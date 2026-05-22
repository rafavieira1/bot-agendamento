-- Migration: 20260521_000011_notificacoes_outbound
-- Purpose: Tabela compartilhada entre dois sistemas:
--   1. Sistema OUTBOUND (colega, stack livre): varre SOC, identifica funcionários com
--      exames atrasados, dispara WhatsApp proativo para o contato da empresa, e GRAVA
--      o registro nesta tabela.
--   2. Sistema INBOUND (bot-agendamentos, n8n): quando o cliente responde via WhatsApp,
--      o WF01 consulta esta tabela por telefone (janela 72h) para enriquecer o contexto
--      da conversa antes de invocar o LLM. Permite ao agente saber "essa pessoa foi
--      contatada sobre o funcionário X, exame Y atrasado".
--
-- Contract:
--   - Sistema OUTBOUND escreve (INSERT) ao disparar a notificação.
--   - Sistema INBOUND lê (SELECT) ao processar mensagem entrante.
--   - Quando o INBOUND associa a resposta a uma notificação, faz UPDATE setando
--     respondido_em e conversa_id (FK).
--
-- Both systems use the service_role key. RLS is enabled, no public access.

create table notificacoes_outbound (
  id                  uuid primary key default gen_random_uuid(),
  telefone            text not null,
  cnpj_empresa        text,
  codigo_empresa_soc  int,
  funcionario_cpf     text not null,
  funcionario_nome    text,
  tipo_exame          text not null,
  exame_descricao     text,
  data_vencimento     date,
  enviado_em          timestamptz not null default now(),
  message_id_meta     text,
  template_nome       text,
  respondido_em       timestamptz,
  conversa_id         uuid references conversas(id) on delete set null,
  metadata            jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index idx_notif_outbound_telefone        on notificacoes_outbound (telefone);
create index idx_notif_outbound_telefone_recent on notificacoes_outbound (telefone, enviado_em desc);
create index idx_notif_outbound_funcionario     on notificacoes_outbound (funcionario_cpf);
create index idx_notif_outbound_conversa        on notificacoes_outbound (conversa_id);

alter table notificacoes_outbound enable row level security;

comment on table notificacoes_outbound is
  'Notificacoes proativas WhatsApp disparadas pelo sistema outbound (colega) para clientes com exames em atraso. Lida pelo sistema inbound (bot-agendamentos) para enriquecer contexto da conversa quando o cliente responde.';

comment on column notificacoes_outbound.telefone is
  'E.164 sem + (ex: 5513999990000). Mesmo formato que conversas.telefone para join.';

comment on column notificacoes_outbound.message_id_meta is
  'wamid retornado pela Meta Cloud API ao enviar a mensagem. Usado para auditoria e correlacao.';

comment on column notificacoes_outbound.template_nome is
  'Nome do template UTILITY aprovado pela Meta utilizado no disparo.';

comment on column notificacoes_outbound.respondido_em is
  'Preenchido pelo sistema inbound quando o cliente responde dentro da janela de 72h.';
