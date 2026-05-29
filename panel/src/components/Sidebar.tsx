import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, MessageSquare, Settings2, X, type LucideIcon } from 'lucide-react';
import type { Responsavel } from '../lib/supabase';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { to: '/conversas', label: 'Conversas', icon: MessageSquare },
  { to: '/admin', label: 'Admin', icon: Settings2, adminOnly: true },
];

type Props = {
  responsavel: Responsavel | null;
  onLogout: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function Sidebar({ responsavel, onLogout, mobileOpen = false, onMobileClose }: Props) {
  const isAdmin = responsavel?.role === 'admin';
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const location = useLocation();

  useEffect(() => {
    onMobileClose?.();
  }, [location.pathname, onMobileClose]);

  const iniciais = (responsavel?.nome || '??')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-30"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-40
          flex flex-col w-[240px] shrink-0 bg-white border-r border-ink-100 h-screen
          transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="px-5 pt-6 pb-4 flex items-center gap-3 border-b border-ink-100">
          <img src="/safework.png" alt="Safework" className="h-9 w-auto" />
          <div className="leading-tight flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400">
              Safework
            </div>
            <div className="text-sm font-semibold text-ink-900">Atendimento</div>
          </div>
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1 text-ink-400 hover:text-ink-900"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group relative w-full flex items-center gap-3 px-3 py-2 rounded-card text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-soft text-brand-deep'
                      : 'text-ink-500 hover:bg-ink-50 hover:text-ink-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand" />
                    )}
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-brand' : 'text-ink-400 group-hover:text-ink-700'
                      }`}
                    />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-ink-100 px-3 py-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-brand-soft text-brand-deep flex items-center justify-center text-xs font-semibold uppercase">
              {iniciais}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-ink-900 truncate">
                {responsavel?.nome ?? 'Sessão'}
              </div>
              <div className="text-[10px] text-ink-400">
                {isAdmin ? 'Admin' : responsavel ? 'Atendente' : 'Sem vínculo'}
              </div>
            </div>
            <button
              onClick={onLogout}
              aria-label="Sair"
              title="Sair"
              className="p-1.5 rounded-md text-ink-400 hover:text-ink-900 hover:bg-ink-50 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
