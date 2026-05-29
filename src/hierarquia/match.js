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

export function normalizeNome(s) {
  return stripAccents(String(s ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
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
