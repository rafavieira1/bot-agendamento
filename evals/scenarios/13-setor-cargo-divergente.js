export default {
  nome: 'setor_cargo_divergente',
  descricao: 'Periódico: cliente diz que setor/cargo do cadastro estão errados; transfere para humano.',
  cliente: {
    persona: 'RH atento aos dados',
    objetivo: 'agendar periodico, mas o cargo cadastrado está desatualizado',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '04/06/2026' },
    comportamento: 'quando o bot mostrar o setor e o cargo cadastrados e perguntar se está certo, responde que NÃO, o cargo está errado / desatualizado e precisa corrigir',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'transferir_humano'],
    tools_proibidas: ['listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'dados_funcionario_divergentes',
  },
};
