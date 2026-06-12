export default {
  nome: 'confirma_setor_cargo_ok',
  descricao: 'Periódico: bot mostra setor/cargo do SOC, cliente confirma, segue pro agendamento.',
  cliente: {
    persona: 'dono de empresa objetivo',
    objetivo: 'agendar periodico do funcionario',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '04/06/2026' },
    comportamento: 'quando o bot mostrar o setor e o cargo cadastrados e perguntar se está certo, responde que SIM, está tudo correto; aceita o primeiro horario dizendo "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    tools_proibidas: ['transferir_humano', 'validar_hierarquia', 'cadastrar_funcionario'],
    outcome: 'agendamento_efetuado',
    handoff_motivo: null,
  },
};
