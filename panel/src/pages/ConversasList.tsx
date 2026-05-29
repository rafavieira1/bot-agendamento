import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConversas } from '../hooks/useConversas';

export function ConversasList() {
  const { responsavel } = useAuth();
  const { conversas, loading } = useConversas();

  const abertas = conversas.filter((c) => c.status === 'transferido');
  const encerradas = conversas.filter((c) => c.status === 'encerrado');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-soft">
      <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 max-w-[1100px] mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900">Conversas</h1>
        <p className="text-sm text-ink-400 mt-0.5">
          Atendimentos em andamento e encerrados.
        </p>
      </header>

      {!loading && !responsavel && (
        <div className="mb-6 text-sm text-rose-700 bg-rose-soft border border-rose-200 rounded-card px-4 py-3">
          Seu usuário não está vinculado a um responsável. Contate o admin.
        </div>
      )}

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-ink-900">Em atendimento</h2>
          <span className="text-xs text-ink-400">{abertas.length} conversa(s)</span>
        </div>
        {loading ? (
          <div className="bg-white rounded-card shadow-card border border-ink-100 p-6 text-sm text-ink-400">
            Carregando…
          </div>
        ) : abertas.length === 0 ? (
          <div className="bg-white rounded-card shadow-card border border-ink-100 p-6 text-sm text-ink-400">
            Nenhuma conversa em aberto.
          </div>
        ) : (
          <ul className="space-y-2">
            {abertas.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/conversas/${c.id}`}
                  className="group flex items-center gap-3 bg-white rounded-card shadow-card border border-ink-100 hover:border-accent px-4 py-3 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-accent-soft text-accent-deep flex items-center justify-center text-xs font-semibold shrink-0">
                    {c.telefone.slice(-2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900 truncate">
                      {c.telefone}
                    </div>
                    <div className="text-xs text-ink-400 truncate">
                      Última atividade:{' '}
                      {c.ultima_atividade
                        ? new Date(c.ultima_atividade).toLocaleString('pt-BR')
                        : '—'}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-accent-deep bg-accent-soft rounded-card px-2 py-1">
                    Aberta
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-ink-900">Encerradas</h2>
          <span className="text-xs text-ink-400">{encerradas.length} conversa(s)</span>
        </div>
        {encerradas.length === 0 ? (
          <div className="bg-white rounded-card shadow-card border border-ink-100 p-6 text-sm text-ink-400">
            —
          </div>
        ) : (
          <ul className="space-y-2">
            {encerradas.slice(0, 20).map((c) => (
              <li key={c.id}>
                <Link
                  to={`/conversas/${c.id}`}
                  className="flex items-center gap-3 bg-white/60 rounded-card border border-ink-100 hover:border-ink-200 px-4 py-2.5 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-700 truncate">{c.telefone}</div>
                    <div className="text-xs text-ink-400 truncate">
                      {c.ultima_atividade
                        ? new Date(c.ultima_atividade).toLocaleString('pt-BR')
                        : '—'}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-400 bg-ink-100 rounded-card px-2 py-1">
                    Encerrada
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
