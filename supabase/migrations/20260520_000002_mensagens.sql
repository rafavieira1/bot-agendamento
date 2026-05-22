create table mensagens (
  id           bigserial primary key,
  conversa_id  uuid not null references conversas(id) on delete cascade,
  papel        text not null check (papel in ('user', 'assistant', 'tool', 'system')),
  conteudo     text,
  tool_name    text,
  tool_args    jsonb,
  tool_result  jsonb,
  created_at   timestamptz not null default now()
);

create index idx_mensagens_conversa on mensagens(conversa_id, created_at);

create table mensagens_recebidas (
  message_id   text primary key,
  conversa_id  uuid references conversas(id) on delete set null,
  recebida_em  timestamptz not null default now()
);

create index idx_mensagens_recebidas_recente
  on mensagens_recebidas(recebida_em desc);
