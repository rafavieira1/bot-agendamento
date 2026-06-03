-- Marco de início da sessão de atendimento corrente.
-- Painel exibe apenas mensagens com created_at >= atendimento_iniciado_em.
alter table conversas
  add column if not exists atendimento_iniciado_em timestamptz default now();

-- Backfill: conversas existentes começam na criação (não há sessão anterior a esconder).
-- Nota: ADD COLUMN com DEFAULT now() já preenche linhas existentes com o timestamp corrente,
-- então o WHERE usa <> created_at (não IS NULL) para corrigir o valor para created_at.
update conversas
  set atendimento_iniciado_em = created_at
  where atendimento_iniciado_em <> created_at;
