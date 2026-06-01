import * as reads from './reads.js';
import * as writes from './writes.js';

const REGISTRY = { ...reads, ...writes };

// Despacha uma tool pelo nome. Lança se desconhecida.
export async function dispatchTool(tool_name, args, ctx) {
  const fn = REGISTRY[tool_name];
  if (!fn) throw new Error(`tool desconhecida no harness: ${tool_name}`);
  return await fn(args, ctx);
}

// Tools que ENCERRAM a invocação do WF2 (Is enviar_confirmacao? no WF2).
export const TERMINAL_TOOLS = new Set(['enviar_confirmacao', 'transferir_humano']);
