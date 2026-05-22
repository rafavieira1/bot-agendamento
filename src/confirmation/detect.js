const POSITIVE = /^(sim|s|confirmo|confirmado|pode( ser| confirmar)?|isso|ok|okay|beleza|blz|t[áa]\s*(certo|ok|bom)|perfeito|👍|✅|claro)$/i;
const NEGATIVE = /^(n[ãa]o|n|cancela(r)?|errado|t[áa]\s*errado|n[ãa]o\s*confirmo|corrige|mudei\s*de\s*ideia)$/i;

export function detectConfirmation(msg) {
  if (!msg) return 'ambiguous';
  const trimmed = msg.trim().toLowerCase();
  // Remove trailing punctuation (.!?,;) before matching
  const normalized = trimmed.replace(/[.!?,;]+$/, '');
  if (POSITIVE.test(normalized)) return 'yes';
  if (NEGATIVE.test(normalized)) return 'no';
  return 'ambiguous';
}
