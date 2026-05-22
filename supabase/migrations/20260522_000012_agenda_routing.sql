alter table agendas_config
  add column if not exists cidade text,
  add column if not exists cnpj_empresa text,
  add column if not exists fallback boolean not null default false;

create index if not exists idx_agendas_cidade on agendas_config(cidade, tipo_compromisso) where ativo and cidade is not null;
create index if not exists idx_agendas_cnpj on agendas_config(cnpj_empresa, tipo_compromisso) where ativo and cnpj_empresa is not null;
create index if not exists idx_agendas_fallback on agendas_config(tipo_compromisso) where ativo and fallback;
