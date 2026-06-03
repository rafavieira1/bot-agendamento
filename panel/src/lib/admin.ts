export type Role = 'admin' | 'atendente';

export type NovoUsuario = {
  nome: string;
  usuario: string;
  password: string;
  whatsapp: string;
  role: Role;
};

export function usuarioToEmail(usuario: string): string {
  const u = usuario.trim();
  return u.includes('@') ? u : `${u}@safework.local`;
}

export function validateNovoUsuario(u: NovoUsuario): string | null {
  if (!u.nome.trim()) return 'Informe o nome.';
  if (!u.usuario.trim()) return 'Informe o usuário.';
  if (u.password.length < 6) return 'Senha precisa de ao menos 6 caracteres.';
  if (u.role !== 'admin' && u.role !== 'atendente') return 'Role inválida.';
  return null;
}
