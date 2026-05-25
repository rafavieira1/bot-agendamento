import { describe, it, expect } from 'vitest';
import {
  buildSendTextRequest,
  buildMarkReadRequest,
  buildCheckNumberRequest,
} from '../../src/avisa/send-message.js';

const base = 'https://www.avisaapi.com.br/api';
const tok = 'tok-abc';

describe('buildSendTextRequest', () => {
  it('monta POST sendMessage com bearer', () => {
    const r = buildSendTextRequest({ baseUrl: base, token: tok, telefone: '5519992279989', texto: 'oi' });
    expect(r.url).toBe('https://www.avisaapi.com.br/api/actions/sendMessage');
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer tok-abc');
    expect(r.headers['Content-Type']).toBe('application/json');
    expect(r.body).toEqual({ number: '5519992279989', message: 'oi' });
  });

  it('strip não-dígitos do telefone', () => {
    const r = buildSendTextRequest({ baseUrl: base, token: tok, telefone: '+55 (19) 99227-9989', texto: 'x' });
    expect(r.body.number).toBe('5519992279989');
  });

  it('trim slash final do baseUrl', () => {
    const r = buildSendTextRequest({ baseUrl: base + '///', token: tok, telefone: '5519', texto: 'x' });
    expect(r.url).toBe('https://www.avisaapi.com.br/api/actions/sendMessage');
  });

  it('inclui contextInfo quando replyTo', () => {
    const r = buildSendTextRequest({
      baseUrl: base, token: tok, telefone: '5519', texto: 'x',
      replyTo: { message_id: 'ABC', participant: '5519@s.whatsapp.net' },
    });
    expect(r.body.contextInfo).toEqual({ StanzaId: 'ABC', Participant: '5519@s.whatsapp.net' });
  });

  it('throws sem campos obrigatórios', () => {
    expect(() => buildSendTextRequest({ token: tok, telefone: '5519', texto: 'x' })).toThrow(/baseUrl/);
    expect(() => buildSendTextRequest({ baseUrl: base, telefone: '5519', texto: 'x' })).toThrow(/token/);
    expect(() => buildSendTextRequest({ baseUrl: base, token: tok, texto: 'x' })).toThrow(/telefone/);
    expect(() => buildSendTextRequest({ baseUrl: base, token: tok, telefone: '5519' })).toThrow(/texto/);
  });
});

describe('buildMarkReadRequest', () => {
  it('monta POST markreadMessage', () => {
    const r = buildMarkReadRequest({ baseUrl: base, token: tok, message_id: 'ABC', chat: '5519@s.whatsapp.net' });
    expect(r.url).toBe(base + '/actions/markreadMessage');
    expect(r.body).toEqual({ id: 'ABC', chat: '5519@s.whatsapp.net' });
  });
});

describe('buildCheckNumberRequest', () => {
  it('monta POST checknumber', () => {
    const r = buildCheckNumberRequest({ baseUrl: base, token: tok, telefone: '(19) 99227-9989' });
    expect(r.url).toBe(base + '/actions/checknumber');
    expect(r.body).toEqual({ number: '19992279989' });
  });
});
