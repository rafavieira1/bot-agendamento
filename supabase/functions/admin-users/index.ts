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
  // NOTA: check não-atômico (TOCTOU). Aceitável neste painel de baixa concorrência —
  // dois admins se rebaixando ao mesmo tempo poderiam furar a guarda. Não justifica
  // um redesign transacional aqui.
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
      const whatsappRaw = (payload.whatsapp as string | null) ?? null;
      const whatsapp = whatsappRaw ? (String(whatsappRaw).replace(/\D/g, '') || null) : null; // E.164 sem '+'
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
        const { error: delErr } = await admin.auth.admin.deleteUser(created.user.id); // rollback do auth user
        if (delErr) {
          // rollback falhou: sobrou um auth user órfão sem responsaveis. Sinaliza pro operador limpar.
          return json({ error: 'rollback_falhou', detail: iErr.message, auth_user_id: created.user.id }, 500);
        }
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
