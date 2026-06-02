// GET no PostgREST do Supabase com service role. Retorna array (ou [] em erro).
export async function sb(env, path) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  try {
    const res = await fetch(url, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
