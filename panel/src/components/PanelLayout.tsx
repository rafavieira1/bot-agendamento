import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../hooks/useAuth';

export function PanelLayout() {
  const { responsavel, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen overflow-hidden gradient-bg flex">
      <Sidebar
        responsavel={responsavel}
        onLogout={() => signOut()}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden bg-white/80 backdrop-blur border-b border-ink-100 px-4 py-3 flex items-center gap-2 text-sm font-medium text-ink-700"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
          Menu
        </button>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
