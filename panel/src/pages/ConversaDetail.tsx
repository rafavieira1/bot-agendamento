import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, type Conversa } from '../lib/supabase';
import { useMensagens } from '../hooks/useConversas';
import { MessageBubble } from '../components/MessageBubble';
import { SendMessageInput } from '../components/SendMessageInput';
import { encerrarConversa } from '../lib/api';

export function ConversaDetail() {
  const { id } = useParams<{ id: string }>();
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const { mensagens, refresh } = useMensagens(id, conversa?.atendimento_iniciado_em ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('conversas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setConversa(data as Conversa | null));
  }, [id, mensagens.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  async function handleEncerrar() {
    if (!id) return;
    if (!confirm('Encerrar este atendimento?')) return;
    const r = await encerrarConversa(id);
    if (!r.ok) alert('Erro: ' + r.error);
  }

  if (!id) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
        Conversa não encontrada.
      </div>
    );
  }

  const statusBadge =
    conversa?.status === 'transferido'
      ? { txt: 'Aberta', cls: 'text-accent-deep bg-accent-soft' }
      : conversa?.status === 'encerrado'
        ? { txt: 'Encerrada', cls: 'text-ink-500 bg-ink-100' }
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
        {conversa?.status === 'transferido' && (
          <button
            onClick={handleEncerrar}
            className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 bg-white border border-ink-200 hover:border-rose-300 hover:bg-rose-soft rounded-card px-3 py-1.5 transition"
          >
            Encerrar atendimento
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-soft px-4 sm:px-6 py-6">
        <div className="w-full max-w-3xl mx-auto space-y-1">
          {mensagens.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {conversa?.status === 'transferido' ? (
        <SendMessageInput conversaId={id} onSent={refresh} />
      ) : (
        <div className="border-t border-ink-100 bg-white/80 backdrop-blur px-4 py-3 text-sm text-ink-400 text-center shrink-0">
          Atendimento encerrado. Para reabrir, contate o admin.
        </div>
      )}
    </div>
  );
}
