// Writes mockados. Default "sucesso"; override por cenário via ctx.mocks[tool].
// NÃO chamam SOC nem WhatsApp. Side-effects de estado (status, mensagem visível) ficam aqui
// pra espelhar EC/EM/TH; a decisão de "encerrar invocação" é do agent-runner.

export async function cadastrar_funcionario(args, ctx) {
  const m = (ctx.mocks && ctx.mocks.cadastrar_funcionario) || {};
  if (m.ok === false) return { ok: false, erro: m.erro || { tipo: 'erro_cadastro_soc', mensagem: 'mock erro' } };
  return { ok: true, codigo_funcionario: m.codigo_funcionario ?? 999 };
}

export async function agendar_no_soc(args, ctx) {
  const m = (ctx.mocks && ctx.mocks.agendar_no_soc) || {};
  if (m.ok === false) return { ok: false, codigo_erro: m.codigo_erro || 'mock_erro', mappedError: m.mappedError || null };
  ctx.outcome.agendamento_efetuado = true;
  return { ok: true, codigo_agendamento: m.codigo_agendamento ?? 100000000, from_cache: false };
}

// enviar_confirmacao: grava o resumo como mensagem visível (espelha EC insert) + retorna shape EC.
export async function enviar_confirmacao(args, ctx) {
  ctx.session.appendAssistantText(args.resumo);
  ctx.recordVisible('bot', args.resumo);
  return { ok: true, provider: 'mock', message_id: 'mock', status: 'aguardando_confirmacao' };
}

export async function enviar_mensagem(args, ctx) {
  ctx.session.appendAssistantText(args.texto);
  ctx.recordVisible('bot', args.texto);
  return { ok: true, provider: 'mock', message_id: 'mock' };
}

const TEXTO_TRANSFERENCIA = 'Esse tipo de atendimento sera feito por um colega da equipe Safe. Em instantes alguem do time vai continuar daqui. Obrigado!';
export async function transferir_humano(args, ctx) {
  ctx.session.appendAssistantText(TEXTO_TRANSFERENCIA);
  ctx.recordVisible('bot', TEXTO_TRANSFERENCIA);
  ctx.outcome.transferido = true;
  ctx.outcome.handoff_motivo = args.motivo || 'outro';
  return { ok: true, provider: 'mock', message_id: 'mock', transferido: true };
}

export async function notificar_safe(args, ctx) {
  return { ok: true, notif_id: 'mock' };
}
