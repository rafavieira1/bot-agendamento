# n8n workflows — bot-agendamentos

Após consolidação Plan C (2026-05-22), o projeto tem **5 workflows no n8n** ao invés de 14. Todos com prefixo `[PROD-AGENDAMENTO]` e numeração WF1-WF5.

Esta pasta serve como referência conceitual. Os workflows **vivem dentro do n8n** (não como arquivos JSON commitados). Para exportar/importar use UI ou MCP.

---

## Arquitetura

```
                                  Meta WhatsApp
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ WF1 - Recebe Mensagem (webhook POST+GET)                        │
│   • verify signature  • dedup  • LGPD  • detect confirmação    │
└─────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼ (calls)
┌─────────────────────────────────────────────────────────────────┐
│ WF2 - Agente Conversacional (LLM loop + recursão max 5 iter)    │
│   • load conversa+mensagens  • OpenAI chat  • dispatch tool     │
└─────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼ (calls every tool)
┌─────────────────────────────────────────────────────────────────┐
│ WF4 - Tool Dispatcher (switch sobre tool_name)                  │
│   8 branches:                                                    │
│   • buscar_empresa       (Supabase only)                        │
│   • buscar_funcionario   (Supabase cache → WF3 probe → upsert)  │
│   • listar_slots         (Supabase: agendas + slots + ocupados) │
│   • agendar_no_soc       (idempotency → WF3 insert → Supabase)  │
│   • enviar_mensagem      (HTTP Meta + insert mensagem)          │
│   • enviar_confirmacao   (HTTP Meta + set status aguardando)    │
│   • transferir_humano    (HTTP Meta + notif p0 + set transferido)│
│   • notificar_safe       (insert notificacoes_pendentes)        │
└─────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼ (called by 2 tools)
┌─────────────────────────────────────────────────────────────────┐
│ WF3 - SOC SOAP Call (sub-workflow reutilizável)                 │
│   • build security header (WS-Security PasswordDigest)          │
│   • build envelope        • HTTP POST                            │
│   • parse SOAP response   • map error                            │
└─────────────────────────────────────────────────────────────────┘

WF5 - Cron Jobs (triggers independentes)
   • Schedule a cada 10min → monitor alertas (bucket A errors + SLA breach)
   • Schedule diário 03:00 → anonimização LGPD via RPC
```

---

## Workflows

### WF1 - Recebe Mensagem

**Triggers:** 2 webhooks paralelos convergem em `Normalize Inbound` → mesmo pipeline downstream.
- **Meta WhatsApp Cloud:** POST `/webhook/wa-bot-c8a3f0d1-b9e4-4f12-8a7d-3e5c1b2f6a90` (JSON) + GET (handshake `hub.challenge`)
- **Avisa API:** POST `/webhook/wa-avisa-a7f3c2e8b4d6915af2c0e7b8d3a4f5c1` (form-urlencoded com `token` + `jsonData`)

**Fluxo POST (Meta):**
1. Respond 200 imediato (Meta exige < 5s)
2. Verify HMAC X-Hub-Signature-256 (skip se `META_HMAC_MODE=log_only`)
3. Extract Message (Meta) — filtra só text type → `{message_id, telefone, texto, timestamp}`
4. → Normalize Inbound

**Fluxo POST (Avisa):**
1. Respond 200 imediato
2. Parse Avisa — valida `body.token === $env.AVISA_TOKEN`, `JSON.parse(body.jsonData)`, extrai `event.Info.SenderAlt` + `event.Message.conversation`, skip se IsFromMe/IsGroup/non-Message
3. → Normalize Inbound

**Pipeline comum (após Normalize Inbound):**
4. Allowlist check (skip se `WA_ALLOWLIST` vazio)
5. Dedup via `mensagens_recebidas.message_id`
6. Upsert `conversas` por telefone
7. **IF status='transferido' → END** (bot não responde mais)
8. IF aceite_lgpd_em null → enviar LGPD notice via WF4 enviar_mensagem
9. Insert mensagem (papel=user)
10. IF status='aguardando_confirmacao' → detect confirmation (sim/não/ambíguo) → switch
11. Call WF2 com hint apropriada

**ID:** `o80iAlxgMjWBfher` · **Nodes:** 28

---

### WF2 - Agente Conversacional

**Trigger:** Execute Workflow Trigger (input: `conversa_id, hint?, iteration?`)

**Fluxo:**
1. Init iteration (default 0)
2. Load conversa + mensagens (top 20)
3. Build OpenAI request (system prompt restrito PERIODICO+DEMISSIONAL + history + tools)
4. POST `https://api.openai.com/v1/chat/completions` (`gpt-4.1-mini`, `parallel_tool_calls=false`)
5. Parse response (content + tool_call[0])
6. Save assistant message
7. IF has_tool_call AND iteration < 5:
   - Prepare tool input (parse args)
   - Call WF4 Tool Dispatcher
   - Save tool result
   - IF tool_name in [enviar_confirmacao, transferir_humano] → END (set status)
   - ELSE recurse self with iteration+1
8. IF !has_tool_call AND content not empty → call WF4 enviar_mensagem

**ID:** `cdQwn4joLcuWlTJQ` · **Nodes:** 17

**System prompt:** escopo restrito (apenas PERIODICO + DEMISSIONAL). Tools registradas: `buscar_empresa, buscar_funcionario, listar_slots, enviar_confirmacao, enviar_mensagem, transferir_humano, notificar_safe`. Tool `cadastrar_funcionario` foi REMOVIDA pelo amendment.

---

### WF3 - SOC SOAP Call

**Trigger:** Execute Workflow Trigger (input: `endpoint, ambiente, bodyXml`)

**Fluxo:**
1. Build Security Header (PasswordDigest + Nonce + Timestamp via Node crypto)
2. Build SOAP envelope (header + body)
3. POST a SOC com `responseFormat: file` (gzip-aware)
4. Parse SOAP response (`fast-xml-parser` + gunzip via zlib se necessário)
5. Map error (tabela bucket A/B/C/D/E + userMsg PT-BR)

**Input:** `endpoint` ∈ `{agendamento, funcionario}`; `ambiente` ∈ `{prod, homol}`
**Output:** `{parsed: {kind, ...}, mappedError: {...} | null}`

**ID:** `m1sno9XeHbLmxo1c` · **Nodes:** 6 · **Smoke test:** validado end-to-end com SOC real (2026-05-21).

**URLs SOC:**
- Agendamento: `https://ws1.soc.com.br/WSSoc/AgendamentoWs`
- Funcionário: `https://ws1.soc.com.br/WSSoc/FuncionarioModelo2Ws`

---

### WF4 - Tool Dispatcher

**Trigger:** Execute Workflow Trigger (input: `tool_name, args, conversa_id, telefone`)

**Roteador:** Switch sobre `tool_name`, 8 saídas.

| Branch | Operações |
|---|---|
| `buscar_empresa` | Supabase getAll `empresas_cache` by cnpj → return found/miss |
| `buscar_funcionario` | Supabase cache check + TTL 24h → miss: build XML probe + call WF3 + upsert |
| `listar_slots` | Code routing (cnpj_empresa → cidade → fallback) resolve agenda → ExportaDadosWs "Horarios Livres da Agenda" como fonte principal → fallback `slots_config` se SOC indisponivel |
| `agendar_no_soc` | Pre-check ExportaDadosWs para limpar cache local stale → compute idempotency_key (sha1) → Supabase lookup → miss: build XML + call WF3 + insert |
| `enviar_mensagem` | HTTP POST switched by `$env.WA_PROVIDER` (Meta `/messages` ou Avisa `/actions/sendMessage`) → insert mensagem papel=assistant |
| `enviar_confirmacao` | HTTP switched (Meta/Avisa) + insert mensagem + update conversa.status=`aguardando_confirmacao` |
| `transferir_humano` | HTTP switched (Meta/Avisa, texto fixo) + insert mensagem + insert notif p0 + update conversa.status=`transferido` |
| `notificar_safe` | Insert `notificacoes_pendentes` (tipo, prioridade, payload) |

**ID:** `00kC3KB8q19KgCLp` · **Nodes:** 48

---

### WF5 - Cron Jobs

**Triggers (2 independentes no mesmo workflow):**

1. **Every 10 min:**
   - Query `mensagens` papel=tool, tool_result->>bucket='A', últimos 10min
   - IF count ≥ 3 → call WF4 notificar_safe (tipo=`erro_soc`, prioridade=`p0`)
   - Query `notificacoes_pendentes` aberto, prioridade ≠ p2, created > 2h
   - IF count > 0 → call WF4 notificar_safe (tipo=`revisao`, prioridade=`p0`, motivo='SLA estourado')

2. **Daily 03:00:**
   - POST `https://czqellcrtzhjvdirpgxe.supabase.co/rest/v1/rpc/anonimizar_conversas_antigas`
   - Log afetadas

**ID:** `HYNIIPAfFALivFtL` · **Nodes:** 10

---

## Credenciais n8n necessárias

| ID | Tipo | Uso |
|---|---|---|
| `bFthIb8jUB1PoCan` | Supabase API | WF1, WF2, WF4, WF5 (todas tabelas) |
| `VyPnpzWM0Xljer9G` | OpenAI API | WF2 (também usa `$env.OPENAI_API_KEY` no HTTP node) |

Tokens Meta (`META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, etc.) são lidos via `$env` direto nos HTTP nodes — não exigem credencial n8n separada.

Para disponibilidade real de horarios, WF4 usa o Exporta Dados
`SOC_EXPORTA_HORARIOS_LIVRES_CODIGO` +
`SOC_EXPORTA_HORARIOS_LIVRES_CHAVE` ("Horarios Livres da Agenda") via SOAP
`ExportaDadosWs`, porque esse relatorio tem `data`, `horario`, `codigoAgenda`
e `statusAgenda`. Esse Exporta Dados tem Acesso Post = Nao, entao nao funciona
via `WebSoc/exportadados`; precisa ser chamado pelo WebService.

Antes do lookup idempotente em `agendar_no_soc`, WF4 consulta o mesmo relatorio.
Se o SOC disser que o horario escolhido esta livre, qualquer agendamento local
ativo naquele slot e marcado como `cancelado/sincronizado` para evitar cache
stale depois de exclusao manual no SOC.

---

## Como exportar/importar workflows

### Export (local → backup ou VPS)

Via UI: cada workflow → menu `⋮` → `Download` → salva JSON. Não inclui credenciais.

Via MCP:
```
mcp__n8n-mcp__n8n_get_workflow(id=<workflow_id>, mode=full)
```

### Import (na VPS)

Via UI: `Workflows` → `Import from File`. **Antes de ativar:** reconfigurar credenciais (não vêm no JSON).

Via MCP-VPS (`mcp__n8n-mcp-vps__n8n_create_workflow`) passando nodes + connections do export.

---

## Gotchas críticos (validados em produção)

1. **Respostas SOC vêm gzipped sempre.** WF3 usa `responseFormat: file` + `helpers.getBinaryDataBuffer()` para descompactar. NÃO mudar para `text`.
2. **WS-Security exige Timestamp** no header (`<wsu:Timestamp>` com Created/Expires). Sem isso → `InvalidSecurity`.
3. **Username SOC tem prefixo `U`** (ex: `U3604573`). Sem prefixo → `FailedAuthentication`.
4. **n8n Code nodes precisam de allowlist** para `crypto`, `zlib` e `fast-xml-parser`. Setado em `start-n8n.ps1`.
5. **`.env` parser deve strip comments inline** (`\s+#.*$`). Caso contrário valores herdam o comentário e quebram autenticação.
6. **Webhook Meta:** `responseMode: responseNode` + `onError: continueRegularOutput` (n8n exige). WF1 responde 200 imediato via `Respond to Webhook` node, depois processa async.

---

## Próximas mudanças previstas

- Integração com automação outbound do colega → contrato em [docs/contrato-integracao-outbound.md](../../docs/contrato-integracao-outbound.md). **Adiada** (foco atual: 100% funcional inbound).
- Migrar de ngrok pra DNS estável na VPS quando deploy final
- Setar `META_HMAC_MODE=enforce` após 24h validado
