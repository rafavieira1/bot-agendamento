# Bot WhatsApp de Agendamento SOC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## ⚠️ AMENDMENT 2026-05-21 — Mudança de escopo (gestor)

**Escopo restrito após alinhamento com gestor:**

1. **Apenas dois tipos de exame:** `PERIODICO` e `DEMISSIONAL`. Premissa: para esses tipos, o funcionário já está cadastrado no SOC — não é necessário cadastrar via WebService de funcionário.
2. **Qualquer outro tipo** (ADMISSIONAL, MUDANCA_FUNCAO, RETORNO_TRABALHO, CONSULTA isolada, etc) → **bot transfere atendimento para humano**.
3. **Funcionário não encontrado no SOC** → **bot transfere atendimento para humano** (não pede dados pra cadastrar).
4. **Erro de empresa não cadastrada** → **bot transfere atendimento para humano**.
5. **Handoff dentro do mesmo número:** bot avisa cliente que humano vai assumir, marca `conversa.status='transferido'`, cria notificação P0, e PARA de responder. Humano monitora `notificacoes_pendentes` tipo=`transferencia`.

**Tasks impactadas:**

| Task original | Status pós-amendment |
|---|---|
| Task 14 (builder `importacaoFuncionario`) | ✅ Mantém — ainda usado pelo probe em `buscar_funcionario` (passa flags `criar=false, atualizar=false`) |
| Task 23 (Tool n8n `cadastrar_funcionario`) | ❌ **CANCELADA** — workflow `06_tool_cadastrar_funcionario` foi deletado do n8n |
| Task 19 (system prompt) | 🟡 **REVISADA** — prompt restrito a PERIODICO+DEMISSIONAL; instrui transferir em todos os outros casos |
| Task 28 (WF01 `recebe_mensagem`) | 🟡 **REVISADA** — adiciona check `conversa.status='transferido'` logo após carregar conversa; se sim, salva mensagem do user mas NÃO invoca LLM (humano assumiu) |
| Task 29 (WF02 `agente_llm`) | 🟡 **REVISADA** — tool `cadastrar_funcionario` removida; tool nova `transferir_humano` adicionada; recursão para após `transferir_humano` ou `enviar_confirmacao` |
| **Task 23B (NOVA)** | ✅ **Tool n8n `14_tool_transferir_humano`** — avisa cliente, cria `notificacoes_pendentes` (tipo=`transferencia`, prioridade=`p0`), seta `conversa.status='transferido'` |
| Task 31 (eval set) | 🟡 Transcripts 02 (`funcionario_novo`) precisa ser revisado — fluxo de cadastro não existe mais; deve virar transferência |

**Especificação Tool `transferir_humano`:**
- Input: `{ telefone, conversa_id, motivo: string, contexto?: object }`
- Comportamento:
  1. Chama `09_tool_enviar_whatsapp` com texto: "Esse tipo de atendimento será feito por um colega da equipe Safe. Em instantes alguém do time vai continuar daqui. Obrigado!"
  2. Chama `10_tool_notificar_safe` com `tipo='transferencia'`, `prioridade='p0'`, `payload={motivo, telefone, contexto}`
  3. UPDATE `conversas SET status='transferido' WHERE id = <conversa_id>`
- Output: `{ ok: true, transferido: true }`

**Status `conversas.status` ampliado:** valores possíveis agora incluem `transferido`. Migration original (Task 2) já usa text sem constraint, então não exige nova migration.

**Decisão sobre integração com automação outbound (colega):** **adiada/desacoplada**. O foco atual é colocar a automação inbound 100% funcional. A migration `20260521_000011_notificacoes_outbound.sql` foi aplicada e o doc de contrato (`docs/contrato-integracao-outbound.md`) existe para o colega, mas nenhuma alteração de workflow do INBOUND consome `notificacoes_outbound` ainda. Adaptação fica para depois.

**Itens do plano original que continuam idênticos:** Tasks 1-13, 15-18, 20-22, 24-27, 30, 32-36. Apenas as listadas acima sofreram revisão/cancelamento.

---

**Goal:** Construir bot WhatsApp que recebe pedidos de agendamento de exame ocupacional, conversa em PT-BR com cliente, e agenda exame PERIODICO/DEMISSIONAL via WS SOAP do SOC. Outros tipos de exame ou qualquer falha em pré-requisitos → transfere atendimento para humano.

**Architecture:** n8n orquestra; Supabase guarda estado e cache; OpenAI conduz conversa via tool calling; helpers críticos (WS-Security, montagem XML, parser, mapper de erros) ficam em código JS puro testável com Vitest e são colados em Code nodes do n8n. Workflows n8n exportados como JSON versionado.

**Tech Stack:** n8n (self-hosted ou cloud do user), Supabase (Postgres + Edge Functions opcionais), Meta WhatsApp Cloud API, OpenAI API (GPT-4o-mini ou GPT-4.1), Node.js + Vitest (apenas para helpers testáveis), SQL para migrations.

**Spec de referência:** [`docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md`](../specs/2026-05-20-bot-agendamento-soc-design.md)

---

## Estrutura de arquivos

```
bot-agendamentos/
├── docs/superpowers/
│   ├── specs/2026-05-20-bot-agendamento-soc-design.md
│   └── plans/2026-05-20-bot-agendamento-soc.md
├── package.json                        # Vitest + deps mínimas
├── vitest.config.ts
├── src/
│   ├── soap/
│   │   ├── ws-security.js              # Gera UsernameToken+PasswordDigest+Nonce+Timestamp
│   │   ├── envelope.js                 # Concatena Header+Body em envelope SOAP
│   │   ├── xml-builders/
│   │   │   ├── incluir-agendamento.js  # Monta <Body> de incluirAgendamento
│   │   │   ├── importacao-funcionario.js
│   │   │   └── _escape.js              # XML-escape de strings
│   │   ├── response-parser.js          # XML → JSON, classifica sucesso/erro/fault
│   │   └── error-map.js                # Tabela código SOC → bucket + msg + ação
│   ├── confirmation/
│   │   └── detect.js                   # Regex sim/não pré-LLM
│   ├── llm/
│   │   └── system-prompt.js            # System prompt + helpers de contexto
│   └── meta/
│       └── verify-signature.js         # HMAC SHA-256 do X-Hub-Signature-256
├── tests/                              # Vitest, espelha src/
│   └── soap/
│       ├── ws-security.test.js
│       ├── envelope.test.js
│       ├── xml-builders/
│       │   ├── incluir-agendamento.test.js
│       │   └── importacao-funcionario.test.js
│       ├── response-parser.test.js
│       └── error-map.test.js
├── supabase/
│   ├── migrations/
│   │   ├── 20260520_000001_conversas.sql
│   │   ├── 20260520_000002_mensagens.sql
│   │   ├── 20260520_000003_caches.sql
│   │   ├── 20260520_000004_config.sql
│   │   ├── 20260520_000005_agendamentos.sql
│   │   ├── 20260520_000006_notificacoes.sql
│   │   ├── 20260520_000007_rls.sql
│   │   └── 20260520_000008_retencao.sql
│   └── seed/
│       └── README.md                   # Instruções pra popular agendas/slots/defaults
├── n8n/
│   └── workflows/
│       ├── 01_recebe_mensagem.json
│       ├── 02_agente_llm.json
│       ├── 03_soc_soap_call.json        # Sub-workflow reutilizável
│       ├── 04_tool_buscar_empresa.json
│       ├── 05_tool_buscar_funcionario.json
│       ├── 06_tool_cadastrar_funcionario.json
│       ├── 07_tool_listar_slots.json
│       ├── 08_tool_agendar_no_soc.json
│       ├── 09_tool_enviar_whatsapp.json
│       ├── 10_tool_notificar_safe.json
│       └── 11_retomar_apos_cadastro.json
├── evals/
│   ├── transcripts/
│   │   ├── 01_caso_feliz.json
│   │   ├── 02_funcionario_novo.json
│   │   └── ...
│   └── run-eval.js
└── README.md
```

---

## Task 1: Setup do repositório

**Files:**
- Create: `package.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Inicializar package.json**

```bash
cd c:/Users/Rafa/Documents/Safe/bot-agendamentos
npm init -y
```

- [ ] **Step 2: Instalar dependências de dev**

```bash
npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 3: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Adicionar scripts no `package.json`**

Editar `package.json`, campo `scripts`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

- [ ] **Step 5: Criar `.gitignore`**

```
node_modules/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 6: Criar `README.md` mínimo**

```markdown
# Bot Agendamento SOC

Bot WhatsApp para agendamento de exames ocupacionais via SOC.

Ver `docs/superpowers/specs/` e `docs/superpowers/plans/` para arquitetura e plano de
implementação.

## Estrutura

- `src/` — helpers JS testáveis (colados em n8n Code nodes)
- `tests/` — Vitest
- `supabase/migrations/` — schemas SQL
- `n8n/workflows/` — workflows exportados JSON
- `evals/` — eval set do LLM
```

- [ ] **Step 7: Verificar instalação**

Run: `npm test`
Expected: Vitest roda, "No test files found" (esperado pois não há testes ainda).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .gitignore README.md
git commit -m "chore: setup repo with vitest"
```

---

## Task 2: Migrations Supabase — tabela `conversas`

**Files:**
- Create: `supabase/migrations/20260520_000001_conversas.sql`

- [ ] **Step 1: Criar migration**

Conteúdo de `supabase/migrations/20260520_000001_conversas.sql`:

```sql
create extension if not exists "uuid-ossp";

create table conversas (
  id                  uuid primary key default uuid_generate_v4(),
  telefone            text not null unique,
  status              text not null default 'coletando'
                      check (status in (
                        'coletando',
                        'aguardando_dados_cadastro',
                        'aguardando_confirmacao',
                        'agendando',
                        'concluido',
                        'erro',
                        'aguardando_cadastro_func'
                      )),
  dados               jsonb not null default '{}'::jsonb,
  cnpj_empresa        text,
  codigo_empresa_soc  int,
  aceite_lgpd_em      timestamptz,
  ultima_atividade    timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index idx_conversas_telefone on conversas(telefone);
create index idx_conversas_status on conversas(status) where status != 'concluido';
```

- [ ] **Step 2: Aplicar migration no Supabase**

Via MCP Supabase (assistente vai usar `mcp__supabase__apply_migration`) ou via Supabase CLI local. O nome da migration é `20260520_000001_conversas`.

- [ ] **Step 3: Verificar tabela criada**

Run via MCP: `mcp__supabase__list_tables`
Expected: tabela `conversas` aparece com as colunas listadas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000001_conversas.sql
git commit -m "feat(db): create conversas table"
```

---

## Task 3: Migrations — `mensagens` e `mensagens_recebidas`

**Files:**
- Create: `supabase/migrations/20260520_000002_mensagens.sql`

- [ ] **Step 1: Criar migration**

```sql
create table mensagens (
  id           bigserial primary key,
  conversa_id  uuid not null references conversas(id) on delete cascade,
  papel        text not null check (papel in ('user', 'assistant', 'tool', 'system')),
  conteudo     text,
  tool_name    text,
  tool_args    jsonb,
  tool_result  jsonb,
  created_at   timestamptz not null default now()
);

create index idx_mensagens_conversa on mensagens(conversa_id, created_at);

create table mensagens_recebidas (
  message_id   text primary key,
  conversa_id  uuid references conversas(id) on delete set null,
  recebida_em  timestamptz not null default now()
);

create index idx_mensagens_recebidas_recente
  on mensagens_recebidas(recebida_em desc);
```

- [ ] **Step 2: Aplicar via MCP Supabase**

Migration name: `20260520_000002_mensagens`.

- [ ] **Step 3: Verificar tabelas via `mcp__supabase__list_tables`**

Expected: `mensagens` e `mensagens_recebidas` presentes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000002_mensagens.sql
git commit -m "feat(db): create mensagens and mensagens_recebidas tables"
```

---

## Task 4: Migrations — caches (empresas + funcionários)

**Files:**
- Create: `supabase/migrations/20260520_000003_caches.sql`

- [ ] **Step 1: Criar migration**

```sql
create table empresas_cache (
  cnpj                  text primary key,
  codigo_empresa        int not null,
  razao_social          text,
  unidades              jsonb not null default '[]'::jsonb,
  defaults_funcionario  jsonb not null default '{}'::jsonb,
  atualizado_em         timestamptz not null default now()
);

create table funcionarios_cache (
  cpf                  text not null,
  codigo_empresa       int not null,
  codigo_funcionario   int not null,
  nome                 text,
  ativo                boolean not null default true,
  atualizado_em        timestamptz not null default now(),
  primary key (cpf, codigo_empresa)
);

create index idx_funcionarios_cache_atualizado
  on funcionarios_cache(atualizado_em desc);
```

- [ ] **Step 2: Aplicar via MCP. Migration name: `20260520_000003_caches`.**

- [ ] **Step 3: Verificar via `mcp__supabase__list_tables`.**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000003_caches.sql
git commit -m "feat(db): create empresas_cache and funcionarios_cache"
```

---

## Task 5: Migrations — config (agendas + slots)

**Files:**
- Create: `supabase/migrations/20260520_000004_config.sql`

- [ ] **Step 1: Criar migration**

```sql
create table agendas_config (
  id                        serial primary key,
  codigo_empresa_principal  int not null,
  unidade                   text not null,
  tipo_compromisso          text not null check (tipo_compromisso in (
    'ADMISSIONAL','PERIODICO','RETORNO_TRABALHO','MUDANCA_FUNCAO','DEMISSIONAL',
    'MONITORACAO_PONTUAL','CONSULTA','ACIDENTE','LICENCA_MEDICA','ENFERMAGEM',
    'TERCEIROS','CONSULTA_ASSISTENCIAL'
  )),
  codigo_usuario_agenda     int not null,
  codigo_prestador          int,
  ativo                     boolean not null default true,
  unique (codigo_empresa_principal, unidade, tipo_compromisso)
);

create table slots_config (
  id                serial primary key,
  agenda_config_id  int not null references agendas_config(id) on delete cascade,
  dia_semana        int not null check (dia_semana between 1 and 7),
  hora_inicial      time not null,
  duracao_minutos   int not null default 30,
  ativo             boolean not null default true
);

create index idx_slots_agenda on slots_config(agenda_config_id) where ativo;
```

- [ ] **Step 2: Aplicar via MCP. Migration name: `20260520_000004_config`.**

- [ ] **Step 3: Verificar via `list_tables`.**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000004_config.sql
git commit -m "feat(db): create agendas_config and slots_config"
```

---

## Task 6: Migrations — `agendamentos` (com idempotência)

**Files:**
- Create: `supabase/migrations/20260520_000005_agendamentos.sql`

- [ ] **Step 1: Criar migration**

```sql
create table agendamentos (
  id                  uuid primary key default uuid_generate_v4(),
  conversa_id         uuid references conversas(id),
  codigo_agendamento  int,
  codigo_agenda       int,
  codigo_funcionario  int,
  cpf                 text,
  data                date,
  hora_inicial        time,
  tipo_compromisso    text,
  status              text not null default 'agendado'
                      check (status in ('agendado','cancelado','alterado','falhou')),
  idempotency_key     text unique,
  payload_envio       jsonb,
  payload_retorno     jsonb,
  created_at          timestamptz not null default now()
);

create index idx_agendamentos_conversa on agendamentos(conversa_id);
create index idx_agendamentos_cpf_data on agendamentos(cpf, data);
```

- [ ] **Step 2: Aplicar via MCP. Migration name: `20260520_000005_agendamentos`.**

- [ ] **Step 3: Verificar via `list_tables`.**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000005_agendamentos.sql
git commit -m "feat(db): create agendamentos table with idempotency"
```

---

## Task 7: Migrations — `notificacoes_pendentes`

**Files:**
- Create: `supabase/migrations/20260520_000006_notificacoes.sql`

- [ ] **Step 1: Criar migration**

```sql
create table notificacoes_pendentes (
  id            uuid primary key default uuid_generate_v4(),
  conversa_id   uuid references conversas(id) on delete set null,
  tipo          text not null check (tipo in (
    'cadastrar_funcionario','erro_soc','revisao','outro'
  )),
  prioridade    text not null default 'p2' check (prioridade in ('p0','p1','p2')),
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'aberto'
                check (status in ('aberto','resolvido','cancelado')),
  resolvido_por text,
  created_at    timestamptz not null default now(),
  resolvido_em  timestamptz
);

create index idx_notif_abertas on notificacoes_pendentes(created_at)
  where status = 'aberto';
```

- [ ] **Step 2: Aplicar via MCP. Migration name: `20260520_000006_notificacoes`.**

- [ ] **Step 3: Verificar.**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000006_notificacoes.sql
git commit -m "feat(db): create notificacoes_pendentes table"
```

---

## Task 8: Migrations — RLS

**Files:**
- Create: `supabase/migrations/20260520_000007_rls.sql`

- [ ] **Step 1: Criar migration**

```sql
-- Habilita RLS em todas as tabelas. Acesso é via service role (n8n), que bypassa RLS.
-- Nenhum cliente anônimo deve acessar essas tabelas.

alter table conversas              enable row level security;
alter table mensagens              enable row level security;
alter table mensagens_recebidas    enable row level security;
alter table empresas_cache         enable row level security;
alter table funcionarios_cache     enable row level security;
alter table agendas_config         enable row level security;
alter table slots_config           enable row level security;
alter table agendamentos           enable row level security;
alter table notificacoes_pendentes enable row level security;

-- Sem policies: anon e authenticated não acessam. Service role do n8n bypassa.
```

- [ ] **Step 2: Aplicar via MCP. Migration name: `20260520_000007_rls`.**

- [ ] **Step 3: Verificar RLS via consulta SQL**

Run via `mcp__supabase__execute_sql`:

```sql
select relname, relrowsecurity
from pg_class
where relname in (
  'conversas','mensagens','mensagens_recebidas','empresas_cache',
  'funcionarios_cache','agendas_config','slots_config','agendamentos',
  'notificacoes_pendentes'
);
```

Expected: todas com `relrowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000007_rls.sql
git commit -m "feat(db): enable RLS on all tables"
```

---

## Task 9: Migrations — retenção/anonimização

**Files:**
- Create: `supabase/migrations/20260520_000008_retencao.sql`

- [ ] **Step 1: Criar migration com função de anonimização**

```sql
-- Função: anonimiza conversas concluídas/erro com mais de 90 dias.
-- - Apaga conteúdo das mensagens (mantém metadata para auditoria estatística)
-- - Apaga dados pessoais de conversas.dados
-- Agendamentos NÃO são tocados (retenção legal exames ocupacionais).

create or replace function anonimizar_conversas_antigas()
returns int
language plpgsql
as $$
declare
  afetadas int;
begin
  with alvo as (
    select id from conversas
    where status in ('concluido','erro')
      and ultima_atividade < now() - interval '90 days'
      and dados ?| array['funcionarios','cnpj']
  )
  update conversas c
    set dados = jsonb_build_object('anonimizado', true),
        cnpj_empresa = null,
        telefone = '__anon__' || c.id::text
  from alvo
  where c.id = alvo.id;

  get diagnostics afetadas = row_count;

  update mensagens m
    set conteudo = '[anonimizado]',
        tool_args = null,
        tool_result = null
  from conversas c
  where m.conversa_id = c.id
    and c.telefone like '__anon__%'
    and m.conteudo != '[anonimizado]';

  return afetadas;
end;
$$;

comment on function anonimizar_conversas_antigas is
  'Anonimiza conversas concluidas/erro com mais de 90 dias. Agendar via cron.';
```

- [ ] **Step 2: Aplicar via MCP. Migration name: `20260520_000008_retencao`.**

- [ ] **Step 3: Testar função em dry-run**

```sql
select anonimizar_conversas_antigas();
```

Expected: retorna `0` (sem conversas antigas ainda).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000008_retencao.sql
git commit -m "feat(db): retention function for LGPD anonymization"
```

---

## Task 10: Helper `xml-escape`

**Files:**
- Create: `src/soap/xml-builders/_escape.js`
- Test: `tests/soap/xml-builders/_escape.test.js`

- [ ] **Step 1: Escrever teste**

`tests/soap/xml-builders/_escape.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { xmlEscape } from '../../../src/soap/xml-builders/_escape.js';

describe('xmlEscape', () => {
  it('escapa & < > " \'', () => {
    expect(xmlEscape(`Tom & Jerry <test> "quoted" 'apos'`))
      .toBe(`Tom &amp; Jerry &lt;test&gt; &quot;quoted&quot; &apos;apos&apos;`);
  });

  it('preserva texto sem caracteres especiais', () => {
    expect(xmlEscape('João Silva 123')).toBe('João Silva 123');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(xmlEscape(null)).toBe('');
    expect(xmlEscape(undefined)).toBe('');
  });

  it('converte número para string', () => {
    expect(xmlEscape(42)).toBe('42');
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `npm test -- _escape`
Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

`src/soap/xml-builders/_escape.js`:

```js
export function xmlEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `npm test -- _escape`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/soap/xml-builders/_escape.js tests/soap/xml-builders/_escape.test.js
git commit -m "feat(soap): xml-escape helper"
```

---

## Task 11: Helper WS-Security

**Files:**
- Create: `src/soap/ws-security.js`
- Test: `tests/soap/ws-security.test.js`

- [ ] **Step 1: Escrever testes**

`tests/soap/ws-security.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildSecurityHeader, computePasswordDigest } from '../../src/soap/ws-security.js';

describe('computePasswordDigest', () => {
  // Vetor de teste da spec WS-Security UsernameToken Profile 1.0
  it('calcula digest com nonce, created e password', () => {
    const nonce = Buffer.from('WScqanjCEAC4mQoBE07sAQ==', 'base64');
    const created = '2003-07-16T01:24:32Z';
    const password = 'StringPassword';
    const digest = computePasswordDigest(nonce, created, password);
    // SHA1(nonce_bytes + created_utf8 + password_utf8), base64
    expect(digest).toBe('quR/EhPjGsk5cj9GwSDjAaJfIBs=');
  });

  it('lida com password contendo caracteres especiais', () => {
    const nonce = Buffer.alloc(16, 0);
    const created = '2026-05-20T12:00:00Z';
    const password = 'çãoé!@#';
    const digest = computePasswordDigest(nonce, created, password);
    expect(typeof digest).toBe('string');
    expect(digest.length).toBeGreaterThan(0);
  });
});

describe('buildSecurityHeader', () => {
  it('retorna XML com Username, Password tipo PasswordDigest, Nonce, Created e Expires', () => {
    const result = buildSecurityHeader({
      codigoUsuario: '12345',
      password: 'senha-teste',
      now: new Date('2026-05-20T12:00:00.000Z'),
    });

    expect(result).toContain('<wsse:Security');
    expect(result).toContain('<wsu:Timestamp');
    expect(result).toContain('<wsu:Created>2026-05-20T12:00:00.000Z</wsu:Created>');
    expect(result).toContain('<wsu:Expires>2026-05-20T12:01:00.000Z</wsu:Expires>');
    expect(result).toContain('<wsse:Username>U12345</wsse:Username>');
    expect(result).toContain('PasswordDigest');
    expect(result).toContain('<wsse:Nonce');
    expect(result).toContain('EncodingType=');
  });

  it('username sempre prefixado com U', () => {
    const result = buildSecurityHeader({
      codigoUsuario: 999,
      password: 'x',
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(result).toContain('<wsse:Username>U999</wsse:Username>');
  });

  it('cada chamada gera Nonce diferente', () => {
    const a = buildSecurityHeader({ codigoUsuario: '1', password: 'p', now: new Date() });
    const b = buildSecurityHeader({ codigoUsuario: '1', password: 'p', now: new Date() });
    const nonceA = a.match(/<wsse:Nonce[^>]*>([^<]+)<\/wsse:Nonce>/)[1];
    const nonceB = b.match(/<wsse:Nonce[^>]*>([^<]+)<\/wsse:Nonce>/)[1];
    expect(nonceA).not.toBe(nonceB);
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

Run: `npm test -- ws-security`
Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

`src/soap/ws-security.js`:

```js
import crypto from 'node:crypto';

export function computePasswordDigest(nonceBytes, created, password) {
  const buf = Buffer.concat([
    nonceBytes,
    Buffer.from(created, 'utf8'),
    Buffer.from(password, 'utf8'),
  ]);
  return crypto.createHash('sha1').update(buf).digest('base64');
}

export function buildSecurityHeader({ codigoUsuario, password, now = new Date() }) {
  const created = now.toISOString();
  const expires = new Date(now.getTime() + 60_000).toISOString();
  const nonceBytes = crypto.randomBytes(16);
  const nonceB64 = nonceBytes.toString('base64');
  const passwordDigest = computePasswordDigest(nonceBytes, created, password);
  const tsId = 'TS-' + crypto.randomBytes(8).toString('hex');
  const tokenId = 'UT-' + crypto.randomBytes(8).toString('hex');

  return `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <wsu:Timestamp wsu:Id="${tsId}">
    <wsu:Created>${created}</wsu:Created>
    <wsu:Expires>${expires}</wsu:Expires>
  </wsu:Timestamp>
  <wsse:UsernameToken wsu:Id="${tokenId}">
    <wsse:Username>U${codigoUsuario}</wsse:Username>
    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${passwordDigest}</wsse:Password>
    <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceB64}</wsse:Nonce>
    <wsu:Created>${created}</wsu:Created>
  </wsse:UsernameToken>
</wsse:Security>`;
}
```

- [ ] **Step 4: Rodar testes — todos passam**

Run: `npm test -- ws-security`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/soap/ws-security.js tests/soap/ws-security.test.js
git commit -m "feat(soap): WS-Security UsernameToken with PasswordDigest"
```

---

## Task 12: Helper `envelope` (concatena Header+Body)

**Files:**
- Create: `src/soap/envelope.js`
- Test: `tests/soap/envelope.test.js`

- [ ] **Step 1: Escrever teste**

`tests/soap/envelope.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildEnvelope } from '../../src/soap/envelope.js';

describe('buildEnvelope', () => {
  it('monta envelope SOAP completo', () => {
    const env = buildEnvelope({
      securityHeaderXml: '<wsse:Security>...</wsse:Security>',
      bodyXml: '<ser:incluirAgendamento>...</ser:incluirAgendamento>',
    });

    expect(env).toMatch(/^<\?xml version="1\.0"/);
    expect(env).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"');
    expect(env).toContain('xmlns:ser="http://services.soc.age.com/"');
    expect(env).toContain('<soapenv:Header>');
    expect(env).toContain('<wsse:Security>');
    expect(env).toContain('<soapenv:Body>');
    expect(env).toContain('<ser:incluirAgendamento>');
    expect(env).toContain('</soapenv:Envelope>');
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm test -- envelope`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/soap/envelope.js`:

```js
export function buildEnvelope({ securityHeaderXml, bodyXml }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.soc.age.com/">
<soapenv:Header>
${securityHeaderXml}
</soapenv:Header>
<soapenv:Body>
${bodyXml}
</soapenv:Body>
</soapenv:Envelope>`;
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm test -- envelope`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/soap/envelope.js tests/soap/envelope.test.js
git commit -m "feat(soap): envelope builder"
```

---

## Task 13: Builder `incluirAgendamento`

**Files:**
- Create: `src/soap/xml-builders/incluir-agendamento.js`
- Test: `tests/soap/xml-builders/incluir-agendamento.test.js`

- [ ] **Step 1: Escrever testes**

`tests/soap/xml-builders/incluir-agendamento.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildIncluirAgendamento } from '../../../src/soap/xml-builders/incluir-agendamento.js';

const baseInput = {
  identificacao: {
    codigoEmpresaPrincipal: 12345,
    codigoResponsavel: 67890,
    codigoUsuario: 'U111',
  },
  dadosAgendamento: {
    tipoBuscaEmpresa: 'CODIGO_SOC',
    codigoEmpresa: 555,
    tipoBuscaFuncionario: 'CPF_ATIVO',
    codigoFuncionario: '12345678900',
    codigoUsuarioAgenda: 99,
    data: '02/06/2026',
    horaInicial: '09:00',
    tipoCompromisso: 'PERIODICO',
  },
};

describe('buildIncluirAgendamento', () => {
  it('gera <ser:incluirAgendamento> com identificacao e dadosAgendamento', () => {
    const xml = buildIncluirAgendamento(baseInput);
    expect(xml).toContain('<ser:incluirAgendamento>');
    expect(xml).toContain('<IncluirAgendamentoWsVo>');
    expect(xml).toContain('<codigoEmpresaPrincipal>12345</codigoEmpresaPrincipal>');
    expect(xml).toContain('<codigoResponsavel>67890</codigoResponsavel>');
    expect(xml).toContain('<codigoUsuario>U111</codigoUsuario>');
    expect(xml).toContain('<tipoBuscaEmpresa>CODIGO_SOC</tipoBuscaEmpresa>');
    expect(xml).toContain('<codigoEmpresa>555</codigoEmpresa>');
    expect(xml).toContain('<tipoBuscaFuncionario>CPF_ATIVO</tipoBuscaFuncionario>');
    expect(xml).toContain('<codigoFuncionario>12345678900</codigoFuncionario>');
    expect(xml).toContain('<codigoUsuarioAgenda>99</codigoUsuarioAgenda>');
    expect(xml).toContain('<data>02/06/2026</data>');
    expect(xml).toContain('<horaInicial>09:00</horaInicial>');
    expect(xml).toContain('<tipoCompromisso>PERIODICO</tipoCompromisso>');
    expect(xml).toContain('</ser:incluirAgendamento>');
  });

  it('omite campos opcionais não fornecidos', () => {
    const xml = buildIncluirAgendamento(baseInput);
    expect(xml).not.toContain('<horaFinal>');
    expect(xml).not.toContain('<detalhes>');
    expect(xml).not.toContain('<emailWsVo>');
  });

  it('inclui horaFinal quando fornecida', () => {
    const xml = buildIncluirAgendamento({
      ...baseInput,
      dadosAgendamento: { ...baseInput.dadosAgendamento, horaFinal: '09:30' },
    });
    expect(xml).toContain('<horaFinal>09:30</horaFinal>');
  });

  it('inclui codigoPrestador quando fornecido', () => {
    const xml = buildIncluirAgendamento({
      ...baseInput,
      dadosAgendamento: { ...baseInput.dadosAgendamento, codigoPrestador: 42 },
    });
    expect(xml).toContain('<codigoPrestador>42</codigoPrestador>');
  });

  it('escapa caracteres especiais em detalhes', () => {
    const xml = buildIncluirAgendamento({
      ...baseInput,
      dadosAgendamento: {
        ...baseInput.dadosAgendamento,
        detalhes: 'Obs <importante> & "marcar"',
      },
    });
    expect(xml).toContain('Obs &lt;importante&gt; &amp; &quot;marcar&quot;');
    expect(xml).not.toContain('Obs <importante>');
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm test -- incluir-agendamento`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/soap/xml-builders/incluir-agendamento.js`:

```js
import { xmlEscape } from './_escape.js';

function tag(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

export function buildIncluirAgendamento({ identificacao, dadosAgendamento }) {
  const i = identificacao;
  const d = dadosAgendamento;

  return `<ser:incluirAgendamento>
  <IncluirAgendamentoWsVo>
    <identificacaoWsVo>
      ${tag('codigoEmpresaPrincipal', i.codigoEmpresaPrincipal)}
      ${tag('codigoResponsavel', i.codigoResponsavel)}
      ${tag('codigoUsuario', i.codigoUsuario)}
    </identificacaoWsVo>
    <dadosAgendamentoWsVo>
      ${tag('tipoBuscaEmpresa', d.tipoBuscaEmpresa)}
      ${tag('codigoEmpresa', d.codigoEmpresa)}
      ${tag('reservarCompromissoParaEmpresa', d.reservarCompromissoParaEmpresa)}
      ${tag('tipoBuscaFuncionario', d.tipoBuscaFuncionario)}
      ${tag('codigoFuncionario', d.codigoFuncionario)}
      ${tag('codigoUsuarioAgenda', d.codigoUsuarioAgenda)}
      ${tag('data', d.data)}
      ${tag('horaInicial', d.horaInicial)}
      ${tag('horaFinal', d.horaFinal)}
      ${tag('codigoCompromisso', d.codigoCompromisso)}
      ${tag('usaOutroCompromisso', d.usaOutroCompromisso)}
      ${tag('conteudoOutroCompromisso', d.conteudoOutroCompromisso)}
      ${tag('tipoCompromisso', d.tipoCompromisso)}
      ${tag('detalhes', d.detalhes)}
      ${tag('codigoProfissionalAgenda', d.codigoProfissionalAgenda)}
      ${tag('horarioChegada', d.horarioChegada)}
      ${tag('horarioSaida', d.horarioSaida)}
      ${tag('priorizarAtendimento', d.priorizarAtendimento)}
      ${tag('codigoPrestador', d.codigoPrestador)}
    </dadosAgendamentoWsVo>
  </IncluirAgendamentoWsVo>
</ser:incluirAgendamento>`;
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm test -- incluir-agendamento`
Expected: 5 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/soap/xml-builders/incluir-agendamento.js tests/soap/xml-builders/incluir-agendamento.test.js
git commit -m "feat(soap): builder for incluirAgendamento"
```

---

## Task 14: Builder `importacaoFuncionario`

**Files:**
- Create: `src/soap/xml-builders/importacao-funcionario.js`
- Test: `tests/soap/xml-builders/importacao-funcionario.test.js`

- [ ] **Step 1: Escrever testes**

`tests/soap/xml-builders/importacao-funcionario.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildImportacaoFuncionario } from '../../../src/soap/xml-builders/importacao-funcionario.js';

const probeInput = {
  identificacao: {
    chaveAcesso: 'abc123',
    codigoEmpresaPrincipal: 12345,
    codigoResponsavel: 67890,
    codigoUsuario: 'U111',
  },
  flags: {
    criarFuncionario: false,
    atualizarFuncionario: false,
  },
  funcionario: {
    codigoEmpresa: '555',
    tipoBuscaEmpresa: 'CODIGO_SOC',
    chaveProcuraFuncionario: 'CPF_ATIVO',
    cpf: '12345678900',
  },
};

const novoFuncionario = {
  identificacao: probeInput.identificacao,
  flags: {
    criarFuncionario: true,
    criarSetor: false,
    criarCargo: false,
    criarUnidade: false,
  },
  funcionario: {
    codigoEmpresa: '555',
    tipoBuscaEmpresa: 'CODIGO_SOC',
    chaveProcuraFuncionario: 'CPF',
    cpf: '12345678900',
    nomeFuncionario: 'João Silva',
    dataNascimento: '12/05/1990',
    sexo: 'MASCULINO',
    estadoCivil: 'SOLTEIRO',
    dataAdmissao: '15/01/2024',
    regimeTrabalho: 'NORMAL',
    tipoContratacao: 'CLT',
    situacao: 'ATIVO',
  },
  unidade: { codigo: 1, tipoBusca: 'CODIGO' },
  setor: { codigo: 1, tipoBusca: 'CODIGO' },
  cargo: { codigo: 1, tipoBusca: 'CODIGO' },
};

describe('buildImportacaoFuncionario', () => {
  it('monta probe (criarFuncionario=false) com chaveProcuraFuncionario=CPF_ATIVO', () => {
    const xml = buildImportacaoFuncionario(probeInput);
    expect(xml).toContain('<ser:importacaoFuncionario>');
    expect(xml).toContain('<criarFuncionario>false</criarFuncionario>');
    expect(xml).toContain('<atualizarFuncionario>false</atualizarFuncionario>');
    expect(xml).toContain('<chaveProcuraFuncionario>CPF_ATIVO</chaveProcuraFuncionario>');
    expect(xml).toContain('<cpf>12345678900</cpf>');
    expect(xml).toContain('<chaveAcesso>abc123</chaveAcesso>');
  });

  it('monta cadastro novo com todos os campos obrigatórios', () => {
    const xml = buildImportacaoFuncionario(novoFuncionario);
    expect(xml).toContain('<criarFuncionario>true</criarFuncionario>');
    expect(xml).toContain('<nomeFuncionario>João Silva</nomeFuncionario>');
    expect(xml).toContain('<dataNascimento>12/05/1990</dataNascimento>');
    expect(xml).toContain('<sexo>MASCULINO</sexo>');
    expect(xml).toContain('<estadoCivil>SOLTEIRO</estadoCivil>');
    expect(xml).toContain('<dataAdmissao>15/01/2024</dataAdmissao>');
    expect(xml).toContain('<regimeTrabalho>NORMAL</regimeTrabalho>');
    expect(xml).toContain('<tipoContratacao>CLT</tipoContratacao>');
    expect(xml).toContain('<situacao>ATIVO</situacao>');
    // Hierarquia
    expect(xml).toMatch(/<unidadeWsVo>[\s\S]*<codigo>1<\/codigo>[\s\S]*<\/unidadeWsVo>/);
    expect(xml).toMatch(/<setorWsVo>[\s\S]*<codigo>1<\/codigo>[\s\S]*<\/setorWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<codigo>1<\/codigo>[\s\S]*<\/cargoWsVo>/);
  });

  it('escapa caracteres especiais em nome', () => {
    const xml = buildImportacaoFuncionario({
      ...novoFuncionario,
      funcionario: { ...novoFuncionario.funcionario, nomeFuncionario: 'Maria & José' },
    });
    expect(xml).toContain('<nomeFuncionario>Maria &amp; José</nomeFuncionario>');
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npm test -- importacao-funcionario`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/soap/xml-builders/importacao-funcionario.js`:

```js
import { xmlEscape } from './_escape.js';

function tag(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

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
  deficiencia,
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
      ${tag('cpf', funcionario.cpf)}
      ${tag('nomeFuncionario', funcionario.nomeFuncionario)}
      ${tag('dataNascimento', funcionario.dataNascimento)}
      ${tag('dataAdmissao', funcionario.dataAdmissao)}
      ${tag('sexo', funcionario.sexo)}
      ${tag('estadoCivil', funcionario.estadoCivil)}
      ${tag('regimeTrabalho', funcionario.regimeTrabalho)}
      ${tag('tipoContratacao', funcionario.tipoContratacao)}
      ${tag('situacao', funcionario.situacao)}
      ${tag('funcao', funcionario.funcao)}
      ${tag('email', funcionario.email)}
      ${tag('telefoneCelular', funcionario.telefoneCelular)}
    </funcionarioWsVo>
    ${hierarquia('unidadeWsVo', unidade)}
    ${hierarquia('setorWsVo', setor)}
    ${hierarquia('cargoWsVo', cargo)}
    ${hierarquia('centroCustoWsVo', centroCusto)}
    ${hierarquia('motivoLicencaWsVo', motivoLicenca)}
    ${hierarquia('turnoWsVo', turno)}
  </Funcionario>
</ser:importacaoFuncionario>`;
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm test -- importacao-funcionario`
Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/soap/xml-builders/importacao-funcionario.js tests/soap/xml-builders/importacao-funcionario.test.js
git commit -m "feat(soap): builder for importacaoFuncionario (probe + create)"
```

---

## Task 15: Parser de resposta SOAP

**Files:**
- Create: `src/soap/response-parser.js`
- Test: `tests/soap/response-parser.test.js`

- [ ] **Step 1: Instalar `fast-xml-parser`**

```bash
npm install fast-xml-parser
```

- [ ] **Step 2: Escrever testes**

`tests/soap/response-parser.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseSoapResponse } from '../../src/soap/response-parser.js';

const SUCCESS_INCLUIR = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:incluirAgendamentoResponse xmlns:ns2="http://services.soc.age.com/">
      <AgendamentoRetorno>
        <dadosAgendamento>
          <codigoUsuarioAgenda>99</codigoUsuarioAgenda>
          <data>02/06/2026</data>
          <horaInicial>09:00</horaInicial>
        </dadosAgendamento>
        <informacaoGeral>
          <codigoMensagem>SOC-100</codigoMensagem>
          <mensagem>SUCESSO</mensagem>
          <numeroErros>0</numeroErros>
        </informacaoGeral>
        <codigoAgendamento>5555</codigoAgendamento>
      </AgendamentoRetorno>
    </ns2:incluirAgendamentoResponse>
  </soap:Body>
</soap:Envelope>`;

const ERRO_CONSISTENCIA = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:incluirAgendamentoResponse xmlns:ns2="http://services.soc.age.com/">
      <AgendamentoRetorno>
        <informacaoGeral>
          <codigoMensagem>SOC-200</codigoMensagem>
          <mensagem>ERRO. Operação não realizada.</mensagem>
          <mensagemOperacaoDetalheList>
            <codigo>SOC-306</codigo>
            <mensagem>Compromisso no mesmo dia e mesma hora.</mensagem>
          </mensagemOperacaoDetalheList>
          <numeroErros>1</numeroErros>
        </informacaoGeral>
      </AgendamentoRetorno>
    </ns2:incluirAgendamentoResponse>
  </soap:Body>
</soap:Envelope>`;

const FAULT_AUTH = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode xmlns:ns1="...">ns1:FailedAuthentication</faultcode>
      <faultstring>The security token could not be authenticated or authorized</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

const FUNC_PROBE_ENCONTRADO = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:importacaoFuncionarioResponse xmlns:ns2="http://services.soc.age.com/">
      <FuncionarioRetorno>
        <encontrouErro>false</encontrouErro>
        <encontrouFuncionario>true</encontrouFuncionario>
        <atualizouFuncionario>false</atualizouFuncionario>
        <incluiuFuncionario>false</incluiuFuncionario>
        <descricaoErro></descricaoErro>
      </FuncionarioRetorno>
    </ns2:importacaoFuncionarioResponse>
  </soap:Body>
</soap:Envelope>`;

describe('parseSoapResponse', () => {
  it('classifica sucesso de incluirAgendamento', () => {
    const r = parseSoapResponse(SUCCESS_INCLUIR);
    expect(r.kind).toBe('success');
    expect(r.operation).toBe('incluirAgendamento');
    expect(r.codigoAgendamento).toBe(5555);
    expect(r.dadosAgendamento.data).toBe('02/06/2026');
  });

  it('classifica erro de consistência (SOC-200 com detalhes)', () => {
    const r = parseSoapResponse(ERRO_CONSISTENCIA);
    expect(r.kind).toBe('error_consistency');
    expect(r.codigoMensagem).toBe('SOC-200');
    expect(r.detalhes).toHaveLength(1);
    expect(r.detalhes[0].codigo).toBe('SOC-306');
  });

  it('classifica soap:Fault', () => {
    const r = parseSoapResponse(FAULT_AUTH);
    expect(r.kind).toBe('fault');
    expect(r.faultcode).toContain('FailedAuthentication');
    expect(r.faultstring).toContain('security token');
  });

  it('classifica resposta de probe funcionário (encontrou)', () => {
    const r = parseSoapResponse(FUNC_PROBE_ENCONTRADO);
    expect(r.kind).toBe('success');
    expect(r.operation).toBe('importacaoFuncionario');
    expect(r.encontrouFuncionario).toBe(true);
    expect(r.incluiuFuncionario).toBe(false);
  });

  it('retorna unknown se XML inválido', () => {
    const r = parseSoapResponse('<not valid xml');
    expect(r.kind).toBe('unknown');
  });
});
```

- [ ] **Step 3: Rodar — falha**

Run: `npm test -- response-parser`
Expected: FAIL.

- [ ] **Step 4: Implementar**

`src/soap/response-parser.js`:

```js
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: true,
});

export function parseSoapResponse(xml) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return { kind: 'unknown', raw: xml };
  }

  const body = doc?.Envelope?.Body;
  if (!body) return { kind: 'unknown', raw: xml };

  if (body.Fault) {
    return {
      kind: 'fault',
      faultcode: String(body.Fault.faultcode ?? ''),
      faultstring: String(body.Fault.faultstring ?? ''),
    };
  }

  // Agendamento (incluir/alterar/excluir)
  const incluirResp = body.incluirAgendamentoResponse;
  const alterarResp = body.alterarAgendamentoResponse;
  const excluirResp = body.excluirAgendamentoResponse;
  const funcResp = body.importacaoFuncionarioResponse;

  if (incluirResp || alterarResp || excluirResp) {
    const op = incluirResp ? 'incluirAgendamento'
             : alterarResp ? 'alterarAgendamento'
             : 'excluirAgendamento';
    const ret = (incluirResp || alterarResp || excluirResp).AgendamentoRetorno
             || (incluirResp || alterarResp || excluirResp).AgendamentoRetornoAlteracao
             || (incluirResp || alterarResp || excluirResp).AgendamentoRetornoExclusao;

    const info = ret?.informacaoGeral || {};
    const codigo = String(info.codigoMensagem ?? '');

    if (codigo === 'SOC-100' || codigo === '') {
      return {
        kind: 'success',
        operation: op,
        codigoAgendamento: ret?.codigoAgendamento ? Number(ret.codigoAgendamento) : undefined,
        dadosAgendamento: ret?.dadosAgendamento || {},
        info,
      };
    }

    const detList = info.mensagemOperacaoDetalheList;
    const detalhes = !detList ? []
      : Array.isArray(detList) ? detList : [detList];

    return {
      kind: 'error_consistency',
      operation: op,
      codigoMensagem: codigo,
      mensagem: String(info.mensagem ?? ''),
      detalhes: detalhes.map(d => ({
        codigo: String(d.codigo ?? ''),
        mensagem: String(d.mensagem ?? ''),
      })),
    };
  }

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
      raw: ret,
    };
  }

  return { kind: 'unknown', raw: xml };
}
```

- [ ] **Step 5: Rodar — passa**

Run: `npm test -- response-parser`
Expected: 5 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/soap/response-parser.js tests/soap/response-parser.test.js package.json package-lock.json
git commit -m "feat(soap): response parser classifies success/error/fault"
```

---

## Task 16: Error mapper

**Files:**
- Create: `src/soap/error-map.js`
- Test: `tests/soap/error-map.test.js`

- [ ] **Step 1: Escrever testes**

`tests/soap/error-map.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mapError } from '../../src/soap/error-map.js';

describe('mapError', () => {
  it('SOC-202 → bucket B, pede CNPJ', () => {
    const r = mapError({ codigo: 'SOC-202' });
    expect(r.bucket).toBe('B');
    expect(r.retry).toBe('ask_cnpj');
    expect(r.userMsg).toMatch(/CNPJ/i);
  });

  it('SOC-303 → bucket B, sem msg (entra em cadastro)', () => {
    const r = mapError({ codigo: 'SOC-303' });
    expect(r.bucket).toBe('B');
    expect(r.retry).toBe('start_cadastro_funcionario');
  });

  it('SOC-306 → bucket C, propõe outro horário', () => {
    const r = mapError({ codigo: 'SOC-306' });
    expect(r.bucket).toBe('C');
    expect(r.retry).toBe('ask_horario');
  });

  it('SOC-332 (inadimplente) → bucket E, encerra', () => {
    const r = mapError({ codigo: 'SOC-332' });
    expect(r.bucket).toBe('E');
    expect(r.retry).toBe('abort');
  });

  it('FailedAuthentication → bucket A, encerra+notifica', () => {
    const r = mapError({ codigo: 'FailedAuthentication' });
    expect(r.bucket).toBe('A');
    expect(r.retry).toBe('abort_notify');
  });

  it('código desconhecido → bucket A (conservador), notifica', () => {
    const r = mapError({ codigo: 'SOC-9999' });
    expect(r.bucket).toBe('A');
    expect(r.retry).toBe('abort_notify');
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npm test -- error-map`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/soap/error-map.js`:

```js
// bucket: A=infra B=dado_corrigivel C=conflito_horario D=bug_payload E=regra_negocio
// retry: ask_cnpj | start_cadastro_funcionario | ask_funcionario_data | ask_horario
//      | ask_tipo_exame | ask_payload | abort | abort_notify

const MAP = {
  // ---- Infra/auth (A) ----
  FailedAuthentication: { bucket: 'A', retry: 'abort_notify', userMsg: 'Tivemos um problema técnico de autenticação. Equipe Safe já foi avisada.' },
  InvalidSecurity:      { bucket: 'A', retry: 'abort_notify', userMsg: 'Tivemos um problema técnico. Equipe Safe já foi avisada.' },
  MessageExpired:       { bucket: 'A', retry: 'retry_once',   userMsg: null },
  'SOC-201':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Erro desconhecido no SOC. Equipe Safe já foi avisada.' },
  'SOC-311':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Problema técnico. Equipe Safe já foi avisada.' },
  'SOC-314':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Problema técnico. Equipe Safe já foi avisada.' },
  'SOC-343':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Problema técnico ao processar. Equipe avisada.' },

  // ---- Dado corrigível (B) ----
  'SOC-202': { bucket: 'B', retry: 'ask_cnpj', userMsg: 'Não localizei essa empresa. Você pode confirmar o CNPJ?' },
  'SOC-304': { bucket: 'B', retry: 'ask_cnpj', userMsg: 'CNPJ inválido. Pode confirmar o número?' },
  'SOC-303': { bucket: 'B', retry: 'start_cadastro_funcionario', userMsg: null },
  'SOC-315': { bucket: 'B', retry: 'ask_tipo_exame', userMsg: 'Tipo de exame não localizado. Qual exame você precisa? (admissional, periódico, demissional, mudança função, retorno, consulta)' },
  'SOC-316': { bucket: 'B', retry: 'ask_tipo_exame', userMsg: 'Tipo de compromisso inválido. Pode me dizer de novo?' },
  'SOC-341': { bucket: 'B', retry: 'ask_tipo_exame', userMsg: 'Esse funcionário está inativo no sistema. Só posso agendar exame demissional. Quer prosseguir?' },

  // ---- Conflito horário (C) ----
  'SOC-306': { bucket: 'C', retry: 'ask_horario', userMsg: 'Esse horário não está mais disponível. Posso oferecer outro?' },
  'SOC-307': { bucket: 'C', retry: 'ask_horario', userMsg: 'Já existe um agendamento nesse horário. Quer outro horário?' },
  'SOC-308': { bucket: 'C', retry: 'ask_horario', userMsg: 'A agenda atingiu o limite nesse dia. Que tal outro dia?' },
  'SOC-327': { bucket: 'C', retry: 'ask_horario', userMsg: 'Horário não disponível na grade. Posso ofertar outro?' },
  'SOC-340': { bucket: 'C', retry: 'ask_horario', userMsg: 'Limite diário de agendamentos atingido. Que tal outro dia?' },
  'SOC-353': { bucket: 'C', retry: 'ask_horario', userMsg: 'Horário final indisponível. Posso ofertar outro horário?' },

  // ---- Bug payload (D) ----
  'SOC-210': { bucket: 'D', retry: 'abort_notify', userMsg: 'Tive um problema processando os dados. Equipe Safe avisada.' },
  'SOC-325': { bucket: 'D', retry: 'ask_payload', userMsg: 'A data não está válida. Pode confirmar no formato DD/MM/AAAA?' },
  'SOC-326': { bucket: 'D', retry: 'ask_payload', userMsg: 'O horário não está válido. Pode confirmar?' },
  'SOC-329': { bucket: 'D', retry: 'ask_payload', userMsg: 'Hora final inválida. Vou tentar de novo.' },
  'SOC-330': { bucket: 'D', retry: 'ask_payload', userMsg: 'Horário de chegada inválido.' },
  'SOC-331': { bucket: 'D', retry: 'ask_payload', userMsg: 'Horário de saída inválido.' },

  // ---- Regra negócio (E) ----
  'SOC-206': { bucket: 'E', retry: 'abort_notify', userMsg: 'Sua empresa não está habilitada para esse serviço. Equipe Safe entrará em contato.' },
  'SOC-209': { bucket: 'E', retry: 'abort_notify', userMsg: 'Permissões insuficientes no sistema. Equipe Safe avisada.' },
  'SOC-342': { bucket: 'E', retry: 'abort_notify', userMsg: 'Permissões insuficientes. Equipe Safe avisada.' },
  'SOC-332': { bucket: 'E', retry: 'abort',        userMsg: 'Identificamos pendência financeira na sua empresa. Por favor regularize com nosso comercial antes do agendamento.' },
  'SOC-336': { bucket: 'E', retry: 'abort',        userMsg: 'Não é permitido agendar sem funcionário neste contexto.' },
  'SOC-339': { bucket: 'E', retry: 'abort',        userMsg: 'Configuração de usuário externo impede essa ação.' },
};

export function mapError({ codigo }) {
  return MAP[codigo] || {
    bucket: 'A',
    retry: 'abort_notify',
    userMsg: `Erro desconhecido (${codigo}). Equipe Safe já foi avisada.`,
  };
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm test -- error-map`
Expected: 6 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/soap/error-map.js tests/soap/error-map.test.js
git commit -m "feat(soap): error-map classifying SOC codes into buckets"
```

---

## Task 17: Detector de confirmação

**Files:**
- Create: `src/confirmation/detect.js`
- Test: `tests/confirmation/detect.test.js`

- [ ] **Step 1: Escrever testes**

`tests/confirmation/detect.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { detectConfirmation } from '../../src/confirmation/detect.js';

describe('detectConfirmation', () => {
  it.each([
    'sim', 'SIM', ' sim ', 'sim!', 's', 'confirmo', 'pode confirmar', 'isso',
    'ok', 'beleza', '👍', '✅', 'pode ser', 'tá certo', 'perfeito',
  ])('positivo: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('yes');
  });

  it.each([
    'não', 'nao', 'NÃO', ' n ', 'cancela', 'errado', 'tá errado', 'não confirmo',
    'corrige', 'mudei de ideia',
  ])('negativo: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('no');
  });

  it.each([
    'talvez', 'aí me explica melhor', 'qual o valor?', 'pode ser dia 5?',
  ])('ambíguo: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('ambiguous');
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npm test -- detect`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/confirmation/detect.js`:

```js
const POSITIVE = /^(sim|s|confirmo|confirmado|pode( ser| confirmar)?|isso|ok|okay|beleza|blz|t[áa]\s*(certo|ok|bom)|perfeito|👍|✅|claro)$/i;
const NEGATIVE = /^(n[ãa]o|n|cancela(r)?|errado|t[áa]\s*errado|n[ãa]o\s*confirmo|corrige|mudei\s*de\s*ideia)$/i;

export function detectConfirmation(msg) {
  if (!msg) return 'ambiguous';
  const trimmed = msg.trim().toLowerCase();
  if (POSITIVE.test(trimmed)) return 'yes';
  if (NEGATIVE.test(trimmed)) return 'no';
  return 'ambiguous';
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm test -- detect`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/confirmation/detect.js tests/confirmation/detect.test.js
git commit -m "feat(confirmation): regex detector for yes/no/ambiguous"
```

---

## Task 18: Verify webhook signature Meta

**Files:**
- Create: `src/meta/verify-signature.js`
- Test: `tests/meta/verify-signature.test.js`

- [ ] **Step 1: Escrever testes**

`tests/meta/verify-signature.test.js`:

```js
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyMetaSignature } from '../../src/meta/verify-signature.js';

const APP_SECRET = 'super-secret';

function sign(body) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
}

describe('verifyMetaSignature', () => {
  it('aceita assinatura válida', () => {
    const body = '{"foo":"bar"}';
    expect(verifyMetaSignature({ body, signature: sign(body), appSecret: APP_SECRET })).toBe(true);
  });

  it('rejeita assinatura inválida', () => {
    expect(verifyMetaSignature({ body: '{"foo":"bar"}', signature: 'sha256=deadbeef', appSecret: APP_SECRET })).toBe(false);
  });

  it('rejeita assinatura ausente', () => {
    expect(verifyMetaSignature({ body: '{}', signature: '', appSecret: APP_SECRET })).toBe(false);
    expect(verifyMetaSignature({ body: '{}', signature: undefined, appSecret: APP_SECRET })).toBe(false);
  });

  it('rejeita prefixo errado', () => {
    expect(verifyMetaSignature({ body: '{}', signature: 'sha1=abc', appSecret: APP_SECRET })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npm test -- verify-signature`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/meta/verify-signature.js`:

```js
import crypto from 'node:crypto';

export function verifyMetaSignature({ body, signature, appSecret }) {
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm test -- verify-signature`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/meta/verify-signature.js tests/meta/verify-signature.test.js
git commit -m "feat(meta): HMAC verification of X-Hub-Signature-256"
```

---

## Task 19: System prompt do agente LLM

**Files:**
- Create: `src/llm/system-prompt.js`
- Test: `tests/llm/system-prompt.test.js`

- [ ] **Step 1: Escrever teste**

`tests/llm/system-prompt.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/llm/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('inclui regras-chave e estado/dados atuais', () => {
    const p = buildSystemPrompt({
      status: 'coletando',
      dados: { cnpj: '123', funcionarios: [] },
    });
    expect(p).toContain('Safe');
    expect(p).toContain('PT-BR');
    expect(p).toContain('NUNCA');
    expect(p).toContain('agendar_no_soc');
    expect(p).toContain('enviar_confirmacao');
    expect(p).toContain('coletando');
    expect(p).toContain('"cnpj":');
  });

  it('lista tipos de exame válidos', () => {
    const p = buildSystemPrompt({ status: 'coletando', dados: {} });
    expect(p).toContain('ADMISSIONAL');
    expect(p).toContain('PERIODICO');
    expect(p).toContain('DEMISSIONAL');
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npm test -- system-prompt`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/llm/system-prompt.js`:

```js
export function buildSystemPrompt({ status, dados }) {
  return `Você é o assistente de agendamento de exames ocupacionais da Safe.
Atende donos de empresas via WhatsApp em PT-BR informal, cordial e direto.

OBJETIVO: coletar dados e agendar exame(s) no sistema SOC.

DADOS NECESSÁRIOS por exame:
- CNPJ da empresa (se ainda não confirmado neste contexto)
- CPF do funcionário
- Tipo de exame (um destes): ADMISSIONAL, PERIODICO, DEMISSIONAL, MUDANCA_FUNCAO, RETORNO_TRABALHO, CONSULTA
- Unidade de atendimento (cidade/local — confira em buscar_empresa)
- Data preferida (sempre normalize para DD/MM/AAAA antes de chamar tools)
- Hora preferida (HH:MM)

Para CADASTRAR funcionário novo (quando buscar_funcionario retorna "nao_encontrado"):
peça: nome completo, data de nascimento, sexo, estado civil, data de admissão, função.

REGRAS RÍGIDAS:
1. Sempre comece confirmando o CNPJ se ainda não tiver codigo_empresa_soc.
2. Para cada CPF, sempre chame buscar_funcionario primeiro.
3. Antes de qualquer agendamento, SEMPRE chame enviar_confirmacao com resumo claro.
4. NUNCA chame agendar_no_soc por iniciativa própria. O sistema só dispara após o cliente
   responder "SIM" — você não controla isso.
5. Se o cliente quiser agendar vários funcionários, acumule no estado e mande UMA confirmação
   consolidada no final.
6. Em erro do SOC, traduza para PT-BR amigável conforme a userMsg que o sistema retornar.
7. Datas em PT-BR ("amanhã", "dia 5 do mês que vem") — normalize para DD/MM/AAAA antes de
   passar pra qualquer tool. Use a data de hoje do contexto.

ESTADO ATUAL DA CONVERSA:
status: ${status}
dados coletados: ${JSON.stringify(dados, null, 2)}
`;
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm test -- system-prompt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/system-prompt.js tests/llm/system-prompt.test.js
git commit -m "feat(llm): system prompt builder"
```

---

## Task 20: Sub-workflow n8n `soc_soap_call`

**Files:**
- Create: `n8n/workflows/03_soc_soap_call.json` (exportado de n8n após construção)

**Nota:** workflows n8n são construídos visualmente. Esta task descreve o sub-workflow a montar. Após pronto, exporte o JSON (botão "Download" no n8n) e salve no path acima.

- [ ] **Step 1: Criar credenciais n8n**

No n8n, criar credenciais:
- `SOC_WS_AGENDAMENTO_URL` (string) — URL WSDL prod.
- `SOC_WS_AGENDAMENTO_URL_HOMOL` (string) — URL WSDL homologação.
- `SOC_WS_FUNCIONARIO_URL`, `SOC_WS_FUNCIONARIO_URL_HOMOL`.
- `SOC_CODIGO_USUARIO`, `SOC_PASSWORD`, `SOC_CODIGO_EMPRESA_PRINCIPAL`, `SOC_CODIGO_RESPONSAVEL`.
- `SOC_CHAVE_ACESSO` (chaveAcesso usado em importacaoFuncionario).

- [ ] **Step 2: Criar workflow `03_soc_soap_call` como sub-workflow**

Estrutura de nós (em ordem):

1. **Trigger:** `When Called by Another Workflow` (input: `endpoint`, `bodyXml`, `ambiente` default `prod`).
2. **Code (JS) — montar Security Header:** cola o conteúdo de `src/soap/ws-security.js` e chama
   `buildSecurityHeader({ codigoUsuario, password, now: new Date() })`. Exporta `securityHeaderXml`.
3. **Code (JS) — montar envelope:** cola `src/soap/envelope.js` e chama `buildEnvelope(...)`.
   Exporta `envelopeXml`.
4. **HTTP Request:**
   - Method: POST
   - URL: expressão `={{ $('Trigger').item.json.ambiente === 'homol' ? $env.SOC_WS_AGENDAMENTO_URL_HOMOL : $env.SOC_WS_AGENDAMENTO_URL }}`
     (ajustar para escolher entre WS Agendamento e WS Funcionário conforme `endpoint`).
   - Header: `Content-Type: text/xml; charset=utf-8`, `SOAPAction: ""`.
   - Body: `={{ $json.envelopeXml }}`.
   - Timeout: 30000 ms.
   - On Error: continue (importante).
5. **Code (JS) — parsear:** cola `src/soap/response-parser.js` e chama
   `parseSoapResponse(httpResponseBody)`. Retorna `parsed`.
6. **Code (JS) — mapear erro se aplicável:** se `parsed.kind === 'error_consistency'`, pega
   `parsed.detalhes[0].codigo`, chama `mapError({ codigo })` e anexa ao retorno.
7. **Respond to Workflow:** devolve `{ parsed, mappedError }`.

- [ ] **Step 3: Testar manualmente no n8n**

Execute o sub-workflow passando `endpoint='agendamento'`, `ambiente='homol'` e um `bodyXml` mínimo de probe de funcionário com CPF inválido. Deve retornar uma resposta SOC parseada (provavelmente bucket B SOC-303).

- [ ] **Step 4: Exportar JSON do workflow**

No n8n: menu → "Download" → salvar em `n8n/workflows/03_soc_soap_call.json`.

- [ ] **Step 5: Commit**

```bash
git add n8n/workflows/03_soc_soap_call.json
git commit -m "feat(n8n): sub-workflow soc_soap_call"
```

---

## Task 21: Tool n8n `buscar_empresa`

**Files:**
- Create: `n8n/workflows/04_tool_buscar_empresa.json`

**Pré-requisito:** Como o SOC não tem WS público de "buscar empresa por CNPJ", esta versão usa
**apenas o cache Supabase**. O `empresas_cache` é populado manualmente pela equipe Safe (ver Task 27,
seed). Se cache miss, a tool retorna `{ erro: 'empresa_nao_cadastrada' }` e o bot pede que cliente
contate a Safe pra cadastro inicial.

- [ ] **Step 1: Criar workflow no n8n**

Estrutura:

1. **Trigger:** `When Called by Another Workflow` (input: `cnpj`).
2. **Code (JS) — normalizar CNPJ:** remove tudo que não for dígito.

   ```js
   const cnpj = String($input.first().json.cnpj || '').replace(/\D/g, '');
   return [{ json: { cnpj } }];
   ```

3. **Supabase node — Select empresas_cache:**
   - Table: `empresas_cache`
   - Filter: `cnpj = {{ $json.cnpj }}`
   - Return: first

4. **IF:** `{{ $json.codigo_empresa != null }}` — hit / miss.

5. **Respond to Workflow (hit):** `{ ok: true, codigo_empresa, razao_social, unidades, defaults_funcionario }`.

6. **Respond to Workflow (miss):** `{ ok: false, erro: 'empresa_nao_cadastrada' }`.

- [ ] **Step 2: Testar com CNPJ inexistente**

Esperado: retorna `{ ok: false, erro: 'empresa_nao_cadastrada' }`.

- [ ] **Step 3: Inserir empresa de teste manualmente via Supabase Studio**

```sql
insert into empresas_cache (cnpj, codigo_empresa, razao_social, unidades, defaults_funcionario)
values ('12345678000190', 999, 'Empresa Teste',
  '[{"nome": "Santos"}]'::jsonb,
  '{"codigo_unidade_padrao": 1, "tipo_busca_unidade": "CODIGO", "codigo_setor_padrao": 1, "tipo_busca_setor": "CODIGO", "codigo_cargo_padrao": 1, "tipo_busca_cargo": "CODIGO", "tipo_contratacao_default": "CLT", "regime_trabalho_default": "NORMAL", "situacao_default": "ATIVO"}'::jsonb);
```

Testar de novo: retorna `{ ok: true, codigo_empresa: 999, ... }`.

- [ ] **Step 4: Exportar JSON**

Salvar em `n8n/workflows/04_tool_buscar_empresa.json`.

- [ ] **Step 5: Commit**

```bash
git add n8n/workflows/04_tool_buscar_empresa.json
git commit -m "feat(n8n): tool buscar_empresa (cache only v1)"
```

---

## Task 22: Tool n8n `buscar_funcionario`

**Files:**
- Create: `n8n/workflows/05_tool_buscar_funcionario.json`

- [ ] **Step 1: Criar workflow**

Estrutura:

1. **Trigger:** input `{ cpf, codigo_empresa }`.
2. **Normalizar CPF:** só dígitos.
3. **Supabase — Select funcionarios_cache** com `cpf` + `codigo_empresa`. Se hit e
   `atualizado_em > now() - 24h`, retorna cache (`ok: true, codigo_funcionario, nome, ativo: true, from_cache: true`).
4. **Senão:** monta payload probe e chama `03_soc_soap_call`:
   - `endpoint: 'funcionario'`
   - `bodyXml`: usar Code node que cola `src/soap/xml-builders/importacao-funcionario.js` e chama
     `buildImportacaoFuncionario({ identificacao: {...}, flags: { criarFuncionario: false, atualizarFuncionario: false }, funcionario: { codigoEmpresa, tipoBuscaEmpresa: 'CODIGO_SOC', chaveProcuraFuncionario: 'CPF_ATIVO', cpf } })`.
5. **Avaliar resposta:**
   - Se `parsed.encontrouFuncionario === true` → ainda precisamos do `codigo_funcionario`. Como o WS Funcionário M2 não devolve o código na resposta de probe, **upsert no cache** com placeholder e usar `chaveProcuraFuncionario=CPF_ATIVO` na hora do agendamento (o WS de agendamento aceita esse enum diretamente). Cacheia `{ cpf, codigo_empresa, codigo_funcionario: null, nome: null, ativo: true }`.
   - Se `parsed.encontrouFuncionario === false` → retorna `{ ok: false, erro: 'nao_encontrado' }`.
6. **Respond to Workflow.**

**Nota técnica importante:** WS Agendamento aceita `tipoBuscaFuncionario=CPF_ATIVO` com `codigoFuncionario=<cpf>`. Isso simplifica: não precisamos do `codigo_funcionario` numérico — usamos o próprio CPF como chave.

- [ ] **Step 2: Testar com CPF de funcionário existente na empresa de homologação**

Configurar `ambiente: 'homol'` no chamado de teste. Esperado: `{ ok: true, ativo: true }`.

- [ ] **Step 3: Testar com CPF inexistente**

Esperado: `{ ok: false, erro: 'nao_encontrado' }`.

- [ ] **Step 4: Exportar JSON e commit**

```bash
git add n8n/workflows/05_tool_buscar_funcionario.json
git commit -m "feat(n8n): tool buscar_funcionario (probe via importacaoFuncionario)"
```

---

## Task 23: Tool n8n `cadastrar_funcionario` — ❌ CANCELADA (2026-05-21)

> **Cancelada pelo amendment de escopo.** Workflow `06_tool_cadastrar_funcionario` foi deletado do n8n. Caso de "funcionário não encontrado" agora cai em `14_tool_transferir_humano` (Task 23B). Bloco abaixo mantido para histórico — **não implementar**.



**Files:**
- Create: `n8n/workflows/06_tool_cadastrar_funcionario.json`

- [ ] **Step 1: Criar workflow**

Input: `{ codigo_empresa, dados: { cpf, nome, dataNascimento, sexo, estadoCivil, dataAdmissao, funcao }, defaults }`.

Estrutura:

1. **Trigger:** recebe input.
2. **Code (JS) — montar body:**
   - Convertência de datas: ISO `1990-05-12` → `12/05/1990`.
   - Mapear `funcao` (texto livre) → usa `defaults.codigo_cargo_padrao` se cargo novo não for criado nesta v1.
   - Chamar `buildImportacaoFuncionario({ identificacao, flags: { criarFuncionario: true }, funcionario: {...}, unidade: { codigo: defaults.codigo_unidade_padrao, tipoBusca: 'CODIGO' }, setor: { codigo: defaults.codigo_setor_padrao, tipoBusca: 'CODIGO' }, cargo: { codigo: defaults.codigo_cargo_padrao, tipoBusca: 'CODIGO' } })`.
3. **Chama `03_soc_soap_call`** com endpoint `funcionario`.
4. **Avaliar:**
   - `parsed.incluiuFuncionario === true` → upsert no cache, retorna `{ ok: true }`.
   - `parsed.encontrouErro === true` → retorna `{ ok: false, erro: parsed.descricaoErro }`.
   - Erro de consistência (`mappedError`) → retorna `{ ok: false, mappedError }`.

- [ ] **Step 2: Testar cadastro em homologação**

Use empresa de homologação. CPF inédito. Esperado: `{ ok: true }`. Verificar no SOC homol que funcionário aparece.

- [ ] **Step 3: Testar cadastro com CPF já existente**

Esperado: SOC retorna erro indicando duplicidade. `{ ok: false, erro: ... }`.

- [ ] **Step 4: Exportar e commit**

```bash
git add n8n/workflows/06_tool_cadastrar_funcionario.json
git commit -m "feat(n8n): tool cadastrar_funcionario"
```

---

## Task 24: Tool n8n `listar_slots`

**Files:**
- Create: `n8n/workflows/07_tool_listar_slots.json`

- [ ] **Step 1: Criar workflow**

Input: `{ codigo_empresa_principal, unidade, tipo_compromisso, data_de, data_ate }`.

Estrutura:

1. **Trigger.**
2. **Supabase — Select `agendas_config`** com filtros: `codigo_empresa_principal`, `unidade`,
   `tipo_compromisso`, `ativo=true`. Se não encontrar, retorna `{ ok: false, erro: 'sem_agenda' }`.
3. **Supabase — Select `slots_config`** por `agenda_config_id`, `ativo=true`.
4. **Code (JS) — expandir slots:** itera datas entre `data_de` e `data_ate`, e pra cada dia
   verifica quais slots batem com `dia_semana`. Resultado: lista de `{ data: 'DD/MM/AAAA', hora: 'HH:MM', codigo_usuario_agenda }`.
5. **Supabase — Select `agendamentos`** ocupados:
   ```sql
   select data, hora_inicial, codigo_agenda
     from agendamentos
    where codigo_agenda = $1
      and data between $2 and $3
      and status = 'agendado';
   ```
6. **Code (JS) — remover ocupados** da lista expandida.
7. **Respond:** `{ ok: true, slots: [...] }`.

- [ ] **Step 2: Inserir agenda e slots de teste**

```sql
insert into agendas_config (codigo_empresa_principal, unidade, tipo_compromisso, codigo_usuario_agenda)
values (1, 'Santos', 'PERIODICO', 99);

insert into slots_config (agenda_config_id, dia_semana, hora_inicial)
values (1, 2, '09:00'), (1, 2, '10:00'), (1, 3, '09:00');
```

- [ ] **Step 3: Testar workflow**

Chamada teste com data_de = próxima segunda, data_ate = +7 dias. Esperado: lista de slots não ocupados.

- [ ] **Step 4: Exportar e commit**

```bash
git add n8n/workflows/07_tool_listar_slots.json
git commit -m "feat(n8n): tool listar_slots"
```

---

## Task 25: Tool n8n `agendar_no_soc` (com idempotência)

**Files:**
- Create: `n8n/workflows/08_tool_agendar_no_soc.json`

- [ ] **Step 1: Criar workflow**

Input: `{ conversa_id, codigo_empresa, codigo_funcionario_cpf, data, hora_inicial, tipo_compromisso, codigo_usuario_agenda, codigo_prestador? }`.

Estrutura:

1. **Trigger.**
2. **Code (JS) — calcular `idempotency_key`:** `sha1(conversa_id + cpf + data + hora_inicial)`.
3. **Supabase — Select `agendamentos`** por `idempotency_key`. Se já existe e `status='agendado'`,
   retorna `{ ok: true, codigo_agendamento, from_cache: true }` sem chamar SOC.
4. **Code (JS) — montar body:** usa `buildIncluirAgendamento({ identificacao, dadosAgendamento: { tipoBuscaEmpresa: 'CODIGO_SOC', codigoEmpresa, tipoBuscaFuncionario: 'CPF_ATIVO', codigoFuncionario: cpf, codigoUsuarioAgenda, data, horaInicial, tipoCompromisso, codigoPrestador } })`.
5. **Chama `03_soc_soap_call`** endpoint `agendamento`.
6. **Avaliar:**
   - `parsed.kind === 'success'` → insert `agendamentos` (com `idempotency_key`, `codigo_agendamento`, `payload_envio`, `payload_retorno`), retorna `{ ok: true, codigo_agendamento }`.
   - `parsed.kind === 'error_consistency'` → retorna `{ ok: false, codigo_erro, mappedError }`.
   - `parsed.kind === 'fault'` → `{ ok: false, fault: parsed.faultcode, mappedError: mapError({ codigo: parsed.faultcode.split(':').pop() }) }`.

- [ ] **Step 2: Testar caminho feliz em homologação**

CPF de funcionário ativo, data/hora válidos. Esperado: agendamento criado no SOC homol + linha em
`agendamentos` local com `codigo_agendamento`.

- [ ] **Step 3: Testar idempotência**

Chamar a mesma operação 2x seguidas. 2ª chamada NÃO deve chamar SOC; retornar `from_cache: true`.

- [ ] **Step 4: Testar conflito (SOC-306)**

Tentar agendar no mesmo horário 2x com chaves diferentes. 2ª retorna `mappedError.bucket === 'C'`.

- [ ] **Step 5: Exportar e commit**

```bash
git add n8n/workflows/08_tool_agendar_no_soc.json
git commit -m "feat(n8n): tool agendar_no_soc with idempotency"
```

---

## Task 26: Tool n8n `enviar_whatsapp` e `notificar_safe`

**Files:**
- Create: `n8n/workflows/09_tool_enviar_whatsapp.json`
- Create: `n8n/workflows/10_tool_notificar_safe.json`

- [ ] **Step 1: Credenciais Meta**

n8n Credentials:
- `META_WA_TOKEN` (Bearer token Cloud API).
- `META_WA_PHONE_NUMBER_ID`.
- `META_APP_SECRET`.

- [ ] **Step 2: Workflow `enviar_whatsapp`**

Input: `{ telefone, texto }`.

Estrutura:
1. Trigger.
2. HTTP Request:
   - `POST https://graph.facebook.com/v20.0/{{ $env.META_WA_PHONE_NUMBER_ID }}/messages`
   - Header `Authorization: Bearer {{ $env.META_WA_TOKEN }}`.
   - Body JSON:
     ```json
     { "messaging_product": "whatsapp", "to": "{{ $json.telefone }}",
       "type": "text", "text": { "body": "{{ $json.texto }}" } }
     ```
3. Supabase insert em `mensagens` (papel='assistant', conteudo=texto).
4. Respond: `{ ok: true, message_id: <id retornado> }`.

- [ ] **Step 3: Workflow `notificar_safe`**

Input: `{ conversa_id, tipo, prioridade, payload }`.

Estrutura:
1. Trigger.
2. Supabase insert em `notificacoes_pendentes`.
3. Se `prioridade === 'p0'` → nó Send Email do n8n para `processos1.soc@gpsafework.com.br` (assunto: `[BOT P0] {{ tipo }}`, corpo: payload JSON).
4. Respond: `{ ok: true, notif_id }`.

- [ ] **Step 4: Testar `enviar_whatsapp` mandando msg para número de teste**

Confirma chegada. Verifica linha em `mensagens`.

- [ ] **Step 5: Testar `notificar_safe`**

Confirma row em `notificacoes_pendentes`.

- [ ] **Step 6: Exportar e commit**

```bash
git add n8n/workflows/09_tool_enviar_whatsapp.json n8n/workflows/10_tool_notificar_safe.json
git commit -m "feat(n8n): tools enviar_whatsapp and notificar_safe"
```

---

## Task 27: Seed de configuração (instruções)

**Files:**
- Create: `supabase/seed/README.md`

- [ ] **Step 1: Documentar processo de seed manual**

`supabase/seed/README.md`:

```markdown
# Seed de configuração

Antes do bot atender uma empresa, a equipe Safe precisa popular três coisas no Supabase:

## 1. `empresas_cache` (uma linha por empresa cliente)

```sql
insert into empresas_cache (cnpj, codigo_empresa, razao_social, unidades, defaults_funcionario)
values ('CNPJ_SO_DIGITOS', CODIGO_NO_SOC, 'Razão Social', '[]'::jsonb, '{
  "codigo_unidade_padrao": <codigo SOC>,
  "tipo_busca_unidade": "CODIGO",
  "codigo_setor_padrao": <codigo SOC>,
  "tipo_busca_setor": "CODIGO",
  "codigo_cargo_padrao": <codigo SOC>,
  "tipo_busca_cargo": "CODIGO",
  "tipo_contratacao_default": "CLT",
  "regime_trabalho_default": "NORMAL",
  "situacao_default": "ATIVO"
}'::jsonb);
```

## 2. `agendas_config` (uma por combinação empresa/unidade/tipo_exame)

```sql
insert into agendas_config (codigo_empresa_principal, unidade, tipo_compromisso, codigo_usuario_agenda)
values (CODIGO_EMP_PRINC, 'Santos', 'PERIODICO', CODIGO_AGENDA_SOC);
```

## 3. `slots_config` (slots disponíveis por agenda)

```sql
insert into slots_config (agenda_config_id, dia_semana, hora_inicial, duracao_minutos)
values (1, 2, '09:00', 30);  -- segunda 9h
```

`dia_semana`: 1=domingo, 2=segunda, ..., 7=sábado.

## Onde achar os códigos SOC

- `codigo_empresa`: na tela "Configurações de Integração - Empresa/Cliente" no SOC.
- `codigo_usuario_agenda`: tela de cadastro de agenda no SOC.
- `codigo_unidade_padrao`, `codigo_setor_padrao`, `codigo_cargo_padrao`: cadastros respectivos
  no SOC. Use o primeiro/principal de cada para começar.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/seed/README.md
git commit -m "docs(db): seed instructions for Safe team"
```

---

## Task 28: Workflow principal `recebe_mensagem`

**Files:**
- Create: `n8n/workflows/01_recebe_mensagem.json`

- [ ] **Step 1: Criar webhook trigger**

n8n: novo workflow, primeiro nó **Webhook**:
- Method: POST
- Path: `wa-bot-<uuid-aleatório-gerado-uma-vez>`
- Authentication: none (validação manual via signature abaixo).

- [ ] **Step 2: Nó Code — verificar signature**

Cola `src/meta/verify-signature.js` e:

```js
const signature = $input.first().json.headers['x-hub-signature-256'];
const body = JSON.stringify($input.first().json.body);
const ok = verifyMetaSignature({ body, signature, appSecret: $env.META_APP_SECRET });
if (!ok) {
  throw new Error('Invalid signature');
}
return $input.all();
```

- [ ] **Step 3: Nó Code — extrair mensagem**

```js
const entry = $json.body?.entry?.[0]?.changes?.[0]?.value;
const msg = entry?.messages?.[0];
if (!msg || msg.type !== 'text') {
  // Ignora outros tipos (status updates, etc.)
  return [];
}
return [{
  json: {
    message_id: msg.id,
    telefone: msg.from,
    texto: msg.text.body,
    timestamp: msg.timestamp,
  },
}];
```

- [ ] **Step 4: Nó Supabase — dedupe**

`INSERT INTO mensagens_recebidas (message_id) VALUES ('{{ $json.message_id }}') ON CONFLICT DO NOTHING RETURNING message_id`.

Se nenhum row retornado → mensagem já processada → encerra fluxo (nó IF).

- [ ] **Step 5: Nó Supabase — upsert conversa**

```sql
insert into conversas (telefone, status)
values ('{{ $json.telefone }}', 'coletando')
on conflict (telefone) do update set ultima_atividade = now()
returning *;
```

- [ ] **Step 6: Nó IF — aceite LGPD**

Se `conversas.aceite_lgpd_em is null`: chama `enviar_whatsapp` com mensagem LGPD, atualiza
`aceite_lgpd_em = now()`, encerra (não chama LLM nesta msg — espera próxima).

- [ ] **Step 7: Nó Code — insere mensagem do usuário em `mensagens`**

```sql
insert into mensagens (conversa_id, papel, conteudo) values (..., 'user', $texto);
```

- [ ] **Step 8: Nó IF — detecção de confirmação determinística**

Se `conversa.status === 'aguardando_confirmacao'`:
- Cola `src/confirmation/detect.js` e roda.
- Se `'yes'` → seta `status='agendando'`, chama `agendar_no_soc` com dados de
  `conversa.dados`, depois invoca LLM pra formatar resposta final.
- Se `'no'` → seta `status='coletando'`, passa pro LLM com hint "cliente recusou; pergunte o que corrigir".
- Se `'ambiguous'` → segue fluxo normal pra LLM.

- [ ] **Step 9: Nó Execute Workflow — chama `02_agente_llm`**

Passa `{ conversa, mensagens_historico, hint? }`.

- [ ] **Step 10: Exportar e commit**

```bash
git add n8n/workflows/01_recebe_mensagem.json
git commit -m "feat(n8n): main webhook workflow recebe_mensagem"
```

---

## Task 29: Workflow `agente_llm`

**Files:**
- Create: `n8n/workflows/02_agente_llm.json`

- [ ] **Step 1: Definir tool registry (OpenAI function calling)**

Lista de tools com schemas JSON:

```js
const tools = [
  { type: 'function', function: {
    name: 'buscar_empresa',
    description: 'Resolve CNPJ → código da empresa no SOC. Use quando o usuário informar o CNPJ.',
    parameters: { type: 'object', properties: { cnpj: { type: 'string' } }, required: ['cnpj'] },
  }},
  { type: 'function', function: {
    name: 'buscar_funcionario',
    description: 'Verifica se funcionário com este CPF está ativo no SOC dentro da empresa.',
    parameters: { type: 'object', properties: {
      cpf: { type: 'string' },
      codigo_empresa: { type: 'integer' },
    }, required: ['cpf', 'codigo_empresa'] },
  }},
  { type: 'function', function: {
    name: 'cadastrar_funcionario',
    description: 'Cadastra funcionário novo no SOC. Use após coletar todos os dados obrigatórios.',
    parameters: { type: 'object', properties: {
      codigo_empresa: { type: 'integer' },
      cpf: { type: 'string' },
      nome: { type: 'string' },
      dataNascimento: { type: 'string', description: 'DD/MM/AAAA' },
      sexo: { type: 'string', enum: ['MASCULINO', 'FEMININO'] },
      estadoCivil: { type: 'string', enum: ['SOLTEIRO','CASADO','SEPARADO','DIVORCIADO','VIUVO','OUTROS','DESQUITADO','UNIAO_ESTAVEL'] },
      dataAdmissao: { type: 'string', description: 'DD/MM/AAAA' },
      funcao: { type: 'string' },
    }, required: ['codigo_empresa','cpf','nome','dataNascimento','sexo','estadoCivil','dataAdmissao','funcao'] },
  }},
  { type: 'function', function: {
    name: 'listar_slots',
    description: 'Lista horários disponíveis para agendamento.',
    parameters: { type: 'object', properties: {
      codigo_empresa_principal: { type: 'integer' },
      unidade: { type: 'string' },
      tipo_compromisso: { type: 'string', enum: ['ADMISSIONAL','PERIODICO','DEMISSIONAL','MUDANCA_FUNCAO','RETORNO_TRABALHO','CONSULTA'] },
      data_de: { type: 'string', description: 'DD/MM/AAAA' },
      data_ate: { type: 'string', description: 'DD/MM/AAAA' },
    }, required: ['codigo_empresa_principal','unidade','tipo_compromisso','data_de','data_ate'] },
  }},
  { type: 'function', function: {
    name: 'enviar_confirmacao',
    description: 'Envia resumo final ao cliente e coloca a conversa em aguardando_confirmacao. NÃO use isso para mensagens normais.',
    parameters: { type: 'object', properties: { resumo: { type: 'string' } }, required: ['resumo'] },
  }},
  { type: 'function', function: {
    name: 'enviar_mensagem',
    description: 'Envia texto livre ao cliente via WhatsApp.',
    parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  }},
  { type: 'function', function: {
    name: 'notificar_safe',
    description: 'Avisa equipe Safe quando há erro ou intervenção necessária.',
    parameters: { type: 'object', properties: {
      tipo: { type: 'string', enum: ['cadastrar_funcionario','erro_soc','revisao','outro'] },
      prioridade: { type: 'string', enum: ['p0','p1','p2'] },
      payload: { type: 'object' },
    }, required: ['tipo','prioridade'] },
  }},
];
```

- [ ] **Step 2: Estrutura do workflow**

1. **Trigger:** `When Called by Another Workflow` (input: `conversa_id`, `hint?`).
2. **Supabase Select** `conversa` por `id`.
3. **Supabase Select** últimas 20 `mensagens` ordenadas por `created_at`.
4. **Code (JS) — montar payload OpenAI:**
   - System prompt: `buildSystemPrompt({ status, dados })` (cola `src/llm/system-prompt.js`).
   - Histórico mapeado para `{ role, content }` (papéis user/assistant/tool).
   - Se `hint`, prepend system msg adicional.
5. **HTTP Request OpenAI** `POST https://api.openai.com/v1/chat/completions`:
   - Model: `gpt-4o-mini` (decidir após eval).
   - `tools: <registry acima>`.
   - `tool_choice: 'auto'`.
   - Authorization: `Bearer {{ $env.OPENAI_API_KEY }}`.
6. **Code — processar resposta:**
   - Se `message.content` → chama tool `enviar_mensagem` com esse texto (workflow 09).
   - Se `message.tool_calls` → para cada tool_call, invoca o sub-workflow correspondente,
     grava resultado em `mensagens` (papel=tool, tool_name, tool_args, tool_result), e
     **recursivamente chama o agente** com novo histórico (LOOP). Limite: 5 iterações por turno.
7. **Salvar mensagem assistant** em `mensagens`.
8. **Atualizar `conversas.dados`** se LLM extraiu dados estruturados (tool side-effect).

- [ ] **Step 3: Testar com mensagem fictícia**

Inserir uma conversa-teste manualmente, chamar workflow com um turn simples ("oi, quero agendar"). Verificar que o agente responde pedindo CNPJ.

- [ ] **Step 4: Testar fluxo completo até confirmação**

Sequência manual:
1. "oi" → bot pede CNPJ
2. "12345678000190" (cadastrado) → bot pede CPF
3. "12345678900" → bot busca → bot pede tipo de exame
4. "periódico" → bot pede unidade/data
5. "segunda que vem 9h em Santos" → bot pede confirmação
6. "sim" → bot agenda no SOC → bot confirma agendamento

Cada passo deve resultar em estado consistente em `conversas` e `mensagens`.

- [ ] **Step 5: Exportar e commit**

```bash
git add n8n/workflows/02_agente_llm.json
git commit -m "feat(n8n): LLM agent workflow with tool calling"
```

---

## Task 30: Workflow `retomar_apos_cadastro` (intervenção humana)

**Files:**
- Create: `n8n/workflows/11_retomar_apos_cadastro.json`

- [ ] **Step 1: Criar trigger Supabase**

Migration adicional (`supabase/migrations/20260520_000009_trigger_retomar.sql`):

```sql
create or replace function notificar_retomar_conversa() returns trigger
language plpgsql as $$
declare
  webhook_url text := current_setting('app.retomar_webhook_url', true);
begin
  if NEW.status = 'resolvido' and OLD.status = 'aberto' and NEW.tipo = 'cadastrar_funcionario' then
    perform net.http_post(
      url := webhook_url,
      body := jsonb_build_object('conversa_id', NEW.conversa_id, 'notif_id', NEW.id)::text,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return NEW;
end $$;

create trigger trg_retomar_conversa
  after update on notificacoes_pendentes
  for each row execute function notificar_retomar_conversa();
```

Aplicar via MCP. Configurar `app.retomar_webhook_url` no Supabase (URL do webhook deste workflow).

- [ ] **Step 2: Workflow n8n**

1. **Webhook trigger** (path: `retomar-<uuid>`).
2. **Supabase Select** `conversa_id` da notificação.
3. **Chamar `02_agente_llm`** com `hint='Funcionário foi cadastrado pela equipe Safe. Retome o agendamento de onde parou.'`.

- [ ] **Step 3: Testar**

Criar notificação manual com `tipo='cadastrar_funcionario'`, `status='aberto'`. Mudar pra `resolvido`. Verificar que webhook foi chamado e bot retomou conversa.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000009_trigger_retomar.sql n8n/workflows/11_retomar_apos_cadastro.json
git commit -m "feat(retomada): trigger Supabase + workflow retomar_apos_cadastro"
```

---

## Task 31: Eval set do LLM

**Files:**
- Create: `evals/transcripts/01_caso_feliz.json`
- Create: `evals/transcripts/02_funcionario_novo.json`
- Create: `evals/transcripts/03_cliente_vago.json`
- Create: `evals/transcripts/04_multiplos_funcionarios.json`
- Create: `evals/transcripts/05_cliente_muda_ideia.json`
- Create: `evals/run-eval.js`

- [ ] **Step 1: Estrutura de um transcript**

`evals/transcripts/01_caso_feliz.json`:

```json
{
  "name": "caso feliz — funcionário existente, agenda direto",
  "estado_inicial": {
    "status": "coletando",
    "dados": {}
  },
  "turns": [
    {
      "user": "Oi, quero marcar exame periódico do João Silva, CPF 123.456.789-00, CNPJ 12.345.678/0001-90, dia 2/6 às 9h em Santos.",
      "expected_tools": ["buscar_empresa", "buscar_funcionario", "enviar_confirmacao"],
      "expected_dados_keys": ["cnpj", "funcionarios"],
      "expected_status_after": "aguardando_confirmacao"
    },
    {
      "user": "sim",
      "expected_action": "agendamento_efetuado"
    }
  ]
}
```

Criar pelo menos 5 transcripts (1 por arquivo) cobrindo:
- Feliz, funcionário novo (com cadastro), cliente vago (poucas informações), múltiplos funcionários, mudança de ideia.

- [ ] **Step 2: Webhook `eval` no n8n**

Criar workflow simples `99_eval.json`:
1. Webhook trigger `eval-<uuid>`.
2. Recebe `{ transcript }`.
3. Cria conversa temporária no Supabase (`telefone: 'eval-' + random`).
4. Itera `turns` chamando `02_agente_llm` para cada `user` message.
5. Após cada turn, lê `mensagens` recentes e devolve tools chamadas + status final.

- [ ] **Step 3: Script `evals/run-eval.js`**

```js
import fs from 'node:fs';
import path from 'node:path';

const N8N_EVAL_URL = process.env.N8N_EVAL_URL; // ex: http://n8n.local/webhook/eval-xxxx
const DIR = path.join(import.meta.dirname, 'transcripts');

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
let pass = 0, fail = 0;

for (const file of files) {
  const transcript = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const res = await fetch(N8N_EVAL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });
  const out = await res.json();

  let ok = true;
  for (let i = 0; i < transcript.turns.length; i++) {
    const expected = transcript.turns[i];
    const actual = out.turns[i] || {};
    if (expected.expected_tools) {
      const missing = expected.expected_tools.filter(t => !actual.tools_called?.includes(t));
      if (missing.length) { ok = false; console.log(`FAIL ${file} turn ${i}: missing tools`, missing); }
    }
    if (expected.expected_status_after && actual.status !== expected.expected_status_after) {
      ok = false;
      console.log(`FAIL ${file} turn ${i}: status ${actual.status} != ${expected.expected_status_after}`);
    }
  }
  if (ok) { pass++; console.log(`PASS ${file}`); } else { fail++; }
}

console.log(`\n${pass}/${pass + fail} transcripts passing`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 4: Adicionar script ao `package.json`**

```json
{
  "scripts": {
    "eval": "node evals/run-eval.js"
  }
}
```

- [ ] **Step 3: Rodar eval manual**

Para cada transcript, executar no n8n, ver se tools certas foram chamadas. Documentar resultados.

- [ ] **Step 4: Commit**

```bash
git add evals/
git commit -m "test(eval): LLM eval set with 5 conversation transcripts"
```

---

## Task 32: Observabilidade básica

**Files:**
- Create: `supabase/migrations/20260520_000010_views_dashboard.sql`

- [ ] **Step 1: Criar views úteis**

```sql
create view v_conversas_diarias as
select date_trunc('day', created_at)::date as dia,
       count(*)                            as total,
       count(*) filter (where status = 'concluido') as concluidas,
       count(*) filter (where status = 'erro')      as com_erro
from conversas
group by 1
order by 1 desc;

create view v_erros_recentes as
select c.codigo as codigo_erro,
       c.descricao,
       count(*) as ocorrencias,
       max(c.quando) as ultima_ocorrencia
from (
  select tool_result->>'codigo_erro' as codigo,
         tool_result->>'mensagem'    as descricao,
         created_at                  as quando
  from mensagens
  where papel = 'tool'
    and tool_result->>'ok' = 'false'
    and created_at > now() - interval '7 days'
) c
where c.codigo is not null
group by c.codigo, c.descricao
order by ocorrencias desc;

create view v_notificacoes_abertas as
select n.*, c.telefone, c.dados
from notificacoes_pendentes n
left join conversas c on c.id = n.conversa_id
where n.status = 'aberto'
order by case n.prioridade when 'p0' then 0 when 'p1' then 1 else 2 end,
         n.created_at;
```

- [ ] **Step 2: Aplicar via MCP. Migration name: `20260520_000010_views_dashboard`.**

- [ ] **Step 3: Testar views via `mcp__supabase__execute_sql`**

```sql
select * from v_conversas_diarias limit 5;
select * from v_erros_recentes limit 5;
select * from v_notificacoes_abertas limit 5;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_000010_views_dashboard.sql
git commit -m "feat(obs): dashboard views for daily stats and recent errors"
```

---

## Task 33: Alerta P0 (cron de monitoramento)

**Files:**
- Create: `n8n/workflows/12_monitor_alertas.json`

- [ ] **Step 1: Workflow com Schedule Trigger**

A cada 10 min:
1. Supabase: `select count(*) from mensagens where papel='tool' and tool_result->>'bucket' = 'A' and created_at > now() - interval '10 minutes'`.
2. IF count >= 3: dispara `notificar_safe({ tipo: 'erro_soc', prioridade: 'p0', payload: { count } })`.
3. Supabase: `select count(*) from v_notificacoes_abertas where prioridade != 'p2' and created_at < now() - interval '2 hours'`.
4. IF count > 0: alerta de SLA estourado.

- [ ] **Step 2: Testar simulando erros buckets A**

Inserir manualmente 3 linhas em `mensagens` com `tool_result->>'bucket' = 'A'` nos últimos 10 min. Rodar workflow. Verificar notificação p0 criada.

- [ ] **Step 3: Exportar e commit**

```bash
git add n8n/workflows/12_monitor_alertas.json
git commit -m "feat(obs): monitoring cron with P0 alerts"
```

---

## Task 34: Rollout fase 1 (allowlist)

**Files:**
- Modify: `n8n/workflows/01_recebe_mensagem.json`

- [ ] **Step 1: Adicionar allowlist no workflow principal**

No `01_recebe_mensagem`, após extrair mensagem:

```js
const ALLOWLIST = ($env.WA_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
if (ALLOWLIST.length > 0 && !ALLOWLIST.includes($json.telefone)) {
  // responde mensagem padrão e encerra
  await callTool('enviar_whatsapp', {
    telefone: $json.telefone,
    texto: 'Olá! Este bot está em teste fechado. Em breve atenderemos seu número. Obrigado pela paciência.',
  });
  return [];
}
return $input.all();
```

Variável `WA_ALLOWLIST=5513999990000,5513888880000` (números E.164, sem `+`).

- [ ] **Step 2: Re-exportar e commit**

```bash
git add n8n/workflows/01_recebe_mensagem.json
git commit -m "feat(rollout): allowlist for phase 1 rollout"
```

---

## Task 35: Cron de retenção LGPD

**Files:**
- Create: `n8n/workflows/13_cron_retencao.json`

- [ ] **Step 1: Workflow**

Schedule Trigger diário às 03:00:
1. Supabase: `select anonimizar_conversas_antigas();`
2. Loga resultado em log de auditoria (criar tabela `audit_log` se quiser, opcional).

- [ ] **Step 2: Exportar e commit**

```bash
git add n8n/workflows/13_cron_retencao.json
git commit -m "feat(lgpd): daily cron for anonymization"
```

---

## Task 36: Documentação operacional final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar README com seções de operação**

Adicionar ao `README.md`:

```markdown
## Como rodar localmente os testes

```bash
npm test
```

## Como aplicar migrations no Supabase

Via MCP supabase (`mcp__supabase__apply_migration`) ou Supabase CLI:
```bash
supabase db push
```

## Como importar workflows no n8n

Para cada arquivo em `n8n/workflows/*.json`:
1. n8n → Workflows → Import from File.
2. Reconfigure credenciais (n8n não importa credenciais por segurança).
3. Ative o workflow.

## Como cadastrar uma empresa nova

Ver `supabase/seed/README.md`.

## Como resolver notificação pendente (intervenção humana)

1. Acesse Supabase Studio → tabela `notificacoes_pendentes`.
2. Filtre `status = 'aberto'`.
3. Para tipo `cadastrar_funcionario`: cadastre o funcionário no SOC manualmente
   usando os dados do `payload`.
4. Atualize a linha: `status = 'resolvido'`, `resolvido_por = 'seu_nome'`,
   `resolvido_em = now()`. O bot retoma a conversa automaticamente.

## Variáveis de ambiente n8n

- `SOC_WS_AGENDAMENTO_URL`, `SOC_WS_AGENDAMENTO_URL_HOMOL`
- `SOC_WS_FUNCIONARIO_URL`, `SOC_WS_FUNCIONARIO_URL_HOMOL`
- `SOC_CODIGO_USUARIO`, `SOC_PASSWORD`
- `SOC_CODIGO_EMPRESA_PRINCIPAL`, `SOC_CODIGO_RESPONSAVEL`, `SOC_CHAVE_ACESSO`
- `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_APP_SECRET`
- `OPENAI_API_KEY`
- `WA_ALLOWLIST` (CSV de telefones autorizados na fase 1)
```

- [ ] **Step 2: Commit final**

```bash
git add README.md
git commit -m "docs: operational README sections"
```

---

## Critério de pronto (definition of done)

Ao final desta sequência:
- ✅ Todos os helpers críticos cobertos por Vitest (testes verdes).
- ✅ 13 workflows n8n exportados em `n8n/workflows/`.
- ✅ 10 migrations Supabase aplicadas.
- ✅ 5 transcripts de eval com run manual ≥4/5 passando.
- ✅ Cenário feliz e cenário "funcionário novo" funcionando ponta-a-ponta em homologação.
- ✅ Allowlist ativa para fase 1 de rollout.
- ✅ Cron de retenção ativo.
- ✅ Documentação operacional completa.

Critério para avançar à **Fase 2 (piloto):** ≥90% de conversas piloto concluídas sem intervenção humana, zero agendamentos errados no SOC homol durante 1 semana de uso interno.
