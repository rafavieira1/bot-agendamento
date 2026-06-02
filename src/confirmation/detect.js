// Detector pre-LLM de confirmacao (sim/nao), usado pelo WF1 entre turnos pra gerar o HINT.
// Antes era ancorado ^...$ (so casava confirmacao curta exata) -> frase natural como
// "Pode ser as 07:30 entao, obrigado" ou "Sim, confirmo para Fulano. Obrigado!" caia em
// ambiguous e o bot travava pedindo "confirme com um sim" (finding #2). Agora casa
// confirmacao que COMECA com um marcador, permitindo cauda - sem flipar recusa/nova-data.
const AFTER = '(?=$|\\s|[,.!?;])'; // fim, espaco ou pontuacao logo apos o marcador

// NEGATIVO fica ANCORADO (^...$): so "nao"/"cancela"/"errado" curtos sao recusa dura. Negativa
// que continua num pedido ("nao pode esse, tem outro?") NAO e 'no' - e ambiguous, pra o prompt
// tratar como recusa-de-horario e oferecer o proximo slot. Afrouxar isso flipava esse caso.
const NEGATIVE = /^(n[ãa]o|n|negativo|cancela(r)?|errado|t[áa]\s*errado|n[ãa]o\s*confirmo|corrige|mudei\s*de\s*ideia)$/i;
// lider positivo explicito: se a msg comeca com um destes, e confirmacao (com ou sem cauda)
const POSITIVE_LEAD = new RegExp('^(sim|s|claro|isso|ok|okay|beleza|blz|perfeito|fechado|combinado|positivo|confirmo|confirmado|confirma(r)?|t[áa]\\s*(certo|ok|bom)|👍|✅)' + AFTER, 'i');
// "pode ..." so confirma quando le como pode (ser|confirmar|marcar|agendar|sim)
const POSITIVE_PODE = /^pode\s+(ser|confirmar|marcar|agendar|sim)\b/i;
// ...E nao houver sinal de pedido de OUTRO horario/data (senao e recusa/nova data, nao confirmacao)
const PEDE_OUTRO = /\bdia\b|amanh|semana|\btarde\b|\bcedo\b|\boutr|\bantes\b|\bdepois\b|\bmais\b|\d{1,2}\s*\/\s*\d/i;
// negacao em qualquer lugar bloqueia o "yes" (ex: "claro que nao")
const TEM_NEGACAO = /\bn[ãa]o\b|\bnunca\b|\bjamais\b/i;

export function detectConfirmation(msg) {
  if (!msg) return 'ambiguous';
  // Remove trailing punctuation (.!?,;) antes de casar
  const normalized = msg.trim().toLowerCase().replace(/[.!?,;]+$/, '');
  if (NEGATIVE.test(normalized)) return 'no';
  const yes = POSITIVE_LEAD.test(normalized) || (POSITIVE_PODE.test(normalized) && !PEDE_OUTRO.test(normalized));
  if (yes && !TEM_NEGACAO.test(normalized)) return 'yes';
  return 'ambiguous';
}
