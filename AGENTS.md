# Instructions for AI agents

This file is for AI coding assistants OTHER THAN Claude Code (Cursor, GitHub Copilot, Aider, Cline, etc). Claude Code reads [CLAUDE.md](CLAUDE.md) which has identical guidance plus Claude-specific conventions.

## Project at a glance

n8n + Supabase + Meta WhatsApp + OpenAI bot for scheduling occupational exams (PERIÓDICO + DEMISSIONAL only) via SOC SST. All other exam types → bot transfers to human operator.

## Key references

- **Operational README:** [README.md](README.md) — setup, deploy, debug
- **AI session context (primary):** [CLAUDE.md](CLAUDE.md) — full conventions, gotchas, IDs
- **Original design:** [docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md](docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md)
- **Implementation plan + AMENDMENT:** [docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md](docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md)
- **n8n workflows reference:** [n8n/workflows/README.md](n8n/workflows/README.md)
- **SOC technical context:** [.claude/skills/soc-integration.md](.claude/skills/soc-integration.md)

## Stack & layout

- `src/` — JS helpers (ESM, pure functions), tests in `tests/` (Vitest, 64/64 passing)
- `supabase/migrations/` — 11 SQL migrations applied to project `czqellcrtzhjvdirpgxe`
- `n8n/workflows/` — 5 workflows live inside n8n (not committed as JSON). See README for IDs.
- `.env` — never commit. Contains SOC, Supabase, Meta, OpenAI secrets.

## Commands

```bash
.\start-n8n.ps1   # Windows PowerShell: start n8n + ngrok + load .env
npm test          # Vitest
npm run eval      # Run LLM eval on 5 transcripts
```

## Critical conventions

- **Datas:** SOC expects `DD/MM/AAAA`; Postgres uses `YYYY-MM-DD`. Normalize before insert.
- **CPF/CNPJ:** strip non-digits before queries.
- **Telefone:** E.164 without `+` (e.g., `5513999990000`).
- **Migration filename:** `YYYYMMDD_NNNNNN_descricao.sql`
- **Workflow naming:** `[PROD-AGENDAMENTO] WFN - Descrição`

## What NOT to do

- Do NOT implement `cadastrar_funcionario` flow — out of scope per AMENDMENT 2026-05-21.
- Do NOT modify SOC SOAP envelope without testing — gotchas documented in [n8n/workflows/README.md § Gotchas](n8n/workflows/README.md#gotchas-críticos-validados-em-produção).
- Do NOT commit `.env`. It contains secrets.
- Do NOT introduce new top-level workflows without consolidation discussion — current state is intentionally 5 (post-Plan C consolidation).

## Owner

Rafael Vieira (processos1.soc@gpsafework.com.br)
