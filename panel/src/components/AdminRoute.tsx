import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function AdminRoute({ children }: { children: ReactNode }) {
  const { session, responsavel, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">
        Carregando…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (responsavel?.role !== 'admin') return <Navigate to="/conversas" replace />;
  return <>{children}</>;
}
