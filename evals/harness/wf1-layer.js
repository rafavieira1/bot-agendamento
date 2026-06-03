import { detectConfirmation } from '../../src/confirmation/detect.js';

// Strings exatas do WF1 (nodes "Call LLM (yes hint)" / "Call LLM (no hint)").
export const HINT_YES = 'Cliente confirmou (SIM). Dispare agendar_no_soc para cada item pendente e responda confirmando ao cliente.';
export const HINT_NO = 'Cliente recusou a confirmacao. Pergunte o que precisa ser corrigido.';

// Replica a camada WF1 entre turnos. Retorna o que injetar na próxima invocação do WF2.
export function wf1Step({ conversa, texto }) {
  if (conversa.status === 'transferido') return { dropped: true };
  // estado terminal -> próxima mensagem inicia novo atendimento (reabre)
  if (conversa.status === 'encerrado' || conversa.status === 'concluido') {
    return { dropped: false, hint: '', newStatus: 'coletando', reopened: true };
  }
  if (conversa.status !== 'aguardando_confirmacao') return { dropped: false, hint: '', newStatus: null };
  const det = detectConfirmation(texto);
  if (det === 'yes') return { dropped: false, hint: HINT_YES, newStatus: 'agendando' };
  if (det === 'no') return { dropped: false, hint: HINT_NO, newStatus: 'coletando' };
  return { dropped: false, hint: '', newStatus: null }; // ambiguous: status mantido
}
