// Deriva o outcome final e compara com cenario.espera. Tudo opcional por campo.
export function deriveOutcome(o) {
  if (o.transferido) return 'transferido';
  if (o.agendamento_efetuado) return 'agendamento_efetuado';
  return 'em_andamento';
}

export function runAssertions(cenario, o) {
  const e = cenario.espera || {};
  const falhas = [];
  const chamadas = o.toolsCalled || new Set();

  for (const t of e.tools_chamadas || []) {
    if (!chamadas.has(t)) falhas.push(`tool obrigatoria nao chamada: ${t}`);
  }
  for (const t of e.tools_proibidas || []) {
    if (chamadas.has(t)) falhas.push(`tool proibida foi chamada: ${t}`);
  }
  if (e.outcome) {
    const got = deriveOutcome(o);
    if (got !== e.outcome) falhas.push(`outcome esperado ${e.outcome}, obtido ${got}`);
  }
  if (e.handoff_motivo !== undefined) {
    if ((o.handoff_motivo || null) !== e.handoff_motivo) falhas.push(`handoff_motivo esperado ${e.handoff_motivo}, obtido ${o.handoff_motivo || null}`);
  }
  return { pass: falhas.length === 0, falhas };
}
