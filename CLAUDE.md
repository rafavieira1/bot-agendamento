# bot-agendamentos

Bot WhatsApp para agendamento de exames ocupacionais via SOC SST. Inbound only — recebe mensagem do cliente, agente LLM coleta dados, agenda no SOC via SOAP.

**Stack:** n8n (orquestração, self-hosted local + VPS futuro) + Supabase (Postgres + RLS) + WhatsApp (Meta Cloud API em prod, **Avisa API** não-oficial em dev/teste enquanto chip não chega) + OpenAI (gpt-4.1-mini, tool calling) + Node.js/Vitest (helpers testáveis colados em Code nodes).

**Provider WhatsApp:** flag `WA_PROVIDER=avisa|meta` no `.env` controla onde WF1 entra e pra onde WF4 envia. Lado-a-lado — Meta continua plugado, só inativo até flag virar `meta`.

## Escopo (amendment 2026-05-21 + admissional 2026-05-29)

**Bot agenda:** PERIODICO, DEMISSIONAL e **ADMISSIONAL**.
- PERIODICO/DEMISSIONAL: premissa de que funcionário **já está cadastrado** no SOC (`buscar_funcionario`).
- ADMISSIONAL: funcionário **novo**. Bot coleta os dados, valida que setor/cargo/unidade existem na hierarquia da empresa (`validar_hierarquia`), e **cadastra** no SOC (`cadastrar_funcionario`, upsert) antes de agendar. Se a tripla unidade/setor/cargo não existir → transfere humano.

**Transfere pra humano:** qualquer outro tipo de exame, funcionário não encontrado (periodico/demissional), empresa não cadastrada, hierarquia não encontrada (admissional), erro de cadastro/grave do SOC. Handoff dentro do mesmo número: `conversa.status='transferido'`, bot para de responder, notificação P0 criada.

**REGRA UX — escopo nunca exposto ao cliente:** bot pergunta tipo de exame de forma aberta (não lista "periódico/demissional/admissional"). Se cliente pedir tipo fora do escopo, transferência é **silenciosa** (msg padrão "humano em breve", sem dizer que bot não consegue).

Specs: [bot-agendamento-soc-design](docs/superpowers/specs/2026-05-20-bot-agendamento-soc-design.md) + [admissional-design](docs/superpowers/specs/2026-05-29-bot-agendamento-admissional-design.md). Planos: [soc](docs/superpowers/plans/2026-05-20-bot-agendamento-soc.md) (ler AMENDMENT no topo) + [admissional](docs/superpowers/plans/2026-05-29-bot-agendamento-admissional.md).

## Fluxo de coleta

Bot pede dados em **blocos lógicos** nesta ordem (LLM aproveita se cliente mandar mais de uma info junta):

1. Cidade do atendimento (pergunta aberta)
2. CNPJ da empresa → `buscar_empresa`
3. Tipo de exame (pergunta aberta listando exemplos). Fora de PERIODICO/DEMISSIONAL/ADMISSIONAL → `transferir_humano` motivo=`exame_fora_escopo` **antes** de pedir CPF
4. **PERIODICO/DEMISSIONAL:** CPF do funcionário → `buscar_funcionario`
   **ADMISSIONAL:** NÃO chama `buscar_funcionario`. Coleta 2 blocos:
   - PESSOAL: CPF, nome, data nascimento, sexo, estado civil, CTPS (nr/série/UF), data admissão
   - HIERARQUIA: unidade, setor, cargo (NÃO pede CBO — derivado) → `validar_hierarquia(codigo_empresa, unidade, setor, cargo)`. `valido=false` → `transferir_humano` motivo=`hierarquia_nao_encontrada` (silencioso)
5. Data preferida → `listar_slots`
6. Bot pega **1º slot** do array e chama `enviar_confirmacao` direto (sem menu)
7. Cliente "sim" → WF1 detecta → WF2 hint=sim →
   - PERIODICO/DEMISSIONAL: `agendar_no_soc` direto
   - ADMISSIONAL: `cadastrar_funcionario` (ok=true) → `agendar_no_soc`; ok=false → `transferir_humano` motivo=`erro_cadastro_soc`

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
  soap/               # WS-Security, envelope, builders XML (inc. importacao-funcionario), parser, error-map
  confirmation/       # Detector sim/não pré-LLM
  hierarquia/         # match.js — normaliza + casa tripla unidade/setor/cargo (admissional)
  funcionario/        # normalize.js — sexo/uf/estadoCivil/stripDigits
  llm/                # system-prompt.js (FONTE CANÔNICA do prompt WF2 — não importado, manter em sync)
  meta/               # Verify HMAC signature webhook
  avisa/              # Parser webhook + builders sendMessage da Avisa API
tests/                # Vitest, espelha src/. 142/142 passando (pool=forks — ver vitest.config.ts)
panel/                # Painel Vite+React+TS+Tailwind pra atendimento humano (Netlify)
supabase/migrations/  # migrations aplicadas no projeto czqellcrtzhjvdirpgxe
evals/                # Harness de testes conversacionais do agente (WF2 standalone) — ver evals/README.md
  harness/            # loop do agente, cliente-LLM, tools (reads reais / writes mock), wf1-layer, recorder
  scenarios/          # NN-nome.js — cenários declarativos (persona + fatos + espera)
  run-eval.js         # orquestrador: node evals/run-eval.js [--only a,b] [--repeat N]
  runs/               # transcripts md/json + summary por run (gitignored)
  transcripts/        # 7 conversas-spec antigas (referência do fluxo)
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
| `00kC3KB8q19KgCLp` | `[PROD-AGENDAMENTO] WF4 - Tool Dispatcher` | Switch sobre `tool_name` → 10 branches inline (incl. `validar_hierarquia` / VH + `cadastrar_funcionario` / CF) |
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
| Harness de evals (todos cenários) | `npm run eval` |
| Harness: 1+ cenários, N vezes | `node evals/run-eval.js --only <nome1,nome2> --repeat 5` |

## Testar feature nova do agente (harness de evals)

**Regra:** toda mudança no comportamento do agente (prompt WF2, tools, detector de confirmação, dispatcher) ou capacidade conversacional nova DEVE ser testada pelo harness **antes de commitar**. O harness roda o loop real do WF2 **standalone** (sem WhatsApp/n8n), com o cliente simulado por um 2º LLM, **reads reais** (Supabase + SOC hierarquia) e **writes mockados** (SOC cadastro/agenda + envios capturados). Detalhe completo + modelo de cenário: [evals/README.md](evals/README.md).

**Passo a passo pra testar uma feature nova:**

1. **Espelhar a mudança no `src/` canônico** (n8n NÃO importa `src/` — é cópia colada nos Code nodes):
   - regras/comportamento do agente → [src/llm/system-prompt.js](src/llm/system-prompt.js) (= WF2 "Build OpenAI Request")
   - tool nova/alterada → [src/llm/tools.js](src/llm/tools.js) (= mesmo node)
   - detecção sim/não → [src/confirmation/detect.js](src/confirmation/detect.js) (= WF1 "Detect Confirmation")
   - shape de retorno de tool → adapter em [evals/harness/tools/reads.js](evals/harness/tools/reads.js) ou [writes.js](evals/harness/tools/writes.js) (= branch do WF4)
2. **Criar/editar cenário** `evals/scenarios/NN-nome.js`: `cliente` (persona + objetivo + fatos + comportamento) + `espera` (`tools_chamadas`, `tools_proibidas`, `outcome` ∈ `agendamento_efetuado|transferido|em_andamento`, `handoff_motivo`).
3. **Rodar `node evals/run-eval.js --only <nome> --repeat 5`** — cliente-LLM é não-determinístico, então SEMPRE `--repeat` (≥5) pra separar bug real de flutuação.
4. **Ler transcripts** em `evals/runs/<timestamp>/<cenario>_runN.md` (👤 cliente / 🤖 bot / 🔧 tool); `summary.md` dá pass/outcome/tools por run.
5. **Iterar** prompt/código e repetir 3-4 até o cenário ficar estável (ex: 5/5).
6. **`npm test`** (invariantes unitários espelhados em `tests/`).
7. **Sincronizar a mudança no n8n ao vivo** (Code node correspondente, via MCP) e **confirmar que é a versão ativa** (`activeVersionId === versionId`) — o harness testa `src/`, NÃO o n8n; sem o sync a produção fica desatualizada.
8. **Commit** curto e direto (sem co-author).

**Gaps de fidelidade aceitos** (ver README): writes mockados (não escreve no SOC), roteamento de agenda hardcoded em `teste carlos`, `listar_slots` calcula local, `buscar_funcionario` só cache. Cenários usam o seed teste (EMPRESA TESTE ALFA, CPFs `57782554039`/`33333333333`, hierarquia Safe T/ADMINISTRAÇÃO/MOTORISTA). O harness flutua um pouco (~30-32/33) por não-determinismo do cliente-LLM — medir com `--repeat`, não confiar em run única.

## Supabase

- Project ref: `czqellcrtzhjvdirpgxe` (sa-east-1)
- URL: `https://czqellcrtzhjvdirpgxe.supabase.co`
- 22 migrations aplicadas (incluindo painel responsáveis + constraints + RLS + realtime + role + `atendimento_iniciado_em`)
- Tabelas: `conversas` (+ `responsavel_id` + `atendimento_iniciado_em` + status agora aceita `transferido`/`encerrado`), `mensagens` (+ `tool_call_id`, papel agora aceita `humano`), `mensagens_recebidas`, `empresas_cache`, `funcionarios_cache` (+ `cnpj_empresa`), `agendas_config` (cidade/cnpj_empresa/fallback + `responsavel_id`), `slots_config`, `agendamentos`, `notificacoes_pendentes` (tipo agora aceita `transferencia`), `notificacoes_outbound`, **`responsaveis`** (auth_user_id → nome/email/whatsapp/ativo)
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

18. **Painel atendimento humano** (`panel/`, Vite+React, deploy Netlify): conecta no Supabase com anon key; RLS filtra `conversas`/`mensagens` por `responsavel_id`. Envios humanos vão pra `/webhook/painel-send-<PAINEL_SECRET>` (WF6, ativo) que valida JWT e dispara Avisa/Meta. Mensagens do painel ficam com `papel='humano'`. Botão "Encerrar" muda `conversas.status='encerrado'` (encerra a sessão; bot fica mudo até a próxima msg do cliente, que reabre como novo atendimento — ver gotcha 27). Painel mostra **só o atendimento atual**: `useMensagens` filtra `created_at >= conversas.atendimento_iniciado_em`. Realtime via `supabase.channel` em `mensagens` (publication `supabase_realtime`).

    **Hook `useMensagens`** assina INSERT em `mensagens` E UPDATE em `conversas` (filter por id) — sem o segundo, initial fetch acontecia antes de `responsavel_id` ser setado pelo WF4 TH e RLS bloqueava o histórico.

    **MessageBubble** oculta msgs `papel ∈ {tool,system}` e `assistant` sem `conteudo` (tool_call wrappers vazios).

    **Login UX:** campo "Usuário" aceita string livre; sem `@` o front prefixa `@safework.local` antes de chamar `signInWithPassword`. Útil pra usuários internos (ex: `admin` → `admin@safework.local`).

19. **WF4 TH (transferir_humano):** `TH - Resolve Responsavel` roda mesma cascata cnpj_empresa → cidade → fallback do LS/AG pra escolher agenda e ler `agendas_config.responsavel_id` → `responsaveis`. Notif WhatsApp do responsável **só dispara** se `responsavel.whatsapp` não-nulo. Ordem do branch: Resolve → HTTP Send (msg pro cliente) → Insert mensagem → Insert notif p0 → Notif Responsavel WhatsApp → Set status transferido (+responsavel_id) → Return.

20. **Exporta Dados responde ISO-8859-1 (latin1), NÃO UTF-8.** Hierarquia 191874 (e demais exporta dados via `/WebSoc/exportadados`) volta latin1 → decodificar com `Buffer...toString('latin1')` antes do `JSON.parse`, senão acentos quebram o match de setor/cargo (ex: "ADMINISTRAÇÃO"). Vale no `VH - Validar Hierarquia` e `CF - Build Cadastro` (n8n, via `require('https')`) e nos scripts (`fetch` + `arrayBuffer`). Endpoint hierarquia: `https://ws1.soc.com.br/WebSoc/exportadados?parametro=<json>` com `{empresa, codigo:191874, chave, tipoSaida:'json'}`. Colunas: `NOMEUNIDADE/NOMESETOR/NOMECARGO/CBO`. **Empresa principal (289501) não tem hierarquia** — usar o `codigo_empresa` do cliente.

21. **`importacaoFuncionario` exige no RUNTIME campos que o WSDL marca `minOccurs=0`:** `tipoContratacao` (CLT), `estadoCivil`, `codigoCategoriaESocial` (fixo `101` = empregado CLT geral), `regimeTrabalho` (NORMAL), `situacao` (ATIVO). Sem eles → erro "campo obrigatório" mesmo o WSDL dizendo opcional. `estadoCivil` é coletado do cliente (normalizado por `normalizeEstadoCivil`); os outros são defaults da empresa (`empresas_cache.defaults_funcionario`) com fallback hardcoded. Blocos hierarquia exigem booleans: `setorWsVo.criarHistoricoDescricao`, `cargoWsVo.criarHistoricoDescricao` + `atualizaDescricaoRequisitosCargoPeloCbo` (todos `false`). Cargo leva `cbo` (derivado da hierarquia). Hierarquia por `tipoBusca=NOME`.

22. **Admissional = upsert no SOC.** `CF - Build Cadastro` emite `criarFuncionario=true` **+ `atualizarFuncionario=true`**. CPF novo → cria. CPF existente → SOC atualiza dados (nome, setor/cargo) e retorna `atualizouFuncionario=true` + `codigoFuncionario`. Decisão de produto (2026-05-29): re-admissão/dados frescos sobrescrevem. **Risco:** typo de CPF sobrescreve outro funcionário — aceito. Sem `atualizarFuncionario`, CPF existente vira no-op (`encontrouFuncionario=true, incluiu=false`) e o nome velho permanece (foi o que confundiu no 1º teste E2E). `agendar_no_soc` busca por `tipoBuscaFuncionario=CPF_ATIVO`, então `codigo_funcionario` null no cache não bloqueia.

23. **WF2 Build OpenAI — adjacência tool_call↔tool_result (CRÍTICO).** OpenAI exige que toda msg `assistant` com `tool_calls` seja **imediatamente** seguida pelo(s) `tool` result(s) do mesmo `tool_call_id`. O loop monta `messages` indexando tool results por `tool_call_id` e **emitindo o result logo após** seu assistant tool_call (marca consumido). Sem isso, quando uma tool insere uma msg `assistant` no meio do par (ex: `enviar_confirmacao` → `EC - Insert mensagem` grava o resumo `papel=assistant` ENTRE o tool_call e o tool_result do WF2) → erro 400 `tool_calls must be followed by tool messages`. Antes esse interloper tinha `conteudo=''` e era filtrado (mascarava o bug); ao popular o resumo, expôs.

24. **`enviar_confirmacao` usa `args.resumo`, `enviar_mensagem` usa `args.texto`.** Nodes EC (`EC - HTTP Send` + `EC - Insert mensagem`) leem `.resumo`; EM lê `.texto`. Trocar → mensagem vazia → Avisa rejeita "O campo mensagem é obrigatório".

25. **Vitest 4 + Windows quebra no pool default `threads`** ("Cannot read properties of undefined (reading 'config')" ao rodar múltiplos arquivos). `vitest.config.ts` fixa `pool: 'forks'`. Arquivo único via `npx vitest run <file>` funciona em threads, mas a suite inteira não.

26. **Env do exporta hierarquia:** `SOC_EXPORTA_HIERARQUIA_CODIGO=191874` + `SOC_EXPORTA_HIERARQUIA_CHAVE` no `.env`. n8n só lê novas env vars após **restart** (`start-n8n.ps1`). Se VH/CF retornarem hierarquia vazia, conferir se o n8n foi reiniciado depois de editar o `.env`.

27. **Atendimento por sessão (painel mostra só o atual).** Coluna `conversas.atendimento_iniciado_em timestamptz` marca o início da sessão corrente; painel (`useMensagens`) filtra `mensagens.created_at >= atendimento_iniciado_em` (fallback: null → mostra tudo). **WF1 `Route by session`** (Switch que substituiu o IF `Status transferido?`, logo após `Pick Conversa`): `transferido` → `TR - Insert User Mensagem` (salva msg do cliente `papel=user`, bot **mudo**, sem LLM) → fim; `encerrado`/`concluido` → `Reopen Conversa` (status=`coletando` + `atendimento_iniciado_em=now()`) → `Insert User Mensagem` → fluxo normal (nova sessão, bot responde fresco); demais status → `Insert User Mensagem` direto (output fallback `extra`). **WF4 AG** passou a setar `conversas.status='concluido'` após agendar (caminho sucesso novo `AG - Insert` + idempotente `AG - Cached?` true) — é o gatilho de "sessão fechada"; antes o AG não tocava status. Espelho no harness: `evals/harness/wf1-layer.js` reabre em `encerrado`/`concluido`. Spec/plano: `docs/superpowers/{specs,plans}/2026-06-03-painel-atendimento-por-sessao*`.

    **WF2 `Load mensagens` TAMBÉM escopa por sessão (fix 2026-06-03 — loop de saudação).** O node tem 2º filtro `created_at` `gte` `{{ $('Load conversa').first().json.atendimento_iniciado_em || '1970-01-01T00:00:00Z' }}` além de `conversa_id` (matchType=allFilters). Sem isso, numa conversa **reaberta** (concluido/encerrado → Reopen), o `Load mensagens` (getAll, limit 100, só `conversa_id`) injetava no LLM o histórico de sessões anteriores — inclusive um agendamento já concluído — poluindo o contexto e fazendo o gpt-4.1-mini **re-cumprimentar a cada msg** (cada greeting salvo realimentava o loop); a partir de 100 msgs ainda truncava. Mirror do painel `useMensagens`. **Gap de fidelidade do harness:** `session.mensagens`/`wf1-layer.js` não cortam a janela na reabertura — não reproduz o bug porque cada run é sessão única; futura regressão exige modelar `atendimento_iniciado_em` + cenário "concluir → reabrir → não saudar".

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
- ✓ Seed teste: empresa + agenda + slots (agenda teste carlos cobre PERIODICO + DEMISSIONAL + **ADMISSIONAL**)
- ✓ WF1-WF6 ativos
- ✓ Migration 12 (agenda routing) + 17-21 (painel responsáveis/constraints/RLS/realtime/role)
- ✓ WF2 prompt fluxo atual: cidade → CNPJ → tipo → (CPF/`buscar_funcionario` | admissional: dados+`validar_hierarquia`) → data → auto 1º slot → enviar_confirmacao → "sim" → (`cadastrar_funcionario` se admissional) → agendar_no_soc
- ✓ WF4 LS branch: roteamento determinístico cnpj_empresa → cidade → fallback
- ✓ WF4 AG branch: mesmo roteamento dentro do `AG - Idempotency`
- ✓ WF4 TH branch: resolve responsável + notifica painel + WhatsApp do responsável
- ✓ WF4 VH branch (`validar_hierarquia`) + CF branch (`cadastrar_funcionario`, upsert) — gotchas 20-22
- ✓ WF6 painel-send ativo, validado JWT + ownership
- ✓ Painel `panel/` rodando local (Vite dev server) com login admin/rafael, RLS funcional, realtime ativo
- ✓ Responsável teste seedado: Rafael (auth_user_id b9f54194..., whatsapp 5519997026999) ligado a todas as agendas
- ✓ SOC ponta-a-ponta validado: CPF 70372002048 (Cleber) na EMPRESA TESTE ALFA → agenda teste carlos → 28/05/2026 08:00 PERIODICO → SOC-100 SUCESSO (`scripts/test-soc.mjs`)
- ✓ **ADMISSIONAL E2E validado via WhatsApp:** CPF 57782554039 (Rafael Vieira) → `validar_hierarquia` Safe T/ADMINISTRAÇÃO/MOTORISTA → `cadastrar_funcionario` (upsert, codigo 18) → `agendar_no_soc` 01/06/2026 07:30 → SOC-100 agendamento 134437182 (gotchas 23/24 corrigidos no caminho)
- ✓ Builder `incluir-agendamento` emite todos campos obrigatórios + `codigoCompromisso='1'` default
- ✓ Builder `importacao-funcionario` (CTPS, naoPossuiMatricula, eSocial, hierarquia por NOME)
- ✓ Permissão U3604573 concedida em todas as agendas (teste + 6 reais) — admissional liberado na teste carlos

## MCPs disponíveis (escopo project, .mcp.json)

- `n8n-mcp` (local, http://localhost:5678) — cria/edita/valida workflows
- `n8n-mcp-vps` (https://n8n.srv1564091.hstgr.cloud) — VPS de produção (não usado ainda)
- `supabase` (HTTP, mcp.supabase.com/mcp) — apply_migration, execute_sql, list_tables, etc.

## Memória (caveman: ativo)

Sessão usa caveman mode (caveman:caveman skill). Fragmentos OK, drop articles, technical terms exact. Desliga com "stop caveman".
