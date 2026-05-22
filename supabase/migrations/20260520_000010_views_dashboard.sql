create view v_conversas_diarias as
select date_trunc('day', created_at)::date as dia,
       count(*)                            as total,
       count(*) filter (where status = 'concluido') as concluidas,
       count(*) filter (where status = 'erro')      as com_erro
from conversas
group by 1
order by 1 desc;

create view v_erros_recentes as
select c.codigo as codigo_erro,
       c.descricao,
       count(*) as ocorrencias,
       max(c.quando) as ultima_ocorrencia
from (
  select tool_result->>'codigo_erro' as codigo,
         tool_result->>'mensagem'    as descricao,
         created_at                  as quando
  from mensagens
  where papel = 'tool'
    and tool_result->>'ok' = 'false'
    and created_at > now() - interval '7 days'
) c
where c.codigo is not null
group by c.codigo, c.descricao
order by ocorrencias desc;

create view v_notificacoes_abertas as
select n.*, c.telefone, c.dados
from notificacoes_pendentes n
left join conversas c on c.id = n.conversa_id
where n.status = 'aberto'
order by case n.prioridade when 'p0' then 0 when 'p1' then 1 else 2 end,
         n.created_at;
