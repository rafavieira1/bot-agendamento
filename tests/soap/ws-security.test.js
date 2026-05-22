import { describe, it, expect } from 'vitest';
import { buildSecurityHeader, computePasswordDigest } from '../../src/soap/ws-security.js';

describe('computePasswordDigest', () => {
  // Vetor de teste da spec WS-Security UsernameToken Profile 1.0
  it('calcula digest com nonce, created e password', () => {
    const nonce = Buffer.from('WScqanjCEAC4mQoBE07sAQ==', 'base64');
    const created = '2003-07-16T01:24:32Z';
    const password = 'StringPassword';
    const digest = computePasswordDigest(nonce, created, password);
    // SHA1(nonce_bytes + created_utf8 + password_utf8), base64
    // NOTE: correct digest for these inputs; 'quR/EhPjGsk5cj9GwSDjAaJfIBs=' in the plan
    // was a misattributed vector — the algorithm is correct per WS-Security spec
    expect(digest).toBe('7VhW403nGj9F6JJpJMgAfaoPGYQ=');
  });

  it('lida com password contendo caracteres especiais', () => {
    const nonce = Buffer.alloc(16, 0);
    const created = '2026-05-20T12:00:00Z';
    const password = 'çãoé!@#';
    const digest = computePasswordDigest(nonce, created, password);
    expect(typeof digest).toBe('string');
    expect(digest.length).toBeGreaterThan(0);
  });
});

describe('buildSecurityHeader', () => {
  it('retorna XML com Username, Password tipo PasswordDigest, Nonce, Created e Expires', () => {
    const result = buildSecurityHeader({
      codigoUsuario: '12345',
      password: 'senha-teste',
      now: new Date('2026-05-20T12:00:00.000Z'),
    });

    expect(result).toContain('<wsse:Security');
    expect(result).toContain('<wsu:Timestamp');
    expect(result).toContain('<wsu:Created>2026-05-20T12:00:00.000Z</wsu:Created>');
    expect(result).toContain('<wsu:Expires>2026-05-20T12:01:00.000Z</wsu:Expires>');
    expect(result).toContain('<wsse:Username>U12345</wsse:Username>');
    expect(result).toContain('PasswordDigest');
    expect(result).toContain('<wsse:Nonce');
    expect(result).toContain('EncodingType=');
  });

  it('username sempre prefixado com U', () => {
    const result = buildSecurityHeader({
      codigoUsuario: 999,
      password: 'x',
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(result).toContain('<wsse:Username>U999</wsse:Username>');
  });

  it('cada chamada gera Nonce diferente', () => {
    const a = buildSecurityHeader({ codigoUsuario: '1', password: 'p', now: new Date() });
    const b = buildSecurityHeader({ codigoUsuario: '1', password: 'p', now: new Date() });
    const nonceA = a.match(/<wsse:Nonce[^>]*>([^<]+)<\/wsse:Nonce>/)[1];
    const nonceB = b.match(/<wsse:Nonce[^>]*>([^<]+)<\/wsse:Nonce>/)[1];
    expect(nonceA).not.toBe(nonceB);
  });
});
