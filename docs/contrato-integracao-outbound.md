# Contrato de Integração — Outbound + Inbound (Safe)

Este documento explica como duas automações vão funcionar juntas no fluxo de agendamento de exames ocupacionais pela Safe. Foi escrito pra alinhamento entre os dois desenvolvedores (Rafael — inbound; colega — outbound) antes do desenvolvimento avançar.

---

## O cenário em uma frase

Vocês estão construindo dois sistemas separados, em stacks diferentes, que **trabalham com o mesmo cliente, no mesmo número de WhatsApp, em momentos diferentes**, e se comunicam só através de uma tabela compartilhada no Supabase e da API do WhatsApp Meta.

**Sistema OUTBOUND (você, colega):** varre o SOC, identifica funcionários com exames vencidos/atrasados, dispara mensagem proativa via WhatsApp para o contato da empresa. Stack livre.

**Sistema INBOUND (Rafael):** recebe a resposta do cliente, conversa com ele via agente de IA, coleta os dados que faltam e marca o agendamento no SOC. Já existe, em n8n + Supabase.

---

## Analogia pra ficar simples

Imagina que vocês trabalham numa mesma loja. O colega é o **vendedor que liga pro cliente oferecendo produto** ("oi, seu pneu tá vencendo, quer trocar?"). O Rafael é o **atendente que recebe o cliente que liga de volta** ("oi, quero trocar o pneu sim, dá pra marcar pra terça?").

Mesma loja, mesmo telefone, mesmo cliente — mas em momentos diferentes. Pra isso funcionar sem confusão, precisam combinar 4 coisas só.

---

## O que PRECISA ser combinado (e está combinado neste doc)

### 1. A tabela compartilhada `notificacoes_outbound`

Quando o colega dispara uma mensagem proativa, ele **grava o registro nessa tabela**. É o "caderno de anotações" pra que o Rafael saiba sobre o que o cliente está respondendo quando a resposta chegar.

A tabela já está criada no Supabase do projeto `bot-agendamentos`. Schema:

```sql
notificacoes_outbound (
  id                  uuid primary key,
  telefone            text NOT NULL,           -- E.164 sem +, ex: 5513999990000
  cnpj_empresa        text,
  codigo_empresa_soc  int,
  funcionario_cpf     text NOT NULL,
  funcionario_nome    text,
  tipo_exame          text NOT NULL,           -- ADMISSIONAL, PERIODICO, DEMISSIONAL, MUDANCA_FUNCAO, RETORNO_TRABALHO, CONSULTA
  exame_descricao     text,                    -- texto livre, ex: "Audiometria Tonal"
  data_vencimento     date,                    -- quando o exame vence/venceu
  enviado_em          timestamptz NOT NULL DEFAULT now(),
  message_id_meta     text,                    -- wamid retornado pela Meta
  template_nome       text,                    -- nome do template UTILITY usado
  respondido_em       timestamptz,             -- preenchido pelo INBOUND
  conversa_id         uuid REFERENCES conversas(id),  -- preenchido pelo INBOUND
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
)
```

**Quem escreve o quê:**
- OUTBOUND: INSERT ao disparar a mensagem (preenche tudo até `template_nome`)
- INBOUND: UPDATE quando associa a resposta (preenche `respondido_em` e `conversa_id`)

**Como o INBOUND associa a resposta:** quando uma mensagem WhatsApp chega no número, o Rafael consulta:
```sql
select * from notificacoes_outbound
where telefone = '<numero_do_remetente>'
  and enviado_em > now() - interval '72 hours'
  and respondido_em is null
order by enviado_em desc
limit 1;
```

Se achar, considera essa a notificação que o cliente está respondendo. 72h é o limite, depois disso considera-se uma conversa nova sem contexto.

### 2. Quem é dono do webhook Meta

Regra do WhatsApp Business: **um número, uma porta de entrada**. Não dá pra dois sistemas configurarem "me avise quando chegar mensagem" no mesmo número — o último que configurar sobrescreve.

**Decisão:** o webhook aponta para o n8n do Rafael (sistema INBOUND). O colega NÃO configura webhook. O colega só faz **outbound** (POST `/messages` na Meta API, que não precisa de webhook nenhum).

### 3. Token Meta compartilhado

Mesmo `META_ACCESS_TOKEN`, mesmo `META_PHONE_NUMBER_ID`, mesma WABA, mesmo número. Guardar em cofre compartilhado (Bitwarden ou equivalente).

Combinem:
- Quem rotaciona quando precisar (sugiro: o Rafael, porque o sistema dele depende do token a todo momento)
- Como avisa o outro quando rotacionar (sugiro: mensagem no canal interno + atualização imediata do cofre)

### 4. Template UTILITY Meta aprovado

A Meta exige que mensagens proativas (fora da janela de 24h após última msg do cliente) usem um **template pré-aprovado**.

**Quem submete:** o colega, porque é ele quem vai usar.
**Quando submete:** o quanto antes — Meta demora 24-48h pra aprovar.
**O que precisa ficar registrado:** nome do template + texto exato. O Rafael precisa saber pra que o agente de IA tenha contexto do que o cliente recebeu.

**Sugestão de texto inicial** (ajustem conforme aprovação Meta):

```
Ola, {{1}}! Aqui é da Safe Work. Identificamos que o(a) colaborador(a) {{2}} esta com o exame {{3}} em atraso desde {{4}}. Posso agendar para essa semana?
```

Variáveis:
- `{{1}}` = nome do contato da empresa
- `{{2}}` = nome do funcionário
- `{{3}}` = tipo/descrição do exame
- `{{4}}` = data de vencimento formatada (DD/MM/AAAA)

---

## O que NÃO precisa ser combinado

### A. Stack do sistema outbound

Stack livre. Python, Node, Go, n8n, planilha com macro — irrelevante pro Rafael. Vocês se comunicam só pela tabela compartilhada e pela API do WhatsApp.

### B. Como o outbound descobre os exames atrasados

Problema 100% do colega. Pode ser:
- Exporta Dados SOC (códigos 191868 ou 191876, já mapeados em `.claude/skills/soc-integration.md`)
- WebService SOAP do SOC
- Scraping
- Qualquer outra fonte

Resultado final é: pra cada funcionário identificado, INSERT na `notificacoes_outbound` + send via Meta API.

### C. Hospedagem do sistema outbound

VPS, AWS, Vercel, n8n próprio, máquina pessoal — irrelevante. Desde que tenha:
- Acesso à API Supabase (URL + service_role key)
- Acesso à API Meta (mesmo token)
- Acesso ao SOC

### D. Quando o outbound dispara

Cron diário, semanal, horários específicos, manual — escolha do colega. O INBOUND só vê as respostas chegarem.

### E. Como o outbound formata a mensagem além do template

Se vai personalizar com emoji, abreviar nome, etc — desde que respeite o template aprovado, sem impacto pro INBOUND. O INBOUND não lê o texto da mensagem outbound, lê o registro na tabela.

### F. Schema interno do outbound

O colega pode criar quantas tabelas próprias quiser no MESMO projeto Supabase pra controle interno (log de execuções, dedupe, métricas). Sugestão: prefixar com `outbound_` ou usar schema separado (`outbound.tabela`) pra não conflitar com tabelas do INBOUND.

---

## Sobre o Supabase: um projeto só, dois donos lógicos

**Não criar projeto Supabase separado.** Usar o projeto que já existe.

```
projeto: bot-agendamentos
ref:     czqellcrtzhjvdirpgxe
URL:     https://czqellcrtzhjvdirpgxe.supabase.co
região:  sa-east-1
```

Estrutura final do banco:

```
bot-agendamentos (Supabase project)
│
├── tabelas que o INBOUND controla (Rafael — repo bot-agendamentos)
│   ├── conversas
│   ├── mensagens
│   ├── mensagens_recebidas
│   ├── agendamentos
│   ├── empresas_cache
│   ├── funcionarios_cache
│   ├── agendas_config
│   ├── slots_config
│   └── notificacoes_pendentes
│
├── tabela COMPARTILHADA (contrato neste doc)
│   └── notificacoes_outbound          ← colega INSERT, Rafael UPDATE/SELECT
│
└── tabelas que o OUTBOUND controla (colega — repo dele)
    ├── outbound_*  (ou schema dedicado outbound.xxx)
    └── o que ele precisar
```

**Credenciais que o colega precisa:**
- `SUPABASE_URL = https://czqellcrtzhjvdirpgxe.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY = <Rafael passa via cofre>`
- `META_PHONE_NUMBER_ID = <Rafael passa via cofre>`
- `META_ACCESS_TOKEN = <Rafael passa via cofre>`

**Migrations:** o colega cria migrations no repo dele com prefixo de data + nome claro (ex: `20260601_outbound_001_setup.sql`). O ideal é não tocar nas migrations do repo do Rafael — coordenem se houver dúvida.

---

## Checklist pra desbloquear o colega

- [x] Tabela `notificacoes_outbound` criada no Supabase (migration `20260521_000011`)
- [x] Schema documentado neste doc
- [ ] Service role key do Supabase compartilhada via cofre
- [ ] Meta access token compartilhado via cofre
- [ ] Meta phone number ID compartilhado
- [ ] Texto do template UTILITY definido e submetido à Meta pelo colega
- [ ] Quando aprovado, o colega informa o `template_nome` exato pra o Rafael atualizar o prompt do agente

---

## Pontos de adaptação no sistema INBOUND (a fazer depois)

Quando o outbound estiver pronto, o INBOUND precisa de duas pequenas mudanças:

1. **Workflow 01 (`recebe_mensagem`)** — adicionar 1 nó entre "Pick Conversa" e "Insert User Mensagem":
   - Consulta `notificacoes_outbound` por telefone (últimas 72h, `respondido_em is null`)
   - Se achar: enriquece `conversas.dados` com `{ outbound_context: { funcionario_cpf, tipo_exame, exame_descricao, data_vencimento, notif_id } }`
   - Atualiza `notificacoes_outbound` setando `respondido_em = now()` e `conversa_id = <id>`

2. **Workflow 02 (`agente_llm`)** — adicionar ao system prompt:
   - Se `conversas.dados.outbound_context` existe, instruir o agente: "Este cliente foi contatado proativamente sobre o funcionário X (CPF Y) com exame Z atrasado desde data W. Comece o atendimento focando nesse contexto."

Trabalho estimado: 30min-1h após o outbound entregar.

---

## Resumo executivo (1 parágrafo pro colega)

> Combinamos 4 itens e seguimos cada um na sua: (1) você grava na tabela `notificacoes_outbound` no Supabase do projeto `bot-agendamentos` (já criada, schema neste doc) quando disparar mensagem proativa — coluna `telefone`, `funcionario_cpf`, `tipo_exame`, `enviado_em` são obrigatórias; (2) o webhook do número Meta aponta pro meu n8n, então você só usa a Meta API pra mandar, não recebe; (3) compartilhamos `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID` e `SUPABASE_SERVICE_ROLE_KEY` via cofre — quem rotacionar avisa o outro; (4) você submete e mantém aprovado o template UTILITY da Meta para a mensagem proativa, me passando nome e texto final. Stack, hospedagem, schema interno e horários de disparo são 100% sua decisão.
