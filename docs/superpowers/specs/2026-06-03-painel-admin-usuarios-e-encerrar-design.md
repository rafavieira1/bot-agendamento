# Painel: gestão de usuários (admin) + encerrar atendimento

**Data:** 2026-06-03
**Escopo:** Dois ajustes no painel de atendimento humano (`panel/`).

## Objetivo

1. **Admin cria e gerencia usuários pelo painel** — hoje só via SQL no Supabase. Admin deve criar usuário novo (escolhendo a role), ativar/desativar, mudar role e resetar senha, tudo pela UI.
2. **Encerrar atendimento com UX clara** — substituir o `confirm()` do navegador por um modal estilizado; após confirmar, a tela deve refletir o encerramento de forma evidente e **bloquear o envio** de novas mensagens (com opção de reabrir).

## Contexto atual (levantado)

- Painel: Vite+React+TS+Tailwind, conecta no Supabase com **anon key**. RLS filtra tudo.
- `responsaveis`: `id`, `auth_user_id` (FK `auth.users`, UNIQUE, `ON DELETE CASCADE`), `nome` (NOT NULL), `email` (NOT NULL, UNIQUE), `whatsapp` (nullable), `ativo` (NOT NULL default true), `created_at`, `role` (NOT NULL default `atendente`, CHECK in `admin|atendente`).
- RLS `responsaveis`: **só** `resp_self` SELECT (`auth_user_id = auth.uid()`). Sem INSERT/UPDATE/DELETE. → cliente não escreve; admin só enxerga a si mesmo na listagem (bug latente em `Admin.tsx`, que tenta listar todos).
- RLS `conversas`: `conv_select_by_resp` + `conv_update_by_resp` (responsavel dono pode atualizar). → `encerrarConversa` (update `status='encerrado'`) **persiste**.
- Login (`Login.tsx`): campo "usuário"; sem `@` vira `<usuario>@safework.local` antes do `signInWithPassword`. Emails sintéticos não recebem confirmação.
- Nenhuma Edge Function existe no projeto.
- Gotcha 27 (CLAUDE.md): `encerrado` fecha a sessão; bot fica mudo até a próxima msg do cliente, que reabre como nova sessão. Painel mostra só a sessão atual (`mensagens.created_at >= conversas.atendimento_iniciado_em`).

### Causa real do "encerrar não muda nada"
`ConversaDetail` busca `conversa` num `useEffect` dependente de `[id, mensagens.length]`. O update de status **não** muda `mensagens.length`, e o componente não assina mudanças da própria conversa — então o estado local fica obsoleto (badge "Aberta", input visível) até remontar. O update no banco ocorre; a UI é que não reage.

## Decisões (confirmadas com o usuário)

| Tema | Decisão |
|---|---|
| Pós-encerrar | **Bloqueia envio.** Marca encerrado evidente + botão "Reabrir". |
| Escopo admin | **Criar + gerenciar** (ativar/desativar, mudar role, resetar senha). Sem excluir (YAGNI). |
| Senha do novo usuário | **Admin digita** a senha inicial no formulário. |
| Backend de criação | **Supabase Edge Function** (`service_role` nativo, URL estável em dev e prod, não depende de n8n/ngrok; gestão de usuário é assunto de auth+banco, mantém WF do n8n focados em mensageria). |

## Arquitetura

### Componente 1 — Encerrar atendimento (frontend only)

**Unidades:**
- `ConfirmDialog.tsx` (novo, reutilizável): overlay + card no design system, props `{ open, titulo, mensagem, confirmLabel, cancelLabel, onConfirm, onCancel, danger? }`. Fecha em ESC / clique no overlay / Cancelar. Sem dependência externa.
- `useConversa(id)` (novo hook): busca a conversa e assina `UPDATE` em `conversas` (filter `id=eq.<id>`), devolvendo `{ conversa, refresh }` ao vivo. Substitui o `useEffect` ad-hoc de `ConversaDetail`.
- `ConversaDetail.tsx` (edita): usa `useConversa`; "Encerrar" abre `ConfirmDialog`; ao confirmar chama `encerrarConversa`. Quando `status='encerrado'`: badge "Encerrada" + **banner** no topo das mensagens ("Atendimento encerrado") + input escondido + botão do header vira "Reabrir atendimento".
- `api.ts` (edita): adiciona `reabrirConversa(id)` → update `status='transferido'` (RLS `conv_update_by_resp` permite; **não** altera `atendimento_iniciado_em`, preservando a sessão/histórico visível). `encerrarConversa` permanece.

**Fluxo:** clique Encerrar → modal → confirma → `update status=encerrado` → realtime UPDATE → `useConversa` atualiza → UI mostra estado encerrado + esconde input. Reabrir → `update status=transferido` → input volta.

**Nota de consistência com gotcha 27:** encerrar/reabrir manuais só alternam `status` entre `encerrado`/`transferido`; `atendimento_iniciado_em` é tocado apenas pelo WF1 (reabertura por mensagem do cliente) e pelo WF4 AG (conclusão). Sem conflito.

### Componente 2 — Gestão de usuários (edge function + RLS + UI)

**Edge Function `admin-users`** (`supabase/functions/admin-users/index.ts`, Deno + supabase-js):
- Entrada: `POST` com `{ action, ...payload }`. Header `Authorization: Bearer <jwt>` (anexado automaticamente por `supabase.functions.invoke`).
- Autorização: cria client com o JWT do caller → `auth.getUser()` → consulta `responsaveis` (via client service_role) e exige `role='admin'` e `ativo`. Caso contrário **403**.
- Usa dois clients: um com o JWT do caller (só pra identificar) e um com `SUPABASE_SERVICE_ROLE_KEY` (auto-injetado) pras operações privilegiadas.
- CORS: responde `OPTIONS` (preflight) e devolve headers `Access-Control-Allow-Origin/Headers/Methods`.

Ações:
| action | efeito |
|---|---|
| `create` | `auth.admin.createUser({ email, password, email_confirm:true })` → insere `responsaveis {auth_user_id, nome, email, whatsapp, role, ativo:true}`. Se o insert falhar, `auth.admin.deleteUser(novoId)` (rollback, sem órfão). |
| `set_role` | update `responsaveis.role` (valida `admin|atendente`). |
| `set_ativo` | update `responsaveis.ativo`. |
| `reset_password` | `auth.admin.updateUserById(authUserId, { password })`. |

**Guardas:** `set_ativo(false)` e `set_role('atendente')` recusam (**409**) se o alvo for o **último admin ativo** (`select count(*) from responsaveis where role='admin' and ativo`). Senha mínima 6 chars (limite padrão do Supabase Auth).

**Normalização de e-mail:** payload de `create` recebe `usuario`; backend monta `email = usuario.includes('@') ? usuario : usuario+'@safework.local'` (espelha o Login). `nome`, `role`, `password` obrigatórios; `whatsapp` opcional (E.164 sem `+`).

**Migration `<ts>_admin_rls.sql`:**
```sql
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.responsaveis
    where auth_user_id = uid and role = 'admin' and ativo
  );
$$;

create policy resp_admin_select on public.responsaveis
  for select to authenticated
  using (public.is_admin(auth.uid()));
```
`resp_self` permanece (atendente vê a si mesmo). Nenhuma policy de write pro cliente — writes só pela edge function (service_role bypassa RLS). `is_admin` é `SECURITY DEFINER` pra evitar recursão de RLS (policy em `responsaveis` consultando `responsaveis`).

**UI `Admin.tsx` (edita):**
- Botão "Novo usuário" → abre form em **modal**: `nome`, `usuário`, `senha`, `whatsapp` (opcional), `role` (select). Submit → `supabase.functions.invoke('admin-users', { body: { action:'create', ... } })`.
- Tabela passa a listar **todos** (graças ao `resp_admin_select`) com ações por linha: toggle `ativo`, select de `role`, botão "Resetar senha" (abre mini-form de nova senha) — cada um chama a função. Ações destrutivas (desativar) confirmam via `ConfirmDialog`.
- Refetch da lista após cada operação com sucesso. Erros (403/409/validação) exibidos inline.

**`api.ts` (edita):** wrapper `adminUsers(action, payload)` que chama `supabase.functions.invoke('admin-users', { body })` e normaliza `{ ok, error, data }`.

## Fluxo de dados (criar usuário)

```
Admin (painel) --invoke('admin-users', {action:create,...}, JWT)--> Edge Function
  Edge: getUser(JWT) -> checa role=admin
  Edge: service_role.auth.admin.createUser(email,password,email_confirm)
  Edge: service_role.insert responsaveis(...)
  Edge: (erro no insert) -> deleteUser(rollback)
  Edge -> { ok, responsavel } | { error, status }
Painel: refetch responsaveis (resp_admin_select libera ver todos)
```

## Tratamento de erros

- Edge function devolve `{ error, code }` + HTTP status (400 validação, 401 sem JWT, 403 não-admin, 409 guarda último-admin, 500 inesperado). UI traduz pra PT-BR amigável (espelha `traduzErroAuth` do Login).
- `create` é transacional na prática via rollback manual (delete do auth user se o insert falhar).
- Encerrar/reabrir: se o update falhar (RLS/rede), `ConfirmDialog` permanece e mostra o erro; sem mudança otimista de UI antes do sucesso.

## Segurança

- `service_role` nunca sai do servidor (env auto-injetado na edge function). Painel só usa anon key + JWT do usuário.
- Autorização dupla: `verify_jwt` (Supabase gateia JWT inválido) + checagem explícita `role='admin'` no código.
- Cliente continua sem poder escrever em `responsaveis` (sem policy de write); toda escalada de privilégio passa pela função auditável, com guarda de último-admin.
- Reset de senha não expõe senha antiga; admin define a nova.

## Testes

- Painel sem suite automatizada hoje. Validação manual (`npm run dev`):
  1. Admin cria usuário `atendente` → login com ele funciona → vê só conversas próprias.
  2. Admin muda role / desativa / reseta senha → efeitos conferidos.
  3. Guarda: tentar desativar/rebaixar o último admin → bloqueado (409).
  4. Não-admin chamando a função → 403.
  5. Encerrar: modal aparece → confirma → badge "Encerrada" + banner + input some na hora → "Reabrir" volta o input.
- Guardas da edge function (último-admin, validação) podem ganhar teste unitário isolado se desejado (fora do escopo mínimo).

## Fora de escopo (YAGNI)

- Excluir usuário (só desativar).
- Fluxo de "trocar a própria senha" pelo atendente.
- Realtime na lista do admin (refetch pós-ação basta).
- Auditoria/log de ações de admin.

## Arquivos

**Novos:** `panel/src/components/ConfirmDialog.tsx`, `panel/src/hooks/useConversa.ts`, `supabase/functions/admin-users/index.ts`, `supabase/migrations/<ts>_admin_rls.sql`.
**Editados:** `panel/src/pages/ConversaDetail.tsx`, `panel/src/pages/Admin.tsx`, `panel/src/lib/api.ts`.
