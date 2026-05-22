# Seed de configuração

Antes do bot atender uma empresa, a equipe Safe precisa popular três coisas no Supabase:

## 1. `empresas_cache` (uma linha por empresa cliente)

```sql
insert into empresas_cache (cnpj, codigo_empresa, razao_social, unidades, defaults_funcionario)
values ('CNPJ_SO_DIGITOS', CODIGO_NO_SOC, 'Razão Social', '[]'::jsonb, '{
  "codigo_unidade_padrao": <codigo SOC>,
  "tipo_busca_unidade": "CODIGO",
  "codigo_setor_padrao": <codigo SOC>,
  "tipo_busca_setor": "CODIGO",
  "codigo_cargo_padrao": <codigo SOC>,
  "tipo_busca_cargo": "CODIGO",
  "tipo_contratacao_default": "CLT",
  "regime_trabalho_default": "NORMAL",
  "situacao_default": "ATIVO"
}'::jsonb);
```

## 2. `agendas_config` (uma por combinação empresa/unidade/tipo_exame)

```sql
insert into agendas_config (codigo_empresa_principal, unidade, tipo_compromisso, codigo_usuario_agenda)
values (CODIGO_EMP_PRINC, 'Santos', 'PERIODICO', CODIGO_AGENDA_SOC);
```

## 3. `slots_config` (slots disponíveis por agenda)

```sql
insert into slots_config (agenda_config_id, dia_semana, hora_inicial, duracao_minutos)
values (1, 2, '09:00', 30);  -- segunda 9h
```

`dia_semana`: 1=domingo, 2=segunda, ..., 7=sábado.

## Onde achar os códigos SOC

- `codigo_empresa`: na tela "Configurações de Integração - Empresa/Cliente" no SOC.
- `codigo_usuario_agenda`: tela de cadastro de agenda no SOC.
- `codigo_unidade_padrao`, `codigo_setor_padrao`, `codigo_cargo_padrao`: cadastros respectivos
  no SOC. Use o primeiro/principal de cada para começar.
