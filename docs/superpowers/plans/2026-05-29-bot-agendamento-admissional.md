# Agendamento Admissional — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o bot agende exames **ADMISSIONAIS**, cadastrando o funcionário novo no SOC após validar que a tripla unidade+setor+cargo existe na hierarquia da empresa.

**Architecture:** Helpers JS puros e testáveis em `src/` (matcher de hierarquia, normalizadores, builder SOAP, parser) → colados/glued em dois novos branches do WF4 (`validar_hierarquia` via Exporta Dados 191874 HTTP GET; `cadastrar_funcionario` via `importacaoFuncionario` SOAP) → prompt do WF2 ganha o sub-fluxo admissional. Validação da hierarquia é fail-fast (antes da data); criação no SOC só após o "sim".

**Tech Stack:** Node.js ESM + Vitest (helpers), n8n Code nodes (sandbox: `require('https')`, `fast-xml-parser`), SOC SOAP (`FuncionarioModelo2Ws`) + Exporta Dados (`WebSoc/exportadados`), Supabase.

**Spec:** [docs/superpowers/specs/2026-05-29-bot-agendamento-admissional-design.md](../specs/2026-05-29-bot-agendamento-admissional-design.md)

---

## File Structure

| Arquivo | Responsabilidade | Novo/Mod |
|---|---|---|
| `src/hierarquia/match.js` | Pure: normaliza nomes + casa tripla (unidade/setor/cargo) no JSON do 191874; deriva CBO | **Novo** |
| `tests/hierarquia/match.test.js` | Testes do matcher | **Novo** |
| `src/funcionario/normalize.js` | Pure: normaliza `sexo`→enum, `uf`→sigla, `stripDigits` p/ CPF | **Novo** |
| `tests/funcionario/normalize.test.js` | Testes dos normalizadores | **Novo** |
| `src/soap/xml-builders/importacao-funcionario.js` | + CTPS, `naoPossuiMatricula`, hierarquia por NOME, booleans required, `cbo` no cargo | **Mod** |
| `tests/soap/xml-builders/importacao-funcionario.test.js` | + testes dos campos novos | **Mod** |
| `src/soap/response-parser.js` | + extrai `codigoFuncionario` do `FuncionarioRetorno` | **Mod** |
| `tests/soap/response-parser.test.js` | + teste do `codigoFuncionario` | **Mod** |
| `scripts/test-admissional.mjs` | Integração real: 191874 → match → criar (CPF descartável) → agendar ADMISSIONAL | **Novo** |
| WF4 (n8n `00kC3KB8q19KgCLp`) | + branches `validar_hierarquia` e `cadastrar_funcionario` | **Mod (n8n)** |
| WF2 (n8n `cdQwn4joLcuWlTJQ`) | prompt: + ADMISSIONAL, sub-fluxo, 2 tools novas | **Mod (n8n)** |
| `.env` / `start-n8n.ps1` | `SOC_EXPORTA_HIERARQUIA_CODIGO/CHAVE` | **Mod** |
| `CLAUDE.md`, `n8n/workflows/README.md` | documentar o fluxo admissional | **Mod** |

**Nota de convenção (CLAUDE.md #8):** Code nodes do n8n não podem `import`/`require` de `src/`. Os helpers de `src/` são a **fonte de verdade testada**; o JS é **copiado** para dentro do Code node. O script de integração (`scripts/`) importa de `src/` e valida a mesma lógica contra o SOC real.

---

## Phase 1 — Helpers puros (TDD com Vitest)

### Task 1: Matcher de hierarquia

**Files:**
- Create: `src/hierarquia/match.js`
- Test: `tests/hierarquia/match.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/hierarquia/match.test.js
import { describe, it, expect } from 'vitest';
import { normalizeNome, matchHierarquia } from '../../src/hierarquia/match.js';

const rows = [
  { NOMEUNIDADE: 'Safe T', NOMESETOR: 'ADMINISTRAÇÃO', NOMECARGO: 'MOTORISTA', CBO: '7825.10' },
  { NOMEUNIDADE: 'Safe T', NOMESETOR: 'TRANSPORTES',   NOMECARGO: 'MOTORISTA', CBO: '7825.10' },
  { NOMEUNIDADE: 'Safe T', NOMESETOR: 'ADMINISTRAÇÃO', NOMECARGO: 'ANALISTA FINANCEIRO', CBO: '' },
];

describe('normalizeNome', () => {
  it('remove acento, caixa e espaços extras', () => {
    expect(normalizeNome('  Administração ')).toBe('administracao');
    expect(normalizeNome('SAFE   T')).toBe('safe t');
  });
  it('trata null/undefined', () => {
    expect(normalizeNome(null)).toBe('');
    expect(normalizeNome(undefined)).toBe('');
  });
});

describe('matchHierarquia', () => {
  it('casa tripla exata e devolve nomes canônicos + CBO', () => {
    const r = matchHierarquia(rows, { unidade: 'safe t', setor: 'administracao', cargo: 'motorista' });
    expect(r.valido).toBe(true);
    expect(r.unidade_canonica).toBe('Safe T');
    expect(r.setor_canonico).toBe('ADMINISTRAÇÃO');
    expect(r.cargo_canonico).toBe('MOTORISTA');
    expect(r.cbo).toBe('7825.10');
  });
  it('mesma cargo em setor diferente: só casa a tripla certa', () => {
    const r = matchHierarquia(rows, { unidade: 'Safe T', setor: 'TRANSPORTES', cargo: 'MOTORISTA' });
    expect(r.valido).toBe(true);
    expect(r.setor_canonico).toBe('TRANSPORTES');
  });
  it('não casa quando setor não bate', () => {
    const r = matchHierarquia(rows, { unidade: 'Safe T', setor: 'ENGENHARIA', cargo: 'MOTORISTA' });
    expect(r.valido).toBe(false);
  });
  it('CBO vazio vira string vazia, não undefined', () => {
    const r = matchHierarquia(rows, { unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'ANALISTA FINANCEIRO' });
    expect(r.valido).toBe(true);
    expect(r.cbo).toBe('');
  });
  it('rows vazio/ausente → não casa', () => {
    expect(matchHierarquia([], { unidade: 'a', setor: 'b', cargo: 'c' }).valido).toBe(false);
    expect(matchHierarquia(undefined, { unidade: 'a', setor: 'b', cargo: 'c' }).valido).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match`
Expected: FAIL — `Cannot find module '../../src/hierarquia/match.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/hierarquia/match.js
export function normalizeNome(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function matchHierarquia(rows, { unidade, setor, cargo }) {
  const nu = normalizeNome(unidade);
  const ns = normalizeNome(setor);
  const nc = normalizeNome(cargo);
  const hit = (Array.isArray(rows) ? rows : []).find(r =>
    normalizeNome(r.NOMEUNIDADE) === nu &&
    normalizeNome(r.NOMESETOR) === ns &&
    normalizeNome(r.NOMECARGO) === nc
  );
  if (!hit) return { valido: false };
  return {
    valido: true,
    unidade_canonica: hit.NOMEUNIDADE,
    setor_canonico: hit.NOMESETOR,
    cargo_canonico: hit.NOMECARGO,
    cbo: hit.CBO || '',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- match`
Expected: PASS (todos os casos)

- [ ] **Step 5: Commit**

```bash
git add src/hierarquia/match.js tests/hierarquia/match.test.js
git commit -m "feat: matcher de hierarquia SOC (tripla unidade/setor/cargo + CBO)"
```

---

### Task 2: Normalizadores de entrada (sexo, uf, cpf)

**Files:**
- Create: `src/funcionario/normalize.js`
- Test: `tests/funcionario/normalize.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/funcionario/normalize.test.js
import { describe, it, expect } from 'vitest';
import { normalizeSexo, normalizeUf, stripDigits } from '../../src/funcionario/normalize.js';

describe('normalizeSexo', () => {
  it('mapeia variações para enum SOC', () => {
    expect(normalizeSexo('masculino')).toBe('MASCULINO');
    expect(normalizeSexo('M')).toBe('MASCULINO');
    expect(normalizeSexo('homem')).toBe('MASCULINO');
    expect(normalizeSexo('Feminino')).toBe('FEMININO');
    expect(normalizeSexo('F')).toBe('FEMININO');
    expect(normalizeSexo('mulher')).toBe('FEMININO');
  });
  it('retorna null quando não reconhece', () => {
    expect(normalizeSexo('outro')).toBeNull();
    expect(normalizeSexo('')).toBeNull();
  });
});

describe('normalizeUf', () => {
  it('valida e normaliza sigla', () => {
    expect(normalizeUf('pr')).toBe('PR');
    expect(normalizeUf(' SP ')).toBe('SP');
  });
  it('rejeita sigla inválida', () => {
    expect(normalizeUf('XX')).toBeNull();
    expect(normalizeUf('Paraná')).toBeNull();
  });
});

describe('stripDigits', () => {
  it('mantém só dígitos', () => {
    expect(stripDigits('123.456.789-00')).toBe('12345678900');
    expect(stripDigits(' 05.435.277/0001-60 ')).toBe('05435277000160');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- normalize`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Write minimal implementation**

```js
// src/funcionario/normalize.js
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export function normalizeSexo(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['masculino', 'm', 'homem', 'masc'].includes(s)) return 'MASCULINO';
  if (['feminino', 'f', 'mulher', 'fem'].includes(s)) return 'FEMININO';
  return null;
}

export function normalizeUf(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return UFS.includes(s) ? s : null;
}

export function stripDigits(v) {
  return String(v ?? '').replace(/\D/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- normalize`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/funcionario/normalize.js tests/funcionario/normalize.test.js
git commit -m "feat: normalizadores sexo/uf/cpf para cadastro admissional"
```

---

### Task 3: Builder `importacaoFuncionario` — CTPS, naoPossuiMatricula, hierarquia por NOME

**Files:**
- Modify: `src/soap/xml-builders/importacao-funcionario.js`
- Test: `tests/soap/xml-builders/importacao-funcionario.test.js`

- [ ] **Step 1: Write the failing tests (append ao arquivo existente)**

Adicionar este bloco `describe` ao final de `tests/soap/xml-builders/importacao-funcionario.test.js`:

```js
describe('buildImportacaoFuncionario — admissional', () => {
  const base = {
    identificacao: { codigoEmpresaPrincipal: 1, codigoResponsavel: 2, codigoUsuario: 'U3' },
    flags: { criarFuncionario: true, criarSetor: false, criarCargo: false, criarUnidade: false },
    funcionario: {
      codigoEmpresa: '291130', tipoBuscaEmpresa: 'CODIGO_SOC', chaveProcuraFuncionario: 'CPF',
      cpf: '70372002048', nomeFuncionario: 'Cleber Teste', dataNascimento: '01/01/1990',
      sexo: 'MASCULINO', dataAdmissao: '01/06/2026',
      nrCtps: '1234567', serieCtps: '001', ufCtps: 'PR', naoPossuiMatricula: true,
    },
    unidade: { nome: 'Safe T', tipoBusca: 'NOME' },
    setor: { nome: 'ADMINISTRAÇÃO', tipoBusca: 'NOME' },
    cargo: { nome: 'MOTORISTA', tipoBusca: 'NOME', cbo: '7825.10' },
  };

  it('emite CTPS e naoPossuiMatricula', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).toContain('<nrCtps>1234567</nrCtps>');
    expect(xml).toContain('<serieCtps>001</serieCtps>');
    expect(xml).toContain('<ufCtps>PR</ufCtps>');
    expect(xml).toContain('<naoPossuiMatricula>true</naoPossuiMatricula>');
  });

  it('emite hierarquia por NOME', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).toMatch(/<unidadeWsVo>[\s\S]*<nome>Safe T<\/nome>[\s\S]*<tipoBusca>NOME<\/tipoBusca>[\s\S]*<\/unidadeWsVo>/);
    expect(xml).toMatch(/<setorWsVo>[\s\S]*<nome>ADMINISTRAÇÃO<\/nome>[\s\S]*<tipoBusca>NOME<\/tipoBusca>[\s\S]*<\/setorWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<nome>MOTORISTA<\/nome>[\s\S]*<tipoBusca>NOME<\/tipoBusca>[\s\S]*<\/cargoWsVo>/);
  });

  it('emite booleans required dos blocos hierarquia + cbo no cargo', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).toMatch(/<setorWsVo>[\s\S]*<criarHistoricoDescricao>false<\/criarHistoricoDescricao>[\s\S]*<\/setorWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<cbo>7825.10<\/cbo>[\s\S]*<\/cargoWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<criarHistoricoDescricao>false<\/criarHistoricoDescricao>[\s\S]*<\/cargoWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<atualizaDescricaoRequisitosCargoPeloCbo>false<\/atualizaDescricaoRequisitosCargoPeloCbo>[\s\S]*<\/cargoWsVo>/);
  });

  it('omite dataEmissaoCtps quando não informado', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).not.toContain('<dataEmissaoCtps>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- importacao-funcionario`
Expected: FAIL — campos CTPS/naoPossuiMatricula ausentes; `tipoBusca`/`cbo`/booleans não emitidos como esperado

- [ ] **Step 3: Implementar as mudanças no builder**

Substituir **inteiramente** o conteúdo de `src/soap/xml-builders/importacao-funcionario.js` por:

```js
import { xmlEscape } from './_escape.js';

function tag(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

// bloco usado para UNIDADE (funcionarioUnidadeWsVo): sem boolean required
function unidadeBlock(data) {
  if (!data) return '';
  return `<unidadeWsVo>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('tipoBusca', data.tipoBusca)}
</unidadeWsVo>`;
}

// setorWsVo exige criarHistoricoDescricao (boolean required no WSDL)
function setorBlock(data) {
  if (!data) return '';
  return `<setorWsVo>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('tipoBusca', data.tipoBusca)}
  <criarHistoricoDescricao>${data.criarHistoricoDescricao === true ? 'true' : 'false'}</criarHistoricoDescricao>
</setorWsVo>`;
}

// cargoWsVo (funcionarioCargoWsVo) exige criarHistoricoDescricao +
// atualizaDescricaoRequisitosCargoPeloCbo (booleans required), aceita cbo
function cargoBlock(data) {
  if (!data) return '';
  return `<cargoWsVo>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('cbo', data.cbo)}
  ${tag('tipoBusca', data.tipoBusca)}
  <criarHistoricoDescricao>${data.criarHistoricoDescricao === true ? 'true' : 'false'}</criarHistoricoDescricao>
  <atualizaDescricaoRequisitosCargoPeloCbo>${data.atualizaDescricaoRequisitosCargoPeloCbo === true ? 'true' : 'false'}</atualizaDescricaoRequisitosCargoPeloCbo>
</cargoWsVo>`;
}

// genérico para centroCusto/motivoLicenca/turno (mantém compat)
function hierarquia(name, data) {
  if (!data) return '';
  return `<${name}>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('tipoBusca', data.tipoBusca)}
</${name}>`;
}

export function buildImportacaoFuncionario({
  identificacao = {},
  flags = {},
  funcionario = {},
  unidade,
  setor,
  cargo,
  centroCusto,
  motivoLicenca,
  turno,
}) {
  return `<ser:importacaoFuncionario>
  <Funcionario>
    ${tag('criarFuncionario', flags.criarFuncionario)}
    ${tag('atualizarFuncionario', flags.atualizarFuncionario)}
    ${tag('criarSetor', flags.criarSetor)}
    ${tag('atualizarSetor', flags.atualizarSetor)}
    ${tag('criarCargo', flags.criarCargo)}
    ${tag('atualizarCargo', flags.atualizarCargo)}
    ${tag('criarUnidade', flags.criarUnidade)}
    ${tag('atualizarUnidade', flags.atualizarUnidade)}
    ${tag('criarCentroCusto', flags.criarCentroCusto)}
    ${tag('criarMotivoLicenca', flags.criarMotivoLicenca)}
    ${tag('criarTurno', flags.criarTurno)}
    ${tag('criarHistorico', flags.criarHistorico)}
    <identificacaoWsVo>
      ${tag('chaveAcesso', identificacao.chaveAcesso)}
      ${tag('codigoEmpresaPrincipal', identificacao.codigoEmpresaPrincipal)}
      ${tag('codigoResponsavel', identificacao.codigoResponsavel)}
      ${tag('codigoUsuario', identificacao.codigoUsuario)}
    </identificacaoWsVo>
    <funcionarioWsVo>
      ${tag('codigoEmpresa', funcionario.codigoEmpresa)}
      ${tag('tipoBuscaEmpresa', funcionario.tipoBuscaEmpresa)}
      ${tag('chaveProcuraFuncionario', funcionario.chaveProcuraFuncionario)}
      ${tag('codigo', funcionario.codigo)}
      ${tag('matricula', funcionario.matricula)}
      ${tag('matriculaRh', funcionario.matriculaRh)}
      ${tag('naoPossuiMatricula', funcionario.naoPossuiMatricula)}
      ${tag('cpf', funcionario.cpf)}
      ${tag('nomeFuncionario', funcionario.nomeFuncionario)}
      ${tag('dataNascimento', funcionario.dataNascimento)}
      ${tag('dataAdmissao', funcionario.dataAdmissao)}
      ${tag('sexo', funcionario.sexo)}
      ${tag('estadoCivil', funcionario.estadoCivil)}
      ${tag('regimeTrabalho', funcionario.regimeTrabalho)}
      ${tag('tipoContratacao', funcionario.tipoContratacao)}
      ${tag('situacao', funcionario.situacao)}
      ${tag('nrCtps', funcionario.nrCtps)}
      ${tag('serieCtps', funcionario.serieCtps)}
      ${tag('dataEmissaoCtps', funcionario.dataEmissaoCtps)}
      ${tag('ufCtps', funcionario.ufCtps)}
      ${tag('naoPossuiCtps', funcionario.naoPossuiCtps)}
      ${tag('funcao', funcionario.funcao)}
      ${tag('email', funcionario.email)}
      ${tag('telefoneCelular', funcionario.telefoneCelular)}
    </funcionarioWsVo>
    ${unidadeBlock(unidade)}
    ${setorBlock(setor)}
    ${cargoBlock(cargo)}
    ${hierarquia('centroCustoWsVo', centroCusto)}
    ${hierarquia('motivoLicencaWsVo', motivoLicenca)}
    ${hierarquia('turnoWsVo', turno)}
  </Funcionario>
</ser:importacaoFuncionario>`;
}
```

- [ ] **Step 4: Run test to verify it passes (incluindo os testes antigos)**

Run: `npm test -- importacao-funcionario`
Expected: PASS — os 3 testes antigos (probe, cadastro com codigo, escape) **e** os 4 novos. Os testes antigos passam por usarem `toContain`/`toMatch` em substrings; tags extras não quebram.

- [ ] **Step 5: Commit**

```bash
git add src/soap/xml-builders/importacao-funcionario.js tests/soap/xml-builders/importacao-funcionario.test.js
git commit -m "feat: builder importacaoFuncionario com CTPS, naoPossuiMatricula e hierarquia por NOME"
```

---

### Task 4: Parser — extrair `codigoFuncionario` do retorno

**Files:**
- Modify: `src/soap/response-parser.js:71-83`
- Test: `tests/soap/response-parser.test.js`

> O nome exato da tag (`codigoFuncionario`) será confirmado na Task 6 (integração real). Se o SOC usar outra tag, ajustar aqui e no teste.

- [ ] **Step 1: Write the failing test (append)**

Adicionar a `tests/soap/response-parser.test.js`:

```js
it('extrai codigoFuncionario do importacaoFuncionarioResponse', () => {
  const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <importacaoFuncionarioResponse>
        <FuncionarioRetorno>
          <encontrouFuncionario>true</encontrouFuncionario>
          <incluiuFuncionario>true</incluiuFuncionario>
          <encontrouErro>false</encontrouErro>
          <codigoFuncionario>987654</codigoFuncionario>
        </FuncionarioRetorno>
      </importacaoFuncionarioResponse>
    </soap:Body>
  </soap:Envelope>`;
  const r = parseSoapResponse(xml);
  expect(r.kind).toBe('success');
  expect(r.operation).toBe('importacaoFuncionario');
  expect(r.codigoFuncionario).toBe('987654');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- response-parser`
Expected: FAIL — `r.codigoFuncionario` é `undefined`

- [ ] **Step 3: Implementar — adicionar campo no bloco `funcResp`**

Em `src/soap/response-parser.js`, dentro do `if (funcResp) { const ret = ...; return { ... } }`, adicionar a linha `codigoFuncionario` ao objeto retornado:

```js
  if (funcResp) {
    const ret = funcResp.FuncionarioRetorno || {};
    return {
      kind: 'success',
      operation: 'importacaoFuncionario',
      encontrouFuncionario: ret.encontrouFuncionario === true || ret.encontrouFuncionario === 'true',
      incluiuFuncionario: ret.incluiuFuncionario === true || ret.incluiuFuncionario === 'true',
      atualizouFuncionario: ret.atualizouFuncionario === true || ret.atualizouFuncionario === 'true',
      encontrouErro: ret.encontrouErro === true || ret.encontrouErro === 'true',
      descricaoErro: String(ret.descricaoErro ?? ''),
      codigoFuncionario: ret.codigoFuncionario != null && ret.codigoFuncionario !== ''
        ? String(ret.codigoFuncionario) : undefined,
      raw: ret,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- response-parser`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — 87 antigos + novos (match, normalize, builder, parser).

- [ ] **Step 6: Commit**

```bash
git add src/soap/response-parser.js tests/soap/response-parser.test.js
git commit -m "feat: parser extrai codigoFuncionario do importacaoFuncionarioResponse"
```

---

## Phase 2 — Integração real com o SOC (script manual)

### Task 5: Script de integração admissional

**Files:**
- Create: `scripts/test-admissional.mjs`

Valida ponta-a-ponta contra o SOC real usando a `EMPRESA TESTE ALFA` (291130) e uma tripla real (`Safe T` / `ADMINISTRAÇÃO` / `MOTORISTA`, CBO `7825.10`). **Pré-requisito:** ADMISSIONAL habilitado na agenda de teste (ver Task 11) e um CPF descartável.

- [ ] **Step 1: Criar o script**

```js
// scripts/test-admissional.mjs
// uso: node scripts/test-admissional.mjs <cpf-descartavel> <data DD/MM/AAAA> <hora HH:MM>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildSecurityHeader } from '../src/soap/ws-security.js';
import { buildEnvelope } from '../src/soap/envelope.js';
import { buildImportacaoFuncionario } from '../src/soap/xml-builders/importacao-funcionario.js';
import { buildIncluirAgendamento } from '../src/soap/xml-builders/incluir-agendamento.js';
import { parseSoapResponse } from '../src/soap/response-parser.js';
import { matchHierarquia } from '../src/hierarquia/match.js';
import { stripDigits } from '../src/funcionario/normalize.js';

function loadEnv() {
  const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].replace(/\s+#.*$/, '').trim();
  }
  return env;
}

async function callSoc({ url, body, env }) {
  const sec = buildSecurityHeader({ codigoUsuario: env.SOC_CODIGO_USUARIO, password: env.SOC_WS_PASSWORD || env.SOC_PASSWORD });
  const envelope = buildEnvelope({ securityHeaderXml: sec, bodyXml: body });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' }, body: envelope });
  const buf = Buffer.from(await r.arrayBuffer());
  let xml; try { xml = gunzipSync(buf).toString('utf8'); } catch { xml = buf.toString('utf8'); }
  return { status: r.status, xml };
}

async function fetchHierarquia(env, codigoEmpresa) {
  const parametro = JSON.stringify({ empresa: String(codigoEmpresa), codigo: env.SOC_EXPORTA_HIERARQUIA_CODIGO, chave: env.SOC_EXPORTA_HIERARQUIA_CHAVE, tipoSaida: 'json' });
  const url = 'https://ws1.soc.com.br/WebSoc/exportadados?parametro=' + encodeURIComponent(parametro);
  const r = await fetch(url);
  return JSON.parse(await r.text());
}

async function main() {
  const [, , cpfRaw, data, hora] = process.argv;
  if (!cpfRaw || !data || !hora) { console.error('uso: node scripts/test-admissional.mjs <cpf> <data DD/MM/AAAA> <hora HH:MM>'); process.exit(1); }
  const cpf = stripDigits(cpfRaw);
  const env = loadEnv();
  const codigoEmpresa = 291130;          // EMPRESA TESTE ALFA
  const codigoUsuarioAgenda = 1463919;   // teste carlos
  const triplaCliente = { unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA' };
  const ident = { codigoEmpresaPrincipal: env.SOC_EMPRESA, codigoResponsavel: env.SOC_WS_CODIGO_RESPONSAVEL, codigoUsuario: 'U' + env.SOC_CODIGO_USUARIO };

  console.log('\n=== PASSO 1: validar hierarquia (Exporta Dados 191874) ===');
  const rows = await fetchHierarquia(env, codigoEmpresa);
  const hier = matchHierarquia(rows, triplaCliente);
  console.log('match:', JSON.stringify(hier, null, 2));
  if (!hier.valido) { console.log('[STOP] tripla não existe na empresa — transferiria humano.'); return; }

  console.log('\n=== PASSO 2: cadastrar funcionário (criarFuncionario=true) ===');
  const bodyCad = buildImportacaoFuncionario({
    identificacao: ident,
    flags: { criarFuncionario: true, criarSetor: false, criarCargo: false, criarUnidade: false },
    funcionario: {
      codigoEmpresa: String(codigoEmpresa), tipoBuscaEmpresa: 'CODIGO_SOC', chaveProcuraFuncionario: 'CPF',
      cpf, nomeFuncionario: 'TESTE ADMISSIONAL BOT', dataNascimento: '01/01/1990',
      sexo: 'MASCULINO', dataAdmissao: data, naoPossuiMatricula: true,
    },
    unidade: { nome: hier.unidade_canonica, tipoBusca: 'NOME' },
    setor: { nome: hier.setor_canonico, tipoBusca: 'NOME' },
    cargo: { nome: hier.cargo_canonico, tipoBusca: 'NOME', cbo: hier.cbo },
  });
  const rCad = await callSoc({ url: env.SOC_WS_FUNCIONARIO_URL, body: bodyCad, env });
  const pCad = parseSoapResponse(rCad.xml);
  console.log('HTTP', rCad.status, '| parsed:', JSON.stringify(pCad, null, 2));
  if (pCad.kind !== 'success' || pCad.encontrouErro) { console.log('[STOP] cadastro falhou.'); return; }

  console.log('\n=== PASSO 3: agendar ADMISSIONAL ===');
  const bodyAg = buildIncluirAgendamento({
    identificacao: ident,
    dadosAgendamento: {
      tipoBuscaEmpresa: 'CODIGO_SOC', codigoEmpresa: String(codigoEmpresa),
      tipoBuscaFuncionario: 'CPF', codigoFuncionario: cpf,
      codigoUsuarioAgenda: String(codigoUsuarioAgenda),
      data, horaInicial: hora, tipoCompromisso: 'ADMISSIONAL', codigoCompromisso: '1',
      reservarCompromissoParaEmpresa: false, usaOutroCompromisso: false, priorizarAtendimento: false,
      usaEnviarEmail: false, usaEnviarSocms: false, convocacaoAgendada: false,
    },
  });
  const rAg = await callSoc({ url: env.SOC_WS_AGENDAMENTO_URL, body: bodyAg, env });
  console.log('HTTP', rAg.status, '| parsed:', JSON.stringify(parseSoapResponse(rAg.xml), null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Preencher env vars (ver Task 10) e rodar**

Run: `node scripts/test-admissional.mjs <cpf-descartavel> 15/06/2026 08:00`
Expected:
- PASSO 1: `match.valido = true`, com nomes canônicos + `cbo=7825.10`
- PASSO 2: `kind:'success'`, `encontrouErro:false`, idealmente `codigoFuncionario` preenchido (confirmar nome da tag; ajustar Task 4 se diferir)
- PASSO 3: `kind:'success'` (SOC-100) — agendamento criado

- [ ] **Step 3: Se `codigoFuncionario` vier com outro nome de tag**, ajustar `src/soap/response-parser.js` (Task 4) e o teste, rodar `npm test -- response-parser`, e commitar a correção.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-admissional.mjs
git commit -m "test: script de integração admissional ponta-a-ponta com SOC"
```

---

## Phase 3 — Wiring no n8n (MCP)

> Use o MCP `n8n-mcp` (local). Padrão: `n8n_get_workflow` para inspecionar, `n8n_update_partial_workflow` para editar, `n8n_validate_workflow` antes de ativar. Code nodes seguem o sandbox (CLAUDE.md #8): `require('https')`, parse manual de URL, ler HTTP node anterior via `$('Nome').first().json`.

### Task 6: WF4 — branch `validar_hierarquia`

**Files:** WF4 n8n `00kC3KB8q19KgCLp`

- [ ] **Step 1: Inspecionar a estrutura atual do Switch e de um branch HTTP-only (ex. `buscar_empresa`)**

Run (MCP): `n8n_get_workflow(id="00kC3KB8q19KgCLp", mode="structure")`
Objetivo: achar o nó Switch `tool_name`, os nomes exatos dos nós de retorno e o padrão de "Return" usado.

- [ ] **Step 2: Carregar `codigo_empresa_soc` da conversa**

O WF4 recebe só `{tool_name, args, conversa_id, telefone}` — `codigo_empresa_soc` NÃO vem em `args`. Antes do Code node, adicionar um nó Supabase `VH - Get Conversa` (Get row em `conversas` por `id = conversa_id`) para obter `codigo_empresa_soc`. (Mesmo padrão que `listar_slots`/`agendar_no_soc` usam para carregar contexto da conversa.)

- [ ] **Step 3: Adicionar saída `validar_hierarquia` no Switch + nó Code `VH - Validar Hierarquia`**

Criar Code node `VH - Validar Hierarquia` ligado à nova saída do Switch (após `VH - Get Conversa`). Código (matcher inline — cópia fiel de `src/hierarquia/match.js`):

```js
const https = require('https');

function normalizeNome(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function matchHierarquia(rows, { unidade, setor, cargo }) {
  const nu = normalizeNome(unidade), ns = normalizeNome(setor), nc = normalizeNome(cargo);
  const hit = (Array.isArray(rows) ? rows : []).find(r =>
    normalizeNome(r.NOMEUNIDADE) === nu && normalizeNome(r.NOMESETOR) === ns && normalizeNome(r.NOMECARGO) === nc);
  if (!hit) return { valido: false };
  return { valido: true, unidade_canonica: hit.NOMEUNIDADE, setor_canonico: hit.NOMESETOR, cargo_canonico: hit.NOMECARGO, cbo: hit.CBO || '' };
}

const args = $input.first().json.args || {};
// codigo_empresa_soc vem do nó VH - Get Conversa
const codigoEmpresa = $('VH - Get Conversa').first().json.codigo_empresa_soc;
const parametro = JSON.stringify({
  empresa: String(codigoEmpresa),
  codigo: $env.SOC_EXPORTA_HIERARQUIA_CODIGO,
  chave: $env.SOC_EXPORTA_HIERARQUIA_CHAVE,
  tipoSaida: 'json',
});
const path = '/WebSoc/exportadados?parametro=' + encodeURIComponent(parametro);

const rows = await new Promise((resolve, reject) => {
  const req = https.request({ host: 'ws1.soc.com.br', path, method: 'GET' }, (res) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
  });
  req.on('error', reject);
  req.end();
});

const result = matchHierarquia(rows, { unidade: args.unidade, setor: args.setor, cargo: args.cargo });
return [{ json: { tool_result: result, conversa_id: $input.first().json.conversa_id } }];
```

- [ ] **Step 4: Persistir os nomes canônicos + CBO em `conversas.dados`**

Quando `valido=true`, gravar os campos canônicos para uso posterior pelo `cadastrar_funcionario` (que NÃO recebe esses dados do LLM). Adicionar um nó Supabase `VH - Save Canonico` (Update `conversas` por `id = conversa_id`) que faz merge em `dados.cadastro`:

```
dados.cadastro.unidade_canonica = tool_result.unidade_canonica
dados.cadastro.setor_canonico   = tool_result.setor_canonico
dados.cadastro.cargo_canonico   = tool_result.cargo_canonico
dados.cadastro.cbo              = tool_result.cbo
dados.cadastro.hierarquia_validada = tool_result.valido
```
(Usar `jsonb_set`/expression do n8n preservando o resto de `dados`.) Só executa no ramo `valido=true`; no `valido=false` segue direto pro retorno.

- [ ] **Step 5: Conectar ao nó de retorno do dispatcher** (mesmo padrão dos outros branches que devolvem `tool_result` ao WF2).

- [ ] **Step 6: Validar**

Run (MCP): `n8n_validate_workflow(id="00kC3KB8q19KgCLp")`
Expected: sem erros estruturais.

- [ ] **Step 7: Smoke test isolado**

Disparar via WF2 (ou `n8n_test_workflow`) com `tool_name="validar_hierarquia"`, `args={unidade:"Safe T",setor:"administracao",cargo:"motorista"}`, `conversa_id=<uma conversa com codigo_empresa_soc=291130>`.
Expected: `tool_result.valido = true`, `cbo = "7825.10"`, e `conversas.dados.cadastro` populado com os canônicos.

---

### Task 7: WF4 — branch `cadastrar_funcionario`

**Files:** WF4 n8n `00kC3KB8q19KgCLp`

- [ ] **Step 1: Inspecionar o branch `buscar_funcionario`** (já usa `importacaoFuncionario` probe + WF3) para reusar o padrão de chamada ao WF3 e o builder inline.

Run (MCP): `n8n_get_workflow(id="00kC3KB8q19KgCLp", mode="full")` e localizar os nós do branch `buscar_funcionario`.

- [ ] **Step 2: Adicionar saída `cadastrar_funcionario` no Switch + nós:**

Sequência de nós:
`CF - Get Conversa` (Supabase Get `conversas` por `id=conversa_id`, traz `codigo_empresa_soc` + `dados`) →
`CF - Get Defaults` (Supabase Get `empresas_cache` por `cnpj`, traz `defaults_funcionario`) →
`CF - Build Probe` (Code, `criarFuncionario=false`, `chaveProcuraFuncionario=CPF_ATIVO`) →
`CF - Probe (WF3)` (Execute Workflow → WF3, `endpoint=funcionario`) →
`CF - Decide` (IF `encontrouFuncionario`) →
- **se encontrou:** `CF - Return` com `tool_result.ok=true` + `codigo_funcionario` do probe (pula criação)
- **se não:** `CF - Build Cadastro` (Code) → `CF - Cadastrar (WF3)` → `CF - Parse+Upsert` (Code+Supabase) → `CF - Return`

Os Code nodes `CF - Build Probe` e `CF - Build Cadastro` **colam a função `buildImportacaoFuncionario` inteira** da Task 3 no topo do Code node (sandbox não importa de `src/`) e a chamam. Os nomes canônicos (unidade/setor/cargo) + CBO vêm de `conversas.dados.cadastro` (gravados pela `validar_hierarquia`), **não** de `args`.

`CF - Build Cadastro` (Code):

```js
// >>> COLAR AQUI a função buildImportacaoFuncionario inteira (Task 3) <<<
// (e a função tag/_escape inline, já que require('./_escape.js') não funciona no sandbox)

const inp = $input.first().json;
const args = inp.args || {};
const conv = $('CF - Get Conversa').first().json;
const cad = (conv.dados && conv.dados.cadastro) || {};
const defaults = ($('CF - Get Defaults').first().json.defaults_funcionario) || {};

const ident = {
  codigoEmpresaPrincipal: $env.SOC_EMPRESA,
  codigoResponsavel: $env.SOC_WS_CODIGO_RESPONSAVEL,
  codigoUsuario: 'U' + $env.SOC_CODIGO_USUARIO,
};
const funcionario = {
  codigoEmpresa: String(conv.codigo_empresa_soc),
  tipoBuscaEmpresa: 'CODIGO_SOC',
  chaveProcuraFuncionario: 'CPF',
  cpf: String(args.cpf).replace(/\D/g, ''),
  nomeFuncionario: args.nome,
  dataNascimento: args.data_nascimento,
  dataAdmissao: args.data_admissao,
  sexo: args.sexo,                       // já normalizado p/ MASCULINO/FEMININO pelo WF2
  nrCtps: args.ctps && args.ctps.nr, serieCtps: args.ctps && args.ctps.serie, ufCtps: args.ctps && args.ctps.uf,
  naoPossuiMatricula: true,
  estadoCivil: defaults.estado_civil_default,
  regimeTrabalho: defaults.regime_trabalho_default,
  tipoContratacao: defaults.tipo_contratacao_default,
  situacao: defaults.situacao_default,
};
const unidade = { nome: cad.unidade_canonica, tipoBusca: 'NOME' };
const setor   = { nome: cad.setor_canonico, tipoBusca: 'NOME' };
const cargo   = { nome: cad.cargo_canonico, tipoBusca: 'NOME', cbo: cad.cbo };

const bodyXml = buildImportacaoFuncionario({
  identificacao: ident,
  flags: { criarFuncionario: true, criarSetor: false, criarCargo: false, criarUnidade: false },
  funcionario, unidade, setor, cargo,
});
return [{ json: { bodyXml, endpoint: 'funcionario', conversa_id: inp.conversa_id, cpf: funcionario.cpf, codigo_empresa_soc: conv.codigo_empresa_soc, nome: args.nome } }];
```

`CF - Parse+Upsert` chama `parseSoapResponse` (colado inline) sobre a resposta do WF3, faz upsert em `funcionarios_cache` (`cpf`, `codigo_empresa`, `codigo_funcionario`, `nome`, `ativo=true`) quando `incluiuFuncionario`/`encontrouFuncionario`, e passa adiante.

`CF - Return` monta:
```js
const p = $('CF - Parse+Upsert').first().json.parsed;   // ou do probe, no ramo "já existe"
const tool_result = {
  ok: p.kind === 'success' && !p.encontrouErro,
  codigo_funcionario: p.codigoFuncionario,
  erro: (p.encontrouErro) ? { mensagem: p.descricaoErro } : undefined,
};
return [{ json: { tool_result } }];
```

- [ ] **Step 3: Validar** — `n8n_validate_workflow(id="00kC3KB8q19KgCLp")`. Expected: sem erros.

- [ ] **Step 4: Smoke test** com `tool_name="cadastrar_funcionario"` e os dados de um CPF descartável + tripla válida (mesma da Task 5). Expected: `tool_result.ok = true`, `codigo_funcionario` preenchido. Rodar 2x para confirmar idempotência (2ª vez cai no probe "já existe").

---

### Task 8: WF2 — prompt do agente (ADMISSIONAL + sub-fluxo + tools)

**Files:** WF2 n8n `cdQwn4joLcuWlTJQ` (nó que monta o system prompt + definição de tools no "Build OpenAI Request")

- [ ] **Step 1: Ler o prompt e a lista de tools atuais**

Run (MCP): `n8n_get_workflow(id="cdQwn4joLcuWlTJQ", mode="full")`. Localizar o system prompt inline e o array de `tools` enviado à OpenAI.

- [ ] **Step 2: Adicionar as 2 tools novas ao array de tools** (JSON schema function-calling):

```json
{
  "type": "function",
  "function": {
    "name": "validar_hierarquia",
    "description": "Valida se a tripla unidade+setor+cargo existe na hierarquia da empresa no SOC. Chamar APÓS coletar unidade, setor e cargo, ANTES de pedir a data, no fluxo admissional.",
    "parameters": {
      "type": "object",
      "properties": {
        "unidade": { "type": "string" },
        "setor": { "type": "string" },
        "cargo": { "type": "string" }
      },
      "required": ["unidade", "setor", "cargo"]
    }
  }
},
{
  "type": "function",
  "function": {
    "name": "cadastrar_funcionario",
    "description": "Cadastra o funcionário novo no SOC. NUNCA chamar por iniciativa própria — o sistema só dispara após o cliente confirmar 'sim'.",
    "parameters": {
      "type": "object",
      "properties": {
        "cpf": { "type": "string" },
        "nome": { "type": "string" },
        "data_nascimento": { "type": "string", "description": "DD/MM/AAAA" },
        "sexo": { "type": "string", "enum": ["MASCULINO", "FEMININO"] },
        "ctps": { "type": "object", "properties": { "nr": {"type":"string"}, "serie": {"type":"string"}, "uf": {"type":"string"} } },
        "data_admissao": { "type": "string", "description": "DD/MM/AAAA" }
      },
      "required": ["cpf", "nome", "data_nascimento", "sexo", "data_admissao"]
    }
  }
}
```

- [ ] **Step 3: Atualizar o texto do system prompt** — substituir o trecho de escopo restrito por (acrescentando o sub-fluxo admissional):

```
TIPOS DE EXAME NO ESCOPO: PERIODICO, DEMISSIONAL e ADMISSIONAL.
Para qualquer outro tipo → chame transferir_humano motivo="exame_fora_escopo" (transferência silenciosa, NÃO explique o motivo ao cliente).

FLUXO PERIODICO/DEMISSIONAL (funcionário já existe):
cidade → CNPJ (buscar_empresa) → tipo → CPF (buscar_funcionario) → data (listar_slots) → enviar_confirmacao → (sim) → agendar_no_soc.

FLUXO ADMISSIONAL (funcionário NOVO — cadastrar antes de agendar):
1. cidade do atendimento (aberta)
2. CNPJ → buscar_empresa
3. Tipo (aberto). Se ADMISSIONAL, NÃO chame buscar_funcionario.
4. Bloco pessoal: peça CPF, nome completo, data de nascimento, sexo, CTPS (número/série/UF) e data de admissão. Normalize sexo para MASCULINO/FEMININO e datas para DD/MM/AAAA.
5. Bloco hierarquia: peça unidade, setor e cargo. NÃO peça CBO.
6. Chame validar_hierarquia(unidade,setor,cargo).
   - Se valido=false → chame transferir_humano motivo="hierarquia_nao_encontrada" (silencioso).
   - Se valido=true → use os nomes canônicos retornados daqui pra frente.
7. data preferida → listar_slots → pegue o 1º slot → enviar_confirmacao (resumo: nome, CPF, cargo/setor/unidade, data/hora, ADMISSIONAL).
8. Após o cliente confirmar "sim", o sistema chama cadastrar_funcionario e, em seguida, agendar_no_soc. Você NÃO dispara cadastrar_funcionario sozinho.

REGRAS RÍGIDAS (mantidas): nunca exponha o escopo; nunca chame agendar_no_soc nem cadastrar_funcionario por iniciativa própria.
```

- [ ] **Step 4: Garantir a orquestração pós-"sim"** — no branch hint=sim do WF2, com `tipo=ADMISSIONAL`, o LLM chama `cadastrar_funcionario` e, na recursão seguinte (recebendo `codigo_funcionario`), chama `agendar_no_soc`. Confirmar que o budget de iterações (max 5) cobre cadastrar→agendar (2 tool calls). Os nomes canônicos + CBO **não** precisam ser injetados pelo WF2: o branch `cadastrar_funcionario` (Task 7) lê de `conversas.dados.cadastro`, que a `validar_hierarquia` já gravou. O LLM só passa cpf/nome/dob/sexo/ctps/data_admissao.

- [ ] **Step 5: Validar + smoke test conversacional** — `n8n_validate_workflow(id="cdQwn4joLcuWlTJQ")`; depois simular conversa admissional completa (texto) e confirmar a sequência de tools: buscar_empresa → validar_hierarquia → listar_slots → enviar_confirmacao → (sim) → cadastrar_funcionario → agendar_no_soc.

---

## Phase 4 — Config, docs e eval

### Task 9: Env vars

**Files:** `.env` (não commitado), `start-n8n.ps1`

- [ ] **Step 1: Adicionar ao `.env`**

```
SOC_EXPORTA_HIERARQUIA_CODIGO=191874
SOC_EXPORTA_HIERARQUIA_CHAVE=<chave real do 191874>
```

- [ ] **Step 2: Garantir que `start-n8n.ps1` exporta essas vars pro processo n8n** (o parser de `.env` já carrega todas; confirmar que não há allowlist de nomes). Se houver lista explícita de vars repassadas, incluir as duas novas.

- [ ] **Step 3: Confirmar leitura no n8n** — em um Code node de teste, `$env.SOC_EXPORTA_HIERARQUIA_CODIGO` deve retornar `191874`.

- [ ] **Step 4: Commit (apenas start-n8n.ps1 se mudou; `.env` é gitignored)**

```bash
git add start-n8n.ps1
git commit -m "chore: repassa SOC_EXPORTA_HIERARQUIA_* ao n8n"
```

---

### Task 10: Pré-requisitos no SOC (manual, fora do código)

- [ ] **Step 1:** Habilitar **ADMISSIONAL** na agenda de teste `teste carlos #1463919` (no SOC: cadastro da agenda → tipos de compromisso) e refletir em `agendas_config`/`slots_config` se necessário. Sem isso, agendar ADMISSIONAL retorna SOC-315/316.
- [ ] **Step 2:** Separar um **CPF descartável** para os testes de criação real.
- [ ] **Step 3:** Confirmar que `U3604573` tem permissão na agenda de teste para ADMISSIONAL (já liberado para PERIODICO/DEMISSIONAL — confirmar que cobre todos os compromissos).

---

### Task 11: Eval LLM

**Files:** `evals/transcripts/` (+ novo transcript)

- [ ] **Step 1: Criar transcript de conversa admissional** seguindo o formato dos 5 transcripts existentes (inspecionar um deles primeiro): cliente pede admissional → fornece dados pessoais + hierarquia → bot valida → confirma → agenda. Incluir 1 caso de hierarquia inválida → transferência silenciosa.

- [ ] **Step 2: Rodar eval**

Run: `npm run eval`
Expected: o novo transcript passa (sequência de tools esperada + transferência silenciosa no caso inválido).

- [ ] **Step 3: Commit**

```bash
git add evals/transcripts/
git commit -m "test: eval transcript admissional (cadastro + hierarquia inválida)"
```

---

### Task 12: Documentação

**Files:** `CLAUDE.md`, `n8n/workflows/README.md`

- [ ] **Step 1: Atualizar `CLAUDE.md`** — escopo (ADMISSIONAL incluído), fluxo de coleta admissional, WF4 8→10 branches (validar_hierarquia, cadastrar_funcionario), Exporta Dados 191874, novos motivos de transferência, env vars novas, e remover/atualizar a nota de que `cadastrar_funcionario` foi removida.

- [ ] **Step 2: Atualizar `n8n/workflows/README.md`** — WF4 com 10 branches; descrição dos novos nós VH/CF; nota do Exporta Dados 191874 (Acesso POST=Sim → GET direto).

- [ ] **Step 3: Atualizar o amendment** referenciado no plano original ([docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md](2026-05-20-bot-agendamento-soc.md)) registrando a reinclusão de ADMISSIONAL.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md n8n/workflows/README.md docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md
git commit -m "docs: documenta fluxo de agendamento admissional"
```

---

## Self-Review (cobertura do spec)

- **§3.1 Exporta 191874** → Task 6 (branch), Task 5 (integração), Task 9 (env).
- **§3.2 WS Hierarquia descartado** → não há task (correto: não entra).
- **§3.3 importacaoFuncionario por NOME** → Task 3 (builder), Task 5 (integração).
- **§4 Fluxo** → Task 8 (prompt) + Tasks 6/7 (tools).
- **§5 Contratos das tools** → Task 6 (`validar_hierarquia`), Task 7 (`cadastrar_funcionario`).
- **§6 WF4 8→10** → Tasks 6, 7.
- **§7 Builder** → Task 3.
- **§8 Prompt** → Task 8.
- **§9 Dados (cache, sem migration)** → Task 7 (upsert cache); coleta em `conversas.dados` via prompt (Task 8).
- **§10 Motivos transferência** → Task 8 (prompt instrui motivos); branch TH existente reutilizado.
- **§11 Testes** → Tasks 1-5 (unit + integração), Task 11 (eval).
- **§12 env** → Task 9.
- **§13 Pré-requisitos** → Task 10.
- **Edge funcionário-já-existe** → Task 7 (probe antes de criar).
- **codigoFuncionario no parser** → Task 4.
- **Normalização sexo/uf** → Task 2 + Task 8 (prompt normaliza antes).
```
