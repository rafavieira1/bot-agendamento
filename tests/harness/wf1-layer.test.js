// tests/harness/wf1-layer.test.js
import { describe, it, expect } from 'vitest';
import { wf1Step, HINT_YES, HINT_NO } from '../../evals/harness/wf1-layer.js';

describe('wf1Step', () => {
  it('dropa inbound se conversa transferida', () => {
    expect(wf1Step({ conversa: { status: 'transferido' }, texto: 'oi' })).toEqual({ dropped: true });
  });
  it('fora de aguardando_confirmacao -> hint vazio', () => {
    expect(wf1Step({ conversa: { status: 'coletando' }, texto: 'oi' })).toEqual({ dropped: false, hint: '', newStatus: null });
  });
  it('aguardando_confirmacao + "sim" -> yes (agendando + HINT_YES)', () => {
    expect(wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'sim' })).toEqual({ dropped: false, hint: HINT_YES, newStatus: 'agendando' });
  });
  it('aguardando_confirmacao + "nao" -> no (coletando + HINT_NO)', () => {
    expect(wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'nao' })).toEqual({ dropped: false, hint: HINT_NO, newStatus: 'coletando' });
  });
  it('aguardando_confirmacao + frase aberta -> ambiguous (hint vazio, status mantido)', () => {
    expect(wf1Step({ conversa: { status: 'aguardando_confirmacao' }, texto: 'nao pode esse, tem outro?' })).toEqual({ dropped: false, hint: '', newStatus: null });
  });
});
