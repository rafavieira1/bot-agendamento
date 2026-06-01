export default {
  nome: 'caso_feliz_periodico',
  descricao: 'Periódico, funcionário existente (cache), agenda direto.',
  cliente: {
    persona: 'dono de empresa objetivo, manda dados quando pedido',
    objetivo: 'agendar exame periodico do funcionario',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '04/06/2026' },
    comportamento: 'responde uma info por vez; aceita o primeiro horario oferecido dizendo "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    tools_proibidas: ['validar_hierarquia', 'cadastrar_funcionario'],
    outcome: 'agendamento_efetuado',
    handoff_motivo: null,
  },
};
