export function normalizeNome(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function matchHierarquia(rows, { unidade, setor, cargo }) {
  const nu = normalizeNome(unidade);
  const ns = normalizeNome(setor);
  const nc = normalizeNome(cargo);
  const hit = (Array.isArray(rows) ? rows : []).find(r =>
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
    cbo: hit.CBO || '',
  };
}
