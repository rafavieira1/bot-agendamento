import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendMessage } from '../src/lib/api';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-test' } } })),
    },
  },
}));

describe('sendMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejeita texto vazio', async () => {
    const r = await sendMessage({ conversa_id: 'abc', texto: '   ' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/obrigatorios/i);
  });

  it('rejeita conversa_id vazio', async () => {
    const r = await sendMessage({ conversa_id: '', texto: 'oi' });
    expect(r.ok).toBe(false);
  });

  it('faz POST com JWT e conversa_id+texto', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ message_id: 'm1' }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const r = await sendMessage({ conversa_id: 'conv-1', texto: 'oi' });
    expect(r.ok).toBe(true);
    expect(r.message_id).toBe('m1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (fetchMock as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ conversa_id: 'conv-1', texto: 'oi', supabase_jwt: 'jwt-test' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('retorna erro em HTTP nao-ok', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await sendMessage({ conversa_id: 'c', texto: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HTTP 500/);
  });
});
