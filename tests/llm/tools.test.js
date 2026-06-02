// tests/llm/tools.test.js
import { describe, it, expect } from 'vitest';
import { tools } from '../../src/llm/tools.js';

const NAMES = ['buscar_empresa','buscar_funcionario','listar_slots','agendar_no_soc',
  'enviar_confirmacao','enviar_mensagem','transferir_humano','notificar_safe',
  'validar_hierarquia','cadastrar_funcionario'];

describe('tools (schemas OpenAI, espelho do WF2)', () => {
  it('tem exatamente as 10 tools do WF2', () => {
    expect(tools.map(t => t.function.name).sort()).toEqual([...NAMES].sort());
  });
  it('todas são function tools com parameters object', () => {
    for (const t of tools) {
      expect(t.type).toBe('function');
      expect(t.function.parameters.type).toBe('object');
    }
  });
  it('listar_slots/agendar_no_soc exigem cidade+tipo+cpf', () => {
    const ls = tools.find(t => t.function.name === 'listar_slots').function.parameters.required;
    expect(ls).toEqual(expect.arrayContaining(['codigo_empresa','cpf_funcionario','cidade','tipo_compromisso','data_de','data_ate']));
  });
});
