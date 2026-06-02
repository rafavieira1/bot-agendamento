# Harness de Testes Conversacionais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rodar muitos cenários de conversa contra o agente (WF2) standalone — sem WhatsApp, sem escrever no SOC — gravando o transcript de cada um e dando pass/fail por cenário, pra virar gate de regressão depois de cada alteração no WF/prompt.

**Architecture:** Harness em Node que re-roda o loop do agente em processo. Cliente é um 2º LLM (persona+objetivo+comportamento). Tools com reads reais (Supabase + SOC hierarquia) e writes mockados (SOC cadastro/agenda + envios WhatsApp capturados, não enviados). Estado da conversa vive em memória espelhando as linhas da tabela `mensagens` (pra reproduzir fielmente a montagem de `messages` do WF2, incluindo a adjacência tool_call↔tool_result). Lógica canônica que hoje só existe colada no n8n vira módulo `src/llm/*` testável; o n8n passa a ser cópia sincronizada.

**Tech Stack:** Node ESM, Vitest (`pool: 'forks'`), `fetch` global (Node 18+) pra OpenAI + Supabase REST, `src/soap/*` + `src/hierarquia/*` + `src/confirmation/*` já existentes, `.env` na raiz.

**Spec:** [docs/superpowers/specs/2026-06-01-harness-testes-conversacionais-design.md](../specs/2026-06-01-harness-testes-conversacionais-design.md) (ler o apêndice "Verificação ao vivo (2026-06-01)" — tem os tool return shapes e os fatos exatos do loop).

**Decisões travadas (2026-06-01):** abertura canônica = Cidade → CNPJ → Tipo; `src/confirmation/detect.js` é canônico (WF1 alinha a ele).

---

## File Structure

**Canônicos novos (`src/llm/`) — n8n sincroniza por disciplina:**
- `src/llm/tools.js` — schemas OpenAI das 10 tools (verbatim do WF2 Build node).
- `src/llm/build-request.js` — monta o payload OpenAI a partir do histórico (port do WF2 Build node: adjacência, forceListarSlots, parallel_tool_calls=false).

**Harness (`evals/harness/`):**
- `evals/harness/env.js` — loader do `.env` da raiz (copia o parser de `scripts/test-admissional.mjs`).
- `evals/harness/supabase.js` — `sb(env, path)` GET REST com service role.
- `evals/harness/openai.js` — `chat(env, body)` POST chat/completions.
- `evals/harness/session.js` — estado em memória: `conversa` + array `mensagens` (espelho da tabela) + métodos de append que imitam os inserts do WF2/WF4.
- `evals/harness/wf1-layer.js` — camada WF1 entre turnos (drop se transferido; detecção sim/não + hint + transição de status).
- `evals/harness/tools/index.js` — mapa de adapters por tool.
- `evals/harness/tools/reads.js` — adapters de read real (buscar_empresa, buscar_funcionario, listar_slots, validar_hierarquia).
- `evals/harness/tools/writes.js` — adapters de write mockado (cadastrar_funcionario, agendar_no_soc, enviar_confirmacao, enviar_mensagem, transferir_humano, notificar_safe).
- `evals/harness/agent-runner.js` — uma invocação WF2 (loop de tool calls até terminal/iter<5/texto).
- `evals/harness/customer.js` — cliente LLM.
- `evals/harness/recorder.js` — grava `.md` + `.json` por run + `summary.md`.
- `evals/harness/assert.js` — assertions declarativas → `{pass, falhas[]}`.
- `evals/run-eval.js` — orquestrador (substitui o atual baseado em webhook).

**Cenários:** `evals/scenarios/*.js` (11 arquivos).

**Tests:** `tests/llm/build-request.test.js`, `tests/harness/wf1-layer.test.js`, `tests/harness/session.test.js`, `tests/harness/assert.test.js`.

**Saída (gitignored):** `evals/runs/<timestamp>/`.

**Phase 0 (reconciliação de drift — toca prod):** WF2 Build node (abertura), WF1 Detect node (regex), `n8n/workflows/README.md`.

---

## Phase 0 — Reconciliar drifts (baseline confiável)

> Estabelece que o `src/` canônico bate com o prod ANTES de escrever cenários. Toca os Code nodes ao vivo via n8n-mcp. Faça com o n8n local rodando.

### Task 0.1: WF2 abertura CNPJ → CIDADE

**Files:**
- Modify (n8n ao vivo): WF2 `cdQwn4joLcuWlTJQ`, node "Build OpenAI Request", campo `jsCode`.

- [ ] **Step 1: Pull o node atual**

Run (MCP): `mcp__n8n-mcp__n8n_get_workflow(id="cdQwn4joLcuWlTJQ", mode="full")`
Localize no `jsCode` do node "Build OpenAI Request" a linha:
```
- Resposta afirmativa (sim, quero, preciso agendar, etc) -> comece a coleta pedindo o CNPJ.
```

- [ ] **Step 2: Aplicar a troca**

Troque por (alinha com `src/llm/system-prompt.js`, que já diz CIDADE):
```
- Resposta afirmativa (sim, quero, preciso agendar, etc) -> comece a coleta pedindo a CIDADE.
```
Aplique via `mcp__n8n-mcp__n8n_update_partial_workflow(id="cdQwn4joLcuWlTJQ", operations=[{type:"updateNode", nodeName:"Build OpenAI Request", changes:{"parameters.jsCode": "<jsCode inteiro com a linha trocada>"}}])`.

- [ ] **Step 3: Validar**

Run (MCP): `mcp__n8n-mcp__n8n_validate_workflow(id="cdQwn4joLcuWlTJQ")`
Expected: sem erros. Confirme que o restante do prompt (passo 1 = CIDADE, passo 2 = CNPJ, passo 3 = tipo) ficou consistente.

### Task 0.2: WF1 detecção alinhada ao detect.js

**Files:**
- Modify (n8n ao vivo): WF1 `o80iAlxgMjWBfher`, node "Detect Confirmation", campo `jsCode`.

- [ ] **Step 1: Substituir o corpo do node**

O `detect.js` (canônico) remove pontuação final e aceita 👍/✅. Troque o `jsCode` do node "Detect Confirmation" por (mesma semântica do `src/confirmation/detect.js`):
```javascript
const POSITIVE = /^(sim|s|confirmo|confirmado|pode( ser| confirmar)?|isso|ok|okay|beleza|blz|t[áa]\s*(certo|ok|bom)|perfeito|👍|✅|claro)$/i;
const NEGATIVE = /^(n[ãa]o|n|cancela(r)?|errado|t[áa]\s*errado|n[ãa]o\s*confirmo|corrige|mudei\s*de\s*ideia)$/i;
const bruto = String($('Normalize Inbound').first().json.texto || '').trim().toLowerCase();
const texto = bruto.replace(/[.!?,;]+$/, '');
let detection = 'ambiguous';
if (POSITIVE.test(texto)) detection = 'yes';
else if (NEGATIVE.test(texto)) detection = 'no';
return [{ json: { detection, conversa_id: $('Pick Conversa').first().json.id, conversa: $('Pick Conversa').first().json } }];
```
Aplique via `n8n_update_partial_workflow(id="o80iAlxgMjWBfher", operations=[{type:"updateNode", nodeName:"Detect Confirmation", changes:{"parameters.jsCode": "<acima>"}}])`.

- [ ] **Step 2: Validar**

Run (MCP): `mcp__n8n-mcp__n8n_validate_workflow(id="o80iAlxgMjWBfher")`
Expected: sem erros.

### Task 0.3: Atualizar README dos workflows

**Files:**
- Modify: `n8n/workflows/README.md`

- [ ] **Step 1: Corrigir a contagem de tools do WF2**

Edite a seção WF2: trocar "Tools registradas: `buscar_empresa, ...` (7)" e "Tool `cadastrar_funcionario` foi REMOVIDA" por: 10 tools, incluindo `validar_hierarquia` e `cadastrar_funcionario` (fluxo admissional ativo). Atualize a tabela do WF4 pra listar os branches `validar_hierarquia` (VH) e `cadastrar_funcionario` (CF).

- [ ] **Step 2: Commit**

```bash
git add n8n/workflows/README.md
git commit -m "docs: README WF reflete 10 tools + admissional (fim do drift)"
```

---

## Phase 1 — Canônicos `src/llm/`

### Task 1.1: `src/llm/tools.js` (schemas das 10 tools)

**Files:**
- Create: `src/llm/tools.js`
- Test: `tests/llm/tools.test.js`

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/llm/tools.test.js
import { describe, it, expect } from 'vitest';
import { tools } from '../../src/llm/tools.js';

const NAMES = ['buscar_empresa','buscar_funcionario','listar_slots','agendar_no_soc',
  'enviar_confirmacao','enviar_mensagem','transferir_humano','notificar_safe',
  'validar_hierarquia','cadastrar_funcionario'];

describe('tools (schemas OpenAI, espelho do WF2)', () => {
  it('tem exatamente as 10 tools do WF2', () => {
    expect(tools.map(t => t.function.name).sort()).toEqual([...NAMES].sort());
  });
  it('todas são function tools com parameters object', () => {
    for (const t of tools) {
      expect(t.type).toBe('function');
      expect(t.function.parameters.type).toBe('object');
    }
  });
  it('listar_slots/agendar_no_soc exigem cidade+tipo+cpf', () => {
    const ls = tools.find(t => t.function.name === 'listar_slots').function.parameters.required;
    expect(ls).toEqual(expect.arrayContaining(['codigo_empresa','cpf_funcionario','cidade','tipo_compromisso','data_de','data_ate']));
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/llm/tools.test.js`
Expected: FAIL — `Cannot find module '../../src/llm/tools.js'`.

- [ ] **Step 3: Criar `src/llm/tools.js`** (verbatim do WF2 Build node)

```javascript
// FONTE CANÔNICA dos schemas das tools do agente (WF2).
// RUNTIME: o n8n NÃO importa este arquivo — os schemas ficam colados no Code node
// "Build OpenAI Request" do WF2 (cdQwn4joLcuWlTJQ). Ao mudar, edite OS DOIS e mantenha sync.
export const tools = [
  { type: 'function', function: { name: 'buscar_empresa', description: 'Resolve CNPJ para codigo da empresa no SOC.', parameters: { type: 'object', properties: { cnpj: { type: 'string' } }, required: ['cnpj'] } } },
  { type: 'function', function: { name: 'buscar_funcionario', description: 'Verifica se funcionario com este CPF esta ativo no SOC dentro da empresa.', parameters: { type: 'object', properties: { cpf: { type: 'string' }, codigo_empresa: { type: 'integer' } }, required: ['cpf', 'codigo_empresa'] } } },
  { type: 'function', function: { name: 'listar_slots', description: 'Lista horarios disponiveis. O sistema escolhe a agenda certa automaticamente: se funcionario for da New Life usa New Life; senao se cidade for uma das atendidas (Medianeira, Londrina, Santa Helena, Foz do Iguacu) usa a da cidade; senao usa Rede Credenciada.', parameters: { type: 'object', properties: { codigo_empresa: { type: 'integer' }, cpf_funcionario: { type: 'string' }, cidade: { type: 'string' }, tipo_compromisso: { type: 'string', enum: ['PERIODICO','DEMISSIONAL','ADMISSIONAL'] }, data_de: { type: 'string' }, data_ate: { type: 'string' } }, required: ['codigo_empresa','cpf_funcionario','cidade','tipo_compromisso','data_de','data_ate'] } } },
  { type: 'function', function: { name: 'agendar_no_soc', description: 'Realiza o agendamento de fato no SOC. Use APENAS apos o cliente confirmar com SIM via enviar_confirmacao.', parameters: { type: 'object', properties: { codigo_empresa: { type: 'integer' }, cpf_funcionario: { type: 'string' }, cidade: { type: 'string' }, tipo_compromisso: { type: 'string', enum: ['PERIODICO','DEMISSIONAL','ADMISSIONAL'] }, data: { type: 'string', description: 'DD/MM/AAAA' }, hora: { type: 'string', description: 'HH:MM' } }, required: ['codigo_empresa','cpf_funcionario','cidade','tipo_compromisso','data','hora'] } } },
  { type: 'function', function: { name: 'enviar_confirmacao', description: 'Envia resumo final ao cliente e coloca a conversa em aguardando_confirmacao.', parameters: { type: 'object', properties: { resumo: { type: 'string' } }, required: ['resumo'] } } },
  { type: 'function', function: { name: 'enviar_mensagem', description: 'Envia texto livre ao cliente via WhatsApp.', parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] } } },
  { type: 'function', function: { name: 'transferir_humano', description: 'Transfere o atendimento para um humano da equipe Safe SILENCIOSAMENTE. Usar quando: tipo de exame fora do escopo (qualquer um diferente de PERIODICO/DEMISSIONAL), funcionario nao encontrado no SOC, empresa nao cadastrada, ou erro grave do SOC. O sistema mandara mensagem padrao. NUNCA mencione ao cliente que voce nao consegue fazer o agendamento.', parameters: { type: 'object', properties: { motivo: { type: 'string', description: 'exame_fora_escopo, funcionario_nao_encontrado, empresa_nao_cadastrada, erro_soc, outro' }, contexto: { type: 'object', description: 'Dados coletados ate o momento' } }, required: ['motivo'] } } },
  { type: 'function', function: { name: 'notificar_safe', description: 'Cria notificacao interna para a equipe Safe sem transferir o cliente.', parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['erro_soc','revisao','outro'] }, prioridade: { type: 'string', enum: ['p0','p1','p2'] }, payload: { type: 'object' } }, required: ['tipo','prioridade'] } } },
  { type: 'function', function: { name: 'validar_hierarquia', description: 'Valida se a tripla unidade+setor+cargo existe na hierarquia da empresa no SOC. Use SOMENTE no fluxo ADMISSIONAL, apos coletar unidade/setor/cargo e ANTES de pedir a data.', parameters: { type: 'object', properties: { codigo_empresa: { type: 'integer' }, unidade: { type: 'string' }, setor: { type: 'string' }, cargo: { type: 'string' } }, required: ['codigo_empresa','unidade','setor','cargo'] } } },
  { type: 'function', function: { name: 'cadastrar_funcionario', description: 'Cadastra funcionario NOVO no SOC (fluxo ADMISSIONAL). Use APENAS apos o cliente confirmar SIM; nunca por iniciativa propria.', parameters: { type: 'object', properties: { codigo_empresa: { type: 'integer' }, cpf: { type: 'string' }, nome: { type: 'string' }, data_nascimento: { type: 'string', description: 'DD/MM/AAAA' }, sexo: { type: 'string', enum: ['MASCULINO','FEMININO'] }, estado_civil: { type: 'string', enum: ['SOLTEIRO','CASADO','SEPARADO','DIVORCIADO','VIUVO','UNIAO_ESTAVEL','OUTROS'] }, ctps: { type: 'object', properties: { nr: { type: 'string' }, serie: { type: 'string' }, uf: { type: 'string' } } }, data_admissao: { type: 'string', description: 'DD/MM/AAAA' }, unidade: { type: 'string' }, setor: { type: 'string' }, cargo: { type: 'string' } }, required: ['codigo_empresa','cpf','nome','data_nascimento','sexo','estado_civil','data_admissao','unidade','setor','cargo'] } } },
];
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/llm/tools.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/llm/tools.js tests/llm/tools.test.js
git commit -m "feat: src/llm/tools.js (schemas das 10 tools, canonico do WF2)"
```

### Task 1.2: `src/llm/build-request.js` (port do WF2 Build node)

**Files:**
- Create: `src/llm/build-request.js`
- Test: `tests/llm/build-request.test.js`

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/llm/build-request.test.js
import { describe, it, expect } from 'vitest';
import { buildRequest } from '../../src/llm/build-request.js';

const conversa = { status: 'coletando', dados: {}, telefone: '5519999990000' };

describe('buildRequest', () => {
  it('inclui system prompt + hint como mensagens system', () => {
    const { body } = buildRequest({ conversa, mensagens: [], hint: 'Cliente confirmou (SIM).', hoje: '2026-06-01' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({ role: 'system', content: 'Cliente confirmou (SIM).' });
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.tools).toHaveLength(10);
  });

  it('emite tool result imediatamente apos o assistant tool_call (adjacencia)', () => {
    const mensagens = [
      { id: 1, papel: 'user', conteudo: 'CNPJ 05435277000160', created_at: '2026-06-01T10:00:00Z' },
      { id: 2, papel: 'assistant', conteudo: '', tool_name: 'buscar_empresa', tool_args: '{"cnpj":"05435277000160"}', tool_call_id: 'call_1', created_at: '2026-06-01T10:00:01Z' },
      // interloper: resumo gravado ENTRE o tool_call e o tool_result (caso enviar_confirmacao)
      { id: 3, papel: 'assistant', conteudo: 'Empresa ok!', created_at: '2026-06-01T10:00:02Z' },
      { id: 4, papel: 'tool', tool_call_id: 'call_1', tool_result: '{"ok":true,"codigo_empresa":291130}', created_at: '2026-06-01T10:00:03Z' },
    ];
    const { body } = buildRequest({ conversa, mensagens, hoje: '2026-06-01' });
    const roles = body.messages.slice(1).map(m => m.role); // pula o system
    // assistant(tool_call) -> tool -> assistant(texto interloper)
    const idxAsstTc = body.messages.findIndex(m => m.tool_calls);
    expect(body.messages[idxAsstTc + 1].role).toBe('tool');
    expect(body.messages[idxAsstTc + 1].tool_call_id).toBe('call_1');
  });

  it('forca listar_slots so quando iter0 + coletando + resposta de data + bot pediu data', () => {
    const mensagens = [
      { id: 1, papel: 'assistant', conteudo: 'Qual a melhor data pro exame?', created_at: '2026-06-01T10:00:00Z' },
      { id: 2, papel: 'user', conteudo: 'quinta', created_at: '2026-06-01T10:00:01Z' },
    ];
    const { body } = buildRequest({ conversa, mensagens, iteration: 0, hoje: '2026-06-01' });
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'listar_slots' } });
  });

  it('NAO forca listar_slots na iteration > 0', () => {
    const mensagens = [
      { id: 1, papel: 'assistant', conteudo: 'Qual a data?', created_at: '2026-06-01T10:00:00Z' },
      { id: 2, papel: 'user', conteudo: 'quinta', created_at: '2026-06-01T10:00:01Z' },
    ];
    const { body } = buildRequest({ conversa, mensagens, iteration: 1, hoje: '2026-06-01' });
    expect(body.tool_choice).toBe('auto');
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/llm/build-request.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `src/llm/build-request.js`** (port verbatim do WF2 Build node, trocando `$('...')` por params e usando `buildSystemPrompt`/`tools` canônicos)

```javascript
// FONTE CANÔNICA da montagem do request OpenAI do agente (WF2 "Build OpenAI Request").
// Port do Code node. n8n mantém cópia sincronizada. Diferença: usa buildSystemPrompt (acentuado)
// em vez do prompt ASCII colado; conteúdo semântico idêntico (verificado por system-prompt.test.js).
import { buildSystemPrompt } from './system-prompt.js';
import { tools } from './tools.js';

export function buildRequest({ conversa, mensagens, hint = '', iteration = 0, hoje }) {
  const c = conversa || {};
  const msgs = (Array.isArray(mensagens) ? mensagens : []).filter((m) => m && m.papel);
  const sys = buildSystemPrompt({ status: c.status, dados: c.dados, hoje });

  const messages = [{ role: 'system', content: sys }];
  if (hint) messages.push({ role: 'system', content: hint });

  // indexar tool result por tool_call_id (1:1 nesta arquitetura)
  const toolMsgByCallId = new Map();
  for (const m of msgs) if (m.papel === 'tool' && m.tool_call_id) toolMsgByCallId.set(m.tool_call_id, m);
  for (const m of msgs) {
    if (m.papel === 'user') { messages.push({ role: 'user', content: m.conteudo }); continue; }
    if (m.papel === 'assistant') {
      const hasTc = m.tool_args && m.tool_name;
      if (hasTc) {
        const callId = m.tool_call_id || ('call_' + m.id);
        const toolMsg = toolMsgByCallId.get(callId);
        if (!toolMsg) { if (m.conteudo) messages.push({ role: 'assistant', content: m.conteudo }); continue; }
        messages.push({ role: 'assistant', content: m.conteudo || '', tool_calls: [{ id: callId, type: 'function', function: { name: m.tool_name, arguments: typeof m.tool_args === 'string' ? m.tool_args : JSON.stringify(m.tool_args) } }] });
        messages.push({ role: 'tool', tool_call_id: callId, content: typeof toolMsg.tool_result === 'string' ? toolMsg.tool_result : JSON.stringify(toolMsg.tool_result) });
        continue;
      }
      if (m.conteudo == null || m.conteudo === '') continue;
      messages.push({ role: 'assistant', content: m.conteudo });
      continue;
    }
    // papel === 'tool' já emitido junto do seu assistant tool_call; órfãos descartados
  }

  // forceListarSlots: iter0 + coletando + resposta parece data + bot perguntou data antes
  const orderedByTime = [...msgs].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    if (ta !== tb) return ta - tb;
    return Number(a.id || 0) - Number(b.id || 0);
  });
  let lastUserIndex = -1;
  for (let i = orderedByTime.length - 1; i >= 0; i--) {
    if (orderedByTime[i].papel === 'user') { lastUserIndex = i; break; }
  }
  const latestUserText = lastUserIndex >= 0 ? String(orderedByTime[lastUserIndex].conteudo || '').trim().toLowerCase() : '';
  let prevAssistantText = '';
  for (let i = lastUserIndex - 1; i >= 0; i--) {
    if (orderedByTime[i].papel === 'assistant' && orderedByTime[i].conteudo) {
      prevAssistantText = String(orderedByTime[i].conteudo || '').toLowerCase();
      break;
    }
  }
  const looksLikeDateAnswer = /\b(segunda|terca|ter[çc]a|quarta|quinta|sexta|sabado|s[áa]bado|domingo|amanha|amanh[ãa]|hoje|depois de amanha|depois de amanh[ãa])\b|\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/.test(latestUserText);
  const previousAskedForDate = /\b(data|dia|quando)\b/.test(prevAssistantText);
  const forceListarSlots = iteration === 0 && c.status === 'coletando' && looksLikeDateAnswer && previousAskedForDate;
  const tool_choice = forceListarSlots ? { type: 'function', function: { name: 'listar_slots' } } : 'auto';

  return {
    body: { model: 'gpt-4.1-mini', messages, tools, tool_choice, parallel_tool_calls: false, max_tokens: 1024 },
    forcedToolChoice: forceListarSlots ? 'listar_slots' : null,
  };
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/llm/build-request.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/llm/build-request.js tests/llm/build-request.test.js
git commit -m "feat: src/llm/build-request.js (port do WF2 Build node)"
```

---

## Phase 2 — Infra do harness (env, supabase, openai, session)

### Task 2.1: `evals/harness/env.js`

**Files:**
- Create: `evals/harness/env.js`

- [ ] **Step 1: Criar** (mesmo parser de `scripts/test-admissional.mjs`, com strip de comentário inline — gotcha 2)

```javascript
import { readFileSync } from 'node:fs';

// Carrega o .env da raiz do repo. Strip de comentário inline obrigatório (gotcha 2 do CLAUDE.md).
export function loadEnv() {
  const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].replace(/\s+#.*$/, '').trim();
  }
  return env;
}
```

- [ ] **Step 2: Smoke**

Run: `node -e "import('./evals/harness/env.js').then(m=>console.log(!!m.loadEnv().OPENAI_API_KEY, !!m.loadEnv().SUPABASE_URL))"`
Expected: `true true`.

- [ ] **Step 3: Commit**

```bash
git add evals/harness/env.js
git commit -m "feat: harness env loader"
```

### Task 2.2: `evals/harness/supabase.js`

**Files:**
- Create: `evals/harness/supabase.js`

- [ ] **Step 1: Criar** (GET REST com service role, igual o LS node)

```javascript
// GET no PostgREST do Supabase com service role. Retorna array (ou [] em erro).
export async function sb(env, path) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  try {
    const res = await fetch(url, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Smoke**

Run: `node -e "Promise.all([import('./evals/harness/env.js'),import('./evals/harness/supabase.js')]).then(([e,s])=>s.sb(e.loadEnv(),'empresas_cache?cnpj=eq.05435277000160&select=codigo_empresa')).then(r=>console.log(r))"`
Expected: `[ { codigo_empresa: 291130 } ]`.

- [ ] **Step 3: Commit**

```bash
git add evals/harness/supabase.js
git commit -m "feat: harness supabase REST helper"
```

### Task 2.3: `evals/harness/openai.js`

**Files:**
- Create: `evals/harness/openai.js`

- [ ] **Step 1: Criar**

```javascript
// POST chat/completions. body já no formato do buildRequest. Lança em erro HTTP.
export async function chat(env, body) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j = await res.json();
  const choice = j.choices && j.choices[0];
  const msg = choice && choice.message;
  if (!msg) throw new Error('OpenAI sem message: ' + JSON.stringify(j).slice(0, 300));
  const tc = msg.tool_calls && msg.tool_calls[0];
  return {
    content: msg.content || null,
    tool_name: tc ? tc.function.name : null,
    tool_args_raw: tc ? tc.function.arguments : null,
    tool_call_id: tc ? tc.id : null,
    has_tool_call: !!tc,
    finish_reason: choice.finish_reason,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add evals/harness/openai.js
git commit -m "feat: harness openai client"
```

### Task 2.4: `evals/harness/session.js` (estado em memória espelhando `mensagens`)

**Files:**
- Create: `evals/harness/session.js`
- Test: `tests/harness/session.test.js`

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/harness/session.test.js
import { describe, it, expect } from 'vitest';
import { createSession } from '../../evals/harness/session.js';

describe('session', () => {
  it('append imita inserts do WF (user, assistant tool_call, tool result)', () => {
    const s = createSession({ telefone: '551199', status: 'coletando' });
    s.appendUser('oi');
    s.appendAssistantToolCall({ content: '', tool_name: 'buscar_empresa', tool_args: '{"cnpj":"1"}', tool_call_id: 'call_1' });
    s.appendToolResult({ tool_call_id: 'call_1', tool_name: 'buscar_empresa', result: { ok: true } });
    expect(s.mensagens.map(m => m.papel)).toEqual(['user', 'assistant', 'tool']);
    expect(s.mensagens[2].tool_result).toEqual({ ok: true });
    // ids crescentes e created_at presente (pro ordenamento do build-request)
    expect(s.mensagens[2].id).toBeGreaterThan(s.mensagens[0].id);
    expect(s.mensagens[0].created_at).toBeTruthy();
  });

  it('appendAssistantText grava papel assistant com conteudo', () => {
    const s = createSession({ telefone: '551199' });
    s.appendAssistantText('Ola!');
    expect(s.mensagens[0]).toMatchObject({ papel: 'assistant', conteudo: 'Ola!' });
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/harness/session.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `evals/harness/session.js`**

```javascript
// Estado em memória de uma conversa. Espelha as linhas da tabela `mensagens` na MESMA ordem
// que WF2/WF4 inserem, pra que buildRequest reproduza fielmente a montagem de `messages`.
let seq = 0;
function nextRow() { seq += 1; return { id: seq, created_at: new Date(Date.now() + seq).toISOString() }; }

export function createSession({ telefone, status = 'coletando', dados = {} }) {
  const mensagens = [];
  const conversa = { telefone, status, dados };
  return {
    conversa,
    mensagens,
    setStatus(s) { conversa.status = s; },
    appendUser(texto) { mensagens.push({ ...nextRow(), papel: 'user', conteudo: texto }); },
    // espelha WF2 "Save Assistant Msg" (só no ramo tool-call)
    appendAssistantToolCall({ content, tool_name, tool_args, tool_call_id }) {
      mensagens.push({ ...nextRow(), papel: 'assistant', conteudo: content || '', tool_name, tool_args, tool_call_id });
    },
    // espelha WF4 EC/EM insert (texto enviado ao cliente) e WF2 Send Final Text
    appendAssistantText(texto) { mensagens.push({ ...nextRow(), papel: 'assistant', conteudo: texto }); },
    // espelha WF2 "Save Tool Result"
    appendToolResult({ tool_call_id, tool_name, result }) {
      mensagens.push({ ...nextRow(), papel: 'tool', tool_name, tool_call_id, tool_result: result });
    },
  };
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/harness/session.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add evals/harness/session.js tests/harness/session.test.js
git commit -m "feat: harness session (espelho em memoria de mensagens)"
```

---

## Phase 3 — WF1 layer + adapters de tools

### Task 3.1: `evals/harness/wf1-layer.js`

**Files:**
- Create: `evals/harness/wf1-layer.js`
- Test: `tests/harness/wf1-layer.test.js`

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/harness/wf1-layer.test.js
import { describe, it, expect } from 'vitest';
import { wf1Step, HINT_YES, HINT_NO } from '../../evals/harness/wf1-layer.js';

describe('wf1Step', () => {
  it('dropa inbound se conversa transferida', () => {
    expect(wf1Step({ conversa: { status: 'transferido' }, texto: 'oi' })).toEqual({ dropped: true });
  });
  it('fora de aguardando_confirmacao -> hint vazio', () => {
    expect(wf1Step({ conversa: { status: 'coletando' }, texto: 'oi' })).toEqual({ dropped: false, hint: '', newStatus: null });
  });
  it('aguardando_confirmacao + "sim" -> yes (agendando + HINT_YES)', () => {
    expect(wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'sim' })).toEqual({ dropped: false, hint: HINT_YES, newStatus: 'agendando' });
  });
  it('aguardando_confirmacao + "nao" -> no (coletando + HINT_NO)', () => {
    expect(wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'nao' })).toEqual({ dropped: false, hint: HINT_NO, newStatus: 'coletando' });
  });
  it('aguardando_confirmacao + frase aberta -> ambiguous (hint vazio, status mantido)', () => {
    expect(wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'nao pode esse, tem outro?' })).toEqual({ dropped: false, hint: '', newStatus: null });
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/harness/wf1-layer.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `evals/harness/wf1-layer.js`** (hints exatas do WF1)

```javascript
import { detectConfirmation } from '../../src/confirmation/detect.js';

// Strings exatas do WF1 (nodes "Call LLM (yes hint)" / "Call LLM (no hint)").
export const HINT_YES = 'Cliente confirmou (SIM). Dispare agendar_no_soc para cada item pendente e responda confirmando ao cliente.';
export const HINT_NO = 'Cliente recusou a confirmacao. Pergunte o que precisa ser corrigido.';

// Replica a camada WF1 entre turnos. Retorna o que injetar na próxima invocação do WF2.
export function wf1Step({ conversa, texto }) {
  if (conversa.status === 'transferido') return { dropped: true };
  if (conversa.status !== 'aguardando_confirmacao') return { dropped: false, hint: '', newStatus: null };
  const det = detectConfirmation(texto);
  if (det === 'yes') return { dropped: false, hint: HINT_YES, newStatus: 'agendando' };
  if (det === 'no') return { dropped: false, hint: HINT_NO, newStatus: 'coletando' };
  return { dropped: false, hint: '', newStatus: null }; // ambiguous: status mantido
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/harness/wf1-layer.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/wf1-layer.js tests/harness/wf1-layer.test.js
git commit -m "feat: harness wf1-layer (deteccao + hints exatas do WF1)"
```

### Task 3.2: `evals/harness/tools/reads.js` (adapters de read real)

**Files:**
- Create: `evals/harness/tools/reads.js`

- [ ] **Step 1: Criar** (shapes confirmados no WF4 — ver apêndice da spec)

```javascript
import { sb } from '../supabase.js';
import { matchHierarquia } from '../../../src/hierarquia/match.js';

const TEST_UNIDADE = 'teste carlos'; // LS/AG estão hardcoded nessa unidade (verificado 2026-06-01)

// buscar_empresa — read real Supabase. Shape: BE - Output.
export async function buscar_empresa(args, ctx) {
  const cnpj = String(args.cnpj || '').replace(/\D/g, '');
  const rows = await sb(ctx.env, `empresas_cache?cnpj=eq.${cnpj}&limit=1`);
  const row = rows[0];
  if (row && row.codigo_empresa != null) {
    return { ok: true, codigo_empresa: row.codigo_empresa, razao_social: row.razao_social, unidades: row.unidades || [], defaults_funcionario: row.defaults_funcionario || {} };
  }
  return { ok: false, erro: 'empresa_nao_cadastrada' };
}

// buscar_funcionario — read real do cache. Shape: BF - Return Cache / Not Found.
// FIDELITY GAP (documentado na spec): NÃO replica o probe SOC no cache-miss. Cenários usam
// CPFs seedados (cache hit) ou CPFs claramente falsos (not found) — o outcome bate.
export async function buscar_funcionario(args, ctx) {
  const cpf = String(args.cpf || '').replace(/\D/g, '');
  const rows = await sb(ctx.env, `funcionarios_cache?cpf=eq.${cpf}&codigo_empresa=eq.${args.codigo_empresa}&limit=1`);
  const row = rows[0];
  if (row && row.cpf) {
    const out = { ok: true, ativo: row.ativo, from_cache: true };
    if (row.codigo_funcionario != null) out.codigo_funcionario = row.codigo_funcionario;
    return out;
  }
  return { ok: false, erro: 'nao_encontrado' };
}

// validar_hierarquia — read real do SOC Exporta Dados 191874 (latin1 — gotcha 20). Shape VH.
export async function validar_hierarquia(args, ctx) {
  const parametro = JSON.stringify({ empresa: String(args.codigo_empresa), codigo: ctx.env.SOC_EXPORTA_HIERARQUIA_CODIGO, chave: ctx.env.SOC_EXPORTA_HIERARQUIA_CHAVE, tipoSaida: 'json' });
  const url = 'https://ws1.soc.com.br/WebSoc/exportadados?parametro=' + encodeURIComponent(parametro);
  let rows = [];
  try {
    const r = await fetch(url);
    rows = JSON.parse(Buffer.from(await r.arrayBuffer()).toString('latin1'));
  } catch { rows = []; }
  return matchHierarquia(rows, { unidade: args.unidade, setor: args.setor, cargo: args.cargo });
}

// listar_slots — determinístico local por padrão (slots_config menos ocupados); shape LS.
// Override por cenário: mocks.listar_slots.slots = [{data,hora}] força o array (slot ocupado/esgotado).
export async function listar_slots(args, ctx) {
  const mock = ctx.mocks && ctx.mocks.listar_slots;
  if (mock && Array.isArray(mock.slots)) {
    return { ok: true, slots: mock.slots.map((s) => ({ ...s, codigo_usuario_agenda: 1463919 })), sync: { mode: 'mock' } };
  }
  const tipo = encodeURIComponent(args.tipo_compromisso || '');
  const agendas = await sb(ctx.env, `agendas_config?unidade=eq.${encodeURIComponent(TEST_UNIDADE)}&tipo_compromisso=eq.${tipo}&ativo=eq.true&limit=1`);
  const agenda = agendas[0];
  if (!agenda) return { ok: false, erro: 'sem_agenda' };
  const slotsCfg = await sb(ctx.env, `slots_config?agenda_config_id=eq.${agenda.id}&ativo=eq.true&limit=2000`);
  const slots = expandLocalSlots(slotsCfg, args.data_de, args.data_ate, agenda.codigo_usuario_agenda, (mock && mock.ocupados) || []);
  return { ok: true, slots, sync: { mode: 'local_slots_config' } };
}

function dateFromBr(s) { const [d, m, y] = String(s || '').split('/'); return new Date(+y, +m - 1, +d); }
function brFromDate(dt) { return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`; }

function expandLocalSlots(slotsCfg, dataDe, dataAte, codigoAgenda, ocupados) {
  const from = dateFromBr(dataDe);
  const to = dateFromBr(dataAte || dataDe);
  const ocup = new Set(ocupados); // formato 'DD/MM/AAAA|HH:MM' ou 'HH:MM'
  const out = [];
  for (let dt = new Date(from); dt <= to; dt.setDate(dt.getDate() + 1)) {
    const ds = dt.getDay() + 1; // domingo=1 ... sabado=7 (mesma convenção do WF4)
    const dstr = brFromDate(dt);
    for (const s of slotsCfg) {
      if (s.dia_semana === ds) {
        const h = String(s.hora_inicial).slice(0, 5);
        if (!ocup.has(`${dstr}|${h}`) && !ocup.has(h)) out.push({ data: dstr, hora: h, codigo_usuario_agenda: codigoAgenda });
      }
    }
  }
  return out.sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
}
```

- [ ] **Step 2: Smoke** (buscar_empresa real)

Run: `node -e "Promise.all([import('./evals/harness/env.js'),import('./evals/harness/tools/reads.js')]).then(([e,r])=>r.buscar_empresa({cnpj:'05435277000160'},{env:e.loadEnv()})).then(console.log)"`
Expected: `{ ok: true, codigo_empresa: 291130, ... }`.

- [ ] **Step 3: Commit**

```bash
git add evals/harness/tools/reads.js
git commit -m "feat: harness read adapters (empresa/funcionario/hierarquia/slots)"
```

### Task 3.3: `evals/harness/tools/writes.js` (adapters mockados)

**Files:**
- Create: `evals/harness/tools/writes.js`

- [ ] **Step 1: Criar** (capturam args, não tocam SOC/WhatsApp; shapes confirmados no WF4)

```javascript
// Writes mockados. Default "sucesso"; override por cenário via ctx.mocks[tool].
// NÃO chamam SOC nem WhatsApp. Side-effects de estado (status, mensagem visível) ficam aqui
// pra espelhar EC/EM/TH; a decisão de "encerrar invocação" é do agent-runner.

export async function cadastrar_funcionario(args, ctx) {
  const m = (ctx.mocks && ctx.mocks.cadastrar_funcionario) || {};
  if (m.ok === false) return { ok: false, erro: m.erro || { tipo: 'erro_cadastro_soc', mensagem: 'mock erro' } };
  return { ok: true, codigo_funcionario: m.codigo_funcionario ?? 999 };
}

export async function agendar_no_soc(args, ctx) {
  const m = (ctx.mocks && ctx.mocks.agendar_no_soc) || {};
  if (m.ok === false) return { ok: false, codigo_erro: m.codigo_erro || 'mock_erro', mappedError: m.mappedError || null };
  ctx.outcome.agendamento_efetuado = true;
  return { ok: true, codigo_agendamento: m.codigo_agendamento ?? 100000000, from_cache: false };
}

// enviar_confirmacao: grava o resumo como mensagem visível (espelha EC insert) + retorna shape EC.
export async function enviar_confirmacao(args, ctx) {
  ctx.session.appendAssistantText(args.resumo);
  ctx.recordVisible('bot', args.resumo);
  return { ok: true, provider: 'mock', message_id: 'mock', status: 'aguardando_confirmacao' };
}

export async function enviar_mensagem(args, ctx) {
  ctx.session.appendAssistantText(args.texto);
  ctx.recordVisible('bot', args.texto);
  return { ok: true, provider: 'mock', message_id: 'mock' };
}

const TEXTO_TRANSFERENCIA = 'Esse tipo de atendimento sera feito por um colega da equipe Safe. Em instantes alguem do time vai continuar daqui. Obrigado!';
export async function transferir_humano(args, ctx) {
  ctx.session.appendAssistantText(TEXTO_TRANSFERENCIA);
  ctx.recordVisible('bot', TEXTO_TRANSFERENCIA);
  ctx.outcome.transferido = true;
  ctx.outcome.handoff_motivo = args.motivo || 'outro';
  return { ok: true, provider: 'mock', message_id: 'mock', transferido: true };
}

export async function notificar_safe(args, ctx) {
  return { ok: true, notif_id: 'mock' };
}
```

- [ ] **Step 2: Commit**

```bash
git add evals/harness/tools/writes.js
git commit -m "feat: harness write adapters (mockados, capturam args)"
```

### Task 3.4: `evals/harness/tools/index.js` (dispatch)

**Files:**
- Create: `evals/harness/tools/index.js`

- [ ] **Step 1: Criar**

```javascript
import * as reads from './reads.js';
import * as writes from './writes.js';

const REGISTRY = { ...reads, ...writes };

// Despacha uma tool pelo nome. Lança se desconhecida.
export async function dispatchTool(tool_name, args, ctx) {
  const fn = REGISTRY[tool_name];
  if (!fn) throw new Error(`tool desconhecida no harness: ${tool_name}`);
  return await fn(args, ctx);
}

// Tools que ENCERRAM a invocação do WF2 (Is enviar_confirmacao? no WF2).
export const TERMINAL_TOOLS = new Set(['enviar_confirmacao', 'transferir_humano']);
```

- [ ] **Step 2: Commit**

```bash
git add evals/harness/tools/index.js
git commit -m "feat: harness tool dispatch + TERMINAL_TOOLS"
```

---

## Phase 4 — agent-runner + customer

### Task 4.1: `evals/harness/agent-runner.js`

**Files:**
- Create: `evals/harness/agent-runner.js`

- [ ] **Step 1: Criar** (uma invocação WF2 — espelha o control flow do WF2)

```javascript
import { buildRequest } from '../../src/llm/build-request.js';
import { chat } from './openai.js';
import { dispatchTool, TERMINAL_TOOLS } from './tools/index.js';

// Roda UMA invocação do WF2 (o "Recurse Self" vira loop aqui). Muta session.mensagens.
// ctx = { env, mocks, outcome, recordVisible, log }. Retorna { ended: 'confirmacao'|'transferido'|'text'|'cap'|'empty' }.
export async function runAgentInvocation({ session, hint, hoje, ctx }) {
  let iteration = 0;
  while (true) {
    const { body } = buildRequest({ conversa: session.conversa, mensagens: session.mensagens, hint: iteration === 0 ? hint : '', iteration, hoje });
    const r = await chat(ctx.env, body);

    if (r.has_tool_call && iteration < 5) {
      session.appendAssistantToolCall({ content: r.content, tool_name: r.tool_name, tool_args: r.tool_args_raw, tool_call_id: r.tool_call_id });
      let args = {};
      try { args = r.tool_args_raw ? JSON.parse(r.tool_args_raw) : {}; } catch { args = {}; }
      ctx.log({ kind: 'tool_call', tool: r.tool_name, args });
      const result = await dispatchTool(r.tool_name, args, { ...ctx, session });
      session.appendToolResult({ tool_call_id: r.tool_call_id, tool_name: r.tool_name, result });
      ctx.log({ kind: 'tool_result', tool: r.tool_name, result });
      ctx.outcome.toolsCalled.add(r.tool_name);

      if (TERMINAL_TOOLS.has(r.tool_name)) {
        session.setStatus(r.tool_name === 'transferir_humano' ? 'transferido' : 'aguardando_confirmacao');
        return { ended: r.tool_name === 'transferir_humano' ? 'transferido' : 'confirmacao' };
      }
      iteration += 1;
      continue;
    }

    // sem tool (ou cap atingido). Texto puro -> "Send Final Text" (enviar_mensagem).
    if (r.content) {
      session.appendAssistantText(r.content);
      ctx.recordVisible('bot', r.content);
      return { ended: iteration >= 5 ? 'cap' : 'text' };
    }
    return { ended: 'empty' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add evals/harness/agent-runner.js
git commit -m "feat: harness agent-runner (uma invocacao WF2)"
```

### Task 4.2: `evals/harness/customer.js` (cliente LLM)

**Files:**
- Create: `evals/harness/customer.js`

- [ ] **Step 1: Criar**

```javascript
import { chat } from './openai.js';

// Cliente simulado. Vê só as mensagens visíveis do bot e responde como o cliente.
// visivel: array de { who: 'bot'|'cliente', text }. Retorna a próxima fala do cliente.
// Se decidir encerrar, retorna a string contendo o token <STOP>.
export async function customerReply({ env, cliente, visivel, hoje }) {
  const sys = `Voce esta SIMULANDO um cliente do WhatsApp de uma clinica de exames ocupacionais, conversando com um atendente (bot). NUNCA revele que e um teste ou uma IA. Responda curto e natural, como cliente real no WhatsApp.

SEU PERFIL: ${cliente.persona}
SEU OBJETIVO: ${cliente.objetivo}
COMO SE COMPORTAR: ${cliente.comportamento}
DATA DE HOJE: ${hoje}

DADOS QUE VOCE TEM (forneca SOMENTE quando o atendente pedir o dado correspondente; pode mandar varios juntos se fizer sentido):
${JSON.stringify(cliente.fatos, null, 2)}

REGRAS:
- Responda APENAS com a sua proxima mensagem de cliente (sem aspas, sem rotulo).
- Quando seu objetivo for atingido (ex: agendamento confirmado pelo atendente) OU voce decidir desistir, responda com sua ultima fala seguida de " <STOP>".
- Nao invente dados que nao estao na sua lista; se o atendente pedir algo que voce nao tem, improvise de forma plausivel e curta.`;

  const messages = [{ role: 'system', content: sys }];
  // do ponto de vista do cliente: bot = 'user' (quem fala com ele), cliente = 'assistant'
  for (const m of visivel) messages.push({ role: m.who === 'bot' ? 'user' : 'assistant', content: m.text });
  if (visivel.length === 0 || visivel[visivel.length - 1].who === 'cliente') {
    messages.push({ role: 'user', content: '(o atendente ainda nao respondeu; inicie a conversa)' });
  }

  const r = await chat(env, { model: 'gpt-4.1-mini', messages, max_tokens: 200 });
  return (r.content || '').trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add evals/harness/customer.js
git commit -m "feat: harness customer LLM"
```

---

## Phase 5 — recorder, assert, orquestrador

### Task 5.1: `evals/harness/assert.js`

**Files:**
- Create: `evals/harness/assert.js`
- Test: `tests/harness/assert.test.js`

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/harness/assert.test.js
import { describe, it, expect } from 'vitest';
import { runAssertions } from '../../evals/harness/assert.js';

const outcomeBase = { toolsCalled: new Set(['buscar_empresa','agendar_no_soc']), agendamento_efetuado: true, transferido: false, handoff_motivo: null };

describe('runAssertions', () => {
  it('passa quando tudo bate', () => {
    const r = runAssertions({ espera: { tools_chamadas: ['buscar_empresa'], outcome: 'agendamento_efetuado' } }, outcomeBase);
    expect(r.pass).toBe(true);
    expect(r.falhas).toEqual([]);
  });
  it('falha quando tool obrigatoria faltou', () => {
    const r = runAssertions({ espera: { tools_chamadas: ['validar_hierarquia'] } }, outcomeBase);
    expect(r.pass).toBe(false);
    expect(r.falhas[0]).toMatch(/validar_hierarquia/);
  });
  it('falha quando tool proibida foi chamada', () => {
    const r = runAssertions({ espera: { tools_proibidas: ['buscar_empresa'] } }, outcomeBase);
    expect(r.pass).toBe(false);
  });
  it('checa outcome e handoff_motivo', () => {
    const o = { toolsCalled: new Set(['transferir_humano']), transferido: true, handoff_motivo: 'exame_fora_escopo' };
    const r = runAssertions({ espera: { outcome: 'transferido', handoff_motivo: 'exame_fora_escopo' } }, o);
    expect(r.pass).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/harness/assert.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `evals/harness/assert.js`**

```javascript
// Deriva o outcome final e compara com cenario.espera. Tudo opcional por campo.
export function deriveOutcome(o) {
  if (o.transferido) return 'transferido';
  if (o.agendamento_efetuado) return 'agendamento_efetuado';
  return 'em_andamento';
}

export function runAssertions(cenario, o) {
  const e = cenario.espera || {};
  const falhas = [];
  const chamadas = o.toolsCalled || new Set();

  for (const t of e.tools_chamadas || []) {
    if (!chamadas.has(t)) falhas.push(`tool obrigatoria nao chamada: ${t}`);
  }
  for (const t of e.tools_proibidas || []) {
    if (chamadas.has(t)) falhas.push(`tool proibida foi chamada: ${t}`);
  }
  if (e.outcome) {
    const got = deriveOutcome(o);
    if (got !== e.outcome) falhas.push(`outcome esperado ${e.outcome}, obtido ${got}`);
  }
  if (e.handoff_motivo !== undefined) {
    if ((o.handoff_motivo || null) !== e.handoff_motivo) falhas.push(`handoff_motivo esperado ${e.handoff_motivo}, obtido ${o.handoff_motivo || null}`);
  }
  return { pass: falhas.length === 0, falhas };
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/harness/assert.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add evals/harness/assert.js tests/harness/assert.test.js
git commit -m "feat: harness assertions declarativas"
```

### Task 5.2: `evals/harness/recorder.js`

**Files:**
- Create: `evals/harness/recorder.js`

- [ ] **Step 1: Criar**

```javascript
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

// Cria a pasta da run e grava md/json por cenário + summary.md.
export function createRecorder(rootDir) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(rootDir, ts);
  mkdirSync(dir, { recursive: true });
  const summaryPath = path.join(dir, 'summary.md');
  writeFileSync(summaryPath, `# Eval run ${ts}\n\n| Cenário | Run | Pass | Outcome | Tools | Turns | Falhas |\n|---|---|---|---|---|---|---|\n`);

  return {
    dir,
    writeScenario(nome, run, log, outcome, result, turns) {
      const base = `${nome}${run ? '_run' + run : ''}`;
      // markdown legível
      const lines = [`# ${nome} (run ${run})`, '', `**Outcome:** ${outcome} · **Pass:** ${result.pass}`, ''];
      for (const ev of log) {
        if (ev.kind === 'visible') lines.push(`${ev.who === 'cliente' ? '👤 Cliente' : '🤖 Bot'}: ${ev.text}`, '');
        else if (ev.kind === 'tool_call') lines.push(`🔧 \`${ev.tool}\` args: \`${JSON.stringify(ev.args)}\``);
        else if (ev.kind === 'tool_result') lines.push(`   ↳ result: \`${JSON.stringify(ev.result)}\``, '');
      }
      if (!result.pass) lines.push('', '## Falhas', ...result.falhas.map((f) => `- ${f}`));
      writeFileSync(path.join(dir, `${base}.md`), lines.join('\n'));
      // json máquina
      writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ nome, run, outcome, result, log }, null, 2));
      // linha no summary
      const tools = [...(outcome.toolsCalled || [])].join(', ');
      appendFileSync(summaryPath, `| ${nome} | ${run} | ${result.pass ? '✅' : '❌'} | ${outcome.derived} | ${tools} | ${turns} | ${result.falhas.join('; ')} |\n`);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add evals/harness/recorder.js
git commit -m "feat: harness recorder (md + json + summary)"
```

### Task 5.3: `evals/run-eval.js` (orquestrador) + `.gitignore`

**Files:**
- Modify: `evals/run-eval.js` (substitui o conteúdo atual baseado em webhook)
- Modify: `.gitignore` (adiciona `evals/runs/`)

- [ ] **Step 1: Reescrever `evals/run-eval.js`**

```javascript
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from './harness/env.js';
import { createSession } from './harness/session.js';
import { wf1Step } from './harness/wf1-layer.js';
import { runAgentInvocation } from './harness/agent-runner.js';
import { customerReply } from './harness/customer.js';
import { runAssertions, deriveOutcome } from './harness/assert.js';
import { createRecorder } from './harness/recorder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOJE = new Date().toISOString().slice(0, 10);
const MAX_TURNS = 20;

function parseArgs(argv) {
  const out = { only: null, repeat: 1, assert: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') out.only = argv[++i];
    else if (argv[i] === '--repeat') out.repeat = Number(argv[++i]) || 1;
    else if (argv[i] === '--no-assert') out.assert = false;
  }
  return out;
}

async function loadScenarios(only) {
  const dir = path.join(__dirname, 'scenarios');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const scenarios = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    const s = mod.default;
    if (!only || s.nome === only) scenarios.push(s);
  }
  return scenarios;
}

async function runScenario(cenario, env, recorder, run) {
  const session = createSession({ telefone: '5519999990000', status: 'coletando' });
  const log = [];
  const outcome = { toolsCalled: new Set(), agendamento_efetuado: false, transferido: false, handoff_motivo: null };
  const recordVisible = (who, text) => log.push({ kind: 'visible', who, text });
  const ctx = { env, mocks: cenario.mocks || {}, outcome, recordVisible, log: (e) => log.push(e) };

  let turns = 0;
  while (turns < MAX_TURNS) {
    turns++;
    // cliente fala
    const visivel = log.filter((e) => e.kind === 'visible').map((e) => ({ who: e.who, text: e.text }));
    const fala = await customerReply({ env, cliente: cenario.cliente, visivel, hoje: HOJE });
    const stop = / *<STOP>/i.test(fala);
    const falaLimpa = fala.replace(/ *<STOP>/i, '').trim();
    if (falaLimpa) recordVisible('cliente', falaLimpa);

    // camada WF1
    const wf1 = wf1Step({ conversa: session.conversa, texto: falaLimpa });
    if (wf1.dropped) break; // transferido: bot mudo
    if (wf1.newStatus) session.setStatus(wf1.newStatus);
    if (falaLimpa) session.appendUser(falaLimpa);

    // invocação do agente
    if (falaLimpa) await runAgentInvocation({ session, hint: wf1.hint, hoje: HOJE, ctx });

    if (outcome.transferido) break;
    if (stop) break;
  }

  outcome.derived = deriveOutcome(outcome);
  const result = cenario.espera ? runAssertions(cenario, outcome) : { pass: true, falhas: [] };
  recorder.writeScenario(cenario.nome, run, log, outcome, result, turns);
  return result.pass;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const scenarios = await loadScenarios(opts.only);
  const recorder = createRecorder(path.join(__dirname, 'runs'));
  let pass = 0, fail = 0;

  for (const cenario of scenarios) {
    for (let run = 1; run <= opts.repeat; run++) {
      try {
        const ok = await runScenario(cenario, env, recorder, run);
        if (ok) { pass++; console.log(`PASS ${cenario.nome} (run ${run})`); }
        else { fail++; console.log(`FAIL ${cenario.nome} (run ${run})`); }
      } catch (e) {
        fail++; console.log(`ERROR ${cenario.nome} (run ${run}): ${e.message}`);
      }
    }
  }
  console.log(`\n${pass}/${pass + fail} runs passando — transcripts em ${recorder.dir}`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Adicionar `evals/runs/` no `.gitignore`**

Acrescente uma linha `evals/runs/` ao `.gitignore`.

- [ ] **Step 3: Commit**

```bash
git add evals/run-eval.js .gitignore
git commit -m "feat: orquestrador run-eval (substitui harness webhook)"
```

---

## Phase 6 — Cenários v1

> Cada cenário é um arquivo em `evals/scenarios/`. Os transcripts antigos em `evals/transcripts/*.json` viram referência — não são usados pelo runner.

### Task 6.1: Cenários de caminho feliz (periódico + admissional)

**Files:**
- Create: `evals/scenarios/01-caso-feliz-periodico.js`
- Create: `evals/scenarios/02-admissional-completo.js`
- Create: `evals/scenarios/03-admissional-cpf-ja-cadastrado.js`

- [ ] **Step 1: Criar `01-caso-feliz-periodico.js`**

```javascript
export default {
  nome: 'caso_feliz_periodico',
  descricao: 'Periódico, funcionário existente (cache), agenda direto.',
  cliente: {
    persona: 'dono de empresa objetivo, manda dados quando pedido',
    objetivo: 'agendar exame periodico do funcionario',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '04/06/2026' },
    comportamento: 'responde uma info por vez; aceita o primeiro horario oferecido dizendo "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    tools_proibidas: ['validar_hierarquia', 'cadastrar_funcionario'],
    outcome: 'agendamento_efetuado',
    handoff_motivo: null,
  },
};
```

- [ ] **Step 2: Criar `02-admissional-completo.js`**

```javascript
export default {
  nome: 'admissional_completo',
  descricao: 'Admissional: coleta dados + validar_hierarquia + cadastrar + agenda.',
  cliente: {
    persona: 'RH de empresa, organizado',
    objetivo: 'agendar exame admissional de um funcionario novo',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '12345678909', nome: 'João Teste Silva', data_nascimento: '15/03/1995', sexo: 'masculino',
      estado_civil: 'solteiro', ctps_numero: '1234567', ctps_serie: '0012', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA', data_preferida: '04/06/2026',
    },
    comportamento: 'manda os dados em blocos quando pedido; aceita o primeiro horario com "sim"',
  },
  mocks: { cadastrar_funcionario: { ok: true, codigo_funcionario: 555 }, agendar_no_soc: { ok: true, codigo_agendamento: 134400000 } },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'cadastrar_funcionario', 'agendar_no_soc'],
    tools_proibidas: ['buscar_funcionario'],
    outcome: 'agendamento_efetuado',
    handoff_motivo: null,
  },
};
```

- [ ] **Step 3: Criar `03-admissional-cpf-ja-cadastrado.js`**

```javascript
export default {
  nome: 'admissional_cpf_ja_cadastrado',
  descricao: 'Admissional com CPF que já existe — upsert no SOC (mock) e agenda.',
  cliente: {
    persona: 'RH com pressa',
    objetivo: 'agendar admissional reusando um CPF que ja existe no sistema',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '57782554039', nome: 'Rafael Vieira', data_nascimento: '10/10/1990', sexo: 'masculino',
      estado_civil: 'casado', ctps_numero: '7654321', ctps_serie: '0001', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA', data_preferida: '04/06/2026',
    },
    comportamento: 'aceita o primeiro horario com "sim"',
  },
  mocks: { cadastrar_funcionario: { ok: true, codigo_funcionario: 18 }, agendar_no_soc: { ok: true, codigo_agendamento: 134437182 } },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'cadastrar_funcionario', 'agendar_no_soc'],
    tools_proibidas: ['buscar_funcionario'],
    outcome: 'agendamento_efetuado',
  },
};
```

- [ ] **Step 4: Commit**

```bash
git add evals/scenarios/01-caso-feliz-periodico.js evals/scenarios/02-admissional-completo.js evals/scenarios/03-admissional-cpf-ja-cadastrado.js
git commit -m "feat: cenarios caminho feliz (periodico + admissional)"
```

### Task 6.2: Cenários de negociação de horário

**Files:**
- Create: `evals/scenarios/04-recusa-primeira-confirmacao.js`
- Create: `evals/scenarios/05-pede-horario-fora-array.js`

- [ ] **Step 1: Criar `04-recusa-primeira-confirmacao.js`** (frase aberta → ambiguous → bot pula slot)

```javascript
export default {
  nome: 'recusa_primeira_confirmacao',
  descricao: 'Cliente recusa o 1o horario com frase aberta; bot oferece o proximo; cliente aceita.',
  cliente: {
    persona: 'cliente exigente com horario',
    objetivo: 'agendar periodico mas so aceita o segundo horario oferecido',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '33333333333', nome: 'Diego Chies', data_preferida: '04/06/2026' },
    // IMPORTANTE: frase aberta (nao "nao" seco) -> cai em ambiguous -> bot pula pro proximo slot (ver C5 da spec)
    comportamento: 'quando o atendente propor o primeiro horario, recuse dizendo "esse nao da pra mim, tem outro?"; no segundo horario proposto, aceite com "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
```

- [ ] **Step 2: Criar `05-pede-horario-fora-array.js`** (override de slots via mock)

```javascript
export default {
  nome: 'pede_horario_fora_array',
  descricao: 'Cliente pede um horario que nao esta no array; bot informa indisponivel e oferece o proximo.',
  cliente: {
    persona: 'cliente que tem um horario fixo em mente',
    objetivo: 'agendar periodico pedindo 14:00 (que nao existe no array)',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '33333333333', nome: 'Diego Chies', data_preferida: '04/06/2026' },
    comportamento: 'quando o atendente perguntar/propor horario, peca explicitamente "tem as 14:00?"; depois que ele oferecer um horario da manha, aceite com "sim"',
  },
  // array determinístico só com horarios de manha -> 14:00 fica fora
  mocks: { listar_slots: { slots: [{ data: '04/06/2026', hora: '07:30' }, { data: '04/06/2026', hora: '08:00' }, { data: '04/06/2026', hora: '08:30' }] } },
  espera: {
    tools_chamadas: ['listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add evals/scenarios/04-recusa-primeira-confirmacao.js evals/scenarios/05-pede-horario-fora-array.js
git commit -m "feat: cenarios negociacao de horario"
```

### Task 6.3: Cenários de coleta variada

**Files:**
- Create: `evals/scenarios/06-cliente-vago.js`
- Create: `evals/scenarios/07-multiplos-funcionarios.js`

- [ ] **Step 1: Criar `06-cliente-vago.js`**

```javascript
export default {
  nome: 'cliente_vago',
  descricao: 'Periódico, cliente responde pouco; bot puxa info aos poucos.',
  cliente: {
    persona: 'cliente disperso, manda mensagens curtas e vagas',
    objetivo: 'agendar periodico mas sem dar tudo de uma vez',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '05/06/2026' },
    comportamento: 'comece so com "oi quero marcar um exame"; depois va respondendo so o que for perguntado, uma coisa por vez; aceite o primeiro horario com "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
```

- [ ] **Step 2: Criar `07-multiplos-funcionarios.js`**

```javascript
export default {
  nome: 'multiplos_funcionarios',
  descricao: 'Periódico, 2 CPFs na mesma sessão, confirmação consolidada.',
  cliente: {
    persona: 'RH agendando dois funcionarios de uma vez',
    objetivo: 'agendar periodico para DOIS funcionarios na mesma conversa',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico',
      funcionario_1: { cpf: '57782554039', nome: 'Rafael Vieira' },
      funcionario_2: { cpf: '33333333333', nome: 'Diego Chies' },
      data_preferida: '05/06/2026',
    },
    comportamento: 'diga logo que quer marcar para dois funcionarios e passe os dois CPFs; aceite a confirmacao consolidada com "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add evals/scenarios/06-cliente-vago.js evals/scenarios/07-multiplos-funcionarios.js
git commit -m "feat: cenarios coleta variada"
```

### Task 6.4: Cenários de transferência (handoff)

**Files:**
- Create: `evals/scenarios/08-hierarquia-nao-encontrada.js`
- Create: `evals/scenarios/09-exame-fora-escopo.js`
- Create: `evals/scenarios/10-erro-soc-no-cadastro.js`
- Create: `evals/scenarios/11-empresa-nao-cadastrada.js`

- [ ] **Step 1: Criar `08-hierarquia-nao-encontrada.js`** (tripla inexistente → SOC real retorna valido:false)

```javascript
export default {
  nome: 'hierarquia_nao_encontrada',
  descricao: 'Admissional com setor/cargo inexistentes; validar_hierarquia (real) retorna falso; transfere silencioso.',
  cliente: {
    persona: 'RH de empresa',
    objetivo: 'agendar admissional com cargo que nao existe na hierarquia',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '11122233344', nome: 'Maria Teste', data_nascimento: '01/01/1992', sexo: 'feminino',
      estado_civil: 'solteira', ctps_numero: '999', ctps_serie: '001', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'SETOR INEXISTENTE XYZ', cargo: 'CARGO QUE NAO EXISTE 999', data_preferida: '04/06/2026',
    },
    comportamento: 'responde os dados pedidos normalmente',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'transferir_humano'],
    tools_proibidas: ['cadastrar_funcionario', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'hierarquia_nao_encontrada',
  },
};
```

- [ ] **Step 2: Criar `09-exame-fora-escopo.js`**

```javascript
export default {
  nome: 'exame_fora_escopo',
  descricao: 'Tipo de exame fora do escopo; transfere silencioso ANTES de pedir CPF.',
  cliente: {
    persona: 'cliente que quer um exame que o bot nao faz',
    objetivo: 'marcar um exame de "retorno ao trabalho"',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'retorno ao trabalho' },
    comportamento: 'quando perguntarem o tipo, diga claramente que e exame de "retorno ao trabalho"',
  },
  espera: {
    tools_chamadas: ['transferir_humano'],
    tools_proibidas: ['buscar_funcionario', 'listar_slots', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'exame_fora_escopo',
  },
};
```

- [ ] **Step 3: Criar `10-erro-soc-no-cadastro.js`** (mock força erro)

```javascript
export default {
  nome: 'erro_soc_no_cadastro',
  descricao: 'Admissional ok até o cadastro; SOC falha (mock); transfere erro_cadastro_soc.',
  cliente: {
    persona: 'RH organizado',
    objetivo: 'agendar admissional (mas o cadastro vai falhar no SOC)',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '22233344455', nome: 'Carlos Teste', data_nascimento: '05/05/1988', sexo: 'masculino',
      estado_civil: 'casado', ctps_numero: '555', ctps_serie: '002', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA', data_preferida: '04/06/2026',
    },
    comportamento: 'responde os dados; aceita o horario com "sim"',
  },
  mocks: { cadastrar_funcionario: { ok: false, erro: { tipo: 'erro_cadastro_soc', mensagem: 'mock falha SOC' } } },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'enviar_confirmacao', 'cadastrar_funcionario', 'transferir_humano'],
    tools_proibidas: ['agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'erro_cadastro_soc',
  },
};
```

- [ ] **Step 4: Criar `11-empresa-nao-cadastrada.js`**

```javascript
export default {
  nome: 'empresa_nao_cadastrada',
  descricao: 'CNPJ que nao está no cache; buscar_empresa miss; transfere empresa_nao_cadastrada.',
  cliente: {
    persona: 'cliente de empresa nova',
    objetivo: 'agendar periodico para uma empresa que nao esta cadastrada',
    fatos: { cidade: 'Medianeira', cnpj: '11222333000199', tipo_exame: 'periodico' },
    comportamento: 'passe a cidade e o CNPJ quando pedido',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'transferir_humano'],
    tools_proibidas: ['listar_slots', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'empresa_nao_cadastrada',
  },
};
```

- [ ] **Step 5: Commit**

```bash
git add evals/scenarios/08-hierarquia-nao-encontrada.js evals/scenarios/09-exame-fora-escopo.js evals/scenarios/10-erro-soc-no-cadastro.js evals/scenarios/11-empresa-nao-cadastrada.js
git commit -m "feat: cenarios de transferencia/handoff"
```

---

## Phase 7 — Validação end-to-end

### Task 7.1: Rodar a suíte de unit tests

- [ ] **Step 1: Rodar tudo**

Run: `npm test`
Expected: PASS — os testes existentes (109) + os novos (tools, build-request, session, wf1-layer, assert). Se algum falhar, corrija antes de seguir.

### Task 7.2: Rodar o harness contra 1 cenário (smoke)

- [ ] **Step 1: Rodar o caso feliz** (precisa `.env` + n8n NÃO precisa estar no ar; só Supabase + OpenAI + SOC)

Run: `node evals/run-eval.js --only caso_feliz_periodico`
Expected: `PASS caso_feliz_periodico (run 1)` + pasta `evals/runs/<ts>/` com `caso_feliz_periodico_run1.md` legível (👤/🤖/🔧) + `summary.md`.

- [ ] **Step 2: Inspecionar o transcript**

Abra `evals/runs/<ts>/caso_feliz_periodico_run1.md`. Confirme: bot pede cidade → CNPJ → tipo → CPF → data → oferece 1º slot → cliente "sim" → agenda. Tools na ordem esperada.

### Task 7.3: Rodar a suíte completa de cenários

- [ ] **Step 1: Rodar todos**

Run: `node evals/run-eval.js`
Expected: idealmente `11/11 runs passando`. Cenários LLM podem ter flakiness — rode `--repeat 3` nos que oscilarem (`node evals/run-eval.js --only <nome> --repeat 3`).

- [ ] **Step 2: Triagem de falhas**

Pra cada FAIL, abra o `.md` do cenário. Decida: (a) bug real do agente (anote — é o ponto do harness), (b) cenário mal-especificado (ajuste persona/comportamento/fatos), ou (c) flakiness do cliente LLM (aceitável; documente). NÃO afrouxe assertion pra "passar" um bug real.

### Task 7.4: Provar que o gate pega regressão

- [ ] **Step 1: Quebrar de propósito**

No `src/llm/system-prompt.js`, troque temporariamente a regra de escopo pra permitir "retorno" (ex: adicione RETORNO à lista de tipos aceitos).

- [ ] **Step 2: Rodar o cenário de escopo**

Run: `node evals/run-eval.js --only exame_fora_escopo`
Expected: `FAIL exame_fora_escopo` (não chamou `transferir_humano`). Isso prova que o gate detecta regressão de comportamento.

- [ ] **Step 3: Reverter**

```bash
git checkout src/llm/system-prompt.js
```

### Task 7.5: Documentar uso

**Files:**
- Modify: `evals/README.md`
- Modify: `package.json` (script `eval` já aponta pra `evals/run-eval.js` — confirmar)

- [ ] **Step 1: Reescrever `evals/README.md`**

Documente: o que o harness faz, como rodar (`npm run eval`, `--only`, `--repeat`, `--no-assert`), onde ficam os transcripts (`evals/runs/`), como adicionar um cenário (estrutura do arquivo em `evals/scenarios/`), a regra de sync (editou WF2/WF1/WF4 → atualize `src/llm/*` + rode `npm test`), e os fidelity gaps conhecidos (buscar_funcionario sem probe SOC; agenda hardcoded teste carlos; cliente LLM não-determinístico).

- [ ] **Step 2: Confirmar `package.json`**

Verifique que `"eval": "node evals/run-eval.js"` continua válido (o arquivo foi reescrito, o caminho é o mesmo).

- [ ] **Step 3: Commit**

```bash
git add evals/README.md package.json
git commit -m "docs: README do harness de testes conversacionais"
```

---

## Notas de fidelidade (gaps conhecidos, aceitos)

1. **`buscar_funcionario` não faz probe SOC no cache-miss** — usa só o cache. Cenários usam CPFs seedados (hit) ou falsos (miss). Outcome bate; o caminho SOC-probe não é exercitado.
2. **Roteamento de agenda hardcoded em `teste carlos`** — espelha o LS/AG reais (stub de teste). Quando o roteamento de produção (cnpj→cidade→fallback) for plugado no LS, atualizar `reads.js` + o WF juntos.
3. **`listar_slots` usa cálculo local (slots_config)**, não o SOC "Horarios Livres" ao vivo — escolha por determinismo. Modo SOC real fica como melhoria futura.
4. **Cliente LLM é não-determinístico** — daí `--repeat`. Assertions de tool/outcome toleram variação de fraseado; o transcript é a evidência pra leitura humana.
5. **Sync por disciplina** — o harness testa `src/llm/*`, não o n8n ao vivo. Editou Code node → atualize o `src/` + rode `npm test`. (Sem detecção automática de divergência no v1; LLM-judge e snapshot-compare ficam fora do escopo.)

---

## Self-Review (preenchido)

- **Cobertura da spec:** componentes (tools, build-request, agent-runner, customer, recorder, assert, run-eval, wf1-layer, adapters) ✓; fluxo de run ✓; schema de cenário ✓ (campo `outcome` em vez de `status_final`); saída md/json/summary ✓; 11 cenários v1 ✓; reconciliação de drift (Phase 0) ✓; teste de invariante → rebaixado pra "behavioral unit tests + sync por disciplina" (nota de fidelidade #5) — divergência automática WF↔src fica fora do v1 (documentado, não silenciado).
- **Placeholders:** nenhum TODO/TBD; todo step com código real ou comando exato.
- **Consistência de tipos:** `runAgentInvocation({session,hint,hoje,ctx})`, `dispatchTool(name,args,ctx)`, `wf1Step({conversa,texto})→{dropped,hint,newStatus}`, `runAssertions(cenario,outcome)→{pass,falhas}`, `buildRequest({conversa,mensagens,hint,iteration,hoje})→{body,forcedToolChoice}`, adapters `(args,ctx)→result`. `ctx` carrega `{env,mocks,outcome,recordVisible,log,session}` — consistente entre runner/adapters.
