import { describe, it, expect } from 'vitest';
import { normalizeNome, matchHierarquia } from '../../src/hierarquia/match.js';

const rows = [
  { NOMEUNIDADE: 'Safe T', NOMESETOR: 'ADMINISTRAÇÃO', NOMECARGO: 'MOTORISTA', CBO: '7825.10' },
  { NOMEUNIDADE: 'Safe T', NOMESETOR: 'TRANSPORTES',   NOMECARGO: 'MOTORISTA', CBO: '7825.10' },
  { NOMEUNIDADE: 'Safe T', NOMESETOR: 'ADMINISTRAÇÃO', NOMECARGO: 'ANALISTA FINANCEIRO', CBO: '' },
];

describe('normalizeNome', () => {
  it('remove acento, caixa e espaços extras', () => {
    expect(normalizeNome('  Administração ')).toBe('administracao');
    expect(normalizeNome('SAFE   T')).toBe('safe t');
  });
  it('trata null/undefined', () => {
    expect(normalizeNome(null)).toBe('');
    expect(normalizeNome(undefined)).toBe('');
  });
});

describe('matchHierarquia', () => {
  it('casa tripla exata e devolve nomes canônicos + CBO', () => {
    const r = matchHierarquia(rows, { unidade: 'safe t', setor: 'administracao', cargo: 'motorista' });
    expect(r.valido).toBe(true);
    expect(r.unidade_canonica).toBe('Safe T');
    expect(r.setor_canonico).toBe('ADMINISTRAÇÃO');
    expect(r.cargo_canonico).toBe('MOTORISTA');
    expect(r.cbo).toBe('7825.10');
  });
  it('mesma cargo em setor diferente: só casa a tripla certa', () => {
    const r = matchHierarquia(rows, { unidade: 'Safe T', setor: 'TRANSPORTES', cargo: 'MOTORISTA' });
    expect(r.valido).toBe(true);
    expect(r.setor_canonico).toBe('TRANSPORTES');
  });
  it('não casa quando setor não bate', () => {
    const r = matchHierarquia(rows, { unidade: 'Safe T', setor: 'ENGENHARIA', cargo: 'MOTORISTA' });
    expect(r.valido).toBe(false);
  });
  it('CBO vazio vira string vazia, não undefined', () => {
    const r = matchHierarquia(rows, { unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'ANALISTA FINANCEIRO' });
    expect(r.valido).toBe(true);
    expect(r.cbo).toBe('');
  });
  it('rows vazio/ausente → não casa', () => {
    expect(matchHierarquia([], { unidade: 'a', setor: 'b', cargo: 'c' }).valido).toBe(false);
    expect(matchHierarquia(undefined, { unidade: 'a', setor: 'b', cargo: 'c' }).valido).toBe(false);
  });
});
