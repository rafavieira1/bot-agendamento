import { useEffect, useState } from 'react';
import { Users, Calendar, ShieldCheck, Bell, UserPlus, KeyRound, type LucideIcon } from 'lucide-react';
import { supabase, type Responsavel } from '../lib/supabase';
import { adminUsers } from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NovoUsuarioModal } from '../components/NovoUsuarioModal';

type StatCard = { label: string; value: string | number; icon: LucideIcon; hint?: string };

const inputCls =
  'w-full px-3 py-2.5 rounded-card border border-ink-200 bg-ink-50 text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 outline-none transition text-sm';

export function Admin() {
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [conversasAbertas, setConversasAbertas] = useState<number>(0);
  const [notifAbertas, setNotifAbertas] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [confirmDesativar, setConfirmDesativar] = useState<Responsavel | null>(null);
  const [resetAlvo, setResetAlvo] = useState<Responsavel | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  async function loadResponsaveis() {
    const { data } = await supabase.from('responsaveis').select('*').order('nome');
    setResponsaveis((data as Responsavel[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      const [, c, n] = await Promise.all([
        loadResponsaveis(),
        supabase.from('conversas').select('id', { count: 'exact', head: true }).eq('status', 'transferido'),
        supabase.from('notificacoes_pendentes').select('id', { count: 'exact', head: true }).is('lida_em', null),
      ]);
      setConversasAbertas(c.count ?? 0);
      setNotifAbertas(n.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  async function aplicar(action: () => Promise<{ ok: boolean; error?: string }>, id: string) {
    setBusyId(id);
    setErro(null);
    const r = await action();
    setBusyId(null);
    if (!r.ok) {
      setErro(traduzErro(r.error));
      return false;
    }
    await loadResponsaveis();
    return true;
  }

  async function mudarRole(r: Responsavel, role: 'admin' | 'atendente') {
    await aplicar(() => adminUsers({ action: 'set_role', responsavel_id: r.id, role }), r.id);
  }

  async function alternarAtivo(r: Responsavel) {
    if (r.ativo) {
      setConfirmDesativar(r);
      return;
    }
    await aplicar(() => adminUsers({ action: 'set_ativo', responsavel_id: r.id, ativo: true }), r.id);
  }

  async function confirmarDesativar() {
    if (!confirmDesativar) return;
    const ok = await aplicar(
      () => adminUsers({ action: 'set_ativo', responsavel_id: confirmDesativar.id, ativo: false }),
      confirmDesativar.id,
    );
    if (ok) setConfirmDesativar(null);
  }

  async function confirmarReset() {
    if (!resetAlvo) return;
    if (novaSenha.length < 6) {
      setErro('Senha precisa de ao menos 6 caracteres.');
      return;
    }
    const ok = await aplicar(
      () => adminUsers({ action: 'reset_password', responsavel_id: resetAlvo.id, password: novaSenha }),
      resetAlvo.id,
    );
    if (ok) {
      setResetAlvo(null);
      setNovaSenha('');
    }
  }

  const stats: StatCard[] = [
    { label: 'Responsáveis ativos', value: responsaveis.filter((r) => r.ativo).length, icon: Users, hint: `${responsaveis.length} total` },
    { label: 'Conversas em atendimento', value: conversasAbertas, icon: ShieldCheck, hint: 'status = transferido' },
    { label: 'Notificações abertas', value: notifAbertas, icon: Bell, hint: 'pendentes de leitura' },
    { label: 'Agendas configuradas', value: '—', icon: Calendar, hint: 'consultar SOC' },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-soft">
      <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 max-w-[1200px] mx-auto">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-ink-900">Administração</h1>
          <p className="text-sm text-ink-400 mt-0.5">Visão geral de responsáveis, atendimentos e notificações.</p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-card shadow-card border border-ink-100 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-ink-400 uppercase tracking-wider font-semibold">{s.label}</div>
                    <div className="text-2xl font-semibold text-ink-900 mt-2">{loading ? '…' : s.value}</div>
                    {s.hint && <div className="text-xs text-ink-400 mt-1">{s.hint}</div>}
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
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Responsáveis</h2>
              <p className="text-xs text-ink-400 mt-0.5">Usuários vinculados ao painel de atendimento</p>
            </div>
            <button
              onClick={() => setNovoOpen(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-white bg-ink-900 hover:bg-ink-800 rounded-card px-3 py-1.5 transition"
            >
              <UserPlus className="w-4 h-4" /> Novo usuário
            </button>
          </div>

          {erro && (
            <div className="mx-5 mt-3 text-sm text-rose-700 bg-rose-soft border border-rose-200 rounded-card px-3 py-2">
              {erro}
            </div>
          )}

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
                    <th className="px-5 py-2.5 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {responsaveis.map((r) => {
                    const busy = busyId === r.id;
                    return (
                      <tr key={r.id} className="border-t border-ink-100">
                        <td className="px-5 py-3 text-ink-900 font-medium">{r.nome}</td>
                        <td className="px-5 py-3 text-ink-700">{r.email}</td>
                        <td className="px-5 py-3 text-ink-500">{r.whatsapp || '—'}</td>
                        <td className="px-5 py-3">
                          <select
                            value={r.role ?? 'atendente'}
                            disabled={busy}
                            onChange={(e) => mudarRole(r, e.target.value as 'admin' | 'atendente')}
                            className="text-xs rounded-card border border-ink-200 bg-white px-2 py-1 outline-none focus:border-accent disabled:opacity-50"
                          >
                            <option value="atendente">atendente</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[10px] uppercase tracking-wider font-semibold rounded-card px-2 py-1 ${
                              r.ativo ? 'text-accent-deep bg-accent-soft' : 'text-ink-500 bg-ink-100'
                            }`}
                          >
                            {r.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setResetAlvo(r)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-xs font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-2 py-1 transition disabled:opacity-50"
                              title="Resetar senha"
                            >
                              <KeyRound className="w-3.5 h-3.5" /> Senha
                            </button>
                            <button
                              onClick={() => alternarAtivo(r)}
                              disabled={busy}
                              className={`text-xs font-medium rounded-card px-2 py-1 border transition disabled:opacity-50 ${
                                r.ativo
                                  ? 'text-rose-700 border-ink-200 bg-white hover:bg-rose-soft hover:border-rose-300'
                                  : 'text-accent-deep border-ink-200 bg-white hover:bg-accent-soft'
                              }`}
                            >
                              {busy ? '…' : r.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {novoOpen && (
        <NovoUsuarioModal onClose={() => setNovoOpen(false)} onCreated={loadResponsaveis} />
      )}

      <ConfirmDialog
        open={!!confirmDesativar}
        titulo="Desativar usuário?"
        mensagem={`${confirmDesativar?.nome ?? ''} não conseguirá mais entrar no painel até ser reativado.`}
        confirmLabel="Desativar"
        danger
        loading={busyId === confirmDesativar?.id}
        onConfirm={confirmarDesativar}
        onCancel={() => setConfirmDesativar(null)}
      />

      {resetAlvo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-900/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => busyId !== resetAlvo.id && (setResetAlvo(null), setNovaSenha(''))}
        >
          <div className="w-full max-w-sm bg-white rounded-card shadow-card p-6 fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink-900">Resetar senha</h2>
            <p className="text-sm text-ink-500 mt-1 mb-4">Nova senha para {resetAlvo.nome}.</p>
            <input
              className={inputCls}
              type="text"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="mín. 6 caracteres"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setResetAlvo(null);
                  setNovaSenha('');
                }}
                disabled={busyId === resetAlvo.id}
                className="text-sm font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-3 py-1.5 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarReset}
                disabled={busyId === resetAlvo.id}
                className="text-sm font-medium text-white bg-ink-900 hover:bg-ink-800 rounded-card px-3 py-1.5 transition disabled:opacity-50"
              >
                {busyId === resetAlvo.id ? '…' : 'Salvar senha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function traduzErro(e?: string): string {
  const m = (e ?? '').toLowerCase();
  if (m.includes('ultimo_admin')) return 'Não dá para desativar/rebaixar o último admin ativo.';
  if (m.includes('nao_autorizado')) return 'Sem permissão (apenas admin).';
  if (m.includes('senha_curta')) return 'Senha precisa de ao menos 6 caracteres.';
  return e || 'Operação falhou.';
}
