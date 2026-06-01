# Design: Harness de testes conversacionais do agente (WF2)

**Data:** 2026-06-01
**Status:** aprovado (brainstorming)
**Contexto:** depois de cada alteração no WF2 / system-prompt, validar o comportamento do
agente em muitos cenários sem iniciar conversa manual no WhatsApp e responder mensagem
por mensagem. Rodar dezenas de variações, gravar o transcript de cada uma e ter pass/fail
automático como gate de regressão.

## Problema

Hoje testar o agente exige WhatsApp real (Avisa), responder na mão turno a turno, e repetir
para cada variação. Os 7 transcripts em `evals/transcripts/` são *spec executável* mas não há
driver que os rode — o webhook de eval (Task 31 do plano SOC) nunca foi construído. Não dá
para exercitar rapidamente casos como "CPF já cadastrado", "cliente recusa a confirmação",
"cliente pede horário fora do array".

## Decisões de arquitetura (aprovadas)

1. **Loop do agente roda standalone em Node** — não dirige o WF2 ao vivo nem o WF1 ponta-a-ponta.
   Rápido, barato, 100% scriptável, sem WhatsApp, sem poluir SOC.
2. **Cliente é um LLM** — persona + objetivo + fatos + comportamento; responde ao que o bot
   disser. Robusto à variação do bot, descobre casos não scriptados.
3. **Reads reais, writes mockados** — `buscar_empresa` / `buscar_funcionario` / `listar_slots`
   batem no Supabase real; `validar_hierarquia` lê o SOC Exporta Dados (read-only).
   `cadastrar_funcionario` / `agendar_no_soc` / `enviar_confirmacao` / `enviar_mensagem` /
   `transferir_humano` são mockados (capturam args, não tocam SOC nem WhatsApp). O estado da
   conversa vive em memória no harness e é gravado no transcript — não persiste em `mensagens`.
4. **Assertions declarativas** — cada cenário declara o esperado; `npm run eval` vira gate
   (X/Y passando) e grava transcript de todos.

## Componentes

### Canônicos novos em `src/llm/` (tira lógica presa no n8n)

Hoje schemas de tools, construção do request e roteamento de agenda só existem colados em Code
nodes do WF2/WF4. O harness precisa deles, então viram módulos `src/` canônicos — e o n8n passa
a ser cópia sincronizada por disciplina (mesmo modelo do `system-prompt.js` atual).

- **`src/llm/tools.js`** — array com os schemas OpenAI das **10 tools** (`buscar_empresa`,
  `buscar_funcionario`, `validar_hierarquia`, `cadastrar_funcionario`, `listar_slots`,
  `enviar_confirmacao`, `agendar_no_soc`, `transferir_humano`, `enviar_mensagem`,
  `notificar_safe`). Extraído verbatim do Code node "Build OpenAI Request" do WF2. (Ver
  Verificação 2026-06-01 para os schemas exatos.)
- **`src/llm/build-request.js`** — monta o payload OpenAI a partir do histórico: força
  `tool_choice` **só quando** `iteration===0 && status==='coletando' && o texto do user parece
  uma data && o bot pediu data antes** (condição exata do WF2 — mais estreita que o gotcha 16),
  garante adjacência tool_call ↔ tool_result por `tool_call_id` (gotcha 23), `parallel_tool_calls:false`,
  `max_tokens:1024`. Portado do Code node. WF2 sincroniza.
- **`src/llm/agenda-routing.js`** — **reflete o LS/AG reais**: hoje o `LS - Select agendas` e o
  `AG - Idempotency` estão **hardcoded em `unidade='teste carlos'` filtrado por `tipo_compromisso`**
  (stub de teste). A cascata `cnpj_empresa → cidade → fallback` **NÃO** está no LS/AG — só vive no
  `TH - Resolve Responsavel`. O módulo captura o comportamento atual do LS/AG; quando o roteamento
  de produção for plugado no LS, módulo + WF4 atualizam juntos. WF4 sincroniza.

### Harness em `evals/harness/`

- **`agent-runner.js`** — roda o loop de uma invocação do agente: `buildSystemPrompt` +
  `buildRequest` → chama OpenAI (gpt-4.1-mini, mesmo de prod) → se vier `tool_call` (1 só,
  `parallel_tool_calls:false`) e `iter<5`, despacha pelo adapter e re-itera com `iter+1`;
  `enviar_confirmacao`/`transferir_humano` **encerram** a invocação; sem tool + content →
  `enviar_mensagem(content)` encerra. Importa de `src/funcionario/`, `src/hierarquia/`,
  `src/confirmation/` — mas **NÃO assume zero drift**: ver C5/C6 na Verificação.
- **`wf1-layer.js`** — replica a camada WF1 entre turnos: se `status==='transferido'` dropa o
  inbound (terminal); se `status==='aguardando_confirmacao'` roda a detecção sim/não e aplica
  hint + transição de status; senão hint vazio. Regex e strings de hint **exatas** do WF1
  (ver Verificação).
- **`tools/` (adapters, um por tool)** — interface única `async run(args, ctx) -> resultado`.
  Retornos batem com os shapes do WF4 (tabela na Verificação).
  - Reads reais: `buscar_empresa` (Supabase), `buscar_funcionario` (Supabase + probe SOC no
    miss — **não é read puro**, escreve cache; CPFs seedados evitam o SOC), `validar_hierarquia`
    (SOC exportadados, latin1 — gotcha 20).
  - `listar_slots`: **modo determinístico local por padrão** — `slots_config` menos ocupados
    (`agendamentos`), com ocupados injetáveis por cenário pra forçar "slot ocupado"/"array
    esgotado". SOC "Horarios Livres" ao vivo é modo opcional (não-determinístico). NÃO é um read
    de Supabase puro (C1).
  - Writes mockados: `cadastrar_funcionario`, `agendar_no_soc`, `enviar_confirmacao`,
    `enviar_mensagem`, `transferir_humano`. Default "sucesso"; overrides por cenário (campo
    `mocks`). Cada chamada registra `{tool, args, resultado}` no transcript.
- **`customer.js`** — cliente LLM. Recebe `{persona, objetivo, fatos, comportamento}` + o
  histórico visível (só mensagens texto do bot) e devolve a próxima mensagem do cliente. Emite
  `<STOP>` quando o objetivo foi atingido ou o cliente desistiu.
- **`recorder.js`** — grava por run: markdown legível + JSON máquina.
- **`assert.js`** — roda as assertions declarativas do cenário contra o transcript e devolve
  `{pass, falhas[]}`.
- **`run-eval.js`** (substitui o atual baseado em webhook) — orquestrador: carrega cenários,
  roda cada um (× `--repeat`), grava, aplica assertions, imprime resumo, exit code != 0 se
  qualquer cenário falhar.

## Fluxo de uma run

```
seed do cenário (status=coletando, dados={}, mocks aplicados)
loop (turno de conversa = uma invocação WF2):
  customer.reply(histórico_visível) -> mensagem do cliente   (ou <STOP> -> fim)
  wf1-layer(status, msg):
    status==='transferido' -> dropa inbound, fim (terminal)
    status==='aguardando_confirmacao' -> detecta yes/no/ambiguous (regex inline WF1):
        yes -> status=agendando, hint=hint_yes
        no  -> status=coletando, hint=hint_no
        ambiguous -> hint=''
    senão -> hint=''
  agent-runner(messages, hint):                # uma invocação WF2, iter começa em 0
    enquanto tool_call (1 só) e iter < 5:
      adapter.run(args) -> resultado ; grava no transcript
      se tool ∈ {enviar_confirmacao, transferir_humano} -> encerra invocação
      senão iter++ e re-chama OpenAI
    sem tool + content -> enviar_mensagem(content) (texto visível) ; encerra
  recorder.append(turno)
condições de parada da run:
  - outcome terminal: transferido (transferir_humano) | encerrado (bot fecha)
  - <STOP> do cliente   (objetivo atingido, ex: agendamento_efetuado)
  - maxTurns (guarda de segurança, ~20)
assert.run(cenário, transcript) -> pass/fail
```

## Schema de cenário (`evals/scenarios/*.js`)

```js
export default {
  nome: 'admissional_cpf_ja_cadastrado',
  descricao: 'Admissional com CPF que já existe no SOC — deve fazer upsert e agendar',
  cliente: {
    persona: 'dono de empresa, com pressa, manda dados aos poucos',
    objetivo: 'agendar exame admissional do funcionário X',
    fatos: { cpf: '...', cnpj: '05435277000160', cidade: 'Medianeira', tipo: 'admissional',
             nome: '...', nascimento: '...', sexo: '...', estadoCivil: '...',
             ctps: '...', admissao: '...', unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA' },
    comportamento: 'aceita a primeira confirmação de horário',
  },
  mocks: {
    // shapes batem com o WF4 (ver Verificação)
    cadastrar_funcionario: { ok: true, codigo_funcionario: 18 },
    agendar_no_soc: { ok: true, codigo_agendamento: 134437182, from_cache: false },
  },
  espera: {
    tools_chamadas: ['buscar_empresa','validar_hierarquia','cadastrar_funcionario','agendar_no_soc'],
    tools_proibidas: ['buscar_funcionario'],
    outcome: 'agendamento_efetuado',   // NÃO 'agendado' (conversas.status não tem esse valor)
    handoff_motivo: null,
  },
};
```

`mocks` é opcional (default sucesso). `espera` é opcional por campo — só o que estiver
presente é checado. Assertions suportadas v1: `tools_chamadas` (todas devem aparecer),
`tools_proibidas` (nenhuma pode aparecer), `outcome` (`agendamento_efetuado` quando
`agendar_no_soc` ok | `transferido` | `encerrado` | `em_andamento`), `handoff_motivo`
(lido de `transferir_humano.args.motivo`).

## Saída (para análise humana)

`evals/runs/<timestamp>/`:
- `<cenario>.md` — conversa legível: 👤 cliente / 🤖 bot / 🔧 tool (nome + args + resultado).
  Uma seção por run quando `--repeat > 1`.
- `<cenario>.json` — máquina (replay/diff/regressão futura).
- `summary.md` — tabela: cenário · pass/fail · tools chamadas · status final · nº de turns ·
  link pro `.md`.

A pasta `evals/runs/` entra no `.gitignore` (artefato de execução).

## Limite de fidelidade (honesto)

A verificação 2026-06-01 derrubou a premissa de "zero drift por importar src/": **nem os módulos
`src/` já existentes estão em sync com o WF.** Logo:

- **Importados de `src/` mas precisam de teste de invariante** (NÃO são confiáveis só por
  existir): `src/confirmation/detect.js` (drifou do WF1 — ver C5), normalize funcionário, match
  hierarquia, `src/llm/system-prompt.js` (drifou do WF2 — ver Verificação drift #1).
- **Sincronizados por disciplina (cópia, igual prompt hoje):** `tools.js`, `build-request.js`,
  `agenda-routing.js`, `wf1-layer.js`. O harness testa a cópia `src/`, **não** o WF1/WF2/WF4 ao
  vivo. Se o Code node for editado sem sincronizar o `src/`, o teste mente.
- **Mitigação (obrigatória, não opcional):** cada módulo compartilhado ganha um teste de
  invariante (Vitest) que falha quando diverge do Code node ao vivo. O snapshot do WF é buscado
  via n8n-mcp `get_workflow`; o teste compara a lógica/strings normalizadas. **Pré-requisito do
  harness:** a Tarefa 0 do plano reconcilia os 3 drifts achados (abertura CNPJ/CIDADE, detect.js
  pontuação+emoji, README) pra estabelecer um baseline confiável antes de escrever qualquer
  cenário. Sem isso o harness reproduz o src divergente, não o prod.

## Cenários v1 (~11)

Casos pedidos + os 7 transcripts atuais convertidos:

1. `caso_feliz_periodico` — periódico, funcionário existente, agenda direto.
2. `admissional_completo` — coleta + validar_hierarquia + cadastrar + agenda.
3. `admissional_cpf_ja_cadastrado` — upsert (mock `atualizou:true`), agenda.
4. `recusa_primeira_confirmacao` — cliente recusa o 1º horário **com frase aberta** ("não pode
   esse, tem outro?"), que cai em `ambiguous` → bot pula pro próximo slot. (Atenção: um `"não"`
   seco cai em NEGATIVE → hint "pergunte o que corrigir" → bot NÃO oferece próximo slot. Cenário
   tem que escolher a frase de propósito — ver C5.)
5. `pede_horario_fora_array` — cliente pede hora que não está em `listar_slots` → bot informa
   indisponível + oferece o próximo. (Forçar via ocupados injetados no adapter local — C1.)
6. `cliente_vago` — periódico, bot puxa info aos poucos.
7. `multiplos_funcionarios` — periódico, 2 CPFs, confirmação consolidada.
8. `hierarquia_nao_encontrada` — admissional, tripla inexistente → transfere silencioso.
9. `exame_fora_escopo` — tipo fora do escopo → transfere silencioso antes do CPF.
10. `erro_soc_no_cadastro` — admissional, mock `cadastrar_funcionario.ok:false` → transfere
    motivo `erro_cadastro_soc`.
11. `empresa_nao_cadastrada` — `buscar_empresa` não encontra → transfere
    motivo `empresa_nao_cadastrada`.

## Fora de escopo (YAGNI)

- **LLM-judge** de regras soft (não revelou escopo, abertura exata, transferência silenciosa):
  adiado. Assertions de tool/status primeiro; adiciona se as assertions determinísticas não
  pegarem regressões de comportamento.
- **Webhook de eval no n8n** (Task 31 original): não constrói — substituído pelo harness standalone.
- **SOC writes reais** no harness: nunca.
- **Reps automáticas de tuning de prompt:** fora; harness só roda e reporta.

## Dependências / pré-requisitos

- `.env` já tem `OPENAI_API_KEY` (agente + cliente), creds Supabase (service role) e SOC.
- Estado de teste seedado no Supabase já existe (confirmado 2026-06-01): EMPRESA TESTE ALFA
  (CNPJ `05435277000160`, código `291130`); agenda `teste carlos` #1463919 com **3 linhas em
  `agendas_config`** (uma por tipo PERIODICO/DEMISSIONAL/ADMISSIONAL, `fallback=true`,
  `codigo_empresa_principal=289501`); **792 slots** template; 2 funcionários ativos no cache
  (`33333333333` Diego cod 11, `57782554039` Rafael cod 18). Cenários v1 usam esse estado.
- Hierarquia real (Exporta Dados 191874) usada por `validar_hierarquia` — tripla conhecida boa:
  Safe T / ADMINISTRAÇÃO / MOTORISTA.

## Critérios de sucesso

- `npm run eval` roda todos os cenários sem WhatsApp e sem escrever no SOC, e imprime `X/Y`.
- Cada run gera `<cenario>.md` legível + `summary.md`.
- Os 11 cenários v1 passam contra o estado atual do agente.
- Mudar uma regra do prompt que quebre um cenário faz o gate falhar (validado quebrando de
  propósito 1 cenário e vendo falhar).

---

## Verificação ao vivo contra WF1/WF2/WF4 + Supabase (2026-06-01)

Spec validada inspecionando os Code nodes reais via n8n-mcp (`get_workflow` em
`o80iAlxgMjWBfher` / `cdQwn4joLcuWlTJQ` / `00kC3KB8q19KgCLp`) e o schema/seed via Supabase MCP.
**Veredito: viável.** Correções abaixo já refletidas no corpo da spec.

### Tool return shapes (fonte para os adapters)

| tool | sucesso | falha |
|---|---|---|
| `buscar_empresa` | `{ok:true,codigo_empresa,razao_social,unidades,defaults_funcionario}` | `{ok:false,erro:'empresa_nao_cadastrada'}` |
| `buscar_funcionario` | `{ok:true,ativo,from_cache,codigo_funcionario?}` | `{ok:false,erro:'nao_encontrado'}` |
| `listar_slots` | `{ok:true,slots:[{data,hora,codigo_usuario_agenda}],sync}` | `{ok:false,erro:'sem_agenda'}` |
| `agendar_no_soc` | `{ok:true,codigo_agendamento,from_cache}` | `{ok:false,codigo_erro,mappedError}` |
| `enviar_confirmacao` | `{ok:true,provider,message_id,status:'aguardando_confirmacao'}` (lê `args.resumo`) | — |
| `enviar_mensagem` | `{ok:true,provider,message_id}` (lê `args.texto`) | — |
| `transferir_humano` | `{ok:true,provider,message_id,transferido:true}` (texto fixo; lê `args.motivo`) | — |
| `validar_hierarquia` | `{valido:true,unidade_canonica,setor_canonico,cargo_canonico,cbo}` | `{valido:false}` |
| `cadastrar_funcionario` | `{ok:true,codigo_funcionario}` | `{ok:false,erro:{tipo,codigo,mensagem}}` |
| `notificar_safe` | `{ok:true,notif_id}` | — |

### Loop WF2 (confirmado)

- **10 tools** (inclui `notificar_safe`, ausente da spec inicial). `parallel_tool_calls:false`,
  `model:gpt-4.1-mini`, `max_tokens:1024`. Parse pega só `tool_calls[0]`.
- `forceListarSlots = init.iteration===0 && conversa.status==='coletando' && looksLikeDateAnswer
  && previousAskedForDate`. Senão `tool_choice:'auto'`.
- Montagem de `messages`: indexa tool result por `tool_call_id`, emite o `tool` logo após seu
  `assistant` tool_call, marca consumido (gotcha 23). `hint` entra como `system` message.
- Controle: `Has Tool Call? = has_tool_call && iteration<5`. Tool-call → salva assistant, despacha
  WF4, salva tool result, `Is enviar_confirmacao? = tool ∈ {enviar_confirmacao, transferir_humano}`
  → encerra (set status); senão `Recurse Self (iter+1)`. Sem tool + content → `Send Final Text`
  (`enviar_mensagem`). `Save Assistant Msg` só no ramo tool-call (gotcha 17).

### Camada WF1 (confirmado)

- `Pick Conversa → Status transferido?` → se `transferido`, inbound é dropado (bot mudo).
- `Insert User Mensagem → aguardando_confirmacao?` → `Detect Confirmation` (regex **inline**):
  `yes → Set status agendando → Call LLM (hint="Cliente confirmou (SIM). Dispare agendar_no_soc
  para cada item pendente e responda confirmando ao cliente.")`; `no → Set status coletando →
  Call LLM (hint="Cliente recusou a confirmacao. Pergunte o que precisa ser corrigido.")`;
  `ambiguous → Call LLM (hint="")`. Fora de aguardando_confirmacao → `Call LLM (hint="")`.

### Roteamento de agenda (realidade ≠ CLAUDE.md)

- `LS - Select agendas` e `AG - Idempotency` **hardcodam `unidade='teste carlos'` + filtro
  `tipo_compromisso`**. A cascata `cnpj→cidade→fallback` **só existe** no `TH - Resolve
  Responsavel`. (C3)
- `listar_slots`: primário = SOC `ExportaDadosWs` "Horarios Livres" ao vivo; fallback =
  `slots_config` (template por `dia_semana`/hora) menos ocupados de `agendamentos` (status
  `agendado`). (C1)

### Drifts achados (justificam o teste de invariante obrigatório)

1. **WF2 abertura:** resposta afirmativa → "comece a coleta pedindo o **CNPJ**" no WF2, vs
   "pedindo a **CIDADE**" em `src/llm/system-prompt.js`. WF2 ainda se contradiz (passo 1 = cidade).
2. **`detect.js` ≠ WF1:** o src remove pontuação final (`"sim!"`→yes) e casa 👍/✅; o WF1 não faz
   nenhum dos dois (`"sim!"`→ambiguous em prod). "Import direto = zero drift" era falso.
3. **`n8n/workflows/README.md` stale:** dizia 7 tools e `cadastrar_funcionario` removida.

### Correções aplicadas: C1 (listar_slots), C2 (buscar_funcionario não é read puro),
C3 (agenda-routing real), C4 (outcome enum ≠ `conversas.status`), C5 (replicar switch WF1 +
reconciliar detect.js), C6 (invariante obrigatório + Tarefa 0 de reconciliação de drift).
