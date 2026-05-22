-- Função: anonimiza conversas concluídas/erro com mais de 90 dias.
-- - Apaga conteúdo das mensagens (mantém metadata para auditoria estatística)
-- - Apaga dados pessoais de conversas.dados
-- Agendamentos NÃO são tocados (retenção legal exames ocupacionais).

create or replace function anonimizar_conversas_antigas()
returns int
language plpgsql
as $$
declare
  afetadas int;
begin
  with alvo as (
    select id from conversas
    where status in ('concluido','erro')
      and ultima_atividade < now() - interval '90 days'
      and dados ?| array['funcionarios','cnpj']
  )
  update conversas c
    set dados = jsonb_build_object('anonimizado', true),
        cnpj_empresa = null,
        telefone = '__anon__' || c.id::text
  from alvo
  where c.id = alvo.id;

  get diagnostics afetadas = row_count;

  update mensagens m
    set conteudo = '[anonimizado]',
        tool_args = null,
        tool_result = null
  from conversas c
  where m.conversa_id = c.id
    and c.telefone like '__anon__%'
    and m.conteudo != '[anonimizado]';

  return afetadas;
end;
$$;

comment on function anonimizar_conversas_antigas is
  'Anonimiza conversas concluidas/erro com mais de 90 dias. Agendar via cron.';
