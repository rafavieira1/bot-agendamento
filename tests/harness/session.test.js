// tests/harness/session.test.js
import { describe, it, expect } from 'vitest';
import { createSession } from '../../evals/harness/session.js';

describe('session', () => {
  it('append imita inserts do WF (user, assistant tool_call, tool result)', () => {
    const s = createSession({ telefone: '551199', status: 'coletando' });
    s.appendUser('oi');
    s.appendAssistantToolCall({ content: '', tool_name: 'buscar_empresa', tool_args: '{"cnpj":"1"}', tool_call_id: 'call_1' });
    s.appendToolResult({ tool_call_id: 'call_1', tool_name: 'buscar_empresa', result: { ok: true } });
    expect(s.mensagens.map(m => m.papel)).toEqual(['user', 'assistant', 'tool']);
    expect(s.mensagens[2].tool_result).toEqual({ ok: true });
    // ids crescentes e created_at presente (pro ordenamento do build-request)
    expect(s.mensagens[2].id).toBeGreaterThan(s.mensagens[0].id);
    expect(s.mensagens[0].created_at).toBeTruthy();
  });

  it('appendAssistantText grava papel assistant com conteudo', () => {
    const s = createSession({ telefone: '551199' });
    s.appendAssistantText('Ola!');
    expect(s.mensagens[0]).toMatchObject({ papel: 'assistant', conteudo: 'Ola!' });
  });
});
