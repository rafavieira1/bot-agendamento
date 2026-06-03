# Design — Painel mostra só o atendimento atual (sessão)

**Data:** 2026-06-03
**Status:** aprovado (aguardando plano)

## Problema

O painel de atendimento humano mostra o **histórico completo** da conversa com o
cliente — todas as interações que aquele telefone já teve com o bot, desde o
primeiro contato. Como existe **uma única `conversa` por telefone, reusada para
sempre** (WF1 faz upsert `on_conflict=telefone`), mensagens de atendimentos
antigos (já agendados ou já encerrados) ficam empilhadas junto com o atendimento
atual e poluem a tela do vendedor.

**Objetivo:** quando o vendedor abre uma conversa transferida, ver **apenas as
mensagens do atendimento atual** — a sessão corrente inteira (troca cliente↔bot
que levou ao handoff + mensagens humanas), escondendo atendimentos anteriores já
resolvidos.

## Decisões de produto (origem deste design)

1. **Início da sessão exibida:** início da sessão atual, *incluindo* a troca com
   o bot que levou ao handoff (dá contexto do que o cliente pediu). Não é só a
   partir do handoff.
2. **O que fecha uma sessão (e abre a próxima):** vendedor clicar **Encerrar**
   (`status='encerrado'`) **OU** o bot concluir um **agendamento** com sucesso
   (`status='concluido'`). A próxima mensagem do cliente depois disso inicia um
   atendimento novo.
3. **Fix relacionado incluído (#2):** durante `transferido`, as mensagens que o
   cliente envia hoje são **descartadas** (WF1 dropa o inbound). Passarão a ser
   **salvas** (`papel='user'`, bot continua calado), para o vendedor ver as
   respostas do cliente no handoff.

## Abordagem escolhida

**Marco de início de sessão (timestamp) + filtro no painel.** Mantém o modelo de
1-conversa-por-telefone (todo o resto do sistema depende dele: idempotência,
`dados` jsonb acumulado, caches por telefone). Mudança cirúrgica e reversível.

Alternativas descartadas:
- **Heurística de gap de tempo no painel** — não bate com o critério escolhido
  (Encerrar/agendamento), pode cortar conversa lenta no meio.
- **Uma `conversa` nova por atendimento** — conceitualmente mais limpo, mas mexe
  na identidade da conversa (`on_conflict=telefone`) que vários fluxos assumem;
  risco e blast radius altos.

## Conceito central

Coluna nova `conversas.atendimento_iniciado_em`. O painel exibe somente
`mensagens.created_at >= atendimento_iniciado_em`. WF1 carimba o marco quando uma
sessão nova começa; WF4 passa a marcar `concluido` ao agendar (gancho que falta
hoje).

## Componentes

### 1. Migration (Supabase)

```sql
alter table conversas
  add column atendimento_iniciado_em timestamptz default now();

update conversas
  set atendimento_iniciado_em = created_at
  where atendimento_iniciado_em is null;
```

- Backfill com `created_at` → a sessão atual de cada telefone aparece inteira (não
  há sessão anterior fechada para esconder no estado atual).
- `default now()` → toda `conversa` nova já nasce com o marco no momento da
  criação (WF1 `Upsert Conversa` insere sem precisar setar explicitamente).
- Nome do arquivo: `supabase/migrations/YYYYMMDD_NNNNNN_atendimento_iniciado_em.sql`.

### 2. WF1 — fronteira de sessão + fix #2

Hoje, após `Pick Conversa`, o IF `Status transferido?` roteia: `true` → ramo vazio
(bot para, inbound **descartado**); `false` → `Insert User Mensagem` → fluxo
normal. **Só `transferido` para o bot** — `encerrado`/`concluido` não param nada
hoje.

Substituir por um roteamento de 3 vias, decidido pelo status **lido** em
`Pick Conversa` (status antigo, antes de qualquer reabertura):

| Status na chegada | Ação |
|---|---|
| `transferido` | grava msg `papel='user'` → **FIM** (não chama LLM). *[fix #2]* |
| `encerrado` / `concluido` | **nova sessão**: update `atendimento_iniciado_em=now()` + `status='coletando'` → grava msg `papel='user'` → `Call LLM` (hint vazio, sessão fresca) |
| outros (`coletando`, `agendando`, `aguardando_confirmacao`, `aguardando_dados_cadastro`, `aguardando_cadastro_func`, `erro`) | fluxo atual intacto: grava msg → `aguardando_confirmacao?` → … |

Notas de implementação (detalhar no plano):
- Trocar o IF de 2 saídas por um Switch de 3 saídas (`transferido` / terminal /
  ativo), ou um Code classificador + Switch.
- Ramo terminal: nó Supabase "Reopen Conversa" (`status='coletando'`,
  `atendimento_iniciado_em=now()`) **antes** do insert da mensagem.
- Ramo `transferido`: insert da mensagem com `papel='user'`, sem aresta para o LLM.
- Conversa nova (1º contato): marco já vem do `default now()` da coluna.

### 3. WF4 — marcar agendamento concluído

No branch AG (`agendar_no_soc`), após `AG - Success?` = `true` (caminho de inserção
em `agendamentos`) **e** no caminho idempotente (`AG - Idempotent Return`, quando o
agendamento já existia), adicionar update Supabase: `conversas.status='concluido'`
onde `id = conversa_id`.

Sem isso, a regra "agendamento fecha sessão" não tem gancho — hoje o AG não toca
`conversas.status` (verificado: 0 conversas em `concluido`).

- **Multi-funcionário:** o turno "sim" dispara `agendar_no_soc` N vezes (um por
  funcionário pendente) dentro de **uma** execução do WF2, sem inbound do cliente
  no meio. `concluido` é setado N vezes no mesmo turno → terminal após o último.
  Próxima mensagem do cliente = sessão nova. **Aceito.**

### 4. Painel (`panel/`)

- `useMensagens(conversaId, anchor)` ([panel/src/hooks/useConversas.ts](../../../panel/src/hooks/useConversas.ts)):
  adicionar `.gte('created_at', anchor)` na query. Fallback: `anchor` nulo →
  mostra tudo (compatibilidade).
- `ConversaDetail` passa `conversa.atendimento_iniciado_em` como `anchor`. O
  `useConversas` já traz o campo via `select('*')`.
- **Realtime intacto:** INSERT em `mensagens` já filtra por `conversa_id` (novas
  msgs caem naturalmente depois do anchor); UPDATE em `conversas` já é assinado
  pelo `useMensagens` → reabertura (`atendimento_iniciado_em` muda) re-filtra.

## Ciclo de vida resultante

```
conversa nova               → atendimento_iniciado_em = created_at (default)
msg em coletando/agendando/aguardando_*  → mesma sessão
msg em transferido          → salva (papel=user), bot calado, mesma sessão
                              (vendedor vê a resposta do cliente)
msg em encerrado/concluido  → NOVA sessão: carimba now(), reabre coletando,
                              bot responde fresco
painel exibe                → mensagens com created_at >= atendimento_iniciado_em
```

## Testes

Mudança de comportamento do agente / camada WF1 → **harness de evals obrigatório
antes de commit** (CLAUDE.md "Testar feature nova do agente").

- **Espelhar no canônico do harness:** lógica de reabertura (terminal → nova
  sessão) + save-durante-`transferido` vive na camada WF1 →
  [evals/harness/wf1-layer.js](../../../evals/harness/wf1-layer.js).
- **Cenário novo:** (a) agendar → `concluido` → cliente manda nova msg → sessão
  fresca, histórico antigo escondido; (b) `transferido` → msg do cliente é salva.
  Rodar com `--repeat 5` (cliente-LLM não-determinístico).
- `npm test` (invariantes; `detect`/`normalize` não afetados).
- Migration aplicada no projeto `czqellcrtzhjvdirpgxe`.
- **Sincronizar WF1 + WF4 no n8n ao vivo** após validar no harness e **confirmar
  versão ativa** (`activeVersionId === versionId`).

## Fora de escopo / aceito

- Mantém 1-conversa-por-telefone (resto do sistema depende).
- `concluido` setado por chamada de `agendar_no_soc` (multi-funcionário) — aceito.
- `encerrado` passa a reabrir na próxima msg (consistente com `concluido`); antes
  não parava o bot de fato.
- Não há limpeza/retenção do histórico antigo — ele permanece no banco, apenas
  não é exibido.
