# Design — Bot WhatsApp de Agendamento de Exames Ocupacionais (SOC)

**Data:** 2026-05-20
**Autor:** Rafael Vieira + Claude
**Status:** Draft — aguardando revisão

## 1. Objetivo

Permitir que donos de empresas clientes da Safe agendem exames ocupacionais de seus funcionários
diretamente via WhatsApp, eliminando trabalho manual da equipe Safe. O bot conduz a conversa,
coleta dados, opcionalmente cadastra funcionário novo no SOC, agenda o exame no SOC e confirma
ao cliente — tudo via integração com os WebServices SOAP do sistema SOC.

## 2. Escopo

**Inclui:**
- Recepção de mensagens WhatsApp via Meta Cloud API (oficial).
- Agente conversacional em PT-BR conduzindo coleta de dados.
- Identificação de empresa por CNPJ.
- Busca de funcionário por CPF no SOC.
- Cadastro de funcionário novo no SOC (quando ainda não existir).
- Inclusão de agendamento no SOC.
- Confirmação ao cliente via WhatsApp após gravação no SOC.
- Suporte a múltiplos funcionários numa mesma conversa.
- Fila de intervenção humana (equipe Safe) quando bot trava ou erra.

**Não inclui (v1):**
- Alteração ou exclusão de agendamentos existentes via bot.
- Consulta de histórico/resultados de exames.
- Pagamentos ou faturamento.
- Atendimento ativo (bot só responde mensagens recebidas; não inicia conversas).

## 3. Stack

- **Orquestração:** n8n (mesmo padrão já usado pelo usuário em outros projetos).
- **Banco/estado:** Supabase (Postgres + Edge Functions opcionais).
- **WhatsApp:** Meta WhatsApp Cloud API oficial.
- **LLM:** OpenAI (GPT-4o-mini ou GPT-4.1 — definir por custo).
- **Integração SOC:** SOAP 1.1 com WS-Security UsernameToken + PasswordDigest + Nonce + Timestamp.
- **Hospedagem n8n:** instância existente do usuário (mesma do projeto de prospecção de leads).

## 4. Arquitetura geral

```
┌─────────────┐     webhook       ┌──────────────────────────────┐
│ WhatsApp    │ ────────────────► │  n8n: Workflow "Recebe Msg"  │
│ Meta Cloud  │ ◄──── reply ───── │  (entrada única do bot)      │
└─────────────┘                   └──────────────┬───────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │ Supabase: estado convo │
                                    │ (lê + grava)           │
                                    └──────────┬─────────────┘
                                               │
                                               ▼
                          ┌────────────────────────────────────┐
                          │  AI Agent (OpenAI w/ tool calling) │
                          │  System prompt + histórico + estado│
                          └─────┬──────────────────────────────┘
                                │ tool calls
            ┌───────────────────┼───────────────────┬─────────────────────┐
            ▼                   ▼                   ▼                     ▼
     ┌────────────┐     ┌──────────────┐    ┌──────────────┐     ┌──────────────┐
     │ Tool: SOC  │     │ Tool: Supab. │    │ Tool: WhatsA │     │ Tool: Notif. │
     │ SOAP calls │     │ cache/lookup │    │ enviar msg   │     │ equipe Safe  │
     └─────┬──────┘     └──────────────┘    └──────────────┘     └──────────────┘
           │
           ▼
    ┌──────────────┐
    │ SOC WS       │
    │ (SOAP+WSSec) │
    └──────────────┘
```

**Abordagem escolhida:** agente LLM com tools determinísticas + guardrails de estado (opção C
do brainstorming). LLM conduz a conversa naturalmente mas tools encapsulam toda interação com SOC,
WhatsApp e banco. Confirmação do cliente (resposta "SIM") é detectada por workflow determinístico
antes de invocar agendamento — LLM não tem poder de gravar no SOC por iniciativa própria.

## 5. Modelo de dados (Supabase)

### Tabelas

```sql
-- Conversa por número de telefone (uma viva por vez por telefone)
conversas (
  id                  uuid pk,
  telefone            text unique,            -- E.164
  status              text,                   -- 'coletando' | 'aguardando_dados_cadastro'
                                              -- | 'aguardando_confirmacao' | 'agendando'
                                              -- | 'concluido' | 'erro' | 'aguardando_cadastro_func'
  dados               jsonb,                  -- ver schema abaixo
  cnpj_empresa        text,                   -- só dígitos
  codigo_empresa_soc  int,
  aceite_lgpd_em      timestamptz,
  ultima_atividade    timestamptz,
  created_at          timestamptz
)

-- Histórico de mensagens (contexto LLM + auditoria)
mensagens (
  id           bigserial pk,
  conversa_id  uuid fk,
  papel        text,                          -- 'user' | 'assistant' | 'tool'
  conteudo     text,
  tool_name    text null,
  tool_args    jsonb null,
  tool_result  jsonb null,
  created_at   timestamptz
)

-- Dedup de webhooks Meta
mensagens_recebidas (
  message_id   text pk,                       -- Meta message ID
  conversa_id  uuid fk,
  recebida_em  timestamptz
)

-- Cache empresas
empresas_cache (
  cnpj                     text pk,
  codigo_empresa           int,
  razao_social             text,
  unidades                 jsonb,
  defaults_funcionario     jsonb,             -- ver abaixo
  atualizado_em            timestamptz
)

-- Cache funcionários (TTL curto)
funcionarios_cache (
  cpf                  text,
  codigo_empresa       int,
  codigo_funcionario   int,
  nome                 text,
  ativo                boolean,
  atualizado_em        timestamptz,
  pk (cpf, codigo_empresa)
)

-- Mapeamento tipo exame + unidade → agenda SOC
agendas_config (
  id                        serial pk,
  codigo_empresa_principal  int,
  unidade                   text,
  tipo_compromisso          text,             -- enum SOC
  codigo_usuario_agenda     int,
  codigo_prestador          int null,
  ativo                     boolean
)

-- Slots fixos disponíveis por agenda
slots_config (
  id                serial pk,
  agenda_config_id  int fk,
  dia_semana        int,                      -- 1..7
  hora_inicial      time,
  duracao_minutos   int,
  ativo             boolean
)

-- Agendamentos efetivados
agendamentos (
  id                  uuid pk,
  conversa_id         uuid fk,
  codigo_agendamento  int,
  codigo_agenda       int,
  codigo_funcionario  int,
  cpf                 text,
  data                date,
  hora_inicial        time,
  tipo_compromisso    text,
  status              text,                   -- 'agendado' | 'cancelado' | 'alterado'
  idempotency_key     text unique,
  payload_envio       jsonb,
  payload_retorno     jsonb,
  created_at          timestamptz
)

-- Fila de intervenção humana
notificacoes_pendentes (
  id            uuid pk,
  conversa_id   uuid fk,
  tipo          text,                         -- 'cadastrar_funcionario' | 'erro_soc' | 'revisao'
  prioridade    text,                         -- 'p0' | 'p1' | 'p2'
  payload       jsonb,
  status        text,                         -- 'aberto' | 'resolvido' | 'cancelado'
  resolvido_por text null,
  created_at    timestamptz,
  resolvido_em  timestamptz null
)
```

### Schema `conversas.dados` (jsonb)

```jsonc
{
  "cnpj": "12345678000190",
  "funcionarios": [
    {
      "cpf": "12345678900",
      "nome": "João Silva",
      "data_nascimento": "1990-05-12",
      "sexo": "MASCULINO",
      "estado_civil": "SOLTEIRO",
      "data_admissao": "2024-01-15",
      "funcao": "Operador",
      "tipo_exame": "PERIODICO",
      "unidade_atendimento": "Santos",
      "data_preferida": "2026-06-02",
      "hora_preferida": "09:00",
      "codigo_funcionario_soc": 12345,
      "status": "pronto_agendar"
    }
  ],
  "ultimo_resumo_enviado": "...",
  "confirmado": false
}
```

### Schema `empresas_cache.defaults_funcionario`

```jsonc
{
  "codigo_unidade_padrao": 1,
  "tipo_busca_unidade": "CODIGO_SOC",
  "codigo_setor_padrao": 1,
  "tipo_busca_setor": "CODIGO",
  "codigo_cargo_padrao": 1,
  "tipo_busca_cargo": "CODIGO",
  "tipo_contratacao_default": "CLT",
  "regime_trabalho_default": "NORMAL",
  "situacao_default": "ATIVO"
}
```

## 6. Fluxo conversacional

### Estados

```
[nova msg] → carrega conversa → monta contexto → LLM decide
                                                    │
   ┌────────────────────────────────────────────────┤
   ▼                ▼                ▼              ▼
identifica       coleta            confirma       agenda
empresa          func+exame        resumo         SOC
(CNPJ)           (CPF+tipo+data)   (sim/não)      (SOAP)
```

### Detecção de confirmação

Quando `status == 'aguardando_confirmacao'`, workflow n8n check rápido antes de invocar LLM:
- Match positivo (`sim|s|confirmo|pode|isso|ok|👍|✅`) → seta `status='agendando'`, chama
  `agendar_no_soc` diretamente, passa resultado pro LLM formatar resposta final.
- Match negativo (`não|nao|n|cancela|errado`) → volta pra `coletando`, LLM pergunta o que corrigir.
- Ambíguo → LLM decide.

### Aviso LGPD

Primeira interação do bot inclui: *"Olá! Sou o assistente de agendamento da Safe. Para te ajudar
vou coletar alguns dados pessoais do funcionário (CPF, nome, etc), tratados conforme nossa
[Política de Privacidade]. Continuando você confirma o aceite. Por favor, me informe o CNPJ da
empresa."* Timestamp gravado em `conversas.aceite_lgpd_em`.

## 7. Tools do agente

| Tool | Função |
|------|--------|
| `buscar_empresa(cnpj)` | Resolve CNPJ → `codigo_empresa`. Cache 7 dias. |
| `buscar_funcionario(cpf, codigo_empresa)` | Busca funcionário ativo. Cache 24h. |
| `cadastrar_funcionario(dados)` | SOAP `importacaoFuncionario` com defaults da empresa. |
| `listar_slots(empresa, unidade, tipo, data_de, data_ate)` | Slots fixos pré-configurados, cruzando com `agendamentos` locais. |
| `enviar_confirmacao(conversa_id, resumo)` | Manda resumo via WhatsApp; muda status pra `aguardando_confirmacao`. |
| `agendar_no_soc(payload)` | SOAP `incluirAgendamento`. Só roda se status==`agendando`. |
| `enviar_mensagem(conversa_id, texto)` | Texto livre via WhatsApp. |
| `notificar_safe(tipo, payload)` | Cria `notificacoes_pendentes`. |

### Dados mínimos a coletar do cliente

**Para funcionário já cadastrado:** CPF, tipo de exame, unidade, data preferida.

**Para cadastrar funcionário novo:** + nome completo, data de nascimento, sexo, estado civil,
data de admissão, função. Resto vai com defaults da empresa em `empresas_cache.defaults_funcionario`.
Campos extras (RG, PIS, endereço) só são pedidos se SOC retornar erro de obrigatoriedade.

## 8. Integração SOC

### WS-Security (UsernameToken + PasswordDigest)

Cada chamada SOAP gera novo Header de segurança:

```js
const created  = ISO timestamp now;
const expires  = created + 60s;
const nonce    = randomBytes(16);  // raw bytes
const username = 'U' + codigoUsuario;
const passwordDigest = Base64( SHA1( nonce + created_utf8 + password_utf8 ) );
```

Header SOAP montado conforme seção 2.1 das specs SOC (não criptografia adicional na v1).

### Operações usadas

| WS | Operação | Quando |
|----|----------|--------|
| WS Agendamento | `incluirAgendamento` | Gravar agendamento confirmado |
| WS Agendamento | `excluirAgendamento` | (Futuro) cancelamento via bot |
| WS Agendamento | `alterarAgendamento` | (Futuro) remarcação via bot |
| WS Funcionário M2 | `importacaoFuncionario` | Cadastrar ou (probe) buscar funcionário |

### Busca de funcionário sem WS de consulta

WS Funcionário M2 não tem operação de consulta pura. Probe via `importacaoFuncionario` com
`criarFuncionario=false`, `atualizarFuncionario=false`, `chaveProcuraFuncionario=CPF_ATIVO`. Resposta
traz `encontrouFuncionario=true/false`. Substituir por WS Exporta Dados Funcionários se Safe tiver
acesso (a confirmar).

### Cliente SOAP no n8n (sub-workflow `soc_soap_call`)

1. Nó Code monta WS-Security header.
2. Nó Set concatena envelope `<Header>...</Header><Body>{body_xml}</Body>`.
3. Nó HTTP Request POST endpoint WSDL, `Content-Type: text/xml; charset=utf-8`.
4. Nó XML Parse → JSON.
5. Nó Function classifica resposta (sucesso / SOC-200 / soap:Fault).

### Fila sequencial

SOC não suporta paralelismo. Tabela `soc_fila` (ou n8n queue) garante 1 chamada SOAP por vez.

## 9. Tratamento de erros SOC

### Buckets

**A — Infra/autenticação (problema técnico):** `FailedAuthentication`, `InvalidSecurity`,
`MessageExpired`, `SOC-201`, `SOC-311`, `SOC-314`, `SOC-343`, `SOC-24`.
Bot informa "problema técnico" + cria notificação. Sem retry (exceto `MessageExpired` 1x).

**B — Dado de cadastro inexistente (bot resolve coletando mais):** `SOC-202`/`SOC-304` (empresa),
`SOC-303` (funcionário), `SOC-315`/`SOC-316` (compromisso), `SOC-341` (inativo só demissional).
Bot pede info correta ou entra em fluxo de cadastro.

**C — Conflito de horário/agenda (bot oferece alternativa):** `SOC-306`, `SOC-307`, `SOC-308`,
`SOC-340`, `SOC-327`, `SOC-353`.
Bot ressugere horário.

**D — Erro de validação no payload (bug do bot):** `SOC-210`, `SOC-325`–`SOC-331`, `SOC-318`–`SOC-322`,
`SOC-348`.
Log + notifica equipe. Bot re-pergunta o campo.

**E — Regra de negócio bloqueia (bot explica e encerra):** `SOC-206`, `SOC-209`/`SOC-342`,
`SOC-332` (inadimplente), `SOC-336`/`SOC-339`.
Bot explica em PT-BR. Sem retry.

Tabela completa de mapeamento código → bucket+mensagem+ação fica em `error_handler.json` no
Supabase ou hardcoded no n8n.

### Idempotência

- `mensagens_recebidas.message_id` (Meta) com `ON CONFLICT DO NOTHING` evita reprocessar webhook.
- `agendamentos.idempotency_key = hash(conversa_id + cpf + data + hora)` evita gravar 2x no SOC.

### Timeouts/retries

HTTP timeout 30s. Retry automático só pra infra transitória: `MessageExpired` 1x; erro de rede
genérico 2x com backoff 5s/15s. Demais erros: zero retry.

Após 3 falhas SOAP consecutivas na mesma conversa: `status='erro'`, notificação P0.

## 10. Segurança

- **Credenciais SOC, Meta, OpenAI:** n8n Credentials (criptografadas), nunca em DB nem código.
- **Webhook Meta:** valida `X-Hub-Signature-256` (HMAC SHA-256 com `app_secret`). Path com sufixo
  aleatório longo.
- **Supabase:** RLS ativo em todas tabelas; n8n acessa via service role.
- **Logs:** mascarar/truncar payloads SOAP que contenham PII. Logs estruturados em Postgres com
  retenção configurável.

## 11. LGPD

**Dados pessoais tratados:** CPF, nome completo, data nascimento, telefone, função, tipo de exame
(saúde).

**Base legal:** execução de contrato Safe ↔ empresa cliente + obrigação legal NR-7/eSocial.

**Medidas:**
- **Minimização:** coleta só o que o WS exige.
- **Retenção:** `mensagens` e `conversas` finalizadas → anonimizar após 90 dias (cron Supabase).
  `agendamentos` mantém pelos prazos legais de exames ocupacionais (mín. 20 anos — confirmar com
  jurídico Safe).
- **Aviso:** primeira mensagem do bot informa tratamento + link política. Aceite gravado em
  `conversas.aceite_lgpd_em`.
- **Direitos do titular:** atendimento manual via equipe Safe (não automatizar v1).

## 12. Testes

**Unit (Vitest ou similar):** helper WS-Security, montador XML SOAP, parser de resposta, mapper de
erros.

**Integração (n8n → SOC homol):** cenários feliz, funcionário novo, cada bucket de erro. Roda
manual antes de cada deploy.

**E2E manual (WhatsApp homol → bot → SOC homol):** ≥20 conversas simuladas antes do go-live,
cobrindo cliente colaborativo, cliente vago, mudança de ideia, múltiplos funcionários, cancelamento.

**Eval do LLM:** set fixo de ~30 transcripts com saída esperada. Roda contra OpenAI ao mudar
prompt/modelo. Mede acerto de extração (CPF, data, tipo exame, normalização BR).

## 13. Observabilidade

Dashboard (Supabase + Metabase ou n8n nativo):
- Conversas/dia, taxa de conclusão, tempo médio até confirmação, top erros SOC, top motivos de
  notificação pendente.

Alertas:
- ≥3 erros bucket A em 10 min → email/SMS pra dev Safe.
- Notificação pendente >2h aberta → cobrar equipe.

## 14. Rollout

**Fase 1 — homologação interna (1–2 semanas):** lista branca de números (só funcionários Safe).
Coleta feedback.

**Fase 2 — piloto (2–4 semanas):** 1–2 empresas clientes selecionadas. Equipe acompanha cada
conversa.

**Fase 3 — geral:** todos os clientes cadastrados, monitoramento contínuo.

Critério de avanço entre fases: ≥90% das conversas concluídas sem intervenção humana, zero
agendamentos errados no SOC.

## 15. Operação

- **Painel Safe** (Supabase Studio ou app interno futuro): lista `notificacoes_pendentes` abertas,
  botão "marcar resolvido", link pra conversa.
- **Retomada após cadastro manual:** quando equipe Safe cadastra funcionário no SOC e marca
  notificação como resolvida, trigger Supabase chama HTTP do n8n → bot envia "Funcionário
  cadastrado, retomando agendamento" e segue fluxo.

## 16. Pontos abertos

- **WS Exporta Dados Funcionários:** confirmar se Safe tem acesso para substituir probe via
  `importacaoFuncionario`.
- **Política de Privacidade Safe:** precisa link público pro aviso LGPD.
- **Retenção de exames ocupacionais:** confirmar prazo legal exato com jurídico (mín. 20 anos
  é referência comum, mas NR-7 atual pode divergir).
- **Modelo OpenAI definitivo:** decidir entre GPT-4o-mini e GPT-4.1 após eval de extração.
- **Defaults de hierarquia por empresa:** definir processo pra Safe popular
  `empresas_cache.defaults_funcionario` (manual via Supabase Studio ou tela administrativa).
