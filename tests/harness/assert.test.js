// tests/harness/assert.test.js
import { describe, it, expect } from 'vitest';
import { runAssertions } from '../../evals/harness/assert.js';

const outcomeBase = { toolsCalled: new Set(['buscar_empresa','agendar_no_soc']), agendamento_efetuado: true, transferido: false, handoff_motivo: null };

describe('runAssertions', () => {
  it('passa quando tudo bate', () => {
    const r = runAssertions({ espera: { tools_chamadas: ['buscar_empresa'], outcome: 'agendamento_efetuado' } }, outcomeBase);
    expect(r.pass).toBe(true);
    expect(r.falhas).toEqual([]);
  });
  it('falha quando tool obrigatoria faltou', () => {
    const r = runAssertions({ espera: { tools_chamadas: ['validar_hierarquia'] } }, outcomeBase);
    expect(r.pass).toBe(false);
    expect(r.falhas[0]).toMatch(/validar_hierarquia/);
  });
  it('falha quando tool proibida foi chamada', () => {
    const r = runAssertions({ espera: { tools_proibidas: ['buscar_empresa'] } }, outcomeBase);
    expect(r.pass).toBe(false);
  });
  it('checa outcome e handoff_motivo', () => {
    const o = { toolsCalled: new Set(['transferir_humano']), transferido: true, handoff_motivo: 'exame_fora_escopo' };
    const r = runAssertions({ espera: { outcome: 'transferido', handoff_motivo: 'exame_fora_escopo' } }, o);
    expect(r.pass).toBe(true);
  });
});
