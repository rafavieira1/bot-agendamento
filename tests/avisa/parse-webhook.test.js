import { describe, it, expect } from 'vitest';
import { parseAvisaWebhook } from '../../src/avisa/parse-webhook.js';

const TOKEN = 'test-token-123';

function makeBody(eventOverrides = {}, extraTopLevel = {}) {
  const event = {
    Info: {
      ID: '3A2EC15A3BEB51F7D645',
      Sender: '22085426536519@lid',
      SenderAlt: '5519992279989@s.whatsapp.net',
      IsFromMe: false,
      IsGroup: false,
      Type: 'text',
      PushName: 'Rafael',
      Timestamp: '2026-05-25T12:34:23Z',
      ...eventOverrides.Info,
    },
    Message: eventOverrides.Message ?? { conversation: 'alo' },
    ...eventOverrides.root,
  };
  // Avisa real shape: type no nível raiz ao lado de event
  return { token: TOKEN, jsonData: JSON.stringify({ event, type: 'Message' }), ...extraTopLevel };
}

describe('parseAvisaWebhook', () => {
  it('extrai mensagem texto simples', () => {
    const r = parseAvisaWebhook(makeBody(), { expectedToken: TOKEN });
    expect(r).toMatchObject({
      skip: false,
      telefone: '5519992279989',
      texto: 'alo',
      tipo: 'text',
      message_id: '3A2EC15A3BEB51F7D645',
      push_name: 'Rafael',
    });
  });

  it('aceita jsonData já parseado como objeto', () => {
    const body = makeBody();
    body.jsonData = JSON.parse(body.jsonData);
    const r = parseAvisaWebhook(body, { expectedToken: TOKEN });
    expect(r.skip).toBe(false);
    expect(r.texto).toBe('alo');
  });

  it('rejeita token errado', () => {
    const r = parseAvisaWebhook(makeBody(), { expectedToken: 'outro' });
    expect(r).toEqual({ skip: true, reason: 'token_mismatch' });
  });

  it('aceita sem expectedToken (auth desabilitada)', () => {
    const r = parseAvisaWebhook(makeBody());
    expect(r.skip).toBe(false);
  });

  it('skip IsFromMe (eco do bot)', () => {
    const r = parseAvisaWebhook(makeBody({ Info: { IsFromMe: true } }), { expectedToken: TOKEN });
    expect(r).toEqual({ skip: true, reason: 'from_me' });
  });

  it('skip IsGroup', () => {
    const r = parseAvisaWebhook(makeBody({ Info: { IsGroup: true } }), { expectedToken: TOKEN });
    expect(r).toEqual({ skip: true, reason: 'group' });
  });

  it('skip type diferente de Message (nível raiz)', () => {
    const body = { token: TOKEN, jsonData: JSON.stringify({ event: {}, type: 'Receipt' }) };
    const r = parseAvisaWebhook(body, { expectedToken: TOKEN });
    expect(r).toEqual({ skip: true, reason: 'event_type:Receipt' });
  });

  it('aceita type aninhado em event (fallback defensivo)', () => {
    const body = { token: TOKEN, jsonData: JSON.stringify({ event: { type: 'Message', Info: { SenderAlt: '5519@s.whatsapp.net', ID: 'X' }, Message: { conversation: 'oi' } } }) };
    const r = parseAvisaWebhook(body, { expectedToken: TOKEN });
    expect(r.skip).toBe(false);
    expect(r.texto).toBe('oi');
  });

  it('skip body vazio', () => {
    expect(parseAvisaWebhook(null)).toEqual({ skip: true, reason: 'empty_body' });
    expect(parseAvisaWebhook({})).toEqual({ skip: true, reason: 'missing_jsonData' });
  });

  it('skip jsonData inválido', () => {
    const r = parseAvisaWebhook({ token: TOKEN, jsonData: 'lixo{' }, { expectedToken: TOKEN });
    expect(r).toEqual({ skip: true, reason: 'invalid_json' });
  });

  it('extrai extendedTextMessage (texto longo / com formatação)', () => {
    const r = parseAvisaWebhook(
      makeBody({ Message: { extendedTextMessage: { text: 'oi com *negrito*' } } }),
      { expectedToken: TOKEN },
    );
    expect(r.texto).toBe('oi com *negrito*');
    expect(r.tipo).toBe('text');
  });

  it('detecta tipo imagem quando sem texto', () => {
    const r = parseAvisaWebhook(
      makeBody({ Message: { imageMessage: { url: 'https://...' } } }),
      { expectedToken: TOKEN },
    );
    expect(r.skip).toBe(false);
    expect(r.texto).toBe('');
    expect(r.tipo).toBe('image');
  });

  it('detecta tipo audio', () => {
    const r = parseAvisaWebhook(
      makeBody({ Message: { audioMessage: {} } }),
      { expectedToken: TOKEN },
    );
    expect(r.tipo).toBe('audio');
  });

  it('SenderAlt vazio → skip', () => {
    const r = parseAvisaWebhook(makeBody({ Info: { SenderAlt: '' } }), { expectedToken: TOKEN });
    expect(r).toEqual({ skip: true, reason: 'missing_sender' });
  });

  it('telefone strip não-dígitos (defensivo)', () => {
    const r = parseAvisaWebhook(
      makeBody({ Info: { SenderAlt: '+55 (19) 99227-9989@s.whatsapp.net' } }),
      { expectedToken: TOKEN },
    );
    expect(r.telefone).toBe('5519992279989');
  });

  it('telefone strip device suffix (5519...:1@s.whatsapp.net)', () => {
    const r = parseAvisaWebhook(
      makeBody({ Info: { SenderAlt: '5519992279989:1@s.whatsapp.net' } }),
      { expectedToken: TOKEN },
    );
    expect(r.telefone).toBe('5519992279989');
  });
});
