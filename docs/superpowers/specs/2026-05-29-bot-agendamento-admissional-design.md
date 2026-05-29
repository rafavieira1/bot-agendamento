# Design — Agendamento Admissional (cadastro de funcionário novo no SOC)

**Data:** 2026-05-29
**Status:** Aprovado (brainstorming) — aguardando revisão final do spec antes do plano
**Contexto:** estende o bot de agendamento ([CLAUDE.md](../../../CLAUDE.md)) para suportar exames **ADMISSIONAIS**, onde o funcionário ainda **não existe** no SOC e precisa ser cadastrado antes de agendar.

---

## 1. Problema e escopo

Hoje o bot agenda apenas **PERIODICO** e **DEMISSIONAL**, partindo da premissa de que o funcionário já está cadastrado no SOC (amendment de 2026-05-21). Qualquer outro tipo de exame, funcionário não encontrado ou empresa não cadastrada → transferência silenciosa para humano.

Este design adiciona o tipo **ADMISSIONAL** ao escopo do bot. Para admissional, o funcionário é novo: o bot precisa coletar os dados de cadastro, **validar** que o setor/cargo/unidade informados existem na hierarquia daquela empresa no SOC, **cadastrar** o funcionário no SOC e então agendar o exame.

**Regra de negócio crítica:** o bot só prossegue com o agendamento automatizado se a **tripla** unidade + setor + cargo informada já existir na hierarquia da empresa no SOC. Se não existir → transfere para humano. O bot **nunca cria** setor/cargo/unidade.

A regra de UX permanece: **escopo nunca é exposto ao cliente**. O bot pergunta o tipo de exame de forma aberta; transferências por dados fora de escopo são silenciosas (mensagem padrão "humano em breve").

### Fora de escopo
- Criação automática de setor/cargo/unidade no SOC (decisão: transfere humano).
- Cadastro de empresa nova (continua transferindo humano).
- Demais tipos de exame (MUDANCA_FUNCAO, RETORNO_TRABALHO, etc. continuam transferindo).

---

## 2. Decisões tomadas (brainstorming)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Fonte de validação de hierarquia | **Exporta Dados 191874** "Informações da Hierarquia (Por Empresa)" (HTTP GET) |
| 2 | WS de Hierarquia (incluir/alterar/excluir) | **Descartado** — write-only, sem operação de consulta, não busca por nome |
| 3 | Arquitetura no agente | **Duas tools dedicadas**: `validar_hierarquia` (fail-fast) + `cadastrar_funcionario` (após "sim") |
| 4 | CTPS | No funcionário (`nrCtps`, `serieCtps`, `ufCtps`); `dataEmissaoCtps` **omitido** (opcional no WSDL) |
| 5 | CBO | **Derivado do relatório 191874** (linha do cargo casado); não é pedido ao cliente |
| 6 | Matrícula | `naoPossuiMatricula=true` (cliente não tem matrícula) |
| 7 | Campos estadoCivil/regimeTrabalho/tipoContratacao/situacao | Não-obrigatórios no WSDL; usa `empresas_cache.defaults_funcionario` se houver, senão omite. Não pergunta ao cliente |
| 8 | Coleta no WhatsApp | **Bloco a bloco** (consistente com fluxo atual) |
| 9 | Quando criar no SOC | **Só após o "sim"** da confirmação |
| 10 | Matching de nomes | **Normalizado** (case-insensitive, sem acento, trim) |
| 11 | Falha parcial (cadastro OK + agendamento falha) | Transfere humano com `codigo_funcionario` + erro |
| 12 | Unidade | Validada igual setor/cargo (precisa existir na tripla) |
| 13 | Edge funcionário-já-existe | Probe antes de criar; se existir, pula criação e agenda |

---

## 3. Achados técnicos do SOC (validados)

### 3.1 Exporta Dados 191874 — consulta de hierarquia
- **Código:** `191874` · **Chave (env):** `SOC_EXPORTA_HIERARQUIA_CHAVE`
- **Endpoint:** `GET https://ws1.soc.com.br/WebSoc/exportadados` (Acesso POST = Sim)
- **Parâmetro:** `{"empresa":"<codigo_empresa_soc>","codigo":"191874","chave":"<chave>","tipoSaida":"json"}` (JSON sem espaços)
- **Escopo:** retorna a hierarquia da empresa cujo código é passado em `empresa`. Validado: passar `291130` (EMPRESA TESTE ALFA) retorna a hierarquia dessa empresa. A empresa principal não tem cargos/setores cadastrados.
- **Campos de retorno:** `NOMEUNIDADE`, `NOMESETOR`, `NOMECARGO`, `LOCALSETORCARGO`, `DESCRICAOSETORCARGODETALHADA`, `FUNCAO`, `CBO`, `REQUISITOSFUNCAO`, `DESCRICAODETALHADAPPRAPCMSO`, `USARDESCRICAOREQUISITOSDOCARGO`.
- **Formato dos dados:** lista plana de **triplas válidas** `(NOMEUNIDADE → NOMESETOR → NOMECARGO)`, cada linha com seu `CBO`. O mesmo nome de cargo aparece sob unidades/setores diferentes — por isso a validação é da **tripla combinada**, não dos três campos isolados.
- **Não retorna códigos** de setor/cargo/unidade — só nomes. Por isso o cadastro precisa buscar por NOME (ver 3.3).

### 3.2 WS Hierarquia — avaliado e descartado
Documentação em [docs/WS_Hierarquia.pdf](../../WS_Hierarquia.pdf). Operações: `incluir`, `excluir`, `alterarSituacao`, `incluirLote`, `alterarSituacaoLote`. **Não possui operação de consulta/listagem.** Além disso, seu `tipoBusca` só aceita `CODIGO_SOC`/`CODIGO_RH` (não `NOME`). Logo não serve para consultar hierarquia por nome. Só seria útil se o bot fosse criar hierarquia faltante — o que foi descartado. **Não entra no projeto.**

### 3.3 FuncionarioModelo2Ws — cadastro de funcionário
- **Endpoint:** `https://ws1.soc.com.br/WSSoc/FuncionarioModelo2Ws` (env `SOC_WS_FUNCIONARIO_URL`)
- **Operação única:** `importacaoFuncionario`. Não há consulta pura; o "buscar funcionário" atual usa essa operação como probe (`criarFuncionario=false`).
- **Criar funcionário:** `importacaoFuncionario` com `criarFuncionario=true`, `criarSetor=false`, `criarCargo=false`, `criarUnidade=false`.
- **Busca de hierarquia por NOME confirmada:** `tipoBuscaSetorEnum`, `tipoBuscaCargoEnum`, `tipoBuscaUnidadeEnum` incluem `NOME`. Então passamos setor/cargo/unidade por nome (os nomes canônicos vindos do 191874), sem precisar de código. ✅
- **`tipoBuscaEmpresa`:** `CODIGO_SOC` (passamos `codigo_empresa_soc`).
- **Campos do `funcionarioWsVo`:** todos `minOccurs="0"` no schema (nenhum obrigatório a nível de schema; obrigatoriedade real só se confirma testando criação). Inclui CTPS: `nrCtps`, `serieCtps`, `dataEmissaoCtps`, `ufCtps`, flag `naoPossuiCtps`. Flag `naoPossuiMatricula`. **Não tem CBO** — CBO pertence ao cargo (`funcionarioCargoWsVo.cbo`).
- **Booleans required nos blocos de hierarquia (no WSDL):** `setorWsVo.criarHistoricoDescricao`; `funcionarioCargoWsVo.criarHistoricoDescricao` + `atualizaDescricaoRequisitosCargoPeloCbo`. O builder atual **não os emite** → risco de erro no SOC; o builder será corrigido.

### 3.4 Enums relevantes (FuncionarioModelo2Ws)
- `sexoEnum`: `MASCULINO`, `FEMININO`
- `estadosEnum` (para `ufCtps`): AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO
- `situacaoFuncionario`: ATIVO, AFASTADO, PENDENTE, FERIAS, INATIVO
- `regimeTrabalhoEnum`: NORMAL, TURNO
- `tipoContratacaoEnum`: CLT, COOPERADO, TERCERIZADO, AUTONOMO, TEMPORARIO, PESSOA_JURIDICA, ESTAGIARIO, MENOR_APRENDIZ, ESTATUTARIO, … (CLT default)
- `estadoCivilEnum`: SOLTEIRO, CASADO, SEPARADO, DIVORCIADO, VIUVO, OUTROS, DESQUITADO, UNIAO_ESTAVEL
- `tipoBusca` (setor/cargo/unidade): CODIGO, CODIGO_RH, **NOME**

---

## 4. Fluxo conversacional

O fluxo diverge no passo "tipo de exame". Para PERIODICO/DEMISSIONAL nada muda. Para **ADMISSIONAL**:

```
cidade (atendimento) → CNPJ → buscar_empresa → tipo = ADMISSIONAL
  │
  ├─ [Bloco pessoal]    CPF · nome completo · data nascimento · sexo · CTPS (nº/série/UF) · data admissão
  ├─ [Bloco hierarquia] unidade · setor · cargo            (CBO NÃO é pedido — derivado do 191874)
  │
  ├─ validar_hierarquia(unidade, setor, cargo)
  │     ├─ não casou  → transferir_humano (silencioso) motivo=hierarquia_nao_encontrada
  │     └─ casou      → guarda nomes canônicos + CBO em conversas.dados
  │
  ├─ data preferida → listar_slots (mesma rota cnpj→cidade→fallback) → bot pega 1º slot
  ├─ enviar_confirmacao (resumo: nome, CPF, cargo/setor/unidade, data/hora, ADMISSIONAL)
  │
  └─ cliente "sim" → WF1 detecta → WF2 hint=sim → cadastrar_funcionario
         ├─ probe CPF: já existe? → pula criação, usa codigo_funcionario existente
         ├─ criação falha → transferir_humano motivo=erro_cadastro_soc (+payload dados+erro)
         └─ criação OK (codigo_funcionario) → agendar_no_soc (tipoCompromisso=ADMISSIONAL)
                ├─ agendamento falha → transferir_humano motivo=agendou_sem_cadastro (+codigo_funcionario)
                └─ OK → confirmado ao cliente
```

**Notas de fluxo:**
- Para admissional o bot **não** chama `buscar_funcionario` durante a coleta (funcionário é novo). O probe acontece dentro de `cadastrar_funcionario` (edge já-existe).
- A coleta é bloco a bloco; o LLM aproveita se o cliente mandar várias informações juntas.
- `validar_hierarquia` roda **antes** de pedir data (fail-fast), espelhando o padrão atual do `exame_fora_escopo` que transfere antes de pedir o CPF.
- A cidade de atendimento (roteamento de agenda) é **independente** da unidade do funcionário (entidade da hierarquia). Ambas são coletadas.

---

## 5. Tools novas (contrato I/O)

### 5.1 `validar_hierarquia`
```
in:  { unidade: string, setor: string, cargo: string }
     (usa conversas.codigo_empresa_soc do contexto)
out: { valido: boolean,
       unidade_canonica?: string, setor_canonico?: string,
       cargo_canonico?: string, cbo?: string }
```
- Busca o Exporta Dados 191874 com `empresa = codigo_empresa_soc`.
- Normaliza (lowercase, remove acentos, trim) os campos do cliente e de cada linha; casa a **tripla** `(NOMEUNIDADE, NOMESETOR, NOMECARGO)`.
- Match → devolve os **nomes exatos do SOC** (canônicos) + `CBO` da linha.
- Sem match → `valido=false`. O prompt instrui o LLM a chamar `transferir_humano` motivo=`hierarquia_nao_encontrada`.

### 5.2 `cadastrar_funcionario`
```
in:  { cpf, nome, data_nascimento, sexo, ctps:{nr,serie,uf},
        data_admissao, unidade, setor, cargo, cbo }
     (+ defaults da empresa via empresas_cache.defaults_funcionario)
out: { ok: boolean, codigo_funcionario?: string, erro?: { codigo, mensagem } }
```
- **Probe** primeiro (`criarFuncionario=false`, `chaveProcuraFuncionario=CPF`). Se existir → `ok=true` com `codigo_funcionario` existente (pula criação).
- Senão, `importacaoFuncionario` com `criarFuncionario=true`, `criar{Setor,Cargo,Unidade}=false`, setor/cargo/unidade por NOME (canônicos).
- Sucesso → upsert em `funcionarios_cache`. Falha → `ok=false` com `erro`.

---

## 6. WF4 — Tool Dispatcher (8 → 10 branches)

Duas branches novas no Switch sobre `tool_name`:

| Branch | Operações |
|---|---|
| `validar_hierarquia` (novo) | Code node `require('https')` GET `WebSoc/exportadados` cód 191874 `empresa=codigo_empresa_soc` → normaliza + casa tripla → retorna canônicos + CBO. Acesso POST=Sim → GET direto, sem SOAP. |
| `cadastrar_funcionario` (novo) | Probe via WF3 (`importacaoFuncionario criarFuncionario=false`) → se ausente, build `importacaoFuncionario criarFuncionario=true` → WF3 → parse → upsert `funcionarios_cache`. |

Branches existentes (`buscar_empresa`, `buscar_funcionario`, `listar_slots`, `agendar_no_soc`, `enviar_mensagem`, `enviar_confirmacao`, `transferir_humano`, `notificar_safe`) permanecem. O roteamento de agenda do `listar_slots`/`agendar_no_soc` é reutilizado sem mudança (cidade/cnpj→fallback).

Segue os gotchas de sandbox de Code node (CLAUDE.md #8): `require('https')`, parse manual de URL, sem `$helpers`/`fetch`. Requer `https,http,crypto,zlib` no `NODE_FUNCTION_ALLOW_BUILTIN`.

---

## 7. Builder `src/soap/xml-builders/importacao-funcionario.js` — ajustes

1. **CTPS** no `funcionarioWsVo`: `nrCtps`, `serieCtps`, `ufCtps`. `naoPossuiCtps` quando aplicável. `dataEmissaoCtps` **omitido**.
2. **Matrícula:** emitir `naoPossuiMatricula=true` quando não houver matrícula.
3. **Hierarquia por NOME:** blocos `setorWsVo`/`cargoWsVo`/`unidadeWsVo` com `nome` + `tipoBusca=NOME`, `criar*=false`.
4. **Booleans required** dos blocos de hierarquia (corrigir omissão atual):
   - `setorWsVo.criarHistoricoDescricao` (default false)
   - `cargoWsVo` (tipo `funcionarioCargoWsVo`): `cbo` (do 191874) + `criarHistoricoDescricao` (false) + `atualizaDescricaoRequisitosCargoPeloCbo` (false)
5. **Defaults da empresa:** estadoCivil/regimeTrabalho/tipoContratacao/situacao via `empresas_cache.defaults_funcionario` se presentes; senão omite. Não força o cliente.
6. **Normalização de enums:** `sexo` → `MASCULINO`/`FEMININO`; `ufCtps` → sigla UF válida. (Normalização pode ficar no helper do builder ou no Code node; decidir no plano.)

Os testes Vitest existentes do builder serão estendidos (não quebrados).

---

## 8. WF2 — System prompt

- Reintroduz **ADMISSIONAL** entre os tipos aceitos (hoje restrito a PERIODICO+DEMISSIONAL).
- Adiciona o sub-fluxo de cadastro: blocos de coleta, `validar_hierarquia` (antes da data), `cadastrar_funcionario` (só no hint=sim).
- `cadastrar_funcionario` **só dispara no hint=sim** (mesma guarda do `agendar_no_soc`; o LLM nunca dispara por conta própria).
- Mantém "escopo nunca exposto": transferência por `hierarquia_nao_encontrada` é silenciosa.
- Para admissional, **não** chamar `buscar_funcionario` na coleta.
- Normalização de datas (`DD/MM/AAAA`) e dos enums (sexo) antes de chamar as tools.

O arquivo [src/llm/system-prompt.js](../../../src/llm/system-prompt.js) está desatualizado (pré-amendment, já cita ADMISSIONAL e cadastro). O prompt **vivo** é inline no nó do WF2. A fonte de verdade é o WF2; o arquivo será reconciliado durante a implementação.

---

## 9. Modelo de dados (Supabase)

- **Coleta transitória:** vive em `conversas.dados` (jsonb). **Sem nova tabela.** Shape sugerido em `dados.cadastro`:
  ```json
  { "cpf","nome","data_nascimento","sexo","ctps":{"nr","serie","uf"},
    "data_admissao","unidade","setor","cargo","cbo",
    "hierarquia_validada": true, "codigo_funcionario": null }
  ```
- **Hierarquia:** fetch ao vivo por conversa (relatório pequeno, frescor importa). **Sem cache** inicial. (Cache opcional fica como melhoria futura se latência incomodar.)
- **Pós-cadastro:** upsert em `funcionarios_cache` (`cpf`, `codigo_empresa`, `codigo_funcionario`, `nome`, `cnpj_empresa`, `ativo=true`). Sem mudança de constraint.
- **Sem migrations de schema** previstas: os novos motivos de transferência são campos de `payload` em `notificacoes_pendentes` (cujo `tipo` já aceita `transferencia`); `agendamentos.tipo_compromisso`/`tipo_soc` já são `text` livres.

---

## 10. Tratamento de erro / transferência

Novos motivos (campos de `payload`, sem mudança de schema):

| Motivo | Quando | Mensagem ao cliente |
|---|---|---|
| `hierarquia_nao_encontrada` | tripla unidade/setor/cargo não casa o 191874 | Silenciosa (padrão "humano em breve") |
| `erro_cadastro_soc` | `importacaoFuncionario criarFuncionario=true` falha | Padrão erro + transfere |
| `agendou_sem_cadastro` | cadastro OK mas `agendar_no_soc` falha | Padrão erro + transfere; payload inclui `codigo_funcionario` |

Cada transferência cria notificação **P0** com os dados coletados + erro do SOC (quando houver), seguindo o branch TH existente (Resolve Responsavel → notif → status transferido).

---

## 11. Testes

- **Unit (Vitest):**
  - Builder: CTPS (`nrCtps`/`serieCtps`/`ufCtps`), `naoPossuiMatricula`, hierarquia por NOME, `cbo` no cargo, booleans required, escape.
  - Matcher de hierarquia: normalização (case/acento/trim), match de tripla, no-match, CBO derivado.
- **Integração (`scripts/test-soc.mjs` estendido ou novo script):**
  1. GET 191874 para EMPRESA TESTE ALFA (291130) → confirma tripla.
  2. Valida tripla real (ex.: `Safe T` / `ADMINISTRAÇÃO` / `MOTORISTA`, CBO `7825.10`).
  3. `importacaoFuncionario criarFuncionario=true` com **CPF descartável** + tripla por NOME → captura `codigo_funcionario`.
  4. `agendar_no_soc` com `tipoCompromisso=ADMISSIONAL`.
- **Eval LLM:** + transcript de conversa admissional (coleta completa → validação → confirmação → cadastro).

---

## 12. Variáveis de ambiente novas

```
SOC_EXPORTA_HIERARQUIA_CODIGO=191874
SOC_EXPORTA_HIERARQUIA_CHAVE=<chave do Exporta Dados 191874 — preencher no .env>
```
(A chave do Exporta Dados é read-only e vai **apenas no `.env`** (não commitado), nunca neste doc. Segue o padrão das demais chaves SOC.)

---

## 13. Pré-requisitos fora do código (para teste E2E e produção)

1. **Habilitar ADMISSIONAL na agenda de teste** — `teste carlos #1463919` hoje só aceita PERIODICO+DEMISSIONAL. Adicionar ADMISSIONAL ao compromisso no SOC e refletir em `agendas_config`/`slots_config`.
2. **CPF descartável** para validar a criação real (`criarFuncionario=true`) sem sujar dados de cliente.
3. **Confirmar a obrigatoriedade real** de campos na criação (schema diz tudo opcional; SOC pode exigir alguns em runtime). Validar com o teste de criação acima.
4. **Produção:** confirmar que cada empresa cliente real retorna sua própria hierarquia no 191874 (passar `empresa=<codigo do cliente>`).

---

## 14. Componentes e fronteiras (resumo de isolamento)

| Unidade | Faz | Depende de |
|---|---|---|
| Builder `importacao-funcionario.js` | Monta XML do `importacaoFuncionario` (probe e criação) | `_escape.js`, enums SOC |
| Helper matcher hierarquia (novo, `src/hierarquia/`) | Normaliza e casa tripla; extrai CBO | nada (pure function sobre o JSON do 191874) |
| WF4 `validar_hierarquia` | HTTP GET 191874 + chama matcher | Exporta Dados 191874 |
| WF4 `cadastrar_funcionario` | Probe + criação via WF3; upsert cache | Builder, WF3, Supabase |
| WF2 prompt | Orquestra coleta/validação/cadastro/agenda | tools do WF4 |

O matcher de hierarquia é uma **pure function** testável isolada (recebe o array do 191874 + os 3 nomes, devolve match/CBO), sem dependência de n8n nem rede.
