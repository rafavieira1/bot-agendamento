# bot-agendamentos

Bot WhatsApp para agendamento de exames ocupacionais via SOC SST. Inbound only — recebe mensagem do cliente, agente LLM coleta dados, agenda no SOC via SOAP.

**Stack:** n8n (orquestração, self-hosted local + VPS futuro) + Supabase (Postgres + RLS) + WhatsApp (Meta Cloud API em prod, **Avisa API** não-oficial em dev/teste enquanto chip não chega) + OpenAI (gpt-4.1-mini, tool calling) + Node.js/Vitest (helpers testáveis colados em Code nodes).

**Provider WhatsApp:** flag `WA_PROVIDER=avisa|meta` no `.env` controla onde WF1 entra e pra onde WF4 envia. Lado-a-lado — Meta continua plugado, só inativo até flag virar `meta`.

## Escopo (após amendment de 2026-05-21)

**Bot agenda apenas:** PERIODICO e DEMISSIONAL — premissa de que funcionário já está cadastrado no SOC.

**Transfere pra humano:** qualquer outro tipo de exame, funcionário não encontrado, empresa não cadastrada, erro grave do SOC. Handoff dentro do mesmo número: `conversa.status='transferido'`, bot para de responder, notificação P0 criada.

**REGRA UX — escopo nunca exposto ao cliente:** bot pergunta tipo de exame de forma aberta (não lista "periódico/demissional"). Se cliente pedir tipo fora do escopo, transferência é **silenciosa** (msg padrão "humano em breve", sem dizer que bot não consegue).

Spec completa: [docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md](docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md). Plano: [docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md](docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md) (ler AMENDMENT no topo).

## Fluxo de coleta

Bot pede dados em **blocos lógicos** nesta ordem (LLM aproveita se cliente mandar mais de uma info junta):

1. Cidade do atendimento (pergunta aberta)
2. CNPJ da empresa → `buscar_empresa`
3. Tipo de exame (pergunta aberta listando exemplos). Fora de PERIODICO/DEMISSIONAL → `transferir_humano` motivo=`exame_fora_escopo` **antes** de pedir CPF
4. CPF do funcionário → `buscar_funcionario`
5. Data preferida → `listar_slots`
6. Bot pega **1º slot** do array e chama `enviar_confirmacao` direto (sem menu)
7. Cliente "sim" → WF1 detecta → WF2 hint=sim → `agendar_no_soc`

**Horário sem menu:** bot nunca lista opções. Cliente recusa sem horário específico → bot pula pro próximo slot do array e re-envia `enviar_confirmacao`. Cliente pede horário exato no array → bot confirma esse. Horário exato fora do array → informa indisponível + oferece próximo. Array esgotado → pede outra data.

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
  avisa/              # Parser webhook + builders sendMessage da Avisa API
tests/                # Vitest, espelha src/. 87/87 passando
panel/                # Painel Vite+React+TS+Tailwind pra atendimento humano (Netlify)
supabase/migrations/  # 20 migrations aplicadas no projeto czqellcrtzhjvdirpgxe
evals/transcripts/    # 5 conversas para eval LLM
n8n/workflows/        # README.md com guia manual de build (n8n schema proprietário)
docs/                 # specs, plans, contrato-integracao-outbound (deferred)
.claude/skills/       # soc-integration.md — contexto SOC Exporta Dados + SOAP
start-n8n.ps1         # Inicia n8n local + ngrok + carrega .env
```

## n8n: 6 workflows consolidados

| ID | Nome | Função |
|---|---|---|
| `o80iAlxgMjWBfher` | `[PROD-AGENDAMENTO] WF1 - Recebe Mensagem` | Webhook Meta+Avisa, dedup, switch confirmação (gate LGPD removido) |
| `cdQwn4joLcuWlTJQ` | `[PROD-AGENDAMENTO] WF2 - Agente Conversacional` | LLM loop com recursão (max 5 iterations), chama WF4 |
| `m1sno9XeHbLmxo1c` | `[PROD-AGENDAMENTO] WF3 - SOC SOAP Call` | Sub-workflow SOAP: WS-Security + envelope + HTTP + parse |
| `00kC3KB8q19KgCLp` | `[PROD-AGENDAMENTO] WF4 - Tool Dispatcher` | Switch sobre `tool_name` → 8 branches (todas tools inline) |
| `HYNIIPAfFALivFtL` | `[PROD-AGENDAMENTO] WF5 - Cron Jobs` | monitor_alertas (10min) + retencao_lgpd (3h diário) |
| `TNlcBTIFd2Al3joA` | `[PROD-AGENDAMENTO] WF6 - Painel Send` | Endpoint POST `/webhook/painel-send-<PAINEL_SECRET>` que humano usa pra responder via painel. Valida JWT Supabase, confere ownership (conversa.responsavel_id == resp.id), manda Avisa/Meta e grava `papel='humano'`. |

**Webhook Meta URL:** `https://<ngrok>.ngrok-free.dev/webhook/wa-bot-c8a3f0d1-b9e4-4f12-8a7d-3e5c1b2f6a90` (Meta Cloud API).
**Webhook Avisa URL:** `https://<ngrok>.ngrok-free.dev/webhook/wa-avisa-a7f3c2e8b4d6915af2c0e7b8d3a4f5c1` (não-oficial, dev/teste). Configurar no painel `https://www.avisaapi.com.br` ou via `POST {AVISA_BASE_URL}/webhook` body `{"webhook":"<URL>"}`.

Ngrok grátis muda a cada restart — re-registrar a URL no provider ativo quando trocar.

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
- 21 migrations aplicadas (incluindo painel responsáveis + constraints + RLS + realtime + role)
- Tabelas: `conversas` (+ `responsavel_id` + status agora aceita `transferido`/`encerrado`), `mensagens` (+ `tool_call_id`, papel agora aceita `humano`), `mensagens_recebidas`, `empresas_cache`, `funcionarios_cache` (+ `cnpj_empresa`), `agendas_config` (cidade/cnpj_empresa/fallback + `responsavel_id`), `slots_config`, `agendamentos`, `notificacoes_pendentes` (tipo agora aceita `transferencia`), `notificacoes_outbound`, **`responsaveis`** (auth_user_id → nome/email/whatsapp/ativo)
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

3. **n8n Code nodes precisam:** `NODE_FUNCTION_ALLOW_BUILTIN=crypto,zlib,https,http` + `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser`. Setados em `start-n8n.ps1`. Pacote `fast-xml-parser` instalado globalmente via `npm install -g fast-xml-parser`. `https` é obrigatório pra LS/AG fazerem HTTP via `require('https')` (n8n sandbox bloqueia `$helpers`, `fetch` e `globalThis`).

4. **WS-Security exige `<Timestamp>` no header:** sem isso retorna `InvalidSecurity`. Username deve ter prefixo `U` (ex: `U3604573`).

5. **Endpoints SOAP SOC confirmados:** `https://ws1.soc.com.br/WSSoc/AgendamentoWs` e `https://ws1.soc.com.br/WSSoc/FuncionarioModelo2Ws`. NÃO existe `/FuncionarioWs` (404).

6. **`.env` NÃO comitar:** já no `.gitignore`. Contém SOC_WS_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, META_ACCESS_TOKEN (quando preenchido).

7. **Workflows desativados por padrão:** ativar via UI ou MCP `activateWorkflow` antes de smoke test. **Estado atual:** todos os 6 (WF1-WF6) já ativos.

8. **Code node sandbox:** BLOQUEIA `$helpers`, `helpers`, `fetch` global, `globalThis` e módulos não-allowlisted. **Bloqueia também `require('url')`** (mesmo `url` sendo built-in Node). Parsear URL manualmente via regex `/^https?:\/\/([^\/]+)(\/.*)?$/`. HTTP via `const https = require('https')` + `https.request()` + Promise wrapper. Ver `LS - Select agendas`, `AG - Idempotency`, `TH - Resolve Responsavel`, `Verify JWT + Authorize` (WF6). **Requer** `https,http,crypto,zlib` em `NODE_FUNCTION_ALLOW_BUILTIN` (start-n8n.ps1).

   Outro pegadinha: dentro de Code node não existe `$httpNode`. Pra ler resposta de HTTP node anterior, usar `$('Nome do HTTP Node').first().json` (ver `EM - Return`, `TH - Return`, `EC - Return` em WF4).

9. **Roteamento agenda é do dispatcher, não do LLM:** prompt do WF2 instrui LLM a passar `cpf_funcionario` + `cidade` pra `listar_slots`/`agendar_no_soc`. Code node `LS - Select agendas` decide qual agenda usar. LLM **não** escolhe agenda.

10. **Permissão SOC por agenda:** o usuário WS (U3604573) precisa ter permissão CONSULTAR+ALTERAR em **cada agenda** que o bot vai usar. Sem isso → SOC-312 "Cadastro de agenda não localizado" + SOC-355 + SOC-315. Em SOC web: cadastro agenda → seção "Acesso Agenda" → adicionar U3604573 em "Selecionados". Status atual: liberado em todas (teste + 6 reais).

11. **Campos obrigatórios `incluirAgendamento`:** o WSDL marca 6 booleanos como required (sem `minOccurs="0"`): `reservarCompromissoParaEmpresa`, `usaOutroCompromisso`, `priorizarAtendimento`, `usaEnviarEmail`, `usaEnviarSocms`, `convocacaoAgendada`. Builder sempre emite com `false` por default. Também `codigoCompromisso='1'` (tipo "Agenda" do SOC) é obrigatório na prática — sem ele → SOC-315.

12. **Avisa API webhook é `application/x-www-form-urlencoded`** (NÃO JSON). Body chega com `token=<...>` + `jsonData=<JSON urlencoded>`. No n8n o webhook node entrega como `$('Webhook (Avisa)').first().json.body` com os dois campos. Parser precisa `JSON.parse(body.jsonData)`.

13. **Avisa auth do webhook = comparar `body.token` com `$env.AVISA_TOKEN`** (sem HMAC). Defesa em profundidade: path do webhook tem secret aleatório (`/wa-avisa-<AVISA_WEBHOOK_SECRET>`).

14. **Avisa shape entrante:** telefone real está em `event.Info.SenderAlt` (formato `5519992279989@s.whatsapp.net`) — `Sender`/`Chat` é LID interno (`@lid`) e NÃO bate com o número. Texto: `event.Message.conversation` (msg simples) ou `event.Message.extendedTextMessage.text` (com formatação). Skip se `IsFromMe`, `IsGroup`, ou `event.type !== 'Message'`.

15. **Avisa API é não-oficial → risco de ban WhatsApp.** Usar SÓ em dev/teste. Em produção real, flag `WA_PROVIDER=meta` quando chip Meta chegar. Rate limit Avisa: 240 req/min.

16. **WF2 force tool_choice listar_slots:** o Build OpenAI Request força `tool_choice={name:'listar_slots'}` somente na PRIMEIRA iteração (`init.iteration === 0`). Sem essa guarda, todas as recursões forçariam de novo e o LLM ficaria em loop infinito chamando a tool sem nunca responder texto.

17. **WF2 mensagens duplicadas:** se o pipeline gravar a msg assistant ANTES do `Has Tool Call?` E também depois (via `Send Final Text` que chama WF4 `enviar_mensagem`), cada resposta texto fica duplicada. Solução validada: mover `Save Assistant Msg` pra dentro do branch tool-call apenas. Texto puro grava só via WF4 EM (`papel=assistant`).

18. **Painel atendimento humano** (`panel/`, Vite+React, deploy Netlify): conecta no Supabase com anon key; RLS filtra `conversas`/`mensagens` por `responsavel_id`. Envios humanos vão pra `/webhook/painel-send-<PAINEL_SECRET>` (WF6, ativo) que valida JWT e dispara Avisa/Meta. Mensagens do painel ficam com `papel='humano'`. Botão "Encerrar" muda `conversas.status='encerrado'`; bot não responde mais. Realtime via `supabase.channel` em `mensagens` (publication `supabase_realtime`).

    **Hook `useMensagens`** assina INSERT em `mensagens` E UPDATE em `conversas` (filter por id) — sem o segundo, initial fetch acontecia antes de `responsavel_id` ser setado pelo WF4 TH e RLS bloqueava o histórico.

    **MessageBubble** oculta msgs `papel ∈ {tool,system}` e `assistant` sem `conteudo` (tool_call wrappers vazios).

    **Login UX:** campo "Usuário" aceita string livre; sem `@` o front prefixa `@safework.local` antes de chamar `signInWithPassword`. Útil pra usuários internos (ex: `admin` → `admin@safework.local`).

19. **WF4 TH (transferir_humano):** `TH - Resolve Responsavel` roda mesma cascata cnpj_empresa → cidade → fallback do LS/AG pra escolher agenda e ler `agendas_config.responsavel_id` → `responsaveis`. Notif WhatsApp do responsável **só dispara** se `responsavel.whatsapp` não-nulo. Ordem do branch: Resolve → HTTP Send (msg pro cliente) → Insert mensagem → Insert notif p0 → Notif Responsavel WhatsApp → Set status transferido (+responsavel_id) → Return.

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
6. Desligar `fallback=true` da agenda teste antes de produção (`update agendas_config set fallback=false where unidade='teste carlos'`)
7. Seed dos responsáveis reais (nome+email+whatsapp) e vincular `agendas_config.responsavel_id` por cidade/agenda
8. Deploy do painel no Netlify (base `panel/`, build `npm run build`, publish `panel/dist`), env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAINEL_WEBHOOK_URL` apontando pra URL final (ngrok local → VPS quando subir)

**Concluído:**
- ✓ Seed teste: empresa + agenda + 528 slots
- ✓ WF1-WF6 ativos
- ✓ Migration 12 (agenda routing) + 17-21 (painel responsáveis/constraints/RLS/realtime/role)
- ✓ WF2 prompt fluxo atual: cidade → CNPJ → tipo → CPF → data → auto 1º slot → enviar_confirmacao → "sim" → agendar_no_soc
- ✓ WF4 LS branch: roteamento determinístico cnpj_empresa → cidade → fallback
- ✓ WF4 AG branch: mesmo roteamento dentro do `AG - Idempotency`
- ✓ WF4 TH branch: resolve responsável + notifica painel + WhatsApp do responsável
- ✓ WF6 painel-send ativo, validado JWT + ownership
- ✓ Painel `panel/` rodando local (Vite dev server) com login admin/rafael, RLS funcional, realtime ativo
- ✓ Responsável teste seedado: Rafael (auth_user_id b9f54194..., whatsapp 5519997026999) ligado a todas as agendas
- ✓ SOC ponta-a-ponta validado: CPF 70372002048 (Cleber) na EMPRESA TESTE ALFA → agenda teste carlos → 28/05/2026 08:00 PERIODICO → SOC-100 SUCESSO (`scripts/test-soc.mjs`)
- ✓ Builder `incluir-agendamento` emite todos campos obrigatórios + `codigoCompromisso='1'` default
- ✓ Permissão U3604573 concedida em todas as agendas (teste + 6 reais)

## MCPs disponíveis (escopo project, .mcp.json)

- `n8n-mcp` (local, http://localhost:5678) — cria/edita/valida workflows
- `n8n-mcp-vps` (https://n8n.srv1564091.hstgr.cloud) — VPS de produção (não usado ainda)
- `supabase` (HTTP, mcp.supabase.com/mcp) — apply_migration, execute_sql, list_tables, etc.

## Memória (caveman: ativo)

Sessão usa caveman mode (caveman:caveman skill). Fragmentos OK, drop articles, technical terms exact. Desliga com "stop caveman".
