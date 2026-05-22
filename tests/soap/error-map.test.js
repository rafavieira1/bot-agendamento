import { describe, it, expect } from 'vitest';
import { mapError } from '../../src/soap/error-map.js';

describe('mapError', () => {
  it('SOC-202 → bucket B, pede CNPJ', () => {
    const r = mapError({ codigo: 'SOC-202' });
    expect(r.bucket).toBe('B');
    expect(r.retry).toBe('ask_cnpj');
    expect(r.userMsg).toMatch(/CNPJ/i);
  });

  it('SOC-303 → bucket B, sem msg (entra em cadastro)', () => {
    const r = mapError({ codigo: 'SOC-303' });
    expect(r.bucket).toBe('B');
    expect(r.retry).toBe('start_cadastro_funcionario');
  });

  it('SOC-306 → bucket C, propõe outro horário', () => {
    const r = mapError({ codigo: 'SOC-306' });
    expect(r.bucket).toBe('C');
    expect(r.retry).toBe('ask_horario');
  });

  it('SOC-332 (inadimplente) → bucket E, encerra', () => {
    const r = mapError({ codigo: 'SOC-332' });
    expect(r.bucket).toBe('E');
    expect(r.retry).toBe('abort');
  });

  it('FailedAuthentication → bucket A, encerra+notifica', () => {
    const r = mapError({ codigo: 'FailedAuthentication' });
    expect(r.bucket).toBe('A');
    expect(r.retry).toBe('abort_notify');
  });

  it('código desconhecido → bucket A (conservador), notifica', () => {
    const r = mapError({ codigo: 'SOC-9999' });
    expect(r.bucket).toBe('A');
    expect(r.retry).toBe('abort_notify');
  });
});
