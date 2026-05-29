import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY obrigatorias');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 5 } },
});

export type Mensagem = {
  id: number;
  conversa_id: string;
  papel: 'user' | 'assistant' | 'tool' | 'system' | 'humano';
  conteudo: string | null;
  tool_name: string | null;
  created_at: string;
};

export type Conversa = {
  id: string;
  telefone: string;
  status: string;
  responsavel_id: string | null;
  ultima_atividade: string | null;
  created_at: string;
};

export type Responsavel = {
  id: string;
  auth_user_id: string;
  nome: string;
  email: string;
  whatsapp: string | null;
  ativo: boolean;
  role?: 'admin' | 'atendente';
};
