alter table agendamentos
  add column if not exists codigo_empresa int,
  add column if not exists funcionario_nome text,
  add column if not exists atendido text,
  add column if not exists tipo_soc text,
  add column if not exists origem text not null default 'bot',
  add column if not exists sync_status text not null default 'pendente',
  add column if not exists sincronizado_soc_em timestamptz,
  add column if not exists atualizado_em timestamptz not null default now();

alter table agendamentos
  drop constraint if exists agendamentos_origem_check,
  add constraint agendamentos_origem_check
    check (origem in ('bot', 'soc_sync', 'manual'));

alter table agendamentos
  drop constraint if exists agendamentos_sync_status_check,
  add constraint agendamentos_sync_status_check
    check (sync_status in (
      'pendente',
      'sincronizado',
      'codigo_funcionario_ausente',
      'exporta_config_ausente',
      'erro'
    ));

create unique index if not exists idx_agendamentos_codigo_agendamento_unique
  on agendamentos(codigo_agendamento)
  where codigo_agendamento is not null;

create index if not exists idx_agendamentos_agenda_data_status
  on agendamentos(codigo_agenda, data, status);

create index if not exists idx_agendamentos_funcionario_sync
  on agendamentos(codigo_empresa, codigo_funcionario, data, status)
  where codigo_funcionario is not null;

create or replace function set_agendamentos_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_agendamentos_atualizado_em on agendamentos;

create trigger trg_agendamentos_atualizado_em
before update on agendamentos
for each row
execute function set_agendamentos_atualizado_em();
