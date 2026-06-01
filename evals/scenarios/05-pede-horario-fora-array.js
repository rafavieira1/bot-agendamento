export default {
  nome: 'pede_horario_fora_array',
  descricao: 'Cliente pede um horario que nao esta no array; bot informa indisponivel e oferece o proximo.',
  cliente: {
    persona: 'cliente que tem um horario fixo em mente',
    objetivo: 'agendar periodico pedindo 14:00 (que nao existe no array)',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '33333333333', nome: 'Diego Chies', data_preferida: '04/06/2026' },
    comportamento: 'quando o atendente perguntar/propor horario, peca explicitamente "tem as 14:00?"; depois que ele oferecer um horario da manha, aceite com "sim"',
  },
  // array determinístico só com horarios de manha -> 14:00 fica fora
  mocks: { listar_slots: { slots: [{ data: '04/06/2026', hora: '07:30' }, { data: '04/06/2026', hora: '08:00' }, { data: '04/06/2026', hora: '08:30' }] } },
  espera: {
    tools_chamadas: ['listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
