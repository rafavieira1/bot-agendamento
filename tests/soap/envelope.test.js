import { describe, it, expect } from 'vitest';
import { buildEnvelope } from '../../src/soap/envelope.js';

describe('buildEnvelope', () => {
  it('monta envelope SOAP completo', () => {
    const env = buildEnvelope({
      securityHeaderXml: '<wsse:Security>...</wsse:Security>',
      bodyXml: '<ser:incluirAgendamento>...</ser:incluirAgendamento>',
    });

    expect(env).toMatch(/^<\?xml version="1\.0"/);
    expect(env).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"');
    expect(env).toContain('xmlns:ser="http://services.soc.age.com/"');
    expect(env).toContain('<soapenv:Header>');
    expect(env).toContain('<wsse:Security>');
    expect(env).toContain('<soapenv:Body>');
    expect(env).toContain('<ser:incluirAgendamento>');
    expect(env).toContain('</soapenv:Envelope>');
  });
});
