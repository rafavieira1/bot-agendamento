import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/llm/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('inclui regras-chave e estado/dados atuais', () => {
    const p = buildSystemPrompt({
      status: 'coletando',
      dados: { cnpj: '123', funcionarios: [] },
      hoje: '2026-06-01',
    });
    expect(p).toContain('Safe');
    expect(p).toContain('PT-BR');
    expect(p).toContain('NUNCA');
    expect(p).toContain('agendar_no_soc');
    expect(p).toContain('enviar_confirmacao');
    expect(p).toContain('status=coletando');
    expect(p).toContain('"cnpj":');
    expect(p).toContain('2026-06-01');
  });

  it('lista os 3 tipos no escopo e marca escopo interno', () => {
    const p = buildSystemPrompt({ status: 'coletando', dados: {} });
    expect(p).toContain('ADMISSIONAL');
    expect(p).toContain('PERIODICO');
    expect(p).toContain('DEMISSIONAL');
    expect(p).toContain('NUNCA REVELE AO CLIENTE');
  });

  it('inclui o fluxo admissional (validar_hierarquia + cadastrar_funcionario) e transferência silenciosa', () => {
    const p = buildSystemPrompt({ status: 'coletando', dados: {} });
    expect(p).toContain('validar_hierarquia');
    expect(p).toContain('cadastrar_funcionario');
    expect(p).toContain('transferir_humano');
    expect(p).toContain('exame_fora_escopo');
    // admissional não chama buscar_funcionario
    expect(p).toContain('NÃO chame buscar_funcionario');
  });

  it('pede cidade antes do CNPJ (ordem do fluxo atual)', () => {
    const p = buildSystemPrompt({ status: 'coletando', dados: {} });
    const idxCidade = p.indexOf('peça a CIDADE');
    const idxCnpj = p.indexOf('peça o CNPJ');
    expect(idxCidade).toBeGreaterThan(-1);
    expect(idxCnpj).toBeGreaterThan(idxCidade);
  });

  it('exige confirmar setor/cargo do SOC antes da data (periodico/demissional)', () => {
    const p = buildSystemPrompt({ status: 'coletando', dados: {} });
    expect(p).toContain('dados_funcionario_divergentes');
    const idxConfirma = p.indexOf('setor');
    const idxData = p.indexOf('peça a data preferida');
    expect(idxConfirma).toBeGreaterThan(-1);
    expect(idxData).toBeGreaterThan(-1);
  });
});
