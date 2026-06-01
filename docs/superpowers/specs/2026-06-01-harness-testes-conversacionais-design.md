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

- **`src/llm/tools.js`** — array com os schemas OpenAI das 9 tools (`buscar_empresa`,
  `buscar_funcionario`, `validar_hierarquia`, `cadastrar_funcionario`, `listar_slots`,
  `enviar_confirmacao`, `agendar_no_soc`, `transferir_humano`, `enviar_mensagem`). Extraído
  verbatim do Code node "Build OpenAI Request" do WF2.
- **`src/llm/build-request.js`** — monta o payload OpenAI a partir do histórico: força
  `tool_choice={name:'listar_slots'}` só na iteração 0 (gotcha 16), garante adjacência
  tool_call ↔ tool_result por `tool_call_id` (gotcha 23), aplica o cap de iterações (max 5 por
  invocação no WF2). Portado do Code node. WF2 sincroniza.
- **`src/llm/agenda-routing.js`** — cascata `cnpj_empresa → cidade → fallback` (hoje em
  `LS - Select agendas`). O adapter real de `listar_slots` usa isto pra escolher a agenda. WF4
  sincroniza.

### Harness em `evals/harness/`

- **`agent-runner.js`** — roda o loop de uma invocação do agente: `buildSystemPrompt` +
  `buildRequest` → chama OpenAI (gpt-4.1-mini, mesmo de prod) → se vierem `tool_calls`,
  despacha pelos adapters e re-itera; senão devolve o texto do bot. Importa **direto** de
  `src/confirmation/`, `src/funcionario/`, `src/hierarquia/` (zero drift).
- **`tools/` (adapters, um por tool)** — interface única `async run(args, ctx) -> resultado`.
  - Reads reais: `buscar_empresa`, `buscar_funcionario`, `listar_slots` (Supabase via service
    role), `validar_hierarquia` (SOC exportadados, decodificar latin1 — gotcha 20).
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
loop:
  customer.reply(histórico_visível) -> mensagem do cliente   (ou <STOP> -> fim)
  detector sim/não (src/confirmation) sobre a mensagem -> hint (sim|nao|null)
  agent-runner(messages, hint):
    enquanto vier tool_call e iter < cap:
      adapter.run(args) -> resultado ; grava no transcript
    -> texto do bot
  recorder.append(turn)
condições de parada:
  - status terminal: agendado (agendar_no_soc ok) | transferido (transferir_humano) | encerrado
  - <STOP> do cliente
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
    cadastrar_funcionario: { ok: true, atualizou: true, codigo_funcionario: 18 },
    agendar_no_soc: { ok: true, protocolo: '134437182' },
  },
  espera: {
    tools_chamadas: ['buscar_empresa','validar_hierarquia','cadastrar_funcionario','agendar_no_soc'],
    tools_proibidas: ['buscar_funcionario'],
    status_final: 'agendado',
    handoff_motivo: null,
  },
};
```

`mocks` é opcional (default sucesso). `espera` é opcional por campo — só o que estiver
presente é checado. Assertions suportadas v1: `tools_chamadas` (todas devem aparecer),
`tools_proibidas` (nenhuma pode aparecer), `status_final`, `handoff_motivo`.

## Saída (para análise humana)

`evals/runs/<timestamp>/`:
- `<cenario>.md` — conversa legível: 👤 cliente / 🤖 bot / 🔧 tool (nome + args + resultado).
  Uma seção por run quando `--repeat > 1`.
- `<cenario>.json` — máquina (replay/diff/regressão futura).
- `summary.md` — tabela: cenário · pass/fail · tools chamadas · status final · nº de turns ·
  link pro `.md`.

A pasta `evals/runs/` entra no `.gitignore` (artefato de execução).

## Limite de fidelidade (honesto)

- **Zero drift (importados direto de `src/`):** detector sim/não, normalize funcionário,
  match hierarquia, system-prompt.
- **Sincronizados por disciplina (cópia, igual prompt hoje):** `tools.js`, `build-request.js`,
  `agenda-routing.js`. O harness testa a cópia `src/`, **não** o WF2/WF4 ao vivo. Se o Code node
  for editado sem sincronizar o `src/`, o teste mente.
- **Mitigação:** teste de invariante (Vitest) que falha quando `src/llm/*` diverge do que o WF2
  espera — extensão do padrão que já existe pra `system-prompt.test.js`. (O snapshot do WF2 é
  buscado via n8n-mcp `get_workflow` na hora de portar; o teste guarda o hash/estrutura.)

## Cenários v1 (~11)

Casos pedidos + os 7 transcripts atuais convertidos:

1. `caso_feliz_periodico` — periódico, funcionário existente, agenda direto.
2. `admissional_completo` — coleta + validar_hierarquia + cadastrar + agenda.
3. `admissional_cpf_ja_cadastrado` — upsert (mock `atualizou:true`), agenda.
4. `recusa_primeira_confirmacao` — cliente recusa o 1º horário, aceita o 2º (bot pula slot).
5. `pede_horario_fora_array` — cliente pede hora que não está em `listar_slots` → bot informa
   indisponível + oferece o próximo.
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
- Estado de teste seedado no Supabase já existe: EMPRESA TESTE ALFA (CNPJ `05435277000160`,
  código `291130`), agenda `teste carlos` #1463919 (fallback), 528 slots. Cenários v1 usam
  esse estado.
- Hierarquia real (Exporta Dados 191874) usada por `validar_hierarquia` — tripla conhecida boa:
  Safe T / ADMINISTRAÇÃO / MOTORISTA.

## Critérios de sucesso

- `npm run eval` roda todos os cenários sem WhatsApp e sem escrever no SOC, e imprime `X/Y`.
- Cada run gera `<cenario>.md` legível + `summary.md`.
- Os 11 cenários v1 passam contra o estado atual do agente.
- Mudar uma regra do prompt que quebre um cenário faz o gate falhar (validado quebrando de
  propósito 1 cenário e vendo falhar).
