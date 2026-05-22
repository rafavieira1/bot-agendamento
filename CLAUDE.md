# bot-agendamentos

Bot WhatsApp para agendamento de exames ocupacionais via SOC SST. Inbound only — recebe mensagem do cliente, agente LLM coleta dados, agenda no SOC via SOAP.

**Stack:** n8n (orquestração, self-hosted local + VPS futuro) + Supabase (Postgres + RLS) + Meta WhatsApp Cloud API + OpenAI (gpt-4o-mini, tool calling) + Node.js/Vitest (helpers testáveis colados em Code nodes).

## Escopo (após amendment de 2026-05-21)

**Bot agenda apenas:** PERIODICO e DEMISSIONAL — premissa de que funcionário já está cadastrado no SOC.

**Transfere pra humano:** qualquer outro tipo de exame, funcionário não encontrado, empresa não cadastrada, erro grave do SOC. Handoff dentro do mesmo número: `conversa.status='transferido'`, bot para de responder, notificação P0 criada.

**REGRA UX — escopo nunca exposto ao cliente:** bot pergunta tipo de exame de forma aberta (não lista "periódico/demissional"). Se cliente pedir tipo fora do escopo, transferência é **silenciosa** (msg padrão "humano em breve", sem dizer que bot não consegue).

Spec completa: [docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md](docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md). Plano: [docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md](docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md) (ler AMENDMENT no topo).

## Fluxo de coleta (UX híbrido)

Bot pede dados em **blocos lógicos**, mas se cliente já mandar tudo de uma vez, LLM extrai e pula passos:

1. CNPJ empresa → `buscar_empresa`
2. CPF funcionário + tipo de exame (juntos) → `buscar_funcionario`
3. Cidade do atendimento (pergunta aberta)
4. Data preferida → `listar_slots`
5. Cliente escolhe horário → `enviar_confirmacao`
6. Cliente responde "sim" → WF1 detecta → WF2 hint=sim → LLM chama `agendar_no_soc`

**Prioridade de horário:** sempre oferecer o **mais cedo primeiro**. Só pular slots cedo se cliente recusar explicitamente.

## Roteamento de agenda (determinístico no `listar_slots` / `agendar_no_soc`)

Bot escolhe agenda SOC automaticamente, **não** o LLM:

```
funcionário CNPJ == New Life? → agenda New Life
└ não → cidade ∈ {Medianeira, Londrina, Santa Helena, Foz do Iguaçu}? → agenda da cidade
  └ não → agenda Rede Credenciada (fallback)
```

Schema `agendas_config` (após migration 12): `cidade text`, `cnpj_empresa text`, `fallback boolean`. Lógica fica em Code node `LS - Select agendas` em WF4.

**Agendas reais (precisam ser cadastradas em produção):**
- New Life #2746781 (precisa CNPJ da empresa)
- Rede Credenciada #1929818 (`fallback=true`)
- Unidade Foz do Iguaçu #1463906 (`cidade='Foz do Iguaçu'`)
- Unidade Londrina #1463660 (`cidade='Londrina'`)
- Unidade Medianeira #134153 (`cidade='Medianeira'`)
- Unidade Santa Helena #1463775 (`cidade='Santa Helena'`)

**Agenda teste atual:** `teste carlos #1463919` com `fallback=true` — qualquer cidade/CPF cai nela durante teste.

## Estrutura

```
src/                  # Helpers JS testáveis (colados em Code nodes do n8n)
  soap/               # WS-Security, envelope, builders XML, parser, error-map
  confirmation/       # Detector sim/não pré-LLM
  llm/                # System prompt
  meta/               # Verify HMAC signature webhook
tests/                # Vitest, espelha src/. 64/64 passando
supabase/migrations/  # 11 migrations aplicadas no projeto czqellcrtzhjvdirpgxe
evals/transcripts/    # 5 conversas para eval LLM
n8n/workflows/        # README.md com guia manual de build (n8n schema proprietário)
docs/                 # specs, plans, contrato-integracao-outbound (deferred)
.claude/skills/       # soc-integration.md — contexto SOC Exporta Dados + SOAP
start-n8n.ps1         # Inicia n8n local + ngrok + carrega .env
```

## n8n: 5 workflows consolidados

| ID | Nome | Função |
|---|---|---|
| `o80iAlxgMjWBfher` | `[PROD-AGENDAMENTO] WF1 - Recebe Mensagem` | Webhook Meta POST+GET, dedup, LGPD, switch confirmação |
| `cdQwn4joLcuWlTJQ` | `[PROD-AGENDAMENTO] WF2 - Agente Conversacional` | LLM loop com recursão (max 5 iterations), chama WF4 |
| `m1sno9XeHbLmxo1c` | `[PROD-AGENDAMENTO] WF3 - SOC SOAP Call` | Sub-workflow SOAP: WS-Security + envelope + HTTP + parse |
| `00kC3KB8q19KgCLp` | `[PROD-AGENDAMENTO] WF4 - Tool Dispatcher` | Switch sobre `tool_name` → 8 branches (todas tools inline) |
| `HYNIIPAfFALivFtL` | `[PROD-AGENDAMENTO] WF5 - Cron Jobs` | monitor_alertas (10min) + retencao_lgpd (3h diário) |

**Webhook Meta URL atual:** `https://wrecker-wisplike-detergent.ngrok-free.dev/webhook/wa-bot-c8a3f0d1-b9e4-4f12-8a7d-3e5c1b2f6a90` (ngrok grátis muda a cada restart — re-registrar no Meta Console quando trocar).

## Comandos

| Ação | Comando |
|---|---|
| Iniciar n8n local + ngrok | `.\start-n8n.ps1` (PowerShell, na raiz) |
| Rodar tests Vitest | `npm test` |
| Watch tests | `npm run test:watch` |
| Rodar eval LLM | `npm run eval` |

## Supabase

- Project ref: `czqellcrtzhjvdirpgxe` (sa-east-1)
- URL: `https://czqellcrtzhjvdirpgxe.supabase.co`
- 12 migrations aplicadas (incluindo `notificacoes_outbound` deferred + `agenda_routing` cidade/cnpj/fallback)
- Tabelas: `conversas`, `mensagens`, `mensagens_recebidas`, `empresas_cache`, `funcionarios_cache`, `agendas_config` (cidade/cnpj_empresa/fallback), `slots_config`, `agendamentos`, `notificacoes_pendentes`, `notificacoes_outbound`
- Seed teste aplicado: empresa `EMPRESA TESTE ALFA` (CNPJ `05435277000160`, codigo `291130`) + agenda `teste carlos` #1463919 (PERIODICO + DEMISSIONAL, `fallback=true`) + 528 slots (5min, seg/ter/qui/sex 7:30-11:00; qua 7:30-11:00 + 13:30-17:30)
- Views: `v_conversas_diarias`, `v_erros_recentes`, `v_notificacoes_abertas`
- Function: `anonimizar_conversas_antigas()` (RPC, chamada pelo WF5 cron)
- Trigger: `trg_retomar_conversa` (não usado — fluxo de cadastro foi removido pelo amendment)

## Credenciais n8n

| ID | Nome | Usado por |
|---|---|---|
| `bFthIb8jUB1PoCan` | Supabase bot-agendamentos | WF1, WF2, WF4, WF5 |
| `VyPnpzWM0Xljer9G` | OpenAI bot-agendamentos | WF2 (via $env, mas credencial existe) |

## Gotchas críticos (validados em produção)

1. **SOC retorna response gzipped:** HTTP node do n8n com `responseFormat: text` falha com "Converting circular structure to JSON". **Solução:** usar `responseFormat: file` + `helpers.getBinaryDataBuffer()` no parser. Atualmente em WF3 nodes "POST to SOC" + "Parse SOAP Response".

2. **`start-n8n.ps1` parser .env DEVE strip comentários inline:** sem isso, `SOC_CODIGO_USUARIO` herda `# código numérico...` no valor → `FailedAuthentication`. Já corrigido (regex `\s+#.*$`).

3. **n8n Code nodes precisam:** `NODE_FUNCTION_ALLOW_BUILTIN=crypto,zlib` + `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser`. Setados em `start-n8n.ps1`. Pacote `fast-xml-parser` instalado globalmente via `npm install -g fast-xml-parser`.

4. **WS-Security exige `<Timestamp>` no header:** sem isso retorna `InvalidSecurity`. Username deve ter prefixo `U` (ex: `U3604573`).

5. **Endpoints SOAP SOC confirmados:** `https://ws1.soc.com.br/WSSoc/AgendamentoWs` e `https://ws1.soc.com.br/WSSoc/FuncionarioModelo2Ws`. NÃO existe `/FuncionarioWs` (404).

6. **`.env` NÃO comitar:** já no `.gitignore`. Contém SOC_WS_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, META_ACCESS_TOKEN (quando preenchido).

7. **Workflows desativados por padrão:** ativar via UI ou MCP `activateWorkflow` antes de smoke test. **Estado atual:** todos os 5 (WF1-WF5) já ativos.

8. **Code node httpRequest:** usar `$helpers.httpRequest` (não `this.helpers`). Ex: roteamento em `LS - Select agendas` consulta Supabase REST via `$helpers.httpRequest` com `apikey` + `Authorization` headers.

9. **Roteamento agenda é do dispatcher, não do LLM:** prompt do WF2 instrui LLM a passar `cpf_funcionario` + `cidade` pra `listar_slots`/`agendar_no_soc`. Code node `LS - Select agendas` decide qual agenda usar. LLM **não** escolhe agenda.

## Convenções

- Migrations: `YYYYMMDD_NNNNNN_descricao.sql` em `supabase/migrations/`
- Helpers JS: ESM (`"type": "module"` no package.json), pure functions, sem imports do n8n
- Tests: Vitest, espelha `src/` em `tests/`
- Datas no SOC: `DD/MM/AAAA`. No Postgres: `YYYY-MM-DD`. Sempre normalizar antes de inserir.
- CPF/CNPJ: strip não-dígitos antes de queries Supabase
- Telefone: E.164 sem `+` (ex: `5513999990000`)

## Pendências pra ficar funcional

**Bloqueado (esperando chip WhatsApp Business novo):**
1. Preencher `.env`: `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `WA_ALLOWLIST`
2. Configurar webhook Meta Console com URL ngrok atual
3. Smoke test ponta-a-ponta: mandar WhatsApp de número no allowlist

**Pra produção real (depois do teste):**
4. Seed das 6 agendas reais em `agendas_config` (com `cidade` ou `cnpj_empresa` ou `fallback` conforme tabela acima) + slots cada
5. CNPJ da empresa New Life pra preencher `cnpj_empresa` da agenda New Life
6. Patch AG branch em WF4 (`AG - Build XML`) pra resolver agenda da mesma forma que LS faz — hoje pega só do fallback

**Concluído:**
- ✓ Seed teste: empresa + agenda + 528 slots
- ✓ WF1-WF5 ativos
- ✓ Migration 12 (agenda routing)
- ✓ WF2 prompt: UX híbrido C + escopo oculto + roteamento via tool args
- ✓ WF4 LS branch: roteamento determinístico cnpj_empresa → cidade → fallback

## MCPs disponíveis (escopo project, .mcp.json)

- `n8n-mcp` (local, http://localhost:5678) — cria/edita/valida workflows
- `n8n-mcp-vps` (https://n8n.srv1564091.hstgr.cloud) — VPS de produção (não usado ainda)
- `supabase` (HTTP, mcp.supabase.com/mcp) — apply_migration, execute_sql, list_tables, etc.

## Memória (caveman: ativo)

Sessão usa caveman mode (caveman:caveman skill). Fragmentos OK, drop articles, technical terms exact. Desliga com "stop caveman".
