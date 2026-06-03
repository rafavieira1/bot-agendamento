import { describe, it, expect } from 'vitest';
import { usuarioToEmail, validateNovoUsuario, type NovoUsuario } from './admin';

describe('usuarioToEmail', () => {
  it('adiciona @safework.local quando sem @', () => {
    expect(usuarioToEmail('joao')).toBe('joao@safework.local');
  });
  it('mantém email completo', () => {
    expect(usuarioToEmail('joao@x.com')).toBe('joao@x.com');
  });
  it('faz trim', () => {
    expect(usuarioToEmail('  joao ')).toBe('joao@safework.local');
  });
});

describe('validateNovoUsuario', () => {
  const base: NovoUsuario = {
    nome: 'João',
    usuario: 'joao',
    password: '123456',
    whatsapp: '',
    role: 'atendente',
  };
  it('passa com dados válidos', () => {
    expect(validateNovoUsuario(base)).toBeNull();
  });
  it('rejeita senha curta', () => {
    expect(validateNovoUsuario({ ...base, password: '123' })).toMatch(/6 caracteres/);
  });
  it('rejeita nome vazio', () => {
    expect(validateNovoUsuario({ ...base, nome: '  ' })).toMatch(/nome/i);
  });
  it('rejeita usuário vazio', () => {
    expect(validateNovoUsuario({ ...base, usuario: '' })).toMatch(/usu/i);
  });
});
