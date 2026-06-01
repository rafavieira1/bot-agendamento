export default {
  nome: 'admissional_completo',
  descricao: 'Admissional: coleta dados + validar_hierarquia + cadastrar + agenda.',
  cliente: {
    persona: 'RH de empresa, organizado',
    objetivo: 'agendar exame admissional de um funcionario novo',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '12345678909', nome: 'João Teste Silva', data_nascimento: '15/03/1995', sexo: 'masculino',
      estado_civil: 'solteiro', ctps_numero: '1234567', ctps_serie: '0012', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA', data_preferida: '04/06/2026',
    },
    comportamento: 'manda os dados em blocos quando pedido; aceita o primeiro horario com "sim"',
  },
  mocks: { cadastrar_funcionario: { ok: true, codigo_funcionario: 555 }, agendar_no_soc: { ok: true, codigo_agendamento: 134400000 } },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'cadastrar_funcionario', 'agendar_no_soc'],
    tools_proibidas: ['buscar_funcionario'],
    outcome: 'agendamento_efetuado',
    handoff_motivo: null,
  },
};
