create table empresas_cache (
  cnpj                  text primary key,
  codigo_empresa        int not null,
  razao_social          text,
  unidades              jsonb not null default '[]'::jsonb,
  defaults_funcionario  jsonb not null default '{}'::jsonb,
  atualizado_em         timestamptz not null default now()
);

create table funcionarios_cache (
  cpf                  text not null,
  codigo_empresa       int not null,
  codigo_funcionario   int,
  nome                 text,
  ativo                boolean not null default true,
  atualizado_em        timestamptz not null default now(),
  primary key (cpf, codigo_empresa)
);

create index idx_funcionarios_cache_atualizado
  on funcionarios_cache(atualizado_em desc);
