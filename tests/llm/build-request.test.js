// tests/llm/build-request.test.js
import { describe, it, expect } from 'vitest';
import { buildRequest } from '../../src/llm/build-request.js';

const conversa = { status: 'coletando', dados: {}, telefone: '5519999990000' };

describe('buildRequest', () => {
  it('inclui system prompt + hint como mensagens system', () => {
    const { body } = buildRequest({ conversa, mensagens: [], hint: 'Cliente confirmou (SIM).', hoje: '2026-06-01' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({ role: 'system', content: 'Cliente confirmou (SIM).' });
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.tools).toHaveLength(10);
  });

  it('emite tool result imediatamente apos o assistant tool_call (adjacencia)', () => {
    const mensagens = [
      { id: 1, papel: 'user', conteudo: 'CNPJ 05435277000160', created_at: '2026-06-01T10:00:00Z' },
      { id: 2, papel: 'assistant', conteudo: '', tool_name: 'buscar_empresa', tool_args: '{"cnpj":"05435277000160"}', tool_call_id: 'call_1', created_at: '2026-06-01T10:00:01Z' },
      // interloper: resumo gravado ENTRE o tool_call e o tool_result (caso enviar_confirmacao)
      { id: 3, papel: 'assistant', conteudo: 'Empresa ok!', created_at: '2026-06-01T10:00:02Z' },
      { id: 4, papel: 'tool', tool_call_id: 'call_1', tool_result: '{"ok":true,"codigo_empresa":291130}', created_at: '2026-06-01T10:00:03Z' },
    ];
    const { body } = buildRequest({ conversa, mensagens, hoje: '2026-06-01' });
    const roles = body.messages.slice(1).map(m => m.role); // pula o system
    // assistant(tool_call) -> tool -> assistant(texto interloper)
    const idxAsstTc = body.messages.findIndex(m => m.tool_calls);
    expect(body.messages[idxAsstTc + 1].role).toBe('tool');
    expect(body.messages[idxAsstTc + 1].tool_call_id).toBe('call_1');
  });

  it('forca listar_slots quando iter0 + coletando + resposta de data + bot pediu data + pre-requisito atendido', () => {
    const mensagens = [
      // pre-requisito: ja houve buscar_funcionario (passo da data so vem depois)
      { id: 1, papel: 'assistant', conteudo: '', tool_name: 'buscar_funcionario', tool_args: '{"cpf":"57782554039","codigo_empresa":291130}', tool_call_id: 'call_1', created_at: '2026-06-01T10:00:00Z' },
      { id: 2, papel: 'tool', tool_call_id: 'call_1', tool_result: '{"ok":true,"ativo":true}', created_at: '2026-06-01T10:00:01Z' },
      { id: 3, papel: 'assistant', conteudo: 'Qual a melhor data pro exame?', created_at: '2026-06-01T10:00:02Z' },
      { id: 4, papel: 'user', conteudo: 'quinta', created_at: '2026-06-01T10:00:03Z' },
    ];
    const { body } = buildRequest({ conversa, mensagens, iteration: 0, hoje: '2026-06-01' });
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'listar_slots' } });
  });

  it('NAO forca listar_slots se a data aparece antes do pre-requisito (bug admissional: data de admissao no bloco pessoal)', () => {
    // bot pediu o bloco pessoal (contem "data de admissao") e cliente respondeu com datas,
    // mas validar_hierarquia/buscar_funcionario ainda nao rodaram -> NAO pode forcar listar_slots
    const mensagens = [
      { id: 1, papel: 'assistant', conteudo: '', tool_name: 'buscar_empresa', tool_args: '{"cnpj":"05435277000160"}', tool_call_id: 'call_1', created_at: '2026-06-01T10:00:00Z' },
      { id: 2, papel: 'tool', tool_call_id: 'call_1', tool_result: '{"ok":true,"codigo_empresa":291130}', created_at: '2026-06-01T10:00:01Z' },
      { id: 3, papel: 'assistant', conteudo: 'Preciso dos dados: nome, data de nascimento e data de admissao.', created_at: '2026-06-01T10:00:02Z' },
      { id: 4, papel: 'user', conteudo: 'Joao, nascimento 10/10/1990, admissao 02/06/2026', created_at: '2026-06-01T10:00:03Z' },
    ];
    const { body } = buildRequest({ conversa, mensagens, iteration: 0, hoje: '2026-06-01' });
    expect(body.tool_choice).toBe('auto');
  });

  it('NAO forca listar_slots na iteration > 0', () => {
    const mensagens = [
      { id: 1, papel: 'assistant', conteudo: 'Qual a data?', created_at: '2026-06-01T10:00:00Z' },
      { id: 2, papel: 'user', conteudo: 'quinta', created_at: '2026-06-01T10:00:01Z' },
    ];
    const { body } = buildRequest({ conversa, mensagens, iteration: 1, hoje: '2026-06-01' });
    expect(body.tool_choice).toBe('auto');
  });
});
