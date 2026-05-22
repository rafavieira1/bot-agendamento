import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/llm/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('inclui regras-chave e estado/dados atuais', () => {
    const p = buildSystemPrompt({
      status: 'coletando',
      dados: { cnpj: '123', funcionarios: [] },
    });
    expect(p).toContain('Safe');
    expect(p).toContain('PT-BR');
    expect(p).toContain('NUNCA');
    expect(p).toContain('agendar_no_soc');
    expect(p).toContain('enviar_confirmacao');
    expect(p).toContain('coletando');
    expect(p).toContain('"cnpj":');
  });

  it('lista tipos de exame válidos', () => {
    const p = buildSystemPrompt({ status: 'coletando', dados: {} });
    expect(p).toContain('ADMISSIONAL');
    expect(p).toContain('PERIODICO');
    expect(p).toContain('DEMISSIONAL');
  });
});
