import { useState } from 'react';
import { sendMessage } from '../lib/api';

export function SendMessageInput({
  conversaId,
  onSent,
}: {
  conversaId: string;
  onSent: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSend() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await sendMessage({ conversa_id: conversaId, texto: texto.trim() });
    setEnviando(false);
    if (r.ok) {
      setTexto('');
      onSent();
    } else {
      setErro(r.error || 'Falha ao enviar.');
    }
  }

  return (
    <div className="border-t border-ink-100 bg-white/80 backdrop-blur px-4 sm:px-6 py-3">
      <div className="max-w-3xl mx-auto">
        {erro && (
          <div className="text-sm text-rose-700 bg-rose-soft border border-rose-200 rounded-card px-3 py-2 mb-2">
            {erro}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Digite sua resposta (Enter envia, Shift+Enter quebra linha)"
            rows={2}
            disabled={enviando}
            className="flex-1 px-3 py-2.5 rounded-card border border-ink-200 bg-ink-50 text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 outline-none transition resize-none text-sm"
          />
          <button
            onClick={handleSend}
            disabled={enviando || !texto.trim()}
            className="bg-ink-900 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-card transition"
          >
            {enviando ? '…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
