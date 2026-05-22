create table agendamentos (
  id                  uuid primary key default uuid_generate_v4(),
  conversa_id         uuid references conversas(id),
  codigo_agendamento  int,
  codigo_agenda       int,
  codigo_funcionario  int,
  cpf                 text,
  data                date,
  hora_inicial        time,
  tipo_compromisso    text,
  status              text not null default 'agendado'
                      check (status in ('agendado','cancelado','alterado','falhou')),
  idempotency_key     text unique,
  payload_envio       jsonb,
  payload_retorno     jsonb,
  created_at          timestamptz not null default now()
);

create index idx_agendamentos_conversa on agendamentos(conversa_id);
create index idx_agendamentos_cpf_data on agendamentos(cpf, data);
