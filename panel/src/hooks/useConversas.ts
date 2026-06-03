import { useEffect, useState } from 'react';
import { supabase, type Conversa, type Mensagem } from '../lib/supabase';

export function useConversas() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const { data, error } = await supabase
      .from('conversas')
      .select('*')
      .in('status', ['transferido', 'encerrado'])
      .order('ultima_atividade', { ascending: false, nullsFirst: false });
    if (!error) setConversas((data || []) as Conversa[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel('conversas-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversas' },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return { conversas, loading, refresh };
}

export async function fetchMensagens(conversaId: string, anchor: string | null) {
  let q = supabase.from('mensagens').select('*').eq('conversa_id', conversaId);
  if (anchor) q = q.gte('created_at', anchor);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as Mensagem[];
}

export function useMensagens(conversaId: string | undefined, anchor: string | null = null) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!conversaId) return;
    try {
      setMensagens(await fetchMensagens(conversaId, anchor));
    } catch {
      /* ignora; mantém estado anterior */
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!conversaId) return;
    refresh();
    const ch = supabase
      .channel(`msgs:${conversaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${conversaId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversas', filter: `id=eq.${conversaId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversaId, anchor]);

  return { mensagens, loading, refresh };
}
