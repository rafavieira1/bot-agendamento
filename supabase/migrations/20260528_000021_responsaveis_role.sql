alter table responsaveis
  add column if not exists role text not null default 'atendente'
    check (role in ('admin', 'atendente'));

create index if not exists idx_responsaveis_role on responsaveis(role);
