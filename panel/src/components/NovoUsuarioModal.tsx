import { useState } from 'react';
import { usuarioToEmail, validateNovoUsuario, type NovoUsuario, type Role } from '../lib/admin';
import { adminUsers } from '../lib/api';

function traduzErro(e?: string): string {
  const m = (e ?? '').toLowerCase();
  if (m.includes('already') || m.includes('exists') || m.includes('registered')) return 'Já existe usuário com esse e-mail/usuário.';
  if (m.includes('senha_curta')) return 'Senha precisa de ao menos 6 caracteres.';
  if (m.includes('campos_obrigatorios')) return 'Preencha nome, usuário e senha.';
  if (m.includes('nao_autorizado')) return 'Sem permissão (apenas admin).';
  return e || 'Não foi possível criar o usuário.';
}

const inputCls =
  'w-full px-3 py-2.5 rounded-card border border-ink-200 bg-ink-50 text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20 outline-none transition text-sm';

export function NovoUsuarioModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NovoUsuario>({
    nome: '',
    usuario: '',
    password: '',
    whatsapp: '',
    role: 'atendente',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof NovoUsuario>(k: K, v: NovoUsuario[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const v = validateNovoUsuario(form);
    if (v) {
      setErro(v);
      return;
    }
    setSaving(true);
    setErro(null);
    const r = await adminUsers({
      action: 'create',
      nome: form.nome.trim(),
      email: usuarioToEmail(form.usuario),
      password: form.password,
      whatsapp: form.whatsapp.trim() || null,
      role: form.role,
    });
    setSaving(false);
    if (!r.ok) {
      setErro(traduzErro(r.error));
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md bg-white rounded-card shadow-card p-6 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink-900">Novo usuário</h2>
        <p className="text-xs text-ink-400 mt-0.5 mb-4">
          O usuário entra no painel com "usuário" + senha. Sem "@", vira <code>@safework.local</code>.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Nome</span>
            <input className={inputCls} value={form.nome} onChange={(e) => set('nome', e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Usuário</span>
            <input className={inputCls} value={form.usuario} onChange={(e) => set('usuario', e.target.value)} autoCapitalize="none" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Senha</span>
            <input className={inputCls} type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="mín. 6 caracteres" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">WhatsApp (opcional)</span>
            <input className={inputCls} value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="5519999990000" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-700 mb-1">Papel</span>
            <select className={inputCls} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              <option value="atendente">Atendente</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>

        {erro && (
          <div className="text-sm text-rose-700 bg-rose-soft border border-rose-200 rounded-card px-3 py-2 mt-3">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 rounded-card px-3 py-1.5 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="text-sm font-medium text-white bg-ink-900 hover:bg-ink-800 rounded-card px-3 py-1.5 transition disabled:opacity-50"
          >
            {saving ? '…' : 'Criar usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}
