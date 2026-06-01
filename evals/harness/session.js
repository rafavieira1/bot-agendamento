// Estado em memória de uma conversa. Espelha as linhas da tabela `mensagens` na MESMA ordem
// que WF2/WF4 inserem, pra que buildRequest reproduza fielmente a montagem de `messages`.
let seq = 0;
function nextRow() { seq += 1; return { id: seq, created_at: new Date(Date.now() + seq).toISOString() }; }

export function createSession({ telefone, status = 'coletando', dados = {} }) {
  const mensagens = [];
  const conversa = { telefone, status, dados };
  return {
    conversa,
    mensagens,
    setStatus(s) { conversa.status = s; },
    appendUser(texto) { mensagens.push({ ...nextRow(), papel: 'user', conteudo: texto }); },
    // espelha WF2 "Save Assistant Msg" (só no ramo tool-call)
    appendAssistantToolCall({ content, tool_name, tool_args, tool_call_id }) {
      mensagens.push({ ...nextRow(), papel: 'assistant', conteudo: content || '', tool_name, tool_args, tool_call_id });
    },
    // espelha WF4 EC/EM insert (texto enviado ao cliente) e WF2 Send Final Text
    appendAssistantText(texto) { mensagens.push({ ...nextRow(), papel: 'assistant', conteudo: texto }); },
    // espelha WF2 "Save Tool Result"
    appendToolResult({ tool_call_id, tool_name, result }) {
      mensagens.push({ ...nextRow(), papel: 'tool', tool_name, tool_call_id, tool_result: result });
    },
  };
}
