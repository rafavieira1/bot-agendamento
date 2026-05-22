create table agendas_config (
  id                        serial primary key,
  codigo_empresa_principal  int not null,
  unidade                   text not null,
  tipo_compromisso          text not null check (tipo_compromisso in (
    'ADMISSIONAL','PERIODICO','RETORNO_TRABALHO','MUDANCA_FUNCAO','DEMISSIONAL',
    'MONITORACAO_PONTUAL','CONSULTA','ACIDENTE','LICENCA_MEDICA','ENFERMAGEM',
    'TERCEIROS','CONSULTA_ASSISTENCIAL'
  )),
  codigo_usuario_agenda     int not null,
  codigo_prestador          int,
  ativo                     boolean not null default true,
  unique (codigo_empresa_principal, unidade, tipo_compromisso)
);

create table slots_config (
  id                serial primary key,
  agenda_config_id  int not null references agendas_config(id) on delete cascade,
  dia_semana        int not null check (dia_semana between 1 and 7),
  hora_inicial      time not null,
  duracao_minutos   int not null default 30,
  ativo             boolean not null default true
);

create index idx_slots_agenda on slots_config(agenda_config_id) where ativo;
