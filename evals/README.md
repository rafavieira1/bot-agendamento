# Harness de testes conversacionais do agente (WF2)

Roda muitos cenários de conversa contra o agente **standalone** — sem WhatsApp, sem n8n,
sem escrever no SOC — grava o transcript de cada um e dá **pass/fail** por cenário. Vira gate
de regressão depois de mexer no WF2 / no prompt.

## Como rodar

```bash
npm run eval                       # roda todos os cenários, grava transcripts, imprime X/Y
node evals/run-eval.js --only caso_feliz_periodico   # um cenário só
node evals/run-eval.js --repeat 3                     # cada cenário N vezes (pega flakiness do LLM)
node evals/run-eval.js --no-assert                    # só grava, sem pass/fail
```

Precisa do `.env` na raiz (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SOC_EXPORTA_HIERARQUIA_*`). Cada cenário é uma conversa multi-turn: o cliente é um 2º LLM,
o agente é o loop real do WF2 re-rodado em Node. Exit code != 0 se qualquer cenário falhar.

## Onde ficam os transcripts

`evals/runs/<timestamp>/` (gitignored):
- `<cenario>_run<N>.md` — conversa legível (👤 cliente / 🤖 bot / 🔧 tool call+result)
- `<cenario>_run<N>.json` — máquina (replay/diff)
- `summary.md` — tabela: cenário · pass · outcome · tools · turns · falhas

## Como o harness funciona

| Camada | Arquivo | O que faz |
|---|---|---|
| Loop do agente | `src/llm/build-request.js` + `evals/harness/agent-runner.js` | Monta o request OpenAI (adjacência tool_call↔result, forceListarSlots, parallel_tool_calls=false) e roda uma invocação do WF2 (tool calls até terminal / iter<5 / texto) |
| Schemas das tools | `src/llm/tools.js` | As 10 tools, espelho do WF2 |
| Camada WF1 | `evals/harness/wf1-layer.js` | Entre turnos: drop se transferido; detecção sim/não + hint + transição de status (regex + strings exatas do WF1) |
| Tools | `evals/harness/tools/` | `reads.js` (reais: Supabase + SOC hierarquia) · `writes.js` (mockados: SOC cadastro/agenda + envios WhatsApp capturados) · `index.js` (dispatch + TERMINAL_TOOLS) |
| Cliente | `evals/harness/customer.js` | LLM que joga o cliente (persona + objetivo + fatos + comportamento) |
| Estado | `evals/harness/session.js` | Espelho em memória da tabela `mensagens` |
| Resultado | `evals/harness/assert.js` + `recorder.js` | Assertions declarativas + gravação md/json/summary |

## Adicionar um cenário

Crie `evals/scenarios/NN-nome.js` com `export default`:

```js
export default {
  nome: 'meu_cenario',
  descricao: '...',
  cliente: {
    persona: 'dono de empresa objetivo',
    objetivo: 'agendar exame periodico',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', data_preferida: '04/06/2026' },
    comportamento: 'aceita o primeiro horario com "sim"',
  },
  mocks: { agendar_no_soc: { ok: true, codigo_agendamento: 123 } }, // opcional (default sucesso)
  espera: {                                   // opcional por campo
    tools_chamadas: ['buscar_empresa','agendar_no_soc'],
    tools_proibidas: ['validar_hierarquia'],
    outcome: 'agendamento_efetuado',          // | 'transferido' | 'em_andamento'
    handoff_motivo: null,                     // ex: 'exame_fora_escopo'
  },
};
```

Estado de teste seedado no Supabase: EMPRESA TESTE ALFA (CNPJ `05435277000160`, código
`291130`), agenda `teste carlos` #1463919, funcionários ativos `57782554039` (Rafael) e
`33333333333` (Diego). Hierarquia boa pra admissional: Safe T / ADMINISTRAÇÃO / MOTORISTA.

## Regra de sync (CRÍTICO)

O harness testa a cópia `src/`, **não** o n8n ao vivo. Ao editar o Code node do WF2/WF1/WF4,
atualize o módulo `src/` correspondente e rode `npm test`:
- WF2 "Build OpenAI Request" → `src/llm/tools.js` + `src/llm/build-request.js` + `src/llm/system-prompt.js`
- WF1 "Detect Confirmation" → `src/confirmation/detect.js`
- WF4 branches → shapes de retorno em `evals/harness/tools/reads.js` / `writes.js`

## Gaps de fidelidade conhecidos (aceitos)

1. `buscar_funcionario` não faz probe SOC no cache-miss — usa só o cache. Cenários usam CPFs
   seedados (hit) ou falsos (miss).
2. Roteamento de agenda hardcoded em `teste carlos` (espelha o LS/AG reais).
3. `listar_slots` usa cálculo local (slots_config), não o SOC "Horarios Livres" ao vivo —
   por determinismo. Override por cenário: `mocks.listar_slots.slots`.
4. Cliente LLM é não-determinístico → use `--repeat` para medir flakiness.

## Achados (2026-06-01) — o que o harness pegou

Rodadas (single-run bouncam por causa do cliente LLM; use `--repeat` pra medir). O harness
revelou fragilidade **real** do agente sob a lógica atual do WF2:

1. **`forceListarSlots` disparava errado no admissional — CORRIGIDO.** O bloco PESSOAL contém
   "data de admissão" e o pedido do bot por ele contém "data" → a heurística forçava
   `listar_slots` antes de coletar unidade/setor/cargo → `validar_hierarquia` com lixo (cidade nos
   3 campos) → transferia. **Fix aplicado** em `src/llm/build-request.js` + WF2: só força se o
   histórico já tem `buscar_funcionario` OU `validar_hierarquia` (o passo da data só vem depois de
   um deles). Confirmado: não força mais prematuramente.

Pendentes (achados reais, ainda não corrigidos — priorize via harness):

2. **Detector de confirmação (WF1) é estrito demais.** Cliente confirmando com frase natural
   ("Perfeito, obrigado!", "pode marcar sim") cai em `ambiguous` → bot NÃO dispara
   `agendar_no_soc`, fica em `em_andamento`. Regex âncorada só casa positivos curtos exatos.
   UX gap real em prod.
3. **Agente às vezes roda o fluxo PERIODICO para um pedido ADMISSIONAL** (chama
   `buscar_funcionario` + `tipo_compromisso:PERIODICO` em vez de `validar_hierarquia`/
   `cadastrar_funcionario`). Classificação de tipo não-determinística.
4. **LLM às vezes chama tool prematuramente / com arg vazio** (ex: `buscar_empresa` com
   `cnpj:""` antes de pedir o CNPJ).

Parte da variação vem do cliente LLM (fraseado), parte é fragilidade genuína do agente —
exatamente o que o harness existe pra expor sem testar 10× na mão. Cada item acima é um fix
candidato que você valida re-rodando o cenário com `--repeat`.
