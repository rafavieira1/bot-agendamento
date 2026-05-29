import { useEffect, useState } from 'react';
import { Users, Calendar, ShieldCheck, Bell, type LucideIcon } from 'lucide-react';
import { supabase, type Responsavel } from '../lib/supabase';

type StatCard = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
};

export function Admin() {
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [conversasAbertas, setConversasAbertas] = useState<number>(0);
  const [notifAbertas, setNotifAbertas] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [r, c, n] = await Promise.all([
        supabase.from('responsaveis').select('*').order('nome'),
        supabase.from('conversas').select('id', { count: 'exact', head: true }).eq('status', 'transferido'),
        supabase.from('notificacoes_pendentes').select('id', { count: 'exact', head: true }).is('lida_em', null),
      ]);
      setResponsaveis((r.data as Responsavel[]) ?? []);
      setConversasAbertas(c.count ?? 0);
      setNotifAbertas(n.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  const stats: StatCard[] = [
    {
      label: 'Responsáveis ativos',
      value: responsaveis.filter((r) => r.ativo).length,
      icon: Users,
      hint: `${responsaveis.length} total`,
    },
    {
      label: 'Conversas em atendimento',
      value: conversasAbertas,
      icon: ShieldCheck,
      hint: 'status = transferido',
    },
    {
      label: 'Notificações abertas',
      value: notifAbertas,
      icon: Bell,
      hint: 'pendentes de leitura',
    },
    {
      label: 'Agendas configuradas',
      value: '—',
      icon: Calendar,
      hint: 'consultar SOC',
    },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-soft">
      <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 max-w-[1200px] mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900">Administração</h1>
        <p className="text-sm text-ink-400 mt-0.5">
          Visão geral de responsáveis, atendimentos e notificações.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="bg-white rounded-card shadow-card border border-ink-100 p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-ink-400 uppercase tracking-wider font-semibold">
                    {s.label}
                  </div>
                  <div className="text-2xl font-semibold text-ink-900 mt-2">
                    {loading ? '…' : s.value}
                  </div>
                  {s.hint && (
                    <div className="text-xs text-ink-400 mt-1">{s.hint}</div>
                  )}
                </div>
                <div className="w-9 h-9 rounded-card bg-brand-soft text-brand-deep flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-card shadow-card border border-ink-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-900">Responsáveis</h2>
            <p className="text-xs text-ink-400 mt-0.5">
              Usuários vinculados ao painel de atendimento
            </p>
          </div>
          <span className="text-xs text-ink-400">{responsaveis.length} registro(s)</span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-ink-400">Carregando…</div>
        ) : responsaveis.length === 0 ? (
          <div className="p-6 text-sm text-ink-400">Nenhum responsável cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400 bg-ink-50">
                  <th className="px-5 py-2.5 font-semibold">Nome</th>
                  <th className="px-5 py-2.5 font-semibold">Email</th>
                  <th className="px-5 py-2.5 font-semibold">WhatsApp</th>
                  <th className="px-5 py-2.5 font-semibold">Papel</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {responsaveis.map((r) => (
                  <tr key={r.id} className="border-t border-ink-100">
                    <td className="px-5 py-3 text-ink-900 font-medium">{r.nome}</td>
                    <td className="px-5 py-3 text-ink-700">{r.email}</td>
                    <td className="px-5 py-3 text-ink-500">{r.whatsapp || '—'}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-[10px] uppercase tracking-wider font-semibold rounded-card px-2 py-1 ${
                          r.role === 'admin'
                            ? 'text-brand-deep bg-brand-soft'
                            : 'text-ink-500 bg-ink-100'
                        }`}
                      >
                        {r.role ?? 'atendente'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-[10px] uppercase tracking-wider font-semibold rounded-card px-2 py-1 ${
                          r.ativo
                            ? 'text-accent-deep bg-accent-soft'
                            : 'text-ink-500 bg-ink-100'
                        }`}
                      >
                        {r.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-400 mt-4">
        Para criar/editar responsáveis, use o SQL editor do Supabase ou rode um seed.
      </p>
      </div>
    </div>
  );
}
