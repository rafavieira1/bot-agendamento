---
name: handoff-cliente-transferido
description: Runbook para operadora humana atender clientes cuja conversa o bot transferiu. Use quando aparecer notificação P0 do tipo 'transferencia' na fila ou quando precisar assumir manualmente o WhatsApp Business de uma conversa marcada como transferido.
---

# Handoff: assumir conversa transferida pelo bot

Quando o bot transfere uma conversa (cliente pediu exame fora do escopo, funcionário não cadastrado, erro SOC grave), ele:

1. Manda mensagem ao cliente avisando que humano vai assumir
2. Cria `notificacoes_pendentes` com `tipo='transferencia'`, `prioridade='p0'`
3. Marca `conversa.status='transferido'` — **bot para de responder** novas mensagens dessa conversa

Você (humano) assume daqui pra frente, **no mesmo número WhatsApp Business** do bot.

## Passo a passo

### 1. Identificar conversas que precisam atenção

Abra Supabase Studio → SQL Editor:

```sql
select n.id as notif_id, n.created_at, n.tipo, n.payload,
       c.id as conversa_id, c.telefone, c.dados, c.ultima_atividade
from notificacoes_pendentes n
join conversas c on c.id = n.conversa_id
where n.status = 'aberto'
  and n.prioridade = 'p0'
  and n.tipo = 'transferencia'
order by n.created_at asc;
```

Ou via view: `select * from v_notificacoes_abertas where tipo='transferencia';`

### 2. Ler contexto da conversa

Para cada notificação, ler histórico:

```sql
select papel, conteudo, tool_name, tool_result, created_at
from mensagens
where conversa_id = '<conversa_id>'
order by created_at asc;
```

Atenção:
- `papel='user'` → mensagens do cliente
- `papel='assistant'` com `tool_name=null` → texto que o bot enviou
- `papel='assistant'` com `tool_name=...` → decisão de tool do bot (não vai aparecer pro cliente)
- `papel='tool'` → resultado da tool (interno)

O **payload** da notificação tem `motivo` da transferência (ex: `funcionario_nao_encontrado`, `exame_fora_escopo`, `erro_soc`) e contexto coletado pelo bot.

### 3. Responder o cliente

Abrir WhatsApp Business no celular ou Meta Business Suite Web. Conversa aparece com o cliente. **Continuar de onde o bot parou** — o cliente recebeu mensagem "Esse tipo de atendimento será feito por um colega da equipe Safe. Em instantes alguém do time vai continuar daqui. Obrigado!".

Responder educadamente e resolver manualmente o caso (cadastrar funcionário no SOC, agendar exame fora do escopo do bot, etc).

### 4. Marcar notificação resolvida

Após resolver:

```sql
update notificacoes_pendentes
set status = 'resolvido',
    resolvido_por = '<seu_nome>',
    resolvido_em = now()
where id = '<notif_id>';
```

### 5. Decidir se reativa bot

**Padrão: deixar conversa em `transferido` permanentemente.** Bot não responde mais nessa conversa.

Se quiser que o bot volte (raro):
```sql
update conversas set status = 'coletando' where id = '<conversa_id>';
```

## SLA

- P0: atender em até 2h. Cron `WF5` dispara alerta P0 extra se notificação aberta > 2h.
- Conferir fila pelo menos 3x ao dia em horário comercial.

## Casos comuns

| Motivo transferência | Ação humana |
|---|---|
| `funcionario_nao_encontrado` | Cadastrar funcionário no SOC manualmente, depois agendar exame (também manualmente — bot não retoma) |
| `exame_fora_escopo` | Coletar dados do exame (admissional, retorno, mudança de função), agendar manualmente no SOC |
| `empresa_nao_cadastrada` | Cadastrar empresa em `empresas_cache` no Supabase + agendas_config + slots_config. Depois agendar manualmente |
| `erro_soc` | Investigar com TI/Safe. Logs em `mensagens` papel=tool com `tool_result.bucket='A'` |

## Quem é responsável

- Notificações P0 transferencia: **equipe Safe Atendimento**
- Bugs/erros bucket A: **Rafael Vieira** (processos1.soc@gpsafework.com.br)
