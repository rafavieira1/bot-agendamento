# Instructions for AI agents

This file is for AI coding assistants OTHER THAN Claude Code (Cursor, GitHub Copilot, Aider, Cline, etc). Claude Code reads [CLAUDE.md](CLAUDE.md) which has identical guidance plus Claude-specific conventions.

## Project at a glance

n8n + Supabase + WhatsApp (Meta Cloud API in prod, Avisa API in dev/test) + OpenAI bot for scheduling occupational exams (**PERIÓDICO, DEMISSIONAL and ADMISSIONAL**) via SOC SST. All other exam types → bot transfers to human operator silently.

## Key references

- **Operational README:** [README.md](README.md) — setup, deploy, debug
- **AI session context (primary):** [CLAUDE.md](CLAUDE.md) — full conventions, gotchas, IDs, testing workflow
- **Test harness (test any agent feature):** [evals/README.md](evals/README.md)
- **Original design:** [docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md](docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md)
- **Admissional design:** [docs/superpowers/specs/2026-05-29-bot-agendamento-admissional-design.md](docs/superpowers/specs/2026-05-29-bot-agendamento-admissional-design.md)
- **Implementation plan + AMENDMENT:** [docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md](docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md)
- **n8n workflows reference:** [n8n/workflows/README.md](n8n/workflows/README.md)
- **SOC technical context:** [.claude/skills/soc-integration.md](.claude/skills/soc-integration.md)

## Stack & layout

- `src/` — JS helpers (ESM, pure functions), tests in `tests/` (Vitest, 142/142 passing, `pool: forks`)
- `evals/` — conversational test harness for the WF2 agent (standalone, LLM-simulated client). **Run this to test any new agent feature.** See [evals/README.md](evals/README.md) + CLAUDE.md § "Testar feature nova do agente".
- `supabase/migrations/` — 21 SQL migrations applied to project `czqellcrtzhjvdirpgxe`
- `n8n/workflows/` — 6 workflows (WF1–WF6) live inside n8n (not committed as JSON). See CLAUDE.md / README for IDs.
- `.env` — never commit. Contains SOC, Supabase, Meta/Avisa, OpenAI secrets.

## Commands

```bash
.\start-n8n.ps1   # Windows PowerShell: start n8n + ngrok + load .env
npm test          # Vitest (142/142)
npm run eval      # Conversational test harness — all scenarios (agent WF2 standalone)
node evals/run-eval.js --only <name1,name2> --repeat 5   # subset, N runs (client LLM is non-deterministic → always --repeat)
```

## Testing a new agent feature

Any change to agent behavior (WF2 prompt, tools, confirmation detector, dispatcher) or a new conversational capability MUST be exercised by the harness before committing. Mirror the change into the canonical `src/` file → add/edit a scenario in `evals/scenarios/` → run with `--repeat 5` → read transcripts in `evals/runs/` → iterate → `npm test` → sync the Code node into the live n8n workflow (confirm it is the active version). Full step-by-step in **CLAUDE.md § "Testar feature nova do agente (harness de evals)"** and [evals/README.md](evals/README.md).

## Critical conventions

- **Datas:** SOC expects `DD/MM/AAAA`; Postgres uses `YYYY-MM-DD`. Normalize before insert.
- **CPF/CNPJ:** strip non-digits before queries.
- **Telefone:** E.164 without `+` (e.g., `5513999990000`).
- **Migration filename:** `YYYYMMDD_NNNNNN_descricao.sql`
- **Workflow naming:** `[PROD-AGENDAMENTO] WFN - Descrição`

## What NOT to do

- Do NOT change agent behavior (WF2 prompt, tools, confirmation detector, dispatcher) without running the evals harness first (`node evals/run-eval.js --only <name> --repeat 5`).
- Do NOT edit only `src/` for an agent change — the live n8n Code node holds a **pasted copy**; sync it via MCP and confirm it is the active version, or production runs stale.
- Do NOT expose the exam-type scope to the client — bot asks exam type openly and transfers silently for out-of-scope types.
- Do NOT modify SOC SOAP envelope without testing — gotchas documented in [CLAUDE.md § Gotchas críticos](CLAUDE.md).
- Do NOT commit `.env`. It contains secrets.
- Do NOT introduce new top-level workflows without consolidation discussion — current state is intentionally 6 (WF1–WF6).

(`cadastrar_funcionario` / ADMISSIONAL is now **in scope** as of 2026-05-29 — the old "do not implement" rule from AMENDMENT 2026-05-21 no longer applies.)

## Owner

Rafael Vieira (processos1.soc@gpsafework.com.br)
