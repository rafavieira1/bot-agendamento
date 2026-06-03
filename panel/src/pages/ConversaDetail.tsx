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
