export default {
  nome: 'multiplos_funcionarios',
  descricao: 'Periódico, 2 CPFs na mesma sessão, confirmação consolidada.',
  cliente: {
    persona: 'RH agendando dois funcionarios de uma vez',
    objetivo: 'agendar periodico para DOIS funcionarios na mesma conversa',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico',
      funcionario_1: { cpf: '57782554039', nome: 'Rafael Vieira' },
      funcionario_2: { cpf: '33333333333', nome: 'Diego Chies' },
      data_preferida: '05/06/2026',
    },
    comportamento: 'diga logo que quer marcar para dois funcionarios e passe os dois CPFs; aceite a confirmacao consolidada com "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
