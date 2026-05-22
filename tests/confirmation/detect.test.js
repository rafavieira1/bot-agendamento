import { describe, it, expect } from 'vitest';
import { detectConfirmation } from '../../src/confirmation/detect.js';

describe('detectConfirmation', () => {
  it.each([
    'sim', 'SIM', ' sim ', 'sim!', 's', 'confirmo', 'pode confirmar', 'isso',
    'ok', 'beleza', '👍', '✅', 'pode ser', 'tá certo', 'perfeito',
  ])('positivo: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('yes');
  });

  it.each([
    'não', 'nao', 'NÃO', ' n ', 'cancela', 'errado', 'tá errado', 'não confirmo',
    'corrige', 'mudei de ideia',
  ])('negativo: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('no');
  });

  it.each([
    'talvez', 'aí me explica melhor', 'qual o valor?', 'pode ser dia 5?',
  ])('ambíguo: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('ambiguous');
  });
});
