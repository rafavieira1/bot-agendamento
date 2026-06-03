import { useEffect, useId, type ReactNode } from 'react';

type Props = {
  open: boolean;
  titulo: string;
  mensagem?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  titulo,
  mensagem,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const tituloId = useId();
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-sm bg-white rounded-card shadow-card p-6 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={tituloId} className="text-base font-semibold text-ink-900">{titulo}</h2>
        {mensagem && <div className="text-sm text-ink-500 mt-2 leading-relaxed">{mensagem}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-sm font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-3 py-1.5 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`text-sm font-medium text-white rounded-card px-3 py-1.5 transition disabled:opacity-50 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-ink-900 hover:bg-ink-800'
            }`}
          >
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
