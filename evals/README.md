# Evals do agente (WF2)

`run-eval.js` POST cada transcript pra um webhook de eval do n8n (`N8N_EVAL_URL`) que
replaya os turns contra o agente e devolve `{ turns: [{ tools_called, status }] }`.

**Status do harness:** o webhook de eval ainda NÃO foi construído (Task 31 do plano).
Sem `N8N_EVAL_URL` o runner sai com erro. Até lá, os transcripts servem como **spec
executável do fluxo** — fonte de verdade do comportamento esperado, conferida na mão
contra as execuções reais do WF2.

## Fluxo atual (pós-amendment admissional)

Ordem de coleta: **cidade → CNPJ (`buscar_empresa`) → tipo de exame → (ramo) → data → `listar_slots` → 1º slot → `enviar_confirmacao` → "sim"**.

- **PERIODICO / DEMISSIONAL:** após o tipo, pede CPF → `buscar_funcionario`. No "sim" → `agendar_no_soc`.
- **ADMISSIONAL:** NÃO chama `buscar_funcionario`. Coleta bloco pessoal (CPF, nome, nascimento, sexo, estado civil, CTPS, admissão) + hierarquia (unidade/setor/cargo) → `validar_hierarquia`. No "sim" → `cadastrar_funcionario` (upsert) → `agendar_no_soc`.
- **Fora do escopo / hierarquia inexistente / funcionário ou empresa não encontrados / erro SOC:** `transferir_humano` (mensagem padrão silenciosa, status `transferido`).

## Transcripts

| Arquivo | Caso |
|---|---|
| `01_caso_feliz` | Periódico, funcionário existente, tudo numa msg |
| `02_funcionario_novo` | Admissional: coleta + `validar_hierarquia` + `cadastrar_funcionario` + agenda |
| `03_cliente_vago` | Periódico, bot puxa info aos poucos |
| `04_multiplos_funcionarios` | Periódico, 2 CPFs, confirmação consolidada |
| `05_cliente_muda_ideia` | Cliente recusa/corrige após confirmação |
| `06_hierarquia_nao_encontrada` | Admissional, setor/cargo inexistente → transfere silencioso |
| `07_exame_fora_escopo` | Tipo fora do escopo → transfere silencioso antes do CPF |

O prompt do agente é versionado em [`src/llm/system-prompt.js`](../src/llm/system-prompt.js)
(cópia runtime colada no Code node `Build OpenAI Request` do WF2 — manter em sync).
