# Confirmar setor/cargo do funcionário antes de agendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No fluxo PERIODICO/DEMISSIONAL, o bot mostra o setor+cargo que o funcionário tem cadastrado no SOC e pede confirmação antes de pedir data; "correto" → segue, "errado" → transfere para o responsável da cidade.

**Architecture:** A branch `buscar_funcionario` passa a consultar o Exporta Dados 192399 (Cadastro de Funcionarios) por CPF e devolver `nome/setor/cargo`. O parsing fica num helper puro (`src/funcionario/parse-cadastro.js`, testável + colado no Code node). O prompt do WF2 ganha um passo de confirmação e o motivo de handoff `dados_funcionario_divergentes`, com texto específico no TH.

**Tech Stack:** Node.js ESM + Vitest, n8n (WF2/WF4), SOC Exporta Dados (HTTP GET, latin1), harness de evals.

**Spec:** [docs/superpowers/specs/2026-06-12-confirmar-setor-cargo-funcionario-design.md](../specs/2026-06-12-confirmar-setor-cargo-funcionario-design.md)

---

## File Structure

- **Create:** `src/funcionario/parse-cadastro.js` — pura: recebe linhas do 192399 + CPF → `{encontrado, nome, setor, cargo, unidade}`.
- **Create:** `tests/funcionario/parse-cadastro.test.js` — invariantes do helper.
- **Modify:** `evals/harness/tools/reads.js` — `buscar_funcionario` faz GET real no 192399 e mescla setor/cargo.
- **Modify:** `src/llm/system-prompt.js` — passo de confirmação setor/cargo + regra dura + motivo novo.
- **Modify:** `tests/llm/system-prompt.test.js` — invariante do novo passo.
- **Modify:** `src/llm/tools.js` — doc do `transferir_humano` lista o motivo novo.
- **Create:** `evals/scenarios/12-confirma-setor-cargo-ok.js` e `13-setor-cargo-divergente.js`.
- **Modify (n8n, fora do git — Task 7):** WF4 BF, WF4 TH, WF2 Build OpenAI Request.
- **Modify:** `.env` (Task 7) + `CLAUDE.md` (Task 8).

---

## Task 1: Helper puro `parse-cadastro.js`

**Files:**
- Create: `src/funcionario/parse-cadastro.js`
- Test: `tests/funcionario/parse-cadastro.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/funcionario/parse-cadastro.test.js
import { describe, it, expect } from 'vitest';
import { parseCadastroFuncionario } from '../../src/funcionario/parse-cadastro.js';

const ROWS = [
  { NOME: 'RAFAEL VIEIRA', NOMEUNIDADE: 'Safe T', NOMESETOR: 'ADMINISTRAÇÃO', NOMECARGO: 'MOTORISTA', CPFFUNCIONARIO: '577.825.540-39', SITUACAO: 'ATIVO' },
  { NOME: 'OUTRO', NOMEUNIDADE: 'X', NOMESETOR: 'Y', NOMECARGO: 'Z', CPFFUNCIONARIO: '00000000000', SITUACAO: 'INATIVO' },
];

describe('parseCadastroFuncionario', () => {
  it('casa por CPF ignorando máscara e retorna nome/setor/cargo/unidade', () => {
    const r = parseCadastroFuncionario(ROWS, '57782554039');
    expect(r).toEqual({ encontrado: true, nome: 'RAFAEL VIEIRA', unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA' });
  });

  it('prefere linha com SITUACAO ativa quando há mais de uma pro mesmo CPF', () => {
    const rows = [
      { NOMESETOR: 'VELHO', NOMECARGO: 'C1', CPFFUNCIONARIO: '57782554039', SITUACAO: 'INATIVO', NOME: 'R', NOMEUNIDADE: 'U' },
      { NOMESETOR: 'NOVO', NOMECARGO: 'C2', CPFFUNCIONARIO: '57782554039', SITUACAO: 'Ativo', NOME: 'R', NOMEUNIDADE: 'U' },
    ];
    expect(parseCadastroFuncionario(rows, '57782554039').setor).toBe('NOVO');
  });

  it('CPF ausente → encontrado:false', () => {
    expect(parseCadastroFuncionario(ROWS, '99999999999')).toEqual({ encontrado: false });
  });

  it('setor ou cargo vazio → encontrado:false (não dá pra confirmar)', () => {
    const rows = [{ NOMESETOR: '', NOMECARGO: 'X', CPFFUNCIONARIO: '57782554039', SITUACAO: 'ATIVO' }];
    expect(parseCadastroFuncionario(rows, '57782554039')).toEqual({ encontrado: false });
  });

  it('entrada não-array → encontrado:false', () => {
    expect(parseCadastroFuncionario(null, '57782554039')).toEqual({ encontrado: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/funcionario/parse-cadastro.test.js`
Expected: FAIL — "Failed to resolve import ... parse-cadastro.js" / não exporta `parseCadastroFuncionario`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/funcionario/parse-cadastro.js
// Extrai nome/setor/cargo do retorno do Exporta Dados 192399 (Cadastro de Funcionarios) por CPF.
// Helper puro — espelhado no Code node "BF" do WF4 (n8n não importa este arquivo).
import { stripDigits } from './normalize.js';

export function parseCadastroFuncionario(rows, cpf) {
  const target = stripDigits(cpf);
  const list = Array.isArray(rows) ? rows : [];
  const matches = list.filter((r) => stripDigits(r.CPFFUNCIONARIO) === target);
  if (matches.length === 0) return { encontrado: false };
  const row = matches.find((r) => /ativo/i.test(String(r.SITUACAO || ''))) || matches[0];
  const setor = String(row.NOMESETOR || '').trim();
  const cargo = String(row.NOMECARGO || '').trim();
  if (!setor || !cargo) return { encontrado: false };
  return {
    encontrado: true,
    nome: String(row.NOME || '').trim(),
    unidade: String(row.NOMEUNIDADE || '').trim(),
    setor,
    cargo,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/funcionario/parse-cadastro.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/funcionario/parse-cadastro.js tests/funcionario/parse-cadastro.test.js
git commit -m "feat(funcionario): parse setor/cargo do exporta dados 192399 por CPF"
```

---

## Task 2: `buscar_funcionario` do harness traz setor/cargo (read real do 192399)

**Files:**
- Modify: `evals/harness/tools/reads.js:20-30`

- [ ] **Step 1: Substituir a função `buscar_funcionario`**

Trocar o corpo atual (linhas 20-30) por: além do cache, faz GET real no 192399 (latin1) e mescla setor/cargo via o helper da Task 1.

```javascript
// buscar_funcionario — read real do cache + Exporta Dados 192399 (setor/cargo, latin1 — gotcha 20).
export async function buscar_funcionario(args, ctx) {
  const cpf = String(args.cpf || '').replace(/\D/g, '');
  const rows = await sb(ctx.env, `funcionarios_cache?cpf=eq.${cpf}&codigo_empresa=eq.${args.codigo_empresa}&limit=1`);
  const row = rows[0];
  if (!row || !row.cpf) return { ok: false, erro: 'nao_encontrado' };
  const out = { ok: true, ativo: row.ativo, from_cache: true };
  if (row.codigo_funcionario != null) out.codigo_funcionario = row.codigo_funcionario;
  // setor/cargo atuais do SOC (192399)
  const cad = await fetchCadastroSetorCargo(ctx.env, args.codigo_empresa, cpf);
  if (cad.encontrado) { out.nome = cad.nome; out.setor = cad.setor; out.cargo = cad.cargo; }
  return out;
}

async function fetchCadastroSetorCargo(env, codigoEmpresa, cpf) {
  // empresaTrabalho = codigo da empresa CLIENTE é OBRIGATÓRIO no 192399 — sem ele o filtro retorna 0 rows
  // (validado ao vivo 2026-06-12). Diferente do export de hierarquia, que usa só `empresa`.
  const parametro = JSON.stringify({
    empresa: String(codigoEmpresa), empresaTrabalho: String(codigoEmpresa), codigo: env.SOC_EXPORTA_FUNCIONARIO_CODIGO,
    chave: env.SOC_EXPORTA_FUNCIONARIO_CHAVE, tipoSaida: 'json', cpf, parametroData: '0', dataInicio: '', dataFim: '',
  });
  const url = 'https://ws1.soc.com.br/WebSoc/exportadados?parametro=' + encodeURIComponent(parametro);
  let rows = [];
  try {
    const r = await fetch(url);
    rows = JSON.parse(Buffer.from(await r.arrayBuffer()).toString('latin1'));
  } catch { rows = []; }
  return parseCadastroFuncionario(rows, cpf);
}
```

- [ ] **Step 2: Adicionar o import no topo do arquivo**

Em `evals/harness/tools/reads.js`, após a linha `import { matchHierarquia } ...`:

```javascript
import { parseCadastroFuncionario } from '../../../src/funcionario/parse-cadastro.js';
```

- [ ] **Step 3: Garantir env vars no `.env`** (também na Task 7 — fazer agora se ainda não existem)

```
SOC_EXPORTA_FUNCIONARIO_CODIGO=192399
SOC_EXPORTA_FUNCIONARIO_CHAVE=<chave do 192399>
```

- [ ] **Step 4: Smoke do read real** (CPF seedado 57782554039 na EMPRESA TESTE ALFA cod 291130)

Run: `node -e "import('./evals/harness/tools/reads.js').then(async m=>{const fs=await import('node:fs');const env={};fs.readFileSync('.env','utf8').split(/\r?\n/).forEach(l=>{const x=l.match(/^([^#=]+)=(.*)$/);if(x)env[x[1].trim()]=x[2].replace(/\s+#.*$/,'').trim()});console.log(await m.buscar_funcionario({cpf:'57782554039',codigo_empresa:291130},{env}))})"`
Expected: objeto com `ok:true` e `setor`/`cargo` preenchidos (ex.: setor "ADMINISTRAÇÃO", cargo "MOTORISTA"). Se vier sem setor/cargo, conferir chave/empresa no `.env`.

- [ ] **Step 5: Commit**

```bash
git add evals/harness/tools/reads.js
git commit -m "feat(harness): buscar_funcionario traz setor/cargo do 192399"
```

---

## Task 3: Passo de confirmação setor/cargo no system prompt

**Files:**
- Modify: `src/llm/system-prompt.js:26` (passo 4) e `:28` (passo 5) e seção REGRAS DURAS
- Modify: `tests/llm/system-prompt.test.js`

- [ ] **Step 1: Escrever o invariante (teste falhando primeiro)**

Adicionar ao `describe('buildSystemPrompt', ...)` em `tests/llm/system-prompt.test.js`:

```javascript
it('exige confirmar setor/cargo do SOC antes da data (periodico/demissional)', () => {
  const p = buildSystemPrompt({ status: 'coletando', dados: {} });
  expect(p).toContain('dados_funcionario_divergentes');
  // confirmação de setor/cargo vem ANTES de pedir a data
  const idxConfirma = p.indexOf('setor');
  const idxData = p.indexOf('peça a data preferida');
  expect(idxConfirma).toBeGreaterThan(-1);
  expect(idxData).toBeGreaterThan(-1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/llm/system-prompt.test.js`
Expected: FAIL — prompt não contém `dados_funcionario_divergentes`.

- [ ] **Step 3: Editar o passo 4 (periodico/demissional)**

Em `src/llm/system-prompt.js`, substituir a linha do passo 4 (atual: `4. SE TIPO=PERIODICO ou DEMISSIONAL: peça o CPF do funcionário. Quando receber, chame buscar_funcionario.`) por:

```
4. SE TIPO=PERIODICO ou DEMISSIONAL: peça o CPF do funcionário. Quando receber, chame buscar_funcionario. O retorno traz o setor e o cargo que o funcionário tem cadastrado no SOC.
4B. CONFIRMAÇÃO DE SETOR/CARGO (PERIODICO/DEMISSIONAL, OBRIGATÓRIA antes da data): após buscar_funcionario OK, NÃO peça a data ainda. Mostre ao cliente o setor e o cargo retornados e peça confirmação dos DOIS, ex: "O funcionário {nome} está cadastrado no setor {setor}, cargo {cargo}. Está tudo certo?". Espere a resposta. Se o cliente confirmar que setor E cargo estão corretos, prossiga para a data. Se ele disser que o setor e/ou o cargo estão errados/divergentes, chame transferir_humano motivo=dados_funcionario_divergentes. Se buscar_funcionario voltar SEM setor/cargo (cadastro incompleto), também chame transferir_humano motivo=dados_funcionario_divergentes - NUNCA invente setor/cargo.
```

- [ ] **Step 4: Ajustar o passo 5 para refletir o gate**

Substituir o passo 5 (atual: `5. Após buscar_funcionario OK (periodico/demissional) OU validar_hierarquia OK (admissional), peça a data preferida.`) por:

```
5. Após o cliente CONFIRMAR setor/cargo (periodico/demissional) OU validar_hierarquia OK (admissional), peça a data preferida.
```

- [ ] **Step 5: Adicionar regra dura**

Na seção REGRAS DURAS, adicionar uma linha (após a regra de `validar_hierarquia`):

```
- PERIODICO/DEMISSIONAL: é PROIBIDO pedir a data ou chamar listar_slots antes de o cliente CONFIRMAR explicitamente que o setor e o cargo retornados por buscar_funcionario estão corretos. Setor/cargo errado ou ausente -> transferir_humano motivo=dados_funcionario_divergentes.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/llm/system-prompt.test.js`
Expected: PASS (todos, incluindo o novo).

- [ ] **Step 7: Commit**

```bash
git add src/llm/system-prompt.js tests/llm/system-prompt.test.js
git commit -m "feat(prompt): confirma setor/cargo do SOC antes de agendar (periodico/demissional)"
```

---

## Task 4: Motivo novo na doc do `transferir_humano`

**Files:**
- Modify: `src/llm/tools.js:11`
- Modify: `tests/llm/tools.test.js`

- [ ] **Step 1: Escrever o invariante (teste falhando primeiro)**

Adicionar ao `describe` em `tests/llm/tools.test.js`:

```javascript
it('transferir_humano documenta o motivo dados_funcionario_divergentes', () => {
  const th = tools.find(t => t.function.name === 'transferir_humano');
  expect(th.function.parameters.properties.motivo.description).toContain('dados_funcionario_divergentes');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/llm/tools.test.js`
Expected: FAIL — description não contém o motivo.

- [ ] **Step 3: Editar a description do motivo**

Em `src/llm/tools.js`, na tool `transferir_humano`, no campo `motivo.description`, adicionar `dados_funcionario_divergentes` à lista. O texto atual termina em `... erro_soc, outro`; trocar por:

```
exame_fora_escopo, funcionario_nao_encontrado, empresa_nao_cadastrada, hierarquia_nao_encontrada, dados_funcionario_divergentes, erro_cadastro_soc, erro_soc, outro
```

Também atualizar o texto `Usar quando:` da mesma tool para incluir `setor/cargo do funcionario divergentes do cadastro SOC` na lista de gatilhos.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/llm/tools.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/tools.js tests/llm/tools.test.js
git commit -m "feat(tools): motivo dados_funcionario_divergentes em transferir_humano"
```

---

## Task 5: Cenários de eval (confirma-ok + divergência)

**Files:**
- Create: `evals/scenarios/12-confirma-setor-cargo-ok.js`
- Create: `evals/scenarios/13-setor-cargo-divergente.js`

- [ ] **Step 1: Cenário "confirma OK"**

```javascript
// evals/scenarios/12-confirma-setor-cargo-ok.js
export default {
  nome: 'confirma_setor_cargo_ok',
  descricao: 'Periódico: bot mostra setor/cargo do SOC, cliente confirma, segue pro agendamento.',
  cliente: {
    persona: 'dono de empresa objetivo',
    objetivo: 'agendar periodico do funcionario',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '04/06/2026' },
    comportamento: 'quando o bot mostrar o setor e o cargo cadastrados e perguntar se está certo, responde que SIM, está tudo correto; aceita o primeiro horario dizendo "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    tools_proibidas: ['transferir_humano', 'validar_hierarquia', 'cadastrar_funcionario'],
    outcome: 'agendamento_efetuado',
    handoff_motivo: null,
  },
};
```

- [ ] **Step 2: Cenário "divergência"**

```javascript
// evals/scenarios/13-setor-cargo-divergente.js
export default {
  nome: 'setor_cargo_divergente',
  descricao: 'Periódico: cliente diz que setor/cargo do cadastro estão errados; transfere para humano.',
  cliente: {
    persona: 'RH atento aos dados',
    objetivo: 'agendar periodico, mas o cargo cadastrado está desatualizado',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '04/06/2026' },
    comportamento: 'quando o bot mostrar o setor e o cargo cadastrados e perguntar se está certo, responde que NÃO, o cargo está errado / desatualizado e precisa corrigir',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'transferir_humano'],
    tools_proibidas: ['listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'dados_funcionario_divergentes',
  },
};
```

- [ ] **Step 3: Rodar os dois cenários ×5 (cliente-LLM é não-determinístico)**

Run: `node evals/run-eval.js --only confirma_setor_cargo_ok,setor_cargo_divergente --repeat 5`
Expected: ambos estáveis (5/5 ou 4-5/5). Ler `evals/runs/<timestamp>/summary.md` e os transcripts. Se o bot pular a confirmação ou pedir data antes, iterar no prompt (Task 3) e repetir.

- [ ] **Step 4: Rodar a suíte de eval inteira pra checar regressão**

Run: `npm run eval`
Expected: cenários antigos (01 caso_feliz, etc.) continuam passando; nenhum periódico passa a pedir data sem confirmar.

- [ ] **Step 5: Commit**

```bash
git add evals/scenarios/12-confirma-setor-cargo-ok.js evals/scenarios/13-setor-cargo-divergente.js
git commit -m "test(eval): cenarios confirma/diverge setor-cargo"
```

---

## Task 6: `npm test` completo (invariantes unitários)

- [ ] **Step 1: Rodar a suíte unitária inteira**

Run: `npm test`
Expected: tudo verde (helper novo + prompt + tools + suíte existente). Se algum invariante antigo do prompt quebrou por causa da edição de texto, ajustar o teste/texto e re-rodar.

- [ ] **Step 2: Commit (se houve ajuste)**

```bash
git add -A
git commit -m "test: ajusta invariantes apos confirmacao setor/cargo"
```

---

## Task 7: Sincronizar no n8n ao vivo (WF4 BF, WF4 TH, WF2 prompt) + .env

> Requer n8n local rodando (`.\start-n8n.ps1`) e MCP `n8n-mcp` online. n8n NÃO importa `src/` — é cópia colada. Sem este passo a produção fica desatualizada.

- [ ] **Step 1: `.env`** — adicionar (se ainda não na Task 2):

```
SOC_EXPORTA_FUNCIONARIO_CODIGO=192399
SOC_EXPORTA_FUNCIONARIO_CHAVE=<chave do 192399>
```

Reiniciar n8n (`.\start-n8n.ps1`) — gotcha 26: n8n só lê env nova após restart.

- [ ] **Step 2: WF4 (`00kC3KB8q19KgCLp`) — branch BF (DOIS nós de retorno).** O probe SOAP atual (`BF - Build Probe`/`BF - Call SOAP`) é um `importacaoFuncionario` com `criar/atualizar=false` que só seta `encontrouFuncionario` — **não traz setor/cargo**. Há DOIS nós Code que produzem o retorno "encontrado": `BF - Return Cache` (caminho cache-hit) e `BF - Return Found` (caminho probe). Em AMBOS, antes do `return`, fazer GET ao Exporta Dados 192399 via `require('https')` (sandbox bloqueia fetch — gotcha 8), decodificar latin1 (gotcha 20) e mesclar `nome/setor/cargo` no objeto de saída. Template idêntico ao nó `VH - Validar Hierarquia` (mesmo `host:'ws1.soc.com.br'`, `Buffer...toString('latin1')`), trocando `codigo`/`chave` para `$env.SOC_EXPORTA_FUNCIONARIO_CODIGO`/`_CHAVE` e adicionando `cpf` no `parametro`. Colar inline a lógica do `parseCadastroFuncionario` (Task 1). Fontes do cpf/codigo_empresa em cada nó:
  - `BF - Return Cache`: lê do próprio input → `const j = $input.first().json; const cpf = j.cpf; const codigo_empresa = j.codigo_empresa;` (já presentes — vêm do `BF - Check TTL`).
  - `BF - Return Found`: lê via `$('BF - Normalize CPF').first().json.cpf` e `.codigo_empresa` (mesmo padrão do `BF - Upsert Cache`).
  - `BF - Return Not Found` NÃO muda (funcionário ausente → `nao_encontrado`, motivo `funcionario_nao_encontrado`).

  Modelo do bloco a colar em cada nó de retorno (adaptando a origem de cpf/codigo_empresa):

```javascript
const https = require('https');
function stripDigits(v){return String(v==null?'':v).replace(/\D/g,'');}
function parseCadastro(rows,cpf){const t=stripDigits(cpf);const list=Array.isArray(rows)?rows:[];const ms=list.filter(r=>stripDigits(r.CPFFUNCIONARIO)===t);if(!ms.length)return{encontrado:false};const row=ms.find(r=>/ativo/i.test(String(r.SITUACAO||'')))||ms[0];const setor=String(row.NOMESETOR||'').trim();const cargo=String(row.NOMECARGO||'').trim();if(!setor||!cargo)return{encontrado:false};return{encontrado:true,nome:String(row.NOME||'').trim(),setor,cargo};}
// empresaTrabalho = codigo empresa CLIENTE é OBRIGATÓRIO no 192399 (sem ele → 0 rows; validado ao vivo).
const parametro = JSON.stringify({ empresa:String(codigo_empresa), empresaTrabalho:String(codigo_empresa), codigo:$env.SOC_EXPORTA_FUNCIONARIO_CODIGO, chave:$env.SOC_EXPORTA_FUNCIONARIO_CHAVE, tipoSaida:'json', cpf:stripDigits(cpf), parametroData:'0', dataInicio:'', dataFim:'' });
const path = '/WebSoc/exportadados?parametro=' + encodeURIComponent(parametro);
let rows = [];
try { rows = await new Promise((resolve,reject)=>{const req=https.request({host:'ws1.soc.com.br',path,method:'GET'},(res)=>{const chx=[];res.on('data',c=>chx.push(c));res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chx).toString('latin1')));}catch(e){reject(e);}});});req.on('error',reject);req.end();}); } catch(e) { rows=[]; }
const cad = parseCadastro(rows, cpf);
if (cad.encontrado) { out.nome = cad.nome; out.setor = cad.setor; out.cargo = cad.cargo; }
```

  (`out` = o objeto de retorno já montado no nó; em `BF - Return Found` declarar `const out = { ok:true, ativo:true, from_cache:false };` e os `const cpf/codigo_empresa` via `$('BF - Normalize CPF')`.)

- [ ] **Step 3: WF4 — branch TH (texto por motivo, DOIS lugares hardcoded).** O texto ao cliente está hardcoded em DOIS nós: `TH - HTTP Send` (jsonBody) e `TH - Insert mensagem` (conteudo) — ambos com `'Esse tipo de atendimento sera feito por um colega...'`. Para o texto ficar motivo-aware sem divergir:
  1. Em `TH - Resolve Responsavel`, adicionar ao objeto de retorno um campo `texto_cliente` derivado do motivo:

```javascript
const _motivo = args.motivo || 'outro';
const texto_cliente = _motivo === 'dados_funcionario_divergentes'
  ? 'Vou te passar para a equipe ajustar o cadastro desse funcionario. Em instantes alguem do time continua daqui.'
  : 'Esse tipo de atendimento sera feito por um colega da equipe Safe. Em instantes alguem do time vai continuar daqui. Obrigado!';
```

   (incluir `texto_cliente` no `return [{ json: { ...inp, ..., texto_cliente } }]`.)
  2. Em `TH - HTTP Send` (jsonBody), trocar a string literal das DUAS branches (avisa `message:` e meta `text.body:`) por `$('TH - Resolve Responsavel').first().json.texto_cliente`.
  3. Em `TH - Insert mensagem`, trocar o `conteudo` literal por `={{ $('TH - Resolve Responsavel').first().json.texto_cliente }}`.

  Não alterar a cascata de resolução de responsável (cnpj_empresa → cidade → fallback) nem as notificações P0/WhatsApp.

- [ ] **Step 4: WF2 (`cdQwn4joLcuWlTJQ`) — Build OpenAI Request.** Colar a versão nova do system prompt (Task 3) e, se mudou, dos schemas de tools (Task 4) — versão ASCII-fada (sem acentos), mantendo a semântica. Conferir que `dados_funcionario_divergentes` está no prompt e na doc do `transferir_humano`.

- [ ] **Step 5: Confirmar versão ativa.** Para WF2 e WF4: garantir `activeVersionId === versionId` (publicar/ativar a edição). Verificar via `n8n_get_workflow` mode `minimal`/`active`.

- [ ] **Step 6: Smoke manual (opcional, se ambiente WhatsApp disponível).** Mandar um periódico do CPF 57782554039 e confirmar que o bot pergunta o setor/cargo antes da data; testar resposta "está errado" → transferência com o texto novo.

---

## Task 8: Atualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar a mudança**

- Em "Fluxo de coleta", passo 4 (PERIODICO/DEMISSIONAL): acrescentar que após `buscar_funcionario` o bot confirma setor/cargo do SOC antes de pedir data; divergência/ausência → `transferir_humano` motivo=`dados_funcionario_divergentes`.
- Em "Transfere pra humano": incluir "setor/cargo do funcionário divergentes do cadastro SOC".
- Adicionar à lista de Exporta Dados / env: `SOC_EXPORTA_FUNCIONARIO_CODIGO=192399` (Cadastro de Funcionarios, latin1) + `SOC_EXPORTA_FUNCIONARIO_CHAVE`.
- Gotcha: BF agora faz GET no 192399 (empresa = código da empresa CLIENTE, igual hierarquia).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: confirma setor/cargo do funcionario antes de agendar"
```

---

## Notas de execução

- **Ordem:** Tasks 1→6 são `src/`/harness/testes (independem do n8n e validam o comportamento via eval). Task 7 sincroniza produção e exige n8n online. Task 8 fecha docs.
- **Gap de fidelidade:** o harness usa read REAL do 192399 (CPF seedado 57782554039 retorna ADMINISTRAÇÃO/MOTORISTA), então o cenário "confirma OK" exercita dados reais; o cenário "divergente" não depende do valor real — o cliente-LLM apenas nega.
- **Não-determinismo:** sempre `--repeat 5` nos cenários novos antes de considerar estável.
