# Painel: gestão de usuários (admin) + encerrar atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin crie e gerencie usuários do painel pela UI, e dar ao "Encerrar atendimento" um modal estilizado + estado encerrado evidente que bloqueia envio (com reabrir).

**Architecture:** Frontend React (`panel/`) conversa com o Supabase via anon key (RLS). Operações privilegiadas de usuário (criar auth user, mudar role/ativo, resetar senha) rodam numa Supabase **Edge Function** `admin-users` (service_role, valida JWT + role=admin). Uma migration adiciona `is_admin()` + policy pro admin enxergar todos os `responsaveis`. Encerrar/Reabrir são updates de `conversas.status` (RLS já permite), com a UI reagindo via realtime.

**Tech Stack:** Vite + React 18 + TypeScript + TailwindCSS; `@supabase/supabase-js` v2; Supabase Edge Functions (Deno); Postgres RLS. Testes pontuais com Vitest (helpers puros).

Spec: [docs/superpowers/specs/2026-06-03-painel-admin-usuarios-e-encerrar-design.md](../specs/2026-06-03-painel-admin-usuarios-e-encerrar-design.md)

---

## File Structure

**Novos:**
- `supabase/migrations/20260603_000002_admin_rls.sql` — `is_admin()` + policy `resp_admin_select`.
- `supabase/functions/admin-users/index.ts` — edge function (CORS, auth, create/set_role/set_ativo/reset_password, guarda último-admin).
- `panel/src/lib/admin.ts` — helpers puros (`usuarioToEmail`, `validateNovoUsuario`, tipos).
- `panel/src/lib/admin.test.ts` — testes Vitest dos helpers.
- `panel/src/components/ConfirmDialog.tsx` — modal de confirmação reutilizável.
- `panel/src/components/NovoUsuarioModal.tsx` — form de criação de usuário.
- `panel/src/hooks/useConversa.ts` — hook que busca + assina uma conversa ao vivo.

**Editados:**
- `panel/src/lib/api.ts` — `reabrirConversa()` + `adminUsers()`.
- `panel/src/pages/ConversaDetail.tsx` — modal de encerrar, reabrir, banner, bloqueio reativo.
- `panel/src/pages/Admin.tsx` — lista todos + ações por linha + botão "Novo usuário" + reset de senha.

---

## Task 1: Migration — `is_admin()` + policy admin vê todos

**Files:**
- Create: `supabase/migrations/20260603_000002_admin_rls.sql`

- [ ] **Step 1: Criar o arquivo de migration**

`supabase/migrations/20260603_000002_admin_rls.sql`:
```sql
-- Admin enxerga todos os responsaveis (gestão de usuários pelo painel).
-- is_admin() é SECURITY DEFINER pra evitar recursão de RLS (policy em
-- responsaveis consultando responsaveis).

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.responsaveis
    where auth_user_id = uid and role = 'admin' and ativo
  );
$$;

create policy resp_admin_select on public.responsaveis
  for select to authenticated
  using (public.is_admin(auth.uid()));
```

- [ ] **Step 2: Aplicar a migration via MCP Supabase**

Use a tool `mcp__supabase__apply_migration` com:
- `project_id`: `czqellcrtzhjvdirpgxe`
- `name`: `20260603_000002_admin_rls`
- `query`: (o conteúdo SQL acima)

- [ ] **Step 3: Verificar que admin enxerga todos via policy**

Use `mcp__supabase__execute_sql` (project `czqellcrtzhjvdirpgxe`):
```sql
select policyname, cmd from pg_policies
where tablename = 'responsaveis' order by policyname;
```
Expected: lista contém `resp_self` (SELECT) **e** `resp_admin_select` (SELECT).

E confirmar a função:
```sql
select public.is_admin('b9f54194-0000-0000-0000-000000000000') is not null as ok;
```
Expected: `ok = true` (retorna boolean sem erro). Não precisa ser o uuid real — só checa que a função existe e roda.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603_000002_admin_rls.sql
git commit -m "feat(db): is_admin() + policy admin le todos responsaveis"
```

---

## Task 2: Edge Function `admin-users`

**Files:**
- Create: `supabase/functions/admin-users/index.ts`

- [ ] **Step 1: Escrever a edge function**

`supabase/functions/admin-users/index.ts`:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'sem_jwt' }, 401);

  // Client como o caller, só pra identificar o usuário do JWT.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'jwt_invalido' }, 401);

  // Client privilegiado pras operações.
  const admin = createClient(url, serviceKey);

  // Caller precisa ser admin ativo.
  const { data: callerResp } = await admin
    .from('responsaveis')
    .select('id, role, ativo')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!callerResp || callerResp.role !== 'admin' || !callerResp.ativo) {
    return json({ error: 'nao_autorizado' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'body_invalido' }, 400);
  }
  const action = payload.action;

  // true se desativar/rebaixar esse responsavel deixaria zero admins ativos.
  async function isLastAdmin(targetRespId: string): Promise<boolean> {
    const { data } = await admin
      .from('responsaveis')
      .select('id')
      .eq('role', 'admin')
      .eq('ativo', true);
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    return ids.length <= 1 && ids.includes(targetRespId);
  }

  try {
    if (action === 'create') {
      const nome = payload.nome as string;
      const email = payload.email as string;
      const password = payload.password as string;
      const whatsapp = (payload.whatsapp as string | null) ?? null;
      const role = payload.role as string;
      if (!nome || !email || !password) return json({ error: 'campos_obrigatorios' }, 400);
      if (String(password).length < 6) return json({ error: 'senha_curta' }, 400);
      if (role !== 'admin' && role !== 'atendente') return json({ error: 'role_invalida' }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (cErr || !created.user) return json({ error: cErr?.message ?? 'erro_criar_auth' }, 400);

      const { data: resp, error: iErr } = await admin
        .from('responsaveis')
        .insert({ auth_user_id: created.user.id, nome, email, whatsapp, role, ativo: true })
        .select()
        .single();
      if (iErr) {
        await admin.auth.admin.deleteUser(created.user.id); // rollback do auth user
        return json({ error: iErr.message }, 400);
      }
      return json({ ok: true, responsavel: resp });
    }

    if (action === 'set_ativo') {
      const responsavel_id = payload.responsavel_id as string;
      const ativo = payload.ativo as boolean;
      if (!responsavel_id || typeof ativo !== 'boolean') return json({ error: 'params_invalidos' }, 400);
      if (ativo === false && (await isLastAdmin(responsavel_id))) return json({ error: 'ultimo_admin' }, 409);
      const { error } = await admin.from('responsaveis').update({ ativo }).eq('id', responsavel_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'set_role') {
      const responsavel_id = payload.responsavel_id as string;
      const role = payload.role as string;
      if (!responsavel_id || (role !== 'admin' && role !== 'atendente')) return json({ error: 'params_invalidos' }, 400);
      if (role === 'atendente' && (await isLastAdmin(responsavel_id))) return json({ error: 'ultimo_admin' }, 409);
      const { error } = await admin.from('responsaveis').update({ role }).eq('id', responsavel_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'reset_password') {
      const responsavel_id = payload.responsavel_id as string;
      const password = payload.password as string;
      if (!responsavel_id || !password) return json({ error: 'params_invalidos' }, 400);
      if (String(password).length < 6) return json({ error: 'senha_curta' }, 400);
      const { data: target } = await admin
        .from('responsaveis')
        .select('auth_user_id')
        .eq('id', responsavel_id)
        .maybeSingle();
      if (!target?.auth_user_id) return json({ error: 'usuario_sem_auth' }, 400);
      const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'acao_desconhecida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
```

> Nota: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente no runtime das Edge Functions — não precisa configurar secret. `verify_jwt` fica no default (true): a plataforma já barra JWT inválido antes do código; o código revalida `role=admin`.

- [ ] **Step 2: Deploy via MCP Supabase**

Use `mcp__supabase__deploy_edge_function` com:
- `project_id`: `czqellcrtzhjvdirpgxe`
- `name`: `admin-users`
- `entrypoint_path`: `index.ts`
- `files`: `[{ "name": "index.ts", "content": "<conteúdo do index.ts acima>" }]`

(Se o schema da tool diferir, conferir com `mcp__supabase__tools_documentation` ou a descrição da própria tool; manter `verify_jwt` default.)

- [ ] **Step 3: Verificar deploy**

Use `mcp__supabase__list_edge_functions` (project `czqellcrtzhjvdirpgxe`).
Expected: array contém uma função `admin-users` com status `ACTIVE`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-users/index.ts
git commit -m "feat(edge): admin-users (criar/gerenciar usuarios via service_role)"
```

> Teste funcional (criar usuário, 403, 409) acontece no Task 9 (E2E manual pela UI).

---

## Task 3: Componente `ConfirmDialog`

**Files:**
- Create: `panel/src/components/ConfirmDialog.tsx`

- [ ] **Step 1: Escrever o componente**

`panel/src/components/ConfirmDialog.tsx`:
```tsx
import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  titulo: string;
  mensagem?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  titulo,
  mensagem,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-sm bg-white rounded-card shadow-card p-6 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink-900">{titulo}</h2>
        {mensagem && <div className="text-sm text-ink-500 mt-2 leading-relaxed">{mensagem}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-sm font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-3 py-1.5 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`text-sm font-medium text-white rounded-card px-3 py-1.5 transition disabled:opacity-50 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-ink-900 hover:bg-ink-800'
            }`}
          >
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Conferir typecheck**

Run: `cd panel && npx tsc -b`
Expected: sem erros (componente novo, não referenciado ainda — apenas compila).

- [ ] **Step 3: Commit**

```bash
git add panel/src/components/ConfirmDialog.tsx
git commit -m "feat(panel): ConfirmDialog reutilizavel"
```

---

## Task 4: Helpers puros + testes (`lib/admin.ts`)

**Files:**
- Create: `panel/src/lib/admin.ts`
- Test: `panel/src/lib/admin.test.ts`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`panel/src/lib/admin.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { usuarioToEmail, validateNovoUsuario, type NovoUsuario } from './admin';

describe('usuarioToEmail', () => {
  it('adiciona @safework.local quando sem @', () => {
    expect(usuarioToEmail('joao')).toBe('joao@safework.local');
  });
  it('mantém email completo', () => {
    expect(usuarioToEmail('joao@x.com')).toBe('joao@x.com');
  });
  it('faz trim', () => {
    expect(usuarioToEmail('  joao ')).toBe('joao@safework.local');
  });
});

describe('validateNovoUsuario', () => {
  const base: NovoUsuario = {
    nome: 'João',
    usuario: 'joao',
    password: '123456',
    whatsapp: '',
    role: 'atendente',
  };
  it('passa com dados válidos', () => {
    expect(validateNovoUsuario(base)).toBeNull();
  });
  it('rejeita senha curta', () => {
    expect(validateNovoUsuario({ ...base, password: '123' })).toMatch(/6 caracteres/);
  });
  it('rejeita nome vazio', () => {
    expect(validateNovoUsuario({ ...base, nome: '  ' })).toMatch(/nome/i);
  });
  it('rejeita usuário vazio', () => {
    expect(validateNovoUsuario({ ...base, usuario: '' })).toMatch(/usu/i);
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd panel && npx vitest run src/lib/admin.test.ts`
Expected: FAIL — `Failed to resolve import "./admin"` (arquivo ainda não existe).

- [ ] **Step 3: Escrever a implementação**

`panel/src/lib/admin.ts`:
```ts
export type Role = 'admin' | 'atendente';

export type NovoUsuario = {
  nome: string;
  usuario: string;
  password: string;
  whatsapp: string;
  role: Role;
};

export function usuarioToEmail(usuario: string): string {
  const u = usuario.trim();
  return u.includes('@') ? u : `${u}@safework.local`;
}

export function validateNovoUsuario(u: NovoUsuario): string | null {
  if (!u.nome.trim()) return 'Informe o nome.';
  if (!u.usuario.trim()) return 'Informe o usuário.';
  if (u.password.length < 6) return 'Senha precisa de ao menos 6 caracteres.';
  if (u.role !== 'admin' && u.role !== 'atendente') return 'Role inválida.';
  return null;
}
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd panel && npx vitest run src/lib/admin.test.ts`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**

```bash
git add panel/src/lib/admin.ts panel/src/lib/admin.test.ts
git commit -m "feat(panel): helpers admin (usuarioToEmail, validateNovoUsuario) + testes"
```

---

## Task 5: `api.ts` — `reabrirConversa` + `adminUsers`

**Files:**
- Modify: `panel/src/lib/api.ts`

- [ ] **Step 1: Adicionar os helpers no fim de `api.ts`**

Acrescentar ao final de `panel/src/lib/api.ts` (após `encerrarConversa`):
```ts
export async function reabrirConversa(conversa_id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('conversas')
    .update({ status: 'transferido' })
    .eq('id', conversa_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type AdminAction =
  | { action: 'create'; nome: string; email: string; password: string; whatsapp: string | null; role: 'admin' | 'atendente' }
  | { action: 'set_ativo'; responsavel_id: string; ativo: boolean }
  | { action: 'set_role'; responsavel_id: string; role: 'admin' | 'atendente' }
  | { action: 'reset_password'; responsavel_id: string; password: string };

export async function adminUsers(body: AdminAction): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // Em erro HTTP (4xx/5xx), supabase-js entrega FunctionsHttpError com a Response em .context.
    let msg = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) msg = parsed.error as string;
    } catch {
      /* mantém msg padrão */
    }
    return { ok: false, error: msg };
  }
  if (data && (data as { ok?: boolean }).ok === false) {
    return { ok: false, error: (data as { error?: string }).error };
  }
  return { ok: true, data };
}
```

- [ ] **Step 2: Conferir typecheck**

Run: `cd panel && npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add panel/src/lib/api.ts
git commit -m "feat(panel): api reabrirConversa + adminUsers (invoke edge function)"
```

---

## Task 6: Hook `useConversa`

**Files:**
- Create: `panel/src/hooks/useConversa.ts`

- [ ] **Step 1: Escrever o hook**

`panel/src/hooks/useConversa.ts`:
```ts
import { useEffect, useState } from 'react';
import { supabase, type Conversa } from '../lib/supabase';

// Busca uma conversa e mantém o estado ao vivo assinando UPDATE em conversas.
// Resolve o bug de "encerrar não muda nada": ConversaDetail antes não reagia
// a mudança de status da própria conversa.
export function useConversa(id: string | undefined) {
  const [conversa, setConversa] = useState<Conversa | null>(null);

  async function refresh() {
    if (!id) return;
    const { data } = await supabase.from('conversas').select('*').eq('id', id).maybeSingle();
    setConversa((data as Conversa | null) ?? null);
  }

  useEffect(() => {
    if (!id) return;
    refresh();
    const ch = supabase
      .channel(`conversa:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversas', filter: `id=eq.${id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { conversa, refresh };
}
```

- [ ] **Step 2: Conferir typecheck**

Run: `cd panel && npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add panel/src/hooks/useConversa.ts
git commit -m "feat(panel): hook useConversa (estado ao vivo via realtime)"
```

---

## Task 7: `ConversaDetail` — modal de encerrar, reabrir, banner, bloqueio reativo

**Files:**
- Modify: `panel/src/pages/ConversaDetail.tsx` (reescrita completa)

- [ ] **Step 1: Reescrever o arquivo**

`panel/src/pages/ConversaDetail.tsx` (conteúdo completo):
```tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMensagens } from '../hooks/useConversas';
import { useConversa } from '../hooks/useConversa';
import { MessageBubble } from '../components/MessageBubble';
import { SendMessageInput } from '../components/SendMessageInput';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { encerrarConversa, reabrirConversa } from '../lib/api';

export function ConversaDetail() {
  const { id } = useParams<{ id: string }>();
  const { conversa, refresh: refreshConversa } = useConversa(id);
  const { mensagens, refresh } = useMensagens(id, conversa?.atendimento_iniciado_em ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  if (!id) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
        Conversa não encontrada.
      </div>
    );
  }

  const encerrada = conversa?.status === 'encerrado';
  const aberta = conversa?.status === 'transferido';

  async function confirmarEncerrar() {
    if (!id) return;
    setActing(true);
    setErro(null);
    const r = await encerrarConversa(id);
    setActing(false);
    setConfirmOpen(false);
    if (!r.ok) setErro('Erro ao encerrar: ' + r.error);
    else refreshConversa();
  }

  async function handleReabrir() {
    if (!id) return;
    setActing(true);
    setErro(null);
    const r = await reabrirConversa(id);
    setActing(false);
    if (!r.ok) setErro('Erro ao reabrir: ' + r.error);
    else refreshConversa();
  }

  const statusBadge = encerrada
    ? { txt: 'Encerrada', cls: 'text-ink-500 bg-ink-100' }
    : aberta
      ? { txt: 'Aberta', cls: 'text-accent-deep bg-accent-soft' }
      : { txt: conversa?.status ?? '—', cls: 'text-ink-500 bg-ink-100' };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="bg-white/80 backdrop-blur border-b border-ink-100 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <Link
            to="/conversas"
            className="text-xs text-ink-400 hover:text-ink-700 inline-flex items-center gap-1"
          >
            ← Voltar
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            <h1 className="text-base sm:text-lg font-semibold text-ink-900 truncate">
              {conversa?.telefone || id}
            </h1>
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold rounded-card px-2 py-0.5 ${statusBadge.cls}`}
            >
              {statusBadge.txt}
            </span>
          </div>
        </div>
        {encerrada ? (
          <button
            onClick={handleReabrir}
            disabled={acting}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-deep bg-white border border-ink-200 hover:border-brand hover:bg-brand-soft rounded-card px-3 py-1.5 transition disabled:opacity-50"
          >
            Reabrir atendimento
          </button>
        ) : aberta ? (
          <button
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 bg-white border border-ink-200 hover:border-rose-300 hover:bg-rose-soft rounded-card px-3 py-1.5 transition"
          >
            Encerrar atendimento
          </button>
        ) : null}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-soft px-4 sm:px-6 py-6">
        <div className="w-full max-w-3xl mx-auto space-y-1">
          {encerrada && (
            <div className="text-center text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded-card px-3 py-2 mb-2">
              Atendimento encerrado. Reabra para responder novamente.
            </div>
          )}
          {erro && (
            <div className="text-sm text-rose-700 bg-rose-soft border border-rose-200 rounded-card px-3 py-2 mb-2">
              {erro}
            </div>
          )}
          {mensagens.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {aberta ? (
        <SendMessageInput conversaId={id} onSent={refresh} />
      ) : (
        <div className="border-t border-ink-100 bg-white/80 backdrop-blur px-4 py-3 text-sm text-ink-400 text-center shrink-0">
          {encerrada
            ? 'Atendimento encerrado — envio bloqueado. Use "Reabrir atendimento" para responder.'
            : 'Conversa não está em atendimento humano.'}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        titulo="Encerrar atendimento?"
        mensagem="O atendimento será marcado como encerrado e o envio de mensagens ficará bloqueado até reabrir."
        confirmLabel="Encerrar"
        danger
        loading={acting}
        onConfirm={confirmarEncerrar}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
```

> Mudanças vs. versão antiga: removido o `useState<Conversa>` + `useEffect` de fetch (substituídos por `useConversa`); `confirm()` → `ConfirmDialog`; adicionado botão "Reabrir" + banner + mensagem de bloqueio; `import { supabase }` não é mais usado aqui (removido).

- [ ] **Step 2: Conferir typecheck**

Run: `cd panel && npx tsc -b`
Expected: sem erros (atenção a imports não usados — `supabase`/`Conversa` foram removidos do import).

- [ ] **Step 3: Commit**

```bash
git add panel/src/pages/ConversaDetail.tsx
git commit -m "feat(panel): encerrar com modal + reabrir + estado encerrado reativo"
```

---

## Task 8: Modal de novo usuário + Admin com ações

**Files:**
- Create: `panel/src/components/NovoUsuarioModal.tsx`
- Modify: `panel/src/pages/Admin.tsx` (reescrita completa)

- [ ] **Step 1: Escrever `NovoUsuarioModal`**

`panel/src/components/NovoUsuarioModal.tsx`:
```tsx
import { useState } from 'react';
import { usuarioToEmail, validateNovoUsuario, type NovoUsuario, type Role } from '../lib/admin';
import { adminUsers } from '../lib/api';

function traduzErro(e?: string): string {
  const m = (e ?? '').toLowerCase();
  if (m.includes('already') || m.includes('exists') || m.includes('registered')) return 'Já existe usuário com esse e-mail/usuário.';
  if (m.includes('senha_curta')) return 'Senha precisa de ao menos 6 caracteres.';
  if (m.includes('campos_obrigatorios')) return 'Preencha nome, usuário e senha.';
  if (m.includes('nao_autorizado')) return 'Sem permissão (apenas admin).';
  return e || 'Não foi possível criar o usuário.';
}

const inputCls =
  'w-full px-3 py-2.5 rounded-card border border-ink-200 bg-ink-50 text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 outline-none transition text-sm';

export function NovoUsuarioModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NovoUsuario>({
    nome: '',
    usuario: '',
    password: '',
    whatsapp: '',
    role: 'atendente',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof NovoUsuario>(k: K, v: NovoUsuario[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const v = validateNovoUsuario(form);
    if (v) {
      setErro(v);
      return;
    }
    setSaving(true);
    setErro(null);
    const r = await adminUsers({
      action: 'create',
      nome: form.nome.trim(),
      email: usuarioToEmail(form.usuario),
      password: form.password,
      whatsapp: form.whatsapp.trim() || null,
      role: form.role,
    });
    setSaving(false);
    if (!r.ok) {
      setErro(traduzErro(r.error));
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md bg-white rounded-card shadow-card p-6 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink-900">Novo usuário</h2>
        <p className="text-xs text-ink-400 mt-0.5 mb-4">
          O usuário entra no painel com "usuário" + senha. Sem "@", vira <code>@safework.local</code>.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Nome</span>
            <input className={inputCls} value={form.nome} onChange={(e) => set('nome', e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Usuário</span>
            <input className={inputCls} value={form.usuario} onChange={(e) => set('usuario', e.target.value)} autoCapitalize="none" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Senha</span>
            <input className={inputCls} type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="mín. 6 caracteres" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">WhatsApp (opcional)</span>
            <input className={inputCls} value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="5519999990000" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Papel</span>
            <select className={inputCls} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              <option value="atendente">Atendente</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>

        {erro && (
          <div className="text-sm text-rose-700 bg-rose-soft border border-rose-200 rounded-card px-3 py-2 mt-3">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-3 py-1.5 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="text-sm font-medium text-white bg-ink-900 hover:bg-ink-800 rounded-card px-3 py-1.5 transition disabled:opacity-50"
          >
            {saving ? '…' : 'Criar usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescrever `Admin.tsx`**

`panel/src/pages/Admin.tsx` (conteúdo completo):
```tsx
import { useEffect, useState } from 'react';
import { Users, Calendar, ShieldCheck, Bell, UserPlus, KeyRound, type LucideIcon } from 'lucide-react';
import { supabase, type Responsavel } from '../lib/supabase';
import { adminUsers } from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NovoUsuarioModal } from '../components/NovoUsuarioModal';

type StatCard = { label: string; value: string | number; icon: LucideIcon; hint?: string };

const inputCls =
  'w-full px-3 py-2.5 rounded-card border border-ink-200 bg-ink-50 text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 outline-none transition text-sm';

export function Admin() {
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [conversasAbertas, setConversasAbertas] = useState<number>(0);
  const [notifAbertas, setNotifAbertas] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [confirmDesativar, setConfirmDesativar] = useState<Responsavel | null>(null);
  const [resetAlvo, setResetAlvo] = useState<Responsavel | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  async function loadResponsaveis() {
    const { data } = await supabase.from('responsaveis').select('*').order('nome');
    setResponsaveis((data as Responsavel[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      const [, c, n] = await Promise.all([
        loadResponsaveis(),
        supabase.from('conversas').select('id', { count: 'exact', head: true }).eq('status', 'transferido'),
        supabase.from('notificacoes_pendentes').select('id', { count: 'exact', head: true }).is('lida_em', null),
      ]);
      setConversasAbertas(c.count ?? 0);
      setNotifAbertas(n.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  async function aplicar(action: () => Promise<{ ok: boolean; error?: string }>, id: string) {
    setBusyId(id);
    setErro(null);
    const r = await action();
    setBusyId(null);
    if (!r.ok) {
      setErro(traduzErro(r.error));
      return false;
    }
    await loadResponsaveis();
    return true;
  }

  async function mudarRole(r: Responsavel, role: 'admin' | 'atendente') {
    await aplicar(() => adminUsers({ action: 'set_role', responsavel_id: r.id, role }), r.id);
  }

  async function alternarAtivo(r: Responsavel) {
    if (r.ativo) {
      setConfirmDesativar(r);
      return;
    }
    await aplicar(() => adminUsers({ action: 'set_ativo', responsavel_id: r.id, ativo: true }), r.id);
  }

  async function confirmarDesativar() {
    if (!confirmDesativar) return;
    const ok = await aplicar(
      () => adminUsers({ action: 'set_ativo', responsavel_id: confirmDesativar.id, ativo: false }),
      confirmDesativar.id,
    );
    if (ok) setConfirmDesativar(null);
  }

  async function confirmarReset() {
    if (!resetAlvo) return;
    if (novaSenha.length < 6) {
      setErro('Senha precisa de ao menos 6 caracteres.');
      return;
    }
    const ok = await aplicar(
      () => adminUsers({ action: 'reset_password', responsavel_id: resetAlvo.id, password: novaSenha }),
      resetAlvo.id,
    );
    if (ok) {
      setResetAlvo(null);
      setNovaSenha('');
    }
  }

  const stats: StatCard[] = [
    { label: 'Responsáveis ativos', value: responsaveis.filter((r) => r.ativo).length, icon: Users, hint: `${responsaveis.length} total` },
    { label: 'Conversas em atendimento', value: conversasAbertas, icon: ShieldCheck, hint: 'status = transferido' },
    { label: 'Notificações abertas', value: notifAbertas, icon: Bell, hint: 'pendentes de leitura' },
    { label: 'Agendas configuradas', value: '—', icon: Calendar, hint: 'consultar SOC' },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-soft">
      <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 max-w-[1200px] mx-auto">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-ink-900">Administração</h1>
          <p className="text-sm text-ink-400 mt-0.5">Visão geral de responsáveis, atendimentos e notificações.</p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-card shadow-card border border-ink-100 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-ink-400 uppercase tracking-wider font-semibold">{s.label}</div>
                    <div className="text-2xl font-semibold text-ink-900 mt-2">{loading ? '…' : s.value}</div>
                    {s.hint && <div className="text-xs text-ink-400 mt-1">{s.hint}</div>}
                  </div>
                  <div className="w-9 h-9 rounded-card bg-brand-soft text-brand-deep flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="bg-white rounded-card shadow-card border border-ink-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Responsáveis</h2>
              <p className="text-xs text-ink-400 mt-0.5">Usuários vinculados ao painel de atendimento</p>
            </div>
            <button
              onClick={() => setNovoOpen(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-white bg-ink-900 hover:bg-ink-800 rounded-card px-3 py-1.5 transition"
            >
              <UserPlus className="w-4 h-4" /> Novo usuário
            </button>
          </div>

          {erro && (
            <div className="mx-5 mt-3 text-sm text-rose-700 bg-rose-soft border border-rose-200 rounded-card px-3 py-2">
              {erro}
            </div>
          )}

          {loading ? (
            <div className="p-6 text-sm text-ink-400">Carregando…</div>
          ) : responsaveis.length === 0 ? (
            <div className="p-6 text-sm text-ink-400">Nenhum responsável cadastrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400 bg-ink-50">
                    <th className="px-5 py-2.5 font-semibold">Nome</th>
                    <th className="px-5 py-2.5 font-semibold">Email</th>
                    <th className="px-5 py-2.5 font-semibold">WhatsApp</th>
                    <th className="px-5 py-2.5 font-semibold">Papel</th>
                    <th className="px-5 py-2.5 font-semibold">Status</th>
                    <th className="px-5 py-2.5 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {responsaveis.map((r) => {
                    const busy = busyId === r.id;
                    return (
                      <tr key={r.id} className="border-t border-ink-100">
                        <td className="px-5 py-3 text-ink-900 font-medium">{r.nome}</td>
                        <td className="px-5 py-3 text-ink-700">{r.email}</td>
                        <td className="px-5 py-3 text-ink-500">{r.whatsapp || '—'}</td>
                        <td className="px-5 py-3">
                          <select
                            value={r.role ?? 'atendente'}
                            disabled={busy}
                            onChange={(e) => mudarRole(r, e.target.value as 'admin' | 'atendente')}
                            className="text-xs rounded-card border border-ink-200 bg-white px-2 py-1 outline-none focus:border-accent disabled:opacity-50"
                          >
                            <option value="atendente">atendente</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[10px] uppercase tracking-wider font-semibold rounded-card px-2 py-1 ${
                              r.ativo ? 'text-accent-deep bg-accent-soft' : 'text-ink-500 bg-ink-100'
                            }`}
                          >
                            {r.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setResetAlvo(r)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-xs font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-2 py-1 transition disabled:opacity-50"
                              title="Resetar senha"
                            >
                              <KeyRound className="w-3.5 h-3.5" /> Senha
                            </button>
                            <button
                              onClick={() => alternarAtivo(r)}
                              disabled={busy}
                              className={`text-xs font-medium rounded-card px-2 py-1 border transition disabled:opacity-50 ${
                                r.ativo
                                  ? 'text-rose-700 border-ink-200 bg-white hover:bg-rose-soft hover:border-rose-300'
                                  : 'text-accent-deep border-ink-200 bg-white hover:bg-accent-soft'
                              }`}
                            >
                              {busy ? '…' : r.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {novoOpen && (
        <NovoUsuarioModal onClose={() => setNovoOpen(false)} onCreated={loadResponsaveis} />
      )}

      <ConfirmDialog
        open={!!confirmDesativar}
        titulo="Desativar usuário?"
        mensagem={`${confirmDesativar?.nome ?? ''} não conseguirá mais entrar no painel até ser reativado.`}
        confirmLabel="Desativar"
        danger
        loading={busyId === confirmDesativar?.id}
        onConfirm={confirmarDesativar}
        onCancel={() => setConfirmDesativar(null)}
      />

      {resetAlvo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-900/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => busyId !== resetAlvo.id && (setResetAlvo(null), setNovaSenha(''))}
        >
          <div className="w-full max-w-sm bg-white rounded-card shadow-card p-6 fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink-900">Resetar senha</h2>
            <p className="text-sm text-ink-500 mt-1 mb-4">Nova senha para {resetAlvo.nome}.</p>
            <input
              className={inputCls}
              type="text"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="mín. 6 caracteres"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setResetAlvo(null);
                  setNovaSenha('');
                }}
                disabled={busyId === resetAlvo.id}
                className="text-sm font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-3 py-1.5 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarReset}
                disabled={busyId === resetAlvo.id}
                className="text-sm font-medium text-white bg-ink-900 hover:bg-ink-800 rounded-card px-3 py-1.5 transition disabled:opacity-50"
              >
                {busyId === resetAlvo.id ? '…' : 'Salvar senha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function traduzErro(e?: string): string {
  const m = (e ?? '').toLowerCase();
  if (m.includes('ultimo_admin')) return 'Não dá para desativar/rebaixar o último admin ativo.';
  if (m.includes('nao_autorizado')) return 'Sem permissão (apenas admin).';
  if (m.includes('senha_curta')) return 'Senha precisa de ao menos 6 caracteres.';
  return e || 'Operação falhou.';
}
```

- [ ] **Step 3: Conferir typecheck + build**

Run: `cd panel && npx tsc -b`
Expected: sem erros. (Conferir que `UserPlus` e `KeyRound` existem em `lucide-react@1.17` — se algum não existir, trocar por ícone equivalente, ex.: `Plus` / `Key`.)

- [ ] **Step 4: Commit**

```bash
git add panel/src/components/NovoUsuarioModal.tsx panel/src/pages/Admin.tsx
git commit -m "feat(panel): admin cria/gerencia usuarios (criar, role, ativo, reset senha)"
```

---

## Task 9: Verificação E2E manual + build final

**Files:** nenhum (verificação).

- [ ] **Step 1: Garantir env do painel**

Conferir que `panel/.env` (ou `.env.local`) tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` apontando pro projeto `czqellcrtzhjvdirpgxe`. `adminUsers` usa `supabase.functions.invoke` — não precisa de URL extra (a edge function é resolvida pelo client).

- [ ] **Step 2: Subir o painel**

Run: `cd panel && npm run dev`
Abrir a URL local (ex.: `http://localhost:5173`), logar como `admin` / senha do Rafael.

- [ ] **Step 3: Criar usuário e logar com ele**

1. Admin → "Novo usuário" → nome `Teste Atendente`, usuário `teste`, senha `teste123`, role `atendente` → Criar.
   Expected: aparece na tabela; sem erro.
2. Conferir no banco (`mcp__supabase__execute_sql`): `select nome, email, role, ativo from responsaveis where email='teste@safework.local';` → 1 linha, `role=atendente`, `ativo=true`.
3. Logout, logar como `teste` / `teste123`.
   Expected: entra; menu "Admin" **não** aparece (não-admin); vê só conversas próprias.

- [ ] **Step 4: Gerenciar usuário (role / ativo / senha) + guarda**

Logado como admin:
1. Mudar role do `teste` pra `admin` e voltar pra `atendente` — Expected: select reflete, sem erro.
2. "Senha" no `teste` → nova senha `nova123` → Salvar → logout/login com `nova123` funciona.
3. Desativar `teste` → modal de confirmação → Desativar. Expected: status "Inativo"; login com `teste` passa a falhar.
4. **Guarda último-admin:** tentar desativar o admin Rafael (sendo ele o único admin ativo) → Expected: erro "Não dá para desativar/rebaixar o último admin ativo." (409). Tentar mudar a role dele pra atendente → mesmo erro.

- [ ] **Step 5: Encerrar / reabrir atendimento**

Abrir uma conversa com `status='transferido'` (se não houver, criar via SQL: `update conversas set status='transferido', responsavel_id=(select id from responsaveis where role='admin' limit 1) where id='<algum id>';`).
1. Clicar "Encerrar atendimento" → Expected: aparece o **modal estilizado** (não o `confirm()` do navegador).
2. Confirmar → Expected, **na hora** (sem reload): badge vira "Encerrada", aparece o banner "Atendimento encerrado…", o campo de envio some e mostra "envio bloqueado", botão vira "Reabrir atendimento".
3. Clicar "Reabrir atendimento" → Expected: badge "Aberta", campo de envio volta.

- [ ] **Step 6: Limpeza do usuário de teste (opcional)**

Se quiser remover o `teste`: `mcp__supabase__execute_sql` → `delete from responsaveis where email='teste@safework.local';` e remover o auth user pelo dashboard (ou deixar desativado).

- [ ] **Step 7: Rodar testes unitários + build de produção**

Run: `cd panel && npm test`
Expected: PASS (inclui `admin.test.ts`).

Run: `cd panel && npm run build`
Expected: build conclui sem erro de tipo.

- [ ] **Step 8: Commit final (se houver ajuste de verificação)**

Sem mudanças de código novas nesta task. Se algum fix surgiu nos passos acima, commitar com mensagem descritiva.

---

## Notas de deploy (fora do loop de tasks)

- **Painel (Netlify):** o deploy do painel não muda; só rebuild com o novo código (`panel/dist`).
- **Edge function:** já fica ativa no Supabase após o Task 2 (independe de ngrok/n8n). Em produção continua a mesma URL.
- **CORS** está `*` por simplicidade (a função valida JWT+role). Se quiser restringir, trocar `Access-Control-Allow-Origin` pela origin do Netlify depois.
