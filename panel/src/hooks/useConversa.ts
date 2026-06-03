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
