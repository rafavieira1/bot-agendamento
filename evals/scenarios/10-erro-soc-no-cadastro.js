export default {
  nome: 'erro_soc_no_cadastro',
  descricao: 'Admissional ok até o cadastro; SOC falha (mock); transfere erro_cadastro_soc.',
  cliente: {
    persona: 'RH organizado',
    objetivo: 'agendar admissional (mas o cadastro vai falhar no SOC)',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '22233344455', nome: 'Carlos Teste', data_nascimento: '05/05/1988', sexo: 'masculino',
      estado_civil: 'casado', ctps_numero: '555', ctps_serie: '002', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA', data_preferida: '04/06/2026',
    },
    comportamento: 'responde os dados; aceita o horario com "sim"',
  },
  mocks: { cadastrar_funcionario: { ok: false, erro: { tipo: 'erro_cadastro_soc', mensagem: 'mock falha SOC' } } },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'enviar_confirmacao', 'cadastrar_funcionario', 'transferir_humano'],
    tools_proibidas: ['agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'erro_cadastro_soc',
  },
};
