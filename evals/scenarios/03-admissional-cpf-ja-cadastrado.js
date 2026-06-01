export default {
  nome: 'admissional_cpf_ja_cadastrado',
  descricao: 'Admissional com CPF que já existe — upsert no SOC (mock) e agenda.',
  cliente: {
    persona: 'RH com pressa',
    objetivo: 'agendar admissional reusando um CPF que ja existe no sistema',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '57782554039', nome: 'Rafael Vieira', data_nascimento: '10/10/1990', sexo: 'masculino',
      estado_civil: 'casado', ctps_numero: '7654321', ctps_serie: '0001', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA', data_preferida: '04/06/2026',
    },
    comportamento: 'aceita o primeiro horario com "sim"',
  },
  mocks: { cadastrar_funcionario: { ok: true, codigo_funcionario: 18 }, agendar_no_soc: { ok: true, codigo_agendamento: 134437182 } },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'cadastrar_funcionario', 'agendar_no_soc'],
    tools_proibidas: ['buscar_funcionario'],
    outcome: 'agendamento_efetuado',
  },
};
