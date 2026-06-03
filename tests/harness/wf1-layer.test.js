import { describe, it, expect } from 'vitest';
import { wf1Step } from '../../evals/harness/wf1-layer.js';

describe('wf1Step', () => {
  it('transferido: dropa o inbound (bot mudo)', () => {
    expect(wf1Step({ conversa: { status: 'transferido' }, texto: 'oi' }).dropped).toBe(true);
  });

  it('concluido: reabre nova sessao (coletando, reopened)', () => {
    const r = wf1Step({ conversa: { status: 'concluido' }, texto: 'quero agendar de novo' });
    expect(r.dropped).toBe(false);
    expect(r.newStatus).toBe('coletando');
    expect(r.reopened).toBe(true);
  });

  it('encerrado: reabre nova sessao (coletando, reopened)', () => {
    const r = wf1Step({ conversa: { status: 'encerrado' }, texto: 'oi' });
    expect(r.newStatus).toBe('coletando');
    expect(r.reopened).toBe(true);
  });

  it('coletando: passa direto sem reabrir', () => {
    const r = wf1Step({ conversa: { status: 'coletando' }, texto: 'oi' });
    expect(r.dropped).toBe(false);
    expect(r.newStatus).toBe(null);
    expect(r.reopened).toBeUndefined();
  });

  it('aguardando_confirmacao + "sim": vira agendando com hint yes', () => {
    const r = wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'sim' });
    expect(r.newStatus).toBe('agendando');
    expect(r.hint).toContain('SIM');
  });
});
