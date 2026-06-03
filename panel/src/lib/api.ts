// API helpers — chamadas para webhook n8n WF6 (painel-send).
import { supabase } from './supabase';

const WEBHOOK_URL = import.meta.env.VITE_PAINEL_WEBHOOK_URL as string;

export type SendMessageInput = {
  conversa_id: string;
  texto: string;
};

export type SendMessageResult = {
  ok: boolean;
  message_id?: string;
  error?: string;
};

export async function sendMessage({ conversa_id, texto }: SendMessageInput): Promise<SendMessageResult> {
  if (!WEBHOOK_URL) return { ok: false, error: 'VITE_PAINEL_WEBHOOK_URL nao configurada' };
  if (!conversa_id || !texto.trim()) return { ok: false, error: 'conversa_id e texto obrigatorios' };

  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) return { ok: false, error: 'sem sessao' };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ conversa_id, texto, supabase_jwt: jwt }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({}));
    return { ok: true, message_id: body.message_id };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

export async function encerrarConversa(conversa_id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('conversas')
    .update({ status: 'encerrado' })
    .eq('id', conversa_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reabrirConversa(conversa_id: string): Promise<{ ok: boolean; error?: string }> {
  // status='transferido' (NÃO 'coletando'): o WF6 (painel-send) só envia quando
  // conversa.status === 'transferido' (Verify JWT + Authorize rejeita os demais).
  // Reabrir pra qualquer outro status quebraria o envio do humano.
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
