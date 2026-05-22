create extension if not exists "uuid-ossp";

create table conversas (
  id                  uuid primary key default uuid_generate_v4(),
  telefone            text not null unique,
  status              text not null default 'coletando'
                      check (status in (
                        'coletando',
                        'aguardando_dados_cadastro',
                        'aguardando_confirmacao',
                        'agendando',
                        'concluido',
                        'erro',
                        'aguardando_cadastro_func'
                      )),
  dados               jsonb not null default '{}'::jsonb,
  cnpj_empresa        text,
  codigo_empresa_soc  int,
  aceite_lgpd_em      timestamptz,
  ultima_atividade    timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index idx_conversas_telefone on conversas(telefone);
create index idx_conversas_status on conversas(status) where status != 'concluido';
