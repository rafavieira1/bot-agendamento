import { buildRequest } from '../../src/llm/build-request.js';
import { chat } from './openai.js';
import { dispatchTool, TERMINAL_TOOLS } from './tools/index.js';

// Roda UMA invocação do WF2 (o "Recurse Self" vira loop aqui). Muta session.mensagens.
// ctx = { env, mocks, outcome, recordVisible, log }. Retorna { ended: 'confirmacao'|'transferido'|'text'|'cap'|'empty' }.
export async function runAgentInvocation({ session, hint, hoje, ctx }) {
  let iteration = 0;
  while (true) {
    const { body } = buildRequest({ conversa: session.conversa, mensagens: session.mensagens, hint: iteration === 0 ? hint : '', iteration, hoje });
    const r = await chat(ctx.env, body);

    if (r.has_tool_call && iteration < 5) {
      session.appendAssistantToolCall({ content: r.content, tool_name: r.tool_name, tool_args: r.tool_args_raw, tool_call_id: r.tool_call_id });
      let args = {};
      try { args = r.tool_args_raw ? JSON.parse(r.tool_args_raw) : {}; } catch { args = {}; }
      ctx.log({ kind: 'tool_call', tool: r.tool_name, args });
      const result = await dispatchTool(r.tool_name, args, { ...ctx, session });
      session.appendToolResult({ tool_call_id: r.tool_call_id, tool_name: r.tool_name, result });
      ctx.log({ kind: 'tool_result', tool: r.tool_name, result });
      ctx.outcome.toolsCalled.add(r.tool_name);

      if (TERMINAL_TOOLS.has(r.tool_name)) {
        session.setStatus(r.tool_name === 'transferir_humano' ? 'transferido' : 'aguardando_confirmacao');
        return { ended: r.tool_name === 'transferir_humano' ? 'transferido' : 'confirmacao' };
      }
      iteration += 1;
      continue;
    }

    // sem tool (ou cap atingido). Texto puro -> "Send Final Text" (enviar_mensagem).
    if (r.content) {
      session.appendAssistantText(r.content);
      ctx.recordVisible('bot', r.content);
      return { ended: iteration >= 5 ? 'cap' : 'text' };
    }
    return { ended: 'empty' };
  }
}
