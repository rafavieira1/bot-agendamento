# Design — Confirmar setor/cargo do funcionário antes de agendar

**Data:** 2026-06-12
**Escopo:** PERIODICO e DEMISSIONAL (funcionário já cadastrado no SOC). NÃO aplica a ADMISSIONAL.

## Problema

No fluxo periódico/demissional o bot, após `buscar_funcionario`, vai direto pedir a data
do exame. O setor e o cargo cadastrados no SOC nunca são confirmados com o cliente. Se
estiverem desatualizados/errados, o agendamento sai com hierarquia incorreta.

## Requisito

Antes de perguntar data/horário, o bot deve mostrar ao cliente o **setor** e o **cargo** que
o funcionário tem cadastrado no SOC e pedir confirmação:

- Cliente confirma que **ambos** estão corretos → segue para o agendamento (pede data).
- Cliente diz que setor e/ou cargo estão errados → **transfere para o humano responsável
  pela cidade**, avisando que os dados divergem.

## Fonte dos dados (decisão)

`buscar_funcionario` hoje retorna só `{ok, ativo, codigo_funcionario}`. Não há setor/cargo
no retorno nem na `funcionarios_cache`.

**Decisão:** dobrar a busca dentro da própria branch `buscar_funcionario` (WF4 BF) — sem tool
nova, sem round-trip extra do LLM. Após resolver o funcionário, a BF faz um GET no Exporta
Dados de funcionários e devolve `setor`/`cargo` no retorno da tool.

Rejeitado: tool nova `consultar_dados_funcionario` (mais idas-e-voltas do LLM, mais chance de
pular o passo).

### Exporta Dados 192399 — Cadastro de Funcionarios (Por Empresa)

- **Código:** `192399` (não secreto) → `SOC_EXPORTA_FUNCIONARIO_CODIGO`
- **Chave:** → `SOC_EXPORTA_FUNCIONARIO_CHAVE` (segredo, só no `.env`)
- **Endpoint:** `https://ws1.soc.com.br/WebSoc/exportadados?parametro=<json>`
- **Parâmetro:** `{empresa, codigo, chave, tipoSaida:'json', cpf, parametroData:'0', dataInicio:'', dataFim:''}`
  - `empresa` = **código da empresa CLIENTE** (`codigo_empresa` resolvido pelo `buscar_empresa`),
    NÃO a empresa principal — mesma regra do export de hierarquia (gotcha 20 / soc-integration).
  - `cpf` = só dígitos do CPF do funcionário.
- **Resposta é ISO-8859-1 (latin1)** — decodificar com `Buffer...toString('latin1')` antes do
  `JSON.parse` (gotcha 20), senão acentos de NOMESETOR (ex: "ADMINISTRAÇÃO") quebram.
- **Campos usados do retorno:** `NOME`, `NOMESETOR`, `NOMECARGO`. (Disponíveis também:
  `NOMEUNIDADE`, `CBOCARGO`, `CPFFUNCIONARIO`, `SITUACAO`.)

## Fluxo novo (passo 4 → 5 do prompt WF2)

1. `buscar_funcionario` (BF) resolve o funcionário **e** consulta o 192399 por CPF. Retorno
   passa a incluir `nome`, `setor`, `cargo`.
2. Bot **não pede data ainda**. Mensagem:
   *"O funcionário {nome} está cadastrado no setor {setor}, cargo {cargo}. Está tudo certo?"* e espera.
3. Cliente confirma os dois corretos → segue para o passo 5 atual (pede data → `listar_slots` → 1º slot → `enviar_confirmacao`).
4. Cliente diz que setor e/ou cargo estão errados → `transferir_humano` motivo=`dados_funcionario_divergentes`.
   O TH resolve o responsável pela cidade pela cascata existente (cnpj_empresa → cidade → fallback)
   e manda **texto específico de divergência** (ver abaixo).

## Casos de borda

- **Export não retorna linha pro CPF** (cadastro incompleto/sem funcionário na empresa cliente):
  o bot não inventa. `transferir_humano` motivo=`dados_funcionario_divergentes` (mesma rota da divergência).
- **Export retorna setor/cargo vazios** (campos em branco): trata como divergência → transfere.
- **Erro/timeout do GET ao SOC:** `transferir_humano` motivo=`erro_soc` (bucket infra, já existente).
- **Múltiplas linhas pro mesmo CPF** (raro): preferir a linha com `SITUACAO` ativa; senão a primeira.
- **Vários funcionários na mesma sessão:** confirmar setor/cargo de **cada um** logo após seu
  `buscar_funcionario`, antes da atribuição consolidada de slots. Divergência em qualquer um →
  transfere a sessão inteira (motivo=`dados_funcionario_divergentes`).

## Mensagem de transferência por divergência (decisão: handoff com texto por motivo)

Novo motivo `dados_funcionario_divergentes`. O node TH do WF4 passa a escolher o texto de
handoff pelo motivo: para esse motivo, texto explícito de divergência, ex.:

> "Vou te passar para a equipe ajustar o cadastro desse funcionário. Em instantes alguém do time continua daqui."

Demais motivos mantêm o texto padrão atual (`TEXTO_TRANSFERENCIA`). Resolução de responsável e
notificação P0/WhatsApp inalteradas.

Rejeitado: `enviar_mensagem` antes de `transferir_humano` (cliente receberia duas mensagens
seguidas — divergência + handoff genérico — redundante).

## O que NÃO muda

- **Admissional:** segue como está (cliente informa unidade/setor/cargo + `validar_hierarquia`).
  Não há valor "do SOC" pré-existente a confirmar.
- **Detector sim/não pré-LLM (`detect.js`):** a confirmação de setor/cargo é interpretada
  **dentro** do loop do LLM (texto livre do cliente). `enviar_confirmacao`/`detect.js` continuam
  exclusivos da confirmação **final** de agendamento.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| [src/llm/system-prompt.js](../../../src/llm/system-prompt.js) | Novo passo de confirmação setor/cargo (periodico/demissional) + regra dura + motivo `dados_funcionario_divergentes`. Espelhar no node "Build OpenAI Request" do WF2. |
| [src/llm/tools.js](../../../src/llm/tools.js) | Doc do `transferir_humano` lista `dados_funcionario_divergentes`. |
| WF4 BF (n8n, `00kC3KB8q19KgCLp`) | GET Exporta Dados 192399 por CPF (latin1) → `setor`/`cargo`/`nome` no retorno da tool. |
| WF4 TH (n8n) | Texto de handoff específico para `dados_funcionario_divergentes`. |
| [evals/harness/tools/reads.js](../../../evals/harness/tools/reads.js) | `buscar_funcionario` devolve `setor`/`cargo`/`nome` (read real do 192399, ou seed/mock no harness). |
| `.env` + `start-n8n.ps1` | `SOC_EXPORTA_FUNCIONARIO_CODIGO=192399` + `SOC_EXPORTA_FUNCIONARIO_CHAVE`. |
| `evals/scenarios/` | Novos cenários: confirma-ok → agenda; divergência → transferido(`dados_funcionario_divergentes`). |
| `tests/llm/*` | Invariantes do prompt/tools atualizados. |

## Critérios de aceite

- Periódico/demissional: bot mostra setor+cargo do SOC e espera confirmação antes de pedir data.
- "Está correto" → fluxo segue para agendamento normalmente.
- "Setor/cargo errado" → `transferir_humano` motivo=`dados_funcionario_divergentes`, texto de
  divergência, responsável da cidade notificado.
- Admissional inalterado.
- Cenários eval estáveis em `--repeat 5`; `npm test` verde.
