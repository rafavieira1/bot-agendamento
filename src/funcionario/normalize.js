const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export function normalizeSexo(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['masculino', 'm', 'homem', 'masc'].includes(s)) return 'MASCULINO';
  if (['feminino', 'f', 'mulher', 'fem'].includes(s)) return 'FEMININO';
  return null;
}

export function normalizeUf(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return UFS.includes(s) ? s : null;
}

export function stripDigits(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function deburr(v) {
  return Array.from(String(v ?? '').normalize('NFD'))
    .filter((ch) => {
      const c = ch.codePointAt(0);
      return c < 0x300 || c > 0x36f;
    })
    .join('')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const ESTADO_CIVIL = {
  solteiro: 'SOLTEIRO', solteira: 'SOLTEIRO',
  casado: 'CASADO', casada: 'CASADO',
  separado: 'SEPARADO', separada: 'SEPARADO',
  divorciado: 'DIVORCIADO', divorciada: 'DIVORCIADO',
  viuvo: 'VIUVO', viuva: 'VIUVO',
  desquitado: 'DESQUITADO', desquitada: 'DESQUITADO',
  'uniao estavel': 'UNIAO_ESTAVEL',
  outro: 'OUTROS', outros: 'OUTROS',
};

export function normalizeEstadoCivil(v) {
  return ESTADO_CIVIL[deburr(v)] || null;
}
