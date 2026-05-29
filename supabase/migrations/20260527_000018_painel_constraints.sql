alter table agendas_config add column if not exists responsavel_id uuid references responsaveis(id);
alter table conversas add column if not exists responsavel_id uuid references responsaveis(id);
create index if not exists idx_conversas_responsavel on conversas(responsavel_id) where responsavel_id is not null;
create index if not exists idx_agendas_responsavel on agendas_config(responsavel_id) where responsavel_id is not null;

alter table conversas drop constraint conversas_status_check;
alter table conversas add constraint conversas_status_check
  check (status = any (array[
    'coletando','aguardando_dados_cadastro','aguardando_confirmacao',
    'agendando','concluido','erro','aguardando_cadastro_func',
    'transferido','encerrado'
  ]));

alter table mensagens drop constraint mensagens_papel_check;
alter table mensagens add constraint mensagens_papel_check
  check (papel = any (array['user','assistant','tool','system','humano']));

alter table notificacoes_pendentes drop constraint notificacoes_pendentes_tipo_check;
alter table notificacoes_pendentes add constraint notificacoes_pendentes_tipo_check
  check (tipo = any (array['cadastrar_funcionario','erro_soc','revisao','outro','transferencia']));
