-- Habilita RLS em todas as tabelas. Acesso é via service role (n8n), que bypassa RLS.
-- Nenhum cliente anônimo deve acessar essas tabelas.

alter table conversas              enable row level security;
alter table mensagens              enable row level security;
alter table mensagens_recebidas    enable row level security;
alter table empresas_cache         enable row level security;
alter table funcionarios_cache     enable row level security;
alter table agendas_config         enable row level security;
alter table slots_config           enable row level security;
alter table agendamentos           enable row level security;
alter table notificacoes_pendentes enable row level security;

-- Sem policies: anon e authenticated não acessam. Service role do n8n bypassa.
