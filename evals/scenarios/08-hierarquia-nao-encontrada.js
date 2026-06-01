export default {
  nome: 'hierarquia_nao_encontrada',
  descricao: 'Admissional com setor/cargo inexistentes; validar_hierarquia (real) retorna falso; transfere silencioso.',
  cliente: {
    persona: 'RH de empresa',
    objetivo: 'agendar admissional com cargo que nao existe na hierarquia',
    fatos: {
      cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'admissional',
      cpf: '11122233344', nome: 'Maria Teste', data_nascimento: '01/01/1992', sexo: 'feminino',
      estado_civil: 'solteira', ctps_numero: '999', ctps_serie: '001', ctps_uf: 'PR', data_admissao: '02/06/2026',
      unidade: 'Safe T', setor: 'SETOR INEXISTENTE XYZ', cargo: 'CARGO QUE NAO EXISTE 999', data_preferida: '04/06/2026',
    },
    comportamento: 'responde os dados pedidos normalmente',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'validar_hierarquia', 'transferir_humano'],
    tools_proibidas: ['cadastrar_funcionario', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'hierarquia_nao_encontrada',
  },
};
