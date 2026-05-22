# bot-agendamentos

Bot WhatsApp para agendamento de exames ocupacionais via SOC SST. Atende donos de empresas que querem agendar exame **PERIÓDICO** ou **DEMISSIONAL** para funcionários já cadastrados no SOC. Qualquer outro caso → transfere para humano.

**Stack:** n8n (orquestração) · Supabase (Postgres + RLS) · Meta WhatsApp Cloud API · OpenAI GPT-4o-mini (tool calling) · Node.js helpers + Vitest.

Para contexto detalhado de IA assistente, ver [CLAUDE.md](CLAUDE.md).

---

## Setup desenvolvimento local

### Requisitos
- Windows 11 + PowerShell
- Node.js 20+ (`node -v`)
- n8n instalado global (`npm install -g n8n`)
- `fast-xml-parser` global (`npm install -g fast-xml-parser`)
- ngrok (via winget: `winget install Ngrok.Ngrok`)
- Conta Supabase (projeto `czqellcrtzhjvdirpgxe`)
- App Meta WhatsApp Business configurado

### Variáveis de ambiente

Copiar `.env` (não commitado). Preencher mínimo:

```bash
# SOC
SOC_CODIGO_USUARIO=3604573
SOC_PASSWORD=<hash 40 chars>
SOC_EMPRESA=289501
SOC_WS_CODIGO_RESPONSAVEL=104404
SOC_WS_AGENDAMENTO_URL=https://ws1.soc.com.br/WSSoc/AgendamentoWs
SOC_WS_FUNCIONARIO_URL=https://ws1.soc.com.br/WSSoc/FuncionarioModelo2Ws
SOC_AMBIENTE=prod

# Supabase
SUPABASE_URL=https://czqellcrtzhjvdirpgxe.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<JWT service_role>

# Meta (preencher pelo Meta Developer Console)
META_GRAPH_VERSION=v21.0
META_PHONE_NUMBER_ID=<id número WhatsApp>
META_ACCESS_TOKEN=<System User Bearer permanente>
META_APP_SECRET=<App secret p/ HMAC signature>
META_WEBHOOK_VERIFY_TOKEN=<string aleatória que você escolhe>
META_HMAC_MODE=log_only

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Phase 1 rollout
WA_ALLOWLIST=5513999990000,5511988887777
```

### Subir n8n + ngrok

```powershell
.\start-n8n.ps1
```

Script:
1. Carrega `.env` (com strip de comentários inline)
2. Inicia ngrok em `http://localhost:5678`
3. Imprime URL pública (ngrok grátis muda a cada restart)
4. Sobe n8n com `NODE_FUNCTION_ALLOW_BUILTIN=crypto,zlib` + `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser`

n8n disponível em `http://localhost:5678`.

### Rodar testes Vitest

```bash
npm test           # rodada única
npm run test:watch # watch mode
npm run eval       # eval LLM com 5 transcripts
```

64/64 testes passando (cobrem helpers SOAP, WS-Security, parser, error-map, confirmação, signature).

---

## Setup produção (deploy VPS)

### Primeira deploy

1. **VPS:** já existe n8n rodando em `https://n8n.srv1564091.hstgr.cloud`. Acesso via `VPS_SSH_COMMAND` no `.env`.
2. **Exportar workflows do n8n local** via UI (`Export` em cada workflow) OU via MCP `n8n_get_workflow` salvando JSON.
3. **Importar na VPS** via UI ou API. Manter os mesmos nomes `[PROD-AGENDAMENTO] WFN - Descrição`.
4. **Criar credenciais na VPS** (Supabase + OpenAI) com mesmos valores do local.
5. **Configurar env vars da VPS:** `n8n` da VPS lê de `~/.n8n/.env` ou via variável de ambiente do container. Replicar `.env` local omitindo paths Windows.
6. **Configurar webhook Meta Console** apontando para URL VPS: `https://n8n.srv1564091.hstgr.cloud/webhook/wa-bot-c8a3f0d1-b9e4-4f12-8a7d-3e5c1b2f6a90`.
7. **Ativar workflows na VPS:** WF1, WF2, WF3, WF4, WF5.
8. **Setar `META_HMAC_MODE=enforce`** após 24h validado.
9. **Esvaziar `WA_ALLOWLIST`** para liberar geral (após testes).

### Atualização incremental

- Editar workflow no n8n local
- Exportar JSON
- Importar na VPS (overwrite)
- Migrations Supabase: aplicar via MCP ou Supabase Studio (ambiente compartilhado entre dev/prod)

---

## Seed de dados

### Status atual (já aplicado em dev)
- Empresa teste: `EMPRESA TESTE ALFA` (CNPJ `05435277000160`, codigo SOC `291130`)
- Agenda teste: `teste carlos` #1463919 (PERIODICO + DEMISSIONAL, marcada `fallback=true`)
- 528 slots de 5min (seg/ter/qui/sex 7:30-11:00; qua 7:30-11:00 + 13:30-17:30)

### Pra produção — 6 agendas reais

Cada agenda real recebe `cidade` OU `cnpj_empresa` OU `fallback=true`. Roteamento determinístico no Code node `LS - Select agendas`:

| Agenda SOC | Coluna roteamento | Valor |
|---|---|---|
| New Life #2746781 | `cnpj_empresa` | CNPJ da empresa New Life |
| Rede Credenciada #1929818 | `fallback` | `true` |
| Unidade Foz do Iguaçu #1463906 | `cidade` | `Foz do Iguaçu` |
| Unidade Londrina #1463660 | `cidade` | `Londrina` |
| Unidade Medianeira #134153 | `cidade` | `Medianeira` |
| Unidade Santa Helena #1463775 | `cidade` | `Santa Helena` |

Exemplo (1 agenda real):

```sql
insert into agendas_config (codigo_empresa_principal, unidade, tipo_compromisso, codigo_usuario_agenda, cidade, ativo) values
(289501, 'Unidade Medianeira', 'PERIODICO',   134153, 'Medianeira', true),
(289501, 'Unidade Medianeira', 'DEMISSIONAL', 134153, 'Medianeira', true);

-- New Life (CNPJ a preencher)
insert into agendas_config (codigo_empresa_principal, unidade, tipo_compromisso, codigo_usuario_agenda, cnpj_empresa, ativo) values
(289501, 'New Life', 'PERIODICO',   2746781, '00000000000000', true),
(289501, 'New Life', 'DEMISSIONAL', 2746781, '00000000000000', true);

-- Rede Credenciada (fallback)
update agendas_config set fallback=false where unidade='teste carlos';  -- desliga test fallback
insert into agendas_config (codigo_empresa_principal, unidade, tipo_compromisso, codigo_usuario_agenda, fallback, ativo) values
(289501, 'Rede Credenciada', 'PERIODICO',   1929818, true, true),
(289501, 'Rede Credenciada', 'DEMISSIONAL', 1929818, true, true);

-- Slots em cada agenda nova (intervalo 5min ou outro, varia por agenda real)
```

Slots variam por agenda — coletar horários reais de cada cidade antes de seed.

---

## Operação diária

### Monitorar conversas
- Supabase view `v_conversas_diarias` — total/concluídas/erro por dia
- Supabase view `v_erros_recentes` — erros tool nas últimas 7 dias agrupados por código
- Supabase view `v_notificacoes_abertas` — fila de notificações P0/P1/P2 pendentes

### Conversas transferidas para humano
Ver runbook: [.claude/skills/handoff-cliente-transferido.md](.claude/skills/handoff-cliente-transferido.md)

### Backup
- Supabase: backup automático diário (gratuito free tier: últimos 7 dias)
- n8n workflows: exportar JSON periodicamente via UI ou MCP

### Rotacionar credenciais

| Credencial | Onde | Quando rotacionar |
|---|---|---|
| `META_ACCESS_TOKEN` | Meta Developer Console → System Users | Padrão: nunca expira. Rotacionar se vazar |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | Se vazar (cuidado: muitos sistemas usam) |
| `OPENAI_API_KEY` | platform.openai.com → API Keys | Se vazar ou trimestralmente |
| `SOC_WS_PASSWORD` | SOC Cadastro de Usuário → Integração | Se vazar (coordenar com Safe TI) |

Após rotacionar: atualizar `.env` local + VPS + n8n credentials (se aplicável) + reiniciar n8n.

---

## Debugging

### Bot não responde
1. Conferir webhook Meta Console: status verde + URL atual (ngrok muda)
2. n8n: WF1 ativo? Ver Executions tab — algo entrou?
3. Allowlist: `WA_ALLOWLIST` inclui o telefone?
4. Logs: n8n Executions com status "error" — clique pra ver detalhes
5. Conversa em `status='transferido'` → bot intencionalmente parado

### Erro SOC
- `FailedAuthentication` → senha errada ou usuário inativo. Conferir SOC_PASSWORD
- `InvalidSecurity` → header WS-Security malformado (faltou Timestamp?)
- `SOC-303` → funcionário não encontrado (escopo manda transferir)
- `SOC-306/307/308` → conflito de horário (agent pede outro)
- `SOC-202/304` → CNPJ inválido (agent pede confirmação)

### Resposta SOC vazia
- Quase certo: gzip não descomprimido. WF3 deve usar `responseFormat: file` + `helpers.getBinaryDataBuffer()`. Já corrigido.

### Agent não chama tool
- System prompt: revisar `WF2 - Build OpenAI Request` Code node
- Tools registradas no payload? `tool_choice='auto'`?
- OpenAI logs: HTTP 200 + `tool_calls: null` → modelo decidiu não chamar tool (verificar se prompt deixa claro)

### Outros gotchas
Lista crítica em [CLAUDE.md § Gotchas](CLAUDE.md#gotchas-críticos-validados-em-produção).

---

## Estrutura do repo

```
.
├── CLAUDE.md                 # contexto p/ Claude Code (sessões IA)
├── AGENTS.md                 # referência rápida p/ outros AI tools
├── README.md                 # este arquivo (operacional)
├── start-n8n.ps1             # script local
├── package.json              # Vitest deps
├── src/                      # helpers JS testáveis (colados em Code nodes)
├── tests/                    # Vitest (64/64 ok)
├── supabase/
│   └── migrations/           # 11 migrations aplicadas
├── n8n/workflows/            # README do build manual
├── docs/
│   ├── superpowers/
│   │   ├── specs/            # design original
│   │   └── plans/            # plano implementação (+ AMENDMENT)
│   └── contrato-integracao-outbound.md  # contrato c/ colega (deferred)
├── evals/                    # transcripts LLM eval
└── .claude/
    └── skills/               # contexto SOC + runbooks
```

---

## Links úteis

- Supabase Dashboard: https://supabase.com/dashboard/project/czqellcrtzhjvdirpgxe
- n8n local: http://localhost:5678
- n8n VPS: https://n8n.srv1564091.hstgr.cloud
- Meta Developer Console: https://developers.facebook.com
- SOC: https://soc.com.br

## Contato

Owner: Rafael Vieira · processos1.soc@gpsafework.com.br
