create table notificacoes_pendentes (
  id            uuid primary key default uuid_generate_v4(),
  conversa_id   uuid references conversas(id) on delete set null,
  tipo          text not null check (tipo in (
    'cadastrar_funcionario','erro_soc','revisao','outro'
  )),
  prioridade    text not null default 'p2' check (prioridade in ('p0','p1','p2')),
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'aberto'
                check (status in ('aberto','resolvido','cancelado')),
  resolvido_por text,
  created_at    timestamptz not null default now(),
  resolvido_em  timestamptz
);

create index idx_notif_abertas on notificacoes_pendentes(created_at)
  where status = 'aberto';
