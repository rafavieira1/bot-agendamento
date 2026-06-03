# Painel mostra só o atendimento atual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O painel de atendimento humano passa a exibir apenas as mensagens do atendimento (sessão) atual, escondendo o histórico de atendimentos já resolvidos do mesmo telefone.

**Architecture:** Coluna `conversas.atendimento_iniciado_em` marca o início da sessão corrente. WF1 carimba o marco e reabre a conversa quando chega mensagem em estado terminal (`encerrado`/`concluido`); WF4 passa a marcar `concluido` ao agendar; o painel filtra `mensagens.created_at >= atendimento_iniciado_em`. Mantém-se 1-conversa-por-telefone. Inclui fix #2: durante `transferido` a mensagem do cliente passa a ser salva (bot segue mudo).

**Tech Stack:** Supabase/Postgres (migration via MCP), n8n (WF1/WF4 via n8n-mcp), painel Vite+React+TS (Vitest), harness de evals (Node/Vitest).

**Spec:** [docs/superpowers/specs/2026-06-03-painel-atendimento-por-sessao-design.md](../specs/2026-06-03-painel-atendimento-por-sessao-design.md)

---

## File Structure

- `supabase/migrations/20260603_000001_atendimento_iniciado_em.sql` — **criar**: coluna + backfill.
- `panel/src/lib/supabase.ts` — **modificar**: tipo `Conversa` ganha `atendimento_iniciado_em`.
- `panel/src/hooks/useConversas.ts` — **modificar**: extrair `fetchMensagens(conversaId, anchor)`, `useMensagens(conversaId, anchor)`.
- `panel/src/pages/ConversaDetail.tsx` — **modificar**: passar `anchor` ao hook; carregar conversa por `[id]`.
- `panel/tests/mensagens.test.ts` — **criar**: testa o filtro por anchor.
- `evals/harness/wf1-layer.js` — **modificar**: reabertura em `encerrado`/`concluido`.
- `tests/harness/wf1-layer.test.js` — **criar**: testa `wf1Step`.
- n8n WF4 (`00kC3KB8q19KgCLp`) — **modificar (MCP, ao vivo)**: setar `concluido` após agendar.
- n8n WF1 (`o80iAlxgMjWBfher`) — **modificar (MCP, ao vivo)**: roteamento 3-vias + reabertura + save transferido.
- `CLAUDE.md` — **modificar**: documentar coluna, roteamento WF1, status concluido, filtro do painel.

---

## Task 0: Branch de trabalho

- [ ] **Step 1: Criar branch**

```bash
git checkout -b feat/painel-atendimento-sessao
```

---

## Task 1: Migration — coluna `atendimento_iniciado_em`

**Files:**
- Create: `supabase/migrations/20260603_000001_atendimento_iniciado_em.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Marco de início da sessão de atendimento corrente.
-- Painel exibe apenas mensagens com created_at >= atendimento_iniciado_em.
alter table conversas
  add column if not exists atendimento_iniciado_em timestamptz default now();

-- Backfill: conversas existentes começam na criação (não há sessão anterior a esconder).
update conversas
  set atendimento_iniciado_em = created_at
  where atendimento_iniciado_em is null;
```

- [ ] **Step 2: Aplicar via MCP**

Tool: `mcp__supabase__apply_migration`
- `project_id`: `czqellcrtzhjvdirpgxe`
- `name`: `atendimento_iniciado_em`
- `query`: (conteúdo do arquivo)

- [ ] **Step 3: Verificar coluna + backfill**

Tool: `mcp__supabase__execute_sql` (project `czqellcrtzhjvdirpgxe`):

```sql
select count(*) total,
       count(atendimento_iniciado_em) preenchidos,
       count(*) filter (where atendimento_iniciado_em = created_at) iguais_created
from conversas;
```
Esperado: `total == preenchidos == iguais_created` (todas preenchidas com created_at).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603_000001_atendimento_iniciado_em.sql
git commit -m "feat(db): coluna atendimento_iniciado_em em conversas"
```

---

## Task 2: Painel — tipo + filtro por anchor (TDD)

**Files:**
- Modify: `panel/src/lib/supabase.ts`
- Modify: `panel/src/hooks/useConversas.ts`
- Modify: `panel/src/pages/ConversaDetail.tsx`
- Test: `panel/tests/mensagens.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `panel/tests/mensagens.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock encadeável do supabase: cada método retorna o próprio builder;
// `order` resolve com {data,error}. Registra chamadas pra inspeção.
const calls: Record<string, unknown[]> = {};
function makeBuilder() {
  const builder: any = {};
  for (const m of ['select', 'eq', 'gte', 'order']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls[m] = args;
      if (m === 'order') return Promise.resolve({ data: [], error: null });
      return builder;
    });
  }
  return builder;
}
let builder = makeBuilder();
vi.mock('../src/lib/supabase', () => ({
  supabase: { from: vi.fn(() => builder) },
}));

import { fetchMensagens } from '../src/hooks/useConversas';

describe('fetchMensagens', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
    builder = makeBuilder();
  });

  it('filtra por created_at >= anchor quando anchor presente', async () => {
    await fetchMensagens('conv-1', '2026-06-03T10:00:00.000Z');
    expect(builder.eq).toHaveBeenCalledWith('conversa_id', 'conv-1');
    expect(builder.gte).toHaveBeenCalledWith('created_at', '2026-06-03T10:00:00.000Z');
  });

  it('NAO filtra quando anchor nulo (fallback: mostra tudo)', async () => {
    await fetchMensagens('conv-1', null);
    expect(builder.eq).toHaveBeenCalledWith('conversa_id', 'conv-1');
    expect(builder.gte).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd panel && npx vitest run tests/mensagens.test.ts
```
Esperado: FAIL — `fetchMensagens` não exportado.

- [ ] **Step 3: Adicionar `atendimento_iniciado_em` ao tipo Conversa**

Em `panel/src/lib/supabase.ts`, no type `Conversa`, após `created_at: string;` adicionar:

```ts
  atendimento_iniciado_em: string | null;
```

- [ ] **Step 4: Extrair `fetchMensagens` e parametrizar `useMensagens`**

Em `panel/src/hooks/useConversas.ts`, substituir a função `useMensagens` inteira por:

```ts
export async function fetchMensagens(conversaId: string, anchor: string | null) {
  let q = supabase.from('mensagens').select('*').eq('conversa_id', conversaId);
  if (anchor) q = q.gte('created_at', anchor);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as Mensagem[];
}

export function useMensagens(conversaId: string | undefined, anchor: string | null = null) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!conversaId) return;
    try {
      setMensagens(await fetchMensagens(conversaId, anchor));
    } catch {
      /* ignora; mantém estado anterior */
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!conversaId) return;
    refresh();
    const ch = supabase
      .channel(`msgs:${conversaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${conversaId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversas', filter: `id=eq.${conversaId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversaId, anchor]);

  return { mensagens, loading, refresh };
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

```bash
cd panel && npx vitest run tests/mensagens.test.ts
```
Esperado: PASS (2 testes).

- [ ] **Step 6: Passar o anchor em ConversaDetail**

Em `panel/src/pages/ConversaDetail.tsx`:

(a) Trocar a chamada do hook (linha ~12) para passar o anchor da conversa:

```tsx
  const { mensagens, refresh } = useMensagens(id, conversa?.atendimento_iniciado_em ?? null);
```

(b) Trocar a dependência do effect que carrega a conversa (linha ~23) de `[id, mensagens.length]` para `[id, mensagens.length]` permanece, mas garantir que `conversa` carrega — sem mudança extra. (O `anchor` é string estável; quando a conversa chega, o hook refetch-a filtrado. Sem loop: valor string idêntico não dispara refetch.)

> Nota: `conversa` é declarado antes do `useMensagens`? Não — `conversa` (useState) já está nas linhas 11. `useMensagens` está na 12. `conversa?.atendimento_iniciado_em` é lido no render, válido. OK.

- [ ] **Step 7: Build do painel**

```bash
cd panel && npm run build
```
Esperado: build verde (tsc + vite).

- [ ] **Step 8: Suite de testes do painel**

```bash
cd panel && npm test
```
Esperado: todos passando (api.test.ts + mensagens.test.ts).

- [ ] **Step 9: Commit**

```bash
git add panel/src/lib/supabase.ts panel/src/hooks/useConversas.ts panel/src/pages/ConversaDetail.tsx panel/tests/mensagens.test.ts
git commit -m "feat(panel): filtra mensagens pela sessao atual (atendimento_iniciado_em)"
```

---

## Task 3: Harness wf1-layer — reabertura em estado terminal (TDD)

**Files:**
- Modify: `evals/harness/wf1-layer.js`
- Test: `tests/harness/wf1-layer.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/harness/wf1-layer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { wf1Step } from '../../evals/harness/wf1-layer.js';

describe('wf1Step', () => {
  it('transferido: dropa o inbound (bot mudo)', () => {
    expect(wf1Step({ conversa: { status: 'transferido' }, texto: 'oi' }).dropped).toBe(true);
  });

  it('concluido: reabre nova sessao (coletando, reopened)', () => {
    const r = wf1Step({ conversa: { status: 'concluido' }, texto: 'quero agendar de novo' });
    expect(r.dropped).toBe(false);
    expect(r.newStatus).toBe('coletando');
    expect(r.reopened).toBe(true);
  });

  it('encerrado: reabre nova sessao (coletando, reopened)', () => {
    const r = wf1Step({ conversa: { status: 'encerrado' }, texto: 'oi' });
    expect(r.newStatus).toBe('coletando');
    expect(r.reopened).toBe(true);
  });

  it('coletando: passa direto sem reabrir', () => {
    const r = wf1Step({ conversa: { status: 'coletando' }, texto: 'oi' });
    expect(r.dropped).toBe(false);
    expect(r.newStatus).toBe(null);
    expect(r.reopened).toBeUndefined();
  });

  it('aguardando_confirmacao + "sim": vira agendando com hint yes', () => {
    const r = wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'sim' });
    expect(r.newStatus).toBe('agendando');
    expect(r.hint).toContain('SIM');
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run tests/harness/wf1-layer.test.js
```
Esperado: FAIL — caso `concluido`/`encerrado` retorna `reopened` undefined / `newStatus` null.

- [ ] **Step 3: Implementar a reabertura**

Em `evals/harness/wf1-layer.js`, substituir a função `wf1Step` por:

```js
// Replica a camada WF1 entre turnos. Retorna o que injetar na próxima invocação do WF2.
export function wf1Step({ conversa, texto }) {
  if (conversa.status === 'transferido') return { dropped: true };
  // estado terminal -> próxima mensagem inicia novo atendimento (reabre)
  if (conversa.status === 'encerrado' || conversa.status === 'concluido') {
    return { dropped: false, hint: '', newStatus: 'coletando', reopened: true };
  }
  if (conversa.status !== 'aguardando_confirmacao') return { dropped: false, hint: '', newStatus: null };
  const det = detectConfirmation(texto);
  if (det === 'yes') return { dropped: false, hint: HINT_YES, newStatus: 'agendando' };
  if (det === 'no') return { dropped: false, hint: HINT_NO, newStatus: 'coletando' };
  return { dropped: false, hint: '', newStatus: null }; // ambiguous: status mantido
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npx vitest run tests/harness/wf1-layer.test.js
```
Esperado: PASS (5 testes).

- [ ] **Step 5: Suite raiz + regressão de evals**

```bash
npm test
node evals/run-eval.js --repeat 3
```
Esperado: `npm test` verde. Evals sem regressão (≈ mesmo pass rate de antes; flutua por não-determinismo — conferir que cenários felizes seguem `agendamento_efetuado`).

- [ ] **Step 6: Commit**

```bash
git add evals/harness/wf1-layer.js tests/harness/wf1-layer.test.js
git commit -m "feat(harness): wf1-layer reabre sessao em status terminal"
```

---

## Task 4: WF4 (n8n ao vivo) — marcar `concluido` após agendar

**Files:**
- Modify (MCP): WF4 `00kC3KB8q19KgCLp`

- [ ] **Step 1: Ler o nó AG pra pegar a expressão de conversa_id**

Tool: `mcp__n8n-mcp__n8n_get_workflow` (`id: 00kC3KB8q19KgCLp`, `mode: full`). Localizar `AG - Shape Insert` / `AG - Insert` e copiar a expressão usada pra `conversa_id` (ex.: `={{ $('Trigger').first().json.conversa_id }}` ou similar). Usar **a mesma** no novo nó. Verificar também o nó `AG - Idempotent Return` (caminho cacheado) — qual a referência de conversa_id ali.

- [ ] **Step 2: Adicionar nó "AG - Set status concluido"**

Tool: `mcp__n8n-mcp__n8n_update_partial_workflow` (`id: 00kC3KB8q19KgCLp`), operação `addNode`:

```json
{
  "type": "addNode",
  "node": {
    "name": "AG - Set status concluido",
    "type": "n8n-nodes-base.supabase",
    "typeVersion": 1,
    "position": [2400, 250],
    "parameters": {
      "resource": "row",
      "operation": "update",
      "tableId": "conversas",
      "filterType": "manual",
      "matchType": "allFilters",
      "filters": { "conditions": [ { "keyName": "id", "condition": "eq", "keyValue": "<EXPR_CONVERSA_ID_DO_STEP_1>" } ] },
      "dataToSend": "defineBelow",
      "fieldsUi": { "fieldValues": [ { "fieldId": "status", "fieldValue": "concluido" } ] }
    },
    "credentials": { "supabaseApi": { "id": "bFthIb8jUB1PoCan", "name": "Supabase bot-agendamentos" } }
  }
}
```

- [ ] **Step 3: Inserir o nó no fluxo (sucesso novo + idempotente)**

Reencaminhar pra que tanto `AG - Insert` (sucesso novo) quanto `AG - Idempotent Return` (cacheado) passem por `AG - Set status concluido` antes do `AG - Return OK`/retorno. Operações (ajustar nomes de destino conforme o grafo lido no Step 1):

```json
[
  { "type": "rewireConnection", "source": "AG - Insert", "from": "AG - Return OK", "to": "AG - Set status concluido" },
  { "type": "addConnection", "source": "AG - Set status concluido", "target": "AG - Return OK" }
]
```

> Para o caminho idempotente: se `AG - Idempotent Return` é terminal (retorna direto), adicionar também um set de `concluido` análogo, ou aceitar que o idempotente (agendamento já existia) não reseta status — **decisão:** incluir, encadeando `AG - Cached?`(true) → `AG - Set status concluido (idem)` → `AG - Idempotent Return`. Se preferir simplicidade, documentar que o caminho idempotente não re-seta (raro). Escolha registrada no commit.

- [ ] **Step 4: Validar workflow**

Tool: `mcp__n8n-mcp__n8n_validate_workflow` (`id: 00kC3KB8q19KgCLp`). Esperado: sem erros.

- [ ] **Step 5: Confirmar versão ativa**

Tool: `mcp__n8n-mcp__n8n_get_workflow` (`id: 00kC3KB8q19KgCLp`, `mode: full`). Conferir `activeVersionId === versionId` e que `AG - Set status concluido` está no grafo.

---

## Task 5: WF1 (n8n ao vivo) — roteamento 3-vias + reabertura + save transferido

**Files:**
- Modify (MCP): WF1 `o80iAlxgMjWBfher`

Estado atual: `Pick Conversa` → `Status transferido?` (IF) → [true: vazio] / [false: `Insert User Mensagem` → `aguardando_confirmacao?` → …].

Alvo: `Pick Conversa` → `Route by session` (Switch) com 3 saídas:
- **transferido** → `TR - Insert User Mensagem` (papel=user) → FIM
- **terminal** (`encerrado`/`concluido`) → `Reopen Conversa` → `Insert User Mensagem` (existente)
- **fallback/ativo** → `Insert User Mensagem` (existente)

- [ ] **Step 1: Adicionar nó "Reopen Conversa"**

`mcp__n8n-mcp__n8n_update_partial_workflow` (`id: o80iAlxgMjWBfher`), `addNode`:

```json
{
  "type": "addNode",
  "node": {
    "name": "Reopen Conversa",
    "type": "n8n-nodes-base.supabase",
    "typeVersion": 1,
    "position": [2040, 60],
    "parameters": {
      "resource": "row",
      "operation": "update",
      "tableId": "conversas",
      "filterType": "manual",
      "matchType": "allFilters",
      "filters": { "conditions": [ { "keyName": "id", "condition": "eq", "keyValue": "={{ $('Pick Conversa').first().json.id }}" } ] },
      "dataToSend": "defineBelow",
      "fieldsUi": { "fieldValues": [
        { "fieldId": "status", "fieldValue": "coletando" },
        { "fieldId": "atendimento_iniciado_em", "fieldValue": "={{ new Date().toISOString() }}" }
      ] }
    },
    "credentials": { "supabaseApi": { "id": "bFthIb8jUB1PoCan", "name": "Supabase bot-agendamentos" } }
  }
}
```

- [ ] **Step 2: Adicionar nó "TR - Insert User Mensagem"**

`addNode` (copia do `Insert User Mensagem` existente, papel=user, sem downstream):

```json
{
  "type": "addNode",
  "node": {
    "name": "TR - Insert User Mensagem",
    "type": "n8n-nodes-base.supabase",
    "typeVersion": 1,
    "position": [2040, -260],
    "parameters": {
      "resource": "row",
      "operation": "create",
      "tableId": "mensagens",
      "dataToSend": "defineBelow",
      "fieldsUi": { "fieldValues": [
        { "fieldId": "conversa_id", "fieldValue": "={{ $('Pick Conversa').first().json.id }}" },
        { "fieldId": "papel", "fieldValue": "user" },
        { "fieldId": "conteudo", "fieldValue": "={{ $('Normalize Inbound').first().json.texto }}" }
      ] }
    },
    "credentials": { "supabaseApi": { "id": "bFthIb8jUB1PoCan", "name": "Supabase bot-agendamentos" } }
  }
}
```

- [ ] **Step 3: Adicionar o Switch "Route by session"**

`addNode` (Switch v3.2, 2 regras + fallback "extra"):

```json
{
  "type": "addNode",
  "node": {
    "name": "Route by session",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3.2,
    "position": [1800, 0],
    "parameters": {
      "rules": { "values": [
        { "outputKey": "transferido", "conditions": { "options": { "caseSensitive": true, "version": 2, "leftValue": "", "typeValidation": "loose" }, "combinator": "and", "conditions": [ { "id": "t", "leftValue": "={{ $('Pick Conversa').first().json.status }}", "rightValue": "transferido", "operator": { "type": "string", "operation": "equals" } } ] } },
        { "outputKey": "terminal", "conditions": { "options": { "caseSensitive": true, "version": 2, "leftValue": "", "typeValidation": "loose" }, "combinator": "or", "conditions": [
          { "id": "e", "leftValue": "={{ $('Pick Conversa').first().json.status }}", "rightValue": "encerrado", "operator": { "type": "string", "operation": "equals" } },
          { "id": "c", "leftValue": "={{ $('Pick Conversa').first().json.status }}", "rightValue": "concluido", "operator": { "type": "string", "operation": "equals" } }
        ] } }
      ] },
      "options": { "fallbackOutput": "extra" }
    }
  }
}
```
(Saídas resultantes: 0=transferido, 1=terminal, 2=fallback/ativo.)

- [ ] **Step 4: Rewire das conexões**

```json
[
  { "type": "removeConnection", "source": "Pick Conversa", "target": "Status transferido?", "ignoreErrors": true },
  { "type": "removeConnection", "source": "Status transferido?", "target": "Insert User Mensagem", "ignoreErrors": true },
  { "type": "addConnection", "source": "Pick Conversa", "target": "Route by session" },
  { "type": "addConnection", "source": "Route by session", "target": "TR - Insert User Mensagem", "case": 0 },
  { "type": "addConnection", "source": "Route by session", "target": "Reopen Conversa", "case": 1 },
  { "type": "addConnection", "source": "Route by session", "target": "Insert User Mensagem", "case": 2 },
  { "type": "addConnection", "source": "Reopen Conversa", "target": "Insert User Mensagem" },
  { "type": "removeNode", "nodeName": "Status transferido?" }
]
```

- [ ] **Step 5: Validar + limpar conexões órfãs**

```json
{ "type": "cleanStaleConnections" }
```
Depois `mcp__n8n-mcp__n8n_validate_workflow` (`id: o80iAlxgMjWBfher`). Esperado: sem erros. Conferir que `Insert User Mensagem` ainda conecta em `aguardando_confirmacao?`.

- [ ] **Step 6: Confirmar versão ativa**

`mcp__n8n-mcp__n8n_get_workflow` (`mode: full`): `activeVersionId === versionId`; grafo com `Route by session`, `Reopen Conversa`, `TR - Insert User Mensagem`; sem `Status transferido?`.

---

## Task 6: Smoke test ao vivo

**Pré:** n8n local + ngrok de pé (`.\start-n8n.ps1`). Usa SQL direto pra simular estados.

- [ ] **Step 1: Smoke reabertura (terminal → nova sessão)**

Escolher uma conversa de teste (telefone no `WA_ALLOWLIST`). Via `mcp__supabase__execute_sql`:
```sql
update conversas set status='concluido' where telefone='<TEL_TESTE>';
```
Mandar uma mensagem WhatsApp do número. Depois:
```sql
select status, atendimento_iniciado_em, ultima_atividade from conversas where telefone='<TEL_TESTE>';
```
Esperado: `status='coletando'`, `atendimento_iniciado_em` ≈ agora (recém-carimbado), bot respondeu (nova msg assistant em `mensagens`).

- [ ] **Step 2: Smoke save durante transferido**

```sql
update conversas set status='transferido' where telefone='<TEL_TESTE>';
```
Mandar mensagem WhatsApp. Depois:
```sql
select papel, conteudo, created_at from mensagens
where conversa_id=(select id from conversas where telefone='<TEL_TESTE>')
order by created_at desc limit 3;
```
Esperado: a msg do cliente aparece com `papel='user'`; **nenhuma** resposta `assistant` nova (bot mudo).

- [ ] **Step 3: Smoke painel (filtro)**

No painel hosteado (ou dev), abrir a conversa de teste. Confirmar que só as mensagens da sessão atual aparecem (>= `atendimento_iniciado_em`); mensagens anteriores ao último carimbo não aparecem.

---

## Task 7: Documentação + fechamento

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Atualizar CLAUDE.md**

Adicionar à seção de gotchas/estrutura: coluna `conversas.atendimento_iniciado_em` (marco de sessão); WF1 `Route by session` (transferido salva msg/bot mudo; terminal reabre + carimba; ativo segue fluxo); WF4 seta `status='concluido'` pós-agendar; painel `useMensagens` filtra por anchor. Atualizar a lista de migrations (passa a contar a nova).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documenta sessao de atendimento (atendimento_iniciado_em + WF1/WF4)"
```

- [ ] **Step 3: Merge + push (pede confirmação ao usuário)**

```bash
git checkout main && git merge --no-ff feat/painel-atendimento-sessao
git push origin main
```
> O push dispara redeploy automático do painel na Netlify (git-connect). Confirmar com o usuário antes de pushar.

---

## Self-Review (preenchido)

- **Cobertura do spec:** migration (T1) ✓; WF1 roteamento+reabertura+save#2 (T5, harness T3) ✓; WF4 concluido (T4) ✓; painel filtro (T2) ✓; testes (T2/T3/T6) ✓; docs (T7) ✓.
- **Placeholders:** o único `<EXPR_CONVERSA_ID_DO_STEP_1>` e `<TEL_TESTE>` são valores a ler/escolher em runtime, com o passo explícito de como obtê-los (T4 Step1, T6) — não são lacunas de design.
- **Consistência de tipos:** `fetchMensagens(conversaId, anchor)` e `useMensagens(conversaId, anchor)` batem entre T2 Step4 e o teste T2 Step1; `wf1Step` retorna `{dropped,hint,newStatus,reopened?}` consistente entre T3 impl e teste.
- **Gaps aceitos:** caminho idempotente do AG (T4 Step3) — decisão registrada no commit.
