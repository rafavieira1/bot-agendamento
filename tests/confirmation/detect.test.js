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
    'pode ser mais tarde?', 'pode ser outro horário?', 'claro que não',
  ])('ambíguo: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('ambiguous');
  });

  // finding #2: confirmacao em frase natural (lider explicito + cauda) deve casar 'yes'
  it.each([
    'Pode ser às 07:30 então, obrigado.',
    'Sim, confirmo para Diego Chies no dia 05/06/2026 às 07:35. Obrigado!',
    'perfeito, obrigado!',
    'pode marcar sim',
    'ok pode confirmar',
    'isso mesmo, pode agendar',
    'pode ser esse horário mesmo',
  ])('positivo natural: %s', (msg) => {
    expect(detectConfirmation(msg)).toBe('yes');
  });
});
