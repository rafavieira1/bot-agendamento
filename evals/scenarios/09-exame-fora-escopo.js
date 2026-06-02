export default {
  nome: 'exame_fora_escopo',
  descricao: 'Tipo de exame fora do escopo; transfere silencioso ANTES de pedir CPF.',
  cliente: {
    persona: 'cliente que quer um exame que o bot nao faz',
    objetivo: 'marcar um exame de "retorno ao trabalho"',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'retorno ao trabalho' },
    comportamento: 'quando perguntarem o tipo, diga claramente que e exame de "retorno ao trabalho"',
  },
  espera: {
    tools_chamadas: ['transferir_humano'],
    tools_proibidas: ['buscar_funcionario', 'listar_slots', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'exame_fora_escopo',
  },
};
