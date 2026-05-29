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
