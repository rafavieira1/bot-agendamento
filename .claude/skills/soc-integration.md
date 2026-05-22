---
name: soc-integration
description: Contexto técnico completo para integração com o SOC Software — Exporta Dados (HTTP GET) e WebService SOAP. Invocar ao trabalhar com SOC, Exporta Dados, WebService, SOAP, WS-Security, agendamento SOC, UploadArquivos, SocGed.
---

# SOC — Integração Técnica Completa

> Baseado em testes reais com o ambiente SOC da SAFEWORK (cod: `<SOC_EMPRESA>`)

---

## Comparação das interfaces

| Interface | Protocolo | Direção | Quando usar |
|---|---|---|---|
| Exporta Dados | HTTP GET | Somente leitura | Consultar dados, gerar relatórios |
| WebService SOAP | SOAP + WS-Security | Leitura e **escrita** | Criar/alterar agendamentos, uploads, registrar resultados |

---

## Seção 1: Exporta Dados (HTTP GET)

### Endpoint

```
GET https://ws1.soc.com.br/WebSoc/exportadados
```

Cada Exporta Dados é configurado na **tela 733** do SOC. O campo **"Acesso POST"** deve estar como `Sim`.

### Regras importantes

- Não requer login ou sessão ativa
- Não usa SOAP
- Não precisa de Playwright ou automação de browser
- Cada Exporta Dados tem um **código** e uma **chave única** gerados na tela 733
- O JSON do parâmetro deve ser serializado **sem espaços** (`separators=(',', ':')` no Python)

**Formato do parâmetro:**
```
?parametro={"empresa":"XXX","codigo":"XXX","chave":"XXX","tipoSaida":"json",...filtros}
```

---

### Descoberta crítica — campo "empresa"

> ⚠️ Esta é a armadilha mais comum. Ignorar isso quebra todas as automações.

| Situação | Campo `"empresa"` |
|---|---|
| Buscar dados da própria SAFEWORK | `<SOC_EMPRESA>` |
| Buscar dados de uma empresa cliente | **Código da empresa cliente** (ex: `<CODIGO_EMPRESA_CLIENTE>`) |
| Listar todas as empresas | `<SOC_EMPRESA>` (contexto da empresa principal) |

**Por quê:** O SOC filtra os dados pelo contexto da empresa informada. Usar `<SOC_EMPRESA>` ao buscar dados de um funcionário de uma empresa cliente retorna lista vazia.

```python
# ERRADO — retorna []
parametro = {"empresa": "<SOC_EMPRESA>", "codigo": "191876", ...}

# CORRETO — retorna os dados do funcionário
parametro = {"empresa": "<CODIGO_EMPRESA_CLIENTE>", "codigo": "191876", ...}
```

**Como obter o código da empresa cliente:** usar o Exporta Dados **192392 (Cadastro de Empresas)** e pegar o campo **`CODIGO`** — não `CODIGOCLIENTEINTEGRACAO` (geralmente vazio).

---

### Exporta Dados mapeados

#### 192392 — Cadastro de Empresas

| Campo | Valor |
|---|---|
| Código | `192392` |
| Chave (.env) | `SOC_CHAVE_EMPRESAS` |
| Acesso POST | Sim |

**Parâmetros de entrada:**
- `empresa` — código da empresa principal (`<SOC_EMPRESA>`)

**Campos de retorno:**
- `CODIGO` — código da empresa no SOC **(usar este nas chamadas)**
- `NOMEABREVIADO`, `RAZAOSOCIALINICIAL`, `RAZAOSOCIAL`
- `ENDERECO`, `NUMEROENDERECO`, `COMPLEMENTOENDERECO`, `BAIRRO`, `CIDADE`, `CEP`, `UF`
- `CNPJ`, `INSCRICAOESTADUAL`, `INSCRICAOMUNICIPAL`
- `ATIVO` — `1` = ativa, `0` = inativa
- `CODIGOCLIENTEINTEGRACAO` — geralmente vazio, não usar

```python
parametro = {
    "empresa": "<SOC_EMPRESA>",
    "codigo": "192392",
    "chave": "<SOC_CHAVE_EMPRESAS>",
    "tipoSaida": "json"
}
```

Resultado validado: retorna 3.384 empresas cadastradas.
Uso: sincronização diária com Supabase para manter tabela `empresas_clientes` atualizada.

---

#### 191876 — Exames Sugeridos / Atrasados

| Campo | Valor |
|---|---|
| Código | `191876` |
| Chave (.env) | `SOC_CHAVE_EXAMES_SUGERIDOS` |
| Acesso POST | Sim |

**Parâmetros de entrada:**
- `tipoBusca` — `1` = Sugeridos, `2` = Atrasados
- `codigoFuncionario` — código do funcionário (alfanumérico, com zeros à esquerda)
- `tipoExame` — `1` Admissional, `2` Periódico, `3` Retorno ao Trabalho, `4` Mudança de Função, `5` Demissional, `6` Monitoração Pontual, `10` Consulta, `11` Retorno Consulta, `12` Acidente, `13` Licença Médica, `14` Enfermagem, `20` Terceiros

**Campos de retorno:**
- `CODIGO_EXAME`, `CODIGORH_EXAME`, `NOME_EXAME`

```python
parametro = {
    "empresa": "<CODIGO_EMPRESA_CLIENTE>",  # código da empresa CLIENTE, não da SAFEWORK
    "codigo": "191876",
    "chave": "<SOC_CHAVE_EXAMES_SUGERIDOS>",
    "tipoSaida": "json",
    "tipoBusca": "1",
    "codigoFuncionario": "<CODIGO_FUNCIONARIO>",
    "tipoExame": "1"
}
```

Resultado validado: `[{"CODIGO_EXAME":"12340","CODIGORH_EXAME":"","NOME_EXAME":"CONSULTA OCUPACIONAL"}]`

---

#### 191868 — Exames Vencidos / A Vencer

| Campo | Valor |
|---|---|
| Código | `191868` |
| Chave (.env) | `SOC_CHAVE_EXAMES_VENCIDOS` |
| Acesso POST | Sim |

**Parâmetros de entrada:**
- `empresaCliente` — código da empresa cliente (campo `CODIGO` do Cadastro de Empresas)
- `funcionario` — código do funcionário (obrigatório)
- `diasAVencer` — opcional, filtra por dias até vencer

**Campos de retorno:**
- `codigo_cliente`, `local_trabalho`, `setor`, `descricao_setor`
- `codigo_funcao`, `descricao_funcao`
- `beneficiario`
- `tipo_exame_item`, `procedimento`, `descricao_procedimento`
- `periodicidade`, `unidade_tempo`, `vencimento`

> Ainda não testado com dados reais. Pendente validação com empresa cliente ativa.

---

#### 213895 — Consultar Empresa por Código de Integração

| Campo | Valor |
|---|---|
| Código | `213895` |
| Chave (.env) | `SOC_CHAVE_EMPRESA_INTEGRACAO` |

**Limitação:** Requer um `codigoIntegracao` específico — não lista todas as empresas. Preferir o 192392.

---

#### 191710 — GED / SOCGED
| Campo | Valor |
|---|---|
| Chave (.env) | `SOC_CHAVE_GED` |
| Testado | ⚠️ Não mapeado ainda |

Download de documentos PDF do SOC (GED). Parâmetros e campos de retorno a documentar quando usado.

---

### Script Python base

```python
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

def chamar_soc(codigo_exporta, chave, empresa=None, **filtros):
    url = os.getenv("SOC_URL", "https://ws1.soc.com.br/WebSoc/exportadados")
    if empresa is None:
        empresa = os.getenv("SOC_EMPRESA")

    parametro = {
        "empresa": empresa,
        "codigo": codigo_exporta,
        "chave": chave,
        "tipoSaida": "json",
        **filtros
    }

    response = requests.get(
        url,
        params={"parametro": json.dumps(parametro, separators=(',', ':'))},
        timeout=15
    )

    response.raise_for_status()
    return response.json()


# Exemplo — listar todas as empresas
empresas = chamar_soc(
    codigo_exporta="192392",
    chave=os.getenv("SOC_CHAVE_EMPRESAS")
)
print(f"Total: {len(empresas)} empresas")

# Exemplo — exames sugeridos de um funcionário
exames = chamar_soc(
    codigo_exporta="191876",
    chave=os.getenv("SOC_CHAVE_EXAMES_SUGERIDOS"),
    empresa="<CODIGO_EMPRESA_CLIENTE>",  # código da empresa CLIENTE
    tipoBusca="1",
    codigoFuncionario="<CODIGO_FUNCIONARIO>",
    tipoExame="1"
)
print(exames)
```

---

### Padrão de chamada no n8n

**Nó: HTTP Request**
- Method: GET
- URL: `https://ws1.soc.com.br/WebSoc/exportadados`
- Query Parameter: `parametro` = `{{ JSON.stringify({empresa: $json.codigo, codigo: "191876", chave: $env.SOC_CHAVE_EXAMES_SUGERIDOS, tipoSaida: "json", ...}) }}`

> No n8n, usar `JSON.stringify` sem espaços equivale ao `separators=(',', ':')` do Python.
> Credenciais no n8n devem ser configuradas como variáveis de ambiente — nunca hardcoded nos nós.

---

### Padrão de sincronização com Supabase

Tabela `empresas_clientes` (sync diário — 6h):
```
CODIGO          → codigo (PK)
NOMEABREVIADO   → nome
RAZAOSOCIAL     → razao_social
CNPJ            → cnpj
CIDADE          → cidade
UF              → uf
ATIVO           → ativo
```

**Estratégia:** Upsert pelo campo `codigo` — insere novas empresas, atualiza existentes, nunca deleta.

---

### Checklist para novo Exporta Dados

Ao mapear um novo endpoint, coletar:

- [ ] Código
- [ ] Chave
- [ ] Nome
- [ ] Acesso POST = Sim confirmado
- [ ] Parâmetros de entrada (nome, tipo, valores possíveis)
- [ ] Campos de retorno
- [ ] Teste validado com retorno real

---

## Seção 2: WebService SOAP

### Endpoint base

```
https://ws1.soc.com.br/WSSoc
```

### Autenticação: WS-Security com PasswordDigest

O SOC **não aceita PasswordText**. A senha deve ser hasheada a cada requisição.

```python
# Fórmula: PasswordDigest = Base64(SHA-1(nonce_bytes + created_bytes + password_bytes))
import hashlib, base64, secrets
from datetime import datetime, timezone, timedelta

password        = os.getenv("SOC_WS_PASSWORD")
nonce_bytes     = secrets.token_bytes(16)
nonce_b64       = base64.b64encode(nonce_bytes).decode()
created         = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
expires         = (datetime.now(timezone.utc) + timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
digest_input    = nonce_bytes + created.encode() + password.encode()
password_digest = base64.b64encode(hashlib.sha1(digest_input).digest()).decode()
```

**Header SOAP resultante:**
```xml
<wsse:Security>
  <wsu:Timestamp>
    <wsu:Created>{created}</wsu:Created>
    <wsu:Expires>{expires}</wsu:Expires>  <!-- máximo 2 minutos -->
  </wsu:Timestamp>
  <wsse:UsernameToken>
    <wsse:Username>{SOC_WS_USUARIO}</wsse:Username>  <!-- sempre com "U" na frente -->
    <wsse:Password Type="...#PasswordDigest">{password_digest}</wsse:Password>
    <wsse:Nonce EncodingType="...#Base64Binary">{nonce_b64}</wsse:Nonce>
    <wsu:Created>{created}</wsu:Created>
  </wsse:UsernameToken>
</wsse:Security>
```

---

### Bloco de identificação (obrigatório em toda requisição SOAP)

```xml
<identificacaoWsVo>
  <codigoEmpresaPrincipal>{SOC_EMPRESA}</codigoEmpresaPrincipal>
  <codigoResponsavel>{SOC_WS_CODIGO_RESPONSAVEL}</codigoResponsavel>
  <codigoUsuario>{SOC_WS_CODIGO}</codigoUsuario>
</identificacaoWsVo>
```

---

### WebServices disponíveis

| Serviço | Endpoint | Operações |
|---|---|---|
| Agendamento | `/WSSoc/AgendamentoWs` | incluir, alterar, excluir |
| Upload SOCGED | `/WSSoc/UploadArquivosWs` *(confirmar)* | upload de PDF |
| Download SOCGED | `/WSSoc/SocGedWs` *(confirmar)* | download de PDF |
| Resultado de Exames | `/WSSoc/ResultadoExamesWs` *(confirmar)* | gravar resultado |
| Licença Médica | `/WSSoc/LicencaMedicaWs` *(confirmar)* | registrar afastamento |

> Confirmar endpoints abrindo o WSDL de cada serviço no SOC → tela do usuário WS → clica no serviço.

---

### Variáveis de ambiente necessárias

**Exporta Dados:**
- `SOC_URL` — `https://ws1.soc.com.br/WebSoc/exportadados`
- `SOC_EMPRESA` — código da SAFEWORK no SOC
- `SOC_CHAVE_EMPRESAS` — chave do Exporta Dados 192392
- `SOC_CHAVE_GED` — chave do Exporta Dados 191710
- `SOC_CHAVE_EXAMES_VENCIDOS` — chave do Exporta Dados 191868
- `SOC_CHAVE_EXAMES_SUGERIDOS` — chave do Exporta Dados 191876
- `SOC_CHAVE_EMPRESA_INTEGRACAO` — chave do Exporta Dados 213895

**WebService SOAP:**
- `SOC_WS_USUARIO` — usuário WS (sempre com "U" na frente)
- `SOC_WS_CODIGO` — código do usuário WS
- `SOC_WS_CODIGO_RESPONSAVEL` — código do responsável
- `SOC_WS_PASSWORD` — guardar no Bitwarden
