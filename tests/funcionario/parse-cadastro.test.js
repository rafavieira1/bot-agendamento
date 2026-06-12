import { describe, it, expect } from 'vitest';
import { parseCadastroFuncionario } from '../../src/funcionario/parse-cadastro.js';

const ROWS = [
  { NOME: 'RAFAEL VIEIRA', NOMEUNIDADE: 'Safe T', NOMESETOR: 'ADMINISTRAÇÃO', NOMECARGO: 'MOTORISTA', CPFFUNCIONARIO: '577.825.540-39', SITUACAO: 'ATIVO' },
  { NOME: 'OUTRO', NOMEUNIDADE: 'X', NOMESETOR: 'Y', NOMECARGO: 'Z', CPFFUNCIONARIO: '00000000000', SITUACAO: 'INATIVO' },
];

describe('parseCadastroFuncionario', () => {
  it('casa por CPF ignorando máscara e retorna nome/setor/cargo/unidade', () => {
    const r = parseCadastroFuncionario(ROWS, '57782554039');
    expect(r).toEqual({ encontrado: true, nome: 'RAFAEL VIEIRA', unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA' });
  });

  it('prefere linha com SITUACAO ativa quando há mais de uma pro mesmo CPF', () => {
    const rows = [
      { NOMESETOR: 'VELHO', NOMECARGO: 'C1', CPFFUNCIONARIO: '57782554039', SITUACAO: 'INATIVO', NOME: 'R', NOMEUNIDADE: 'U' },
      { NOMESETOR: 'NOVO', NOMECARGO: 'C2', CPFFUNCIONARIO: '57782554039', SITUACAO: 'Ativo', NOME: 'R', NOMEUNIDADE: 'U' },
    ];
    expect(parseCadastroFuncionario(rows, '57782554039').setor).toBe('NOVO');
  });

  it('CPF ausente → encontrado:false', () => {
    expect(parseCadastroFuncionario(ROWS, '99999999999')).toEqual({ encontrado: false });
  });

  it('setor ou cargo vazio → encontrado:false (não dá pra confirmar)', () => {
    const rows = [{ NOMESETOR: '', NOMECARGO: 'X', CPFFUNCIONARIO: '57782554039', SITUACAO: 'ATIVO' }];
    expect(parseCadastroFuncionario(rows, '57782554039')).toEqual({ encontrado: false });
  });

  it('entrada não-array → encontrado:false', () => {
    expect(parseCadastroFuncionario(null, '57782554039')).toEqual({ encontrado: false });
  });
});
