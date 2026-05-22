import { describe, it, expect } from 'vitest';
import { xmlEscape } from '../../../src/soap/xml-builders/_escape.js';

describe('xmlEscape', () => {
  it('escapa & < > " \'', () => {
    expect(xmlEscape(`Tom & Jerry <test> "quoted" 'apos'`))
      .toBe(`Tom &amp; Jerry &lt;test&gt; &quot;quoted&quot; &apos;apos&apos;`);
  });

  it('preserva texto sem caracteres especiais', () => {
    expect(xmlEscape('João Silva 123')).toBe('João Silva 123');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(xmlEscape(null)).toBe('');
    expect(xmlEscape(undefined)).toBe('');
  });

  it('converte número para string', () => {
    expect(xmlEscape(42)).toBe('42');
  });
});
