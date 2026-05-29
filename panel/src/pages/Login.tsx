import { useState, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { session, signIn, loading } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">
        Carregando…
      </div>
    );
  }
  if (session) return <Navigate to="/conversas" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const email = usuario.includes('@') ? usuario : `${usuario}@safework.local`;
    const { error } = await signIn(email, password);
    setEnviando(false);
    if (error) setErro(traduzErroAuth(error.message));
  }

  function traduzErroAuth(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes('invalid login credentials')) return 'Usuário ou senha incorretos.';
    if (m.includes('email not confirmed')) return 'Email ainda não confirmado.';
    if (m.includes('user not found')) return 'Usuário não encontrado.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos.';
    if (m.includes('network') || m.includes('fetch')) return 'Falha de conexão. Verifique sua internet.';
    if (m.includes('password')) return 'Senha inválida.';
    return 'Não foi possível entrar agora. Tente novamente.';
  }

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-card shadow-card px-6 py-4">
            <img src="/safework.png" alt="Grupo Safework" className="h-16 w-auto" />
          </div>
          <div className="text-xs uppercase tracking-[0.24em] text-ink-300 mt-5">
            Atendimento
          </div>
        </div>

        <div className="bg-white rounded-card shadow-card p-8">
          <h1 className="text-xl font-semibold text-ink-900">Entrar no painel</h1>
          <p className="text-sm text-ink-400 mt-1 mb-6">
            Informe usuário e senha para entrar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-ink-700 mb-1.5">Usuário</span>
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                required
                className="w-full px-3 py-2.5 rounded-card border border-ink-200 bg-ink-50 text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 outline-none transition"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-ink-700 mb-1.5">Senha</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-card border border-ink-200 bg-ink-50 text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 outline-none transition"
              />
            </label>

            {erro && (
              <div className="text-sm text-rose-600 bg-rose-soft border border-rose-200 rounded-card px-3 py-2">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full bg-ink-900 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-card transition"
            >
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-xs text-ink-300 text-center mt-6">
          Acesso restrito. Em caso de dúvida, fale com o administrador.
        </p>
      </div>
    </div>
  );
}
