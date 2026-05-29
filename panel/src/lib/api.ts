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
      headers: { 'Content-Type': 'application/json' },
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
