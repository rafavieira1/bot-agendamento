// FONTE CANÔNICA da montagem do request OpenAI do agente (WF2 "Build OpenAI Request").
// Port do Code node. n8n mantém cópia sincronizada. Diferença: usa buildSystemPrompt (acentuado)
// em vez do prompt ASCII colado; conteúdo semântico idêntico (verificado por system-prompt.test.js).
import { buildSystemPrompt } from './system-prompt.js';
import { tools } from './tools.js';

export function buildRequest({ conversa, mensagens, hint = '', iteration = 0, hoje }) {
  const c = conversa || {};
  const msgs = (Array.isArray(mensagens) ? mensagens : []).filter((m) => m && m.papel);
  const sys = buildSystemPrompt({ status: c.status, dados: c.dados, hoje });

  const messages = [{ role: 'system', content: sys }];
  if (hint) messages.push({ role: 'system', content: hint });

  // indexar tool result por tool_call_id (1:1 nesta arquitetura)
  const toolMsgByCallId = new Map();
  for (const m of msgs) if (m.papel === 'tool' && m.tool_call_id) toolMsgByCallId.set(m.tool_call_id, m);
  for (const m of msgs) {
    if (m.papel === 'user') { messages.push({ role: 'user', content: m.conteudo }); continue; }
    if (m.papel === 'assistant') {
      const hasTc = m.tool_args && m.tool_name;
      if (hasTc) {
        const callId = m.tool_call_id || ('call_' + m.id);
        const toolMsg = toolMsgByCallId.get(callId);
        if (!toolMsg) { if (m.conteudo) messages.push({ role: 'assistant', content: m.conteudo }); continue; }
        messages.push({ role: 'assistant', content: m.conteudo || '', tool_calls: [{ id: callId, type: 'function', function: { name: m.tool_name, arguments: typeof m.tool_args === 'string' ? m.tool_args : JSON.stringify(m.tool_args) } }] });
        messages.push({ role: 'tool', tool_call_id: callId, content: typeof toolMsg.tool_result === 'string' ? toolMsg.tool_result : JSON.stringify(toolMsg.tool_result) });
        continue;
      }
      if (m.conteudo == null || m.conteudo === '') continue;
      messages.push({ role: 'assistant', content: m.conteudo });
      continue;
    }
    // papel === 'tool' já emitido junto do seu assistant tool_call; órfãos descartados
  }

  // forceListarSlots: iter0 + coletando + resposta parece data + bot perguntou data antes
  const orderedByTime = [...msgs].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    if (ta !== tb) return ta - tb;
    return Number(a.id || 0) - Number(b.id || 0);
  });
  let lastUserIndex = -1;
  for (let i = orderedByTime.length - 1; i >= 0; i--) {
    if (orderedByTime[i].papel === 'user') { lastUserIndex = i; break; }
  }
  const latestUserText = lastUserIndex >= 0 ? String(orderedByTime[lastUserIndex].conteudo || '').trim().toLowerCase() : '';
  let prevAssistantText = '';
  for (let i = lastUserIndex - 1; i >= 0; i--) {
    if (orderedByTime[i].papel === 'assistant' && orderedByTime[i].conteudo) {
      prevAssistantText = String(orderedByTime[i].conteudo || '').toLowerCase();
      break;
    }
  }
  const looksLikeDateAnswer = /\b(segunda|terca|ter[çc]a|quarta|quinta|sexta|sabado|s[áa]bado|domingo|amanha|amanh[ãa]|hoje|depois de amanha|depois de amanh[ãa])\b|\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/.test(latestUserText);
  const previousAskedForDate = /\b(data|dia|quando)\b/.test(prevAssistantText);
  const forceListarSlots = iteration === 0 && c.status === 'coletando' && looksLikeDateAnswer && previousAskedForDate;
  const tool_choice = forceListarSlots ? { type: 'function', function: { name: 'listar_slots' } } : 'auto';

  return {
    body: { model: 'gpt-4.1-mini', messages, tools, tool_choice, parallel_tool_calls: false, max_tokens: 1024 },
    forcedToolChoice: forceListarSlots ? 'listar_slots' : null,
  };
}
