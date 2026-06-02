// Remove marcas diacríticas combinantes (U+0300–U+036F) sem usar regex com
// caracteres invisíveis (que formatadores/diffs mutilam silenciosamente).
function stripAccents(str) {
  return Array.from(str.normalize('NFD'))
    .filter((ch) => {
      const c = ch.codePointAt(0);
      return c < 0x300 || c > 0x36f;
    })
    .join('');
}

// Rótulo que o cliente ecoa da pergunta do bot ("Unidade Safe T", "setor de Administração",
// "cargo Motorista"). Quebra o match exato contra o nome canônico do SOC. Removido (de AMBOS os
// lados — simétrico, não cria mismatch) antes de comparar. `\s+` exige espaço, então prefixo grudado
// em palavra (ex: "setorista") não é tocado. Conector de/da/do opcional logo após o rótulo.
const LABEL_PREFIX = /^(?:unidade|filial|local|setor|departamento|area|cargo|funcao|posto)\s+(?:(?:de|da|do|dos|das)\s+)?/;

export function normalizeNome(s) {
  const base = stripAccents(String(s ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const stripped = base.replace(LABEL_PREFIX, '').trim();
  return stripped || base; // texto era só o rótulo → mantém original, não vira ''
}

export function matchHierarquia(rows, { unidade, setor, cargo }) {
  const nu = normalizeNome(unidade);
  const ns = normalizeNome(setor);
  const nc = normalizeNome(cargo);
  const hit = (Array.isArray(rows) ? rows : []).find((r) =>
    normalizeNome(r.NOMEUNIDADE) === nu &&
    normalizeNome(r.NOMESETOR) === ns &&
    normalizeNome(r.NOMECARGO) === nc
  );
  if (!hit) return { valido: false };
  return {
    valido: true,
    unidade_canonica: hit.NOMEUNIDADE,
    setor_canonico: hit.NOMESETOR,
    cargo_canonico: hit.NOMECARGO,
    cbo: hit.CBO ?? '',
  };
}
