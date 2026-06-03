import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock encadeável do supabase: cada método retorna o próprio builder;
// `order` resolve com {data,error}. Registra chamadas pra inspeção.
const calls: Record<string, unknown[]> = {};
function makeBuilder() {
  const builder: any = {};
  for (const m of ['select', 'eq', 'gte', 'order']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls[m] = args;
      if (m === 'order') return Promise.resolve({ data: [], error: null });
      return builder;
    });
  }
  return builder;
}
let builder = makeBuilder();
vi.mock('../src/lib/supabase', () => ({
  supabase: { from: vi.fn(() => builder) },
}));

import { fetchMensagens } from '../src/hooks/useConversas';

describe('fetchMensagens', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
    builder = makeBuilder();
  });

  it('filtra por created_at >= anchor quando anchor presente', async () => {
    await fetchMensagens('conv-1', '2026-06-03T10:00:00.000Z');
    expect(builder.eq).toHaveBeenCalledWith('conversa_id', 'conv-1');
    expect(builder.gte).toHaveBeenCalledWith('created_at', '2026-06-03T10:00:00.000Z');
  });

  it('NAO filtra quando anchor nulo (fallback: mostra tudo)', async () => {
    await fetchMensagens('conv-1', null);
    expect(builder.eq).toHaveBeenCalledWith('conversa_id', 'conv-1');
    expect(builder.gte).not.toHaveBeenCalled();
  });
});
