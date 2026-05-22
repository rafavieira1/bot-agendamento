import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyMetaSignature } from '../../src/meta/verify-signature.js';

const APP_SECRET = 'super-secret';

function sign(body) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
}

describe('verifyMetaSignature', () => {
  it('aceita assinatura válida', () => {
    const body = '{"foo":"bar"}';
    expect(verifyMetaSignature({ body, signature: sign(body), appSecret: APP_SECRET })).toBe(true);
  });

  it('rejeita assinatura inválida', () => {
    expect(verifyMetaSignature({ body: '{"foo":"bar"}', signature: 'sha256=deadbeef', appSecret: APP_SECRET })).toBe(false);
  });

  it('rejeita assinatura ausente', () => {
    expect(verifyMetaSignature({ body: '{}', signature: '', appSecret: APP_SECRET })).toBe(false);
    expect(verifyMetaSignature({ body: '{}', signature: undefined, appSecret: APP_SECRET })).toBe(false);
  });

  it('rejeita prefixo errado', () => {
    expect(verifyMetaSignature({ body: '{}', signature: 'sha1=abc', appSecret: APP_SECRET })).toBe(false);
  });
});
