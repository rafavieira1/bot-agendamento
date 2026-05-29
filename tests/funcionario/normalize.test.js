import { describe, it, expect } from 'vitest';
import { normalizeSexo, normalizeUf, stripDigits, normalizeEstadoCivil } from '../../src/funcionario/normalize.js';

describe('normalizeSexo', () => {
  it('mapeia variações para enum SOC', () => {
    expect(normalizeSexo('masculino')).toBe('MASCULINO');
    expect(normalizeSexo('M')).toBe('MASCULINO');
    expect(normalizeSexo('homem')).toBe('MASCULINO');
    expect(normalizeSexo('Feminino')).toBe('FEMININO');
    expect(normalizeSexo('F')).toBe('FEMININO');
    expect(normalizeSexo('mulher')).toBe('FEMININO');
  });
  it('retorna null quando não reconhece', () => {
    expect(normalizeSexo('outro')).toBeNull();
    expect(normalizeSexo('')).toBeNull();
  });
});

describe('normalizeUf', () => {
  it('valida e normaliza sigla', () => {
    expect(normalizeUf('pr')).toBe('PR');
    expect(normalizeUf(' SP ')).toBe('SP');
  });
  it('rejeita sigla inválida', () => {
    expect(normalizeUf('XX')).toBeNull();
    expect(normalizeUf('Paraná')).toBeNull();
  });
});

describe('stripDigits', () => {
  it('mantém só dígitos', () => {
    expect(stripDigits('123.456.789-00')).toBe('12345678900');
    expect(stripDigits(' 05.435.277/0001-60 ')).toBe('05435277000160');
  });
});

describe('normalizeEstadoCivil', () => {
  it('mapeia variações para enum SOC (tolerante a acento/gênero)', () => {
    expect(normalizeEstadoCivil('solteiro')).toBe('SOLTEIRO');
    expect(normalizeEstadoCivil('Casada')).toBe('CASADO');
    expect(normalizeEstadoCivil('viúvo')).toBe('VIUVO');
    expect(normalizeEstadoCivil('Divorciada')).toBe('DIVORCIADO');
    expect(normalizeEstadoCivil('união estável')).toBe('UNIAO_ESTAVEL');
    expect(normalizeEstadoCivil('  Separado ')).toBe('SEPARADO');
  });
  it('retorna null quando não reconhece', () => {
    expect(normalizeEstadoCivil('sei lá')).toBeNull();
    expect(normalizeEstadoCivil('')).toBeNull();
  });
});
