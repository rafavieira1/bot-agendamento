export default {
  nome: 'empresa_nao_cadastrada',
  descricao: 'CNPJ que nao está no cache; buscar_empresa miss; transfere empresa_nao_cadastrada.',
  cliente: {
    persona: 'cliente de empresa nova',
    objetivo: 'agendar periodico para uma empresa que nao esta cadastrada',
    fatos: { cidade: 'Medianeira', cnpj: '11222333000199', tipo_exame: 'periodico' },
    comportamento: 'passe a cidade e o CNPJ quando pedido',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'transferir_humano'],
    tools_proibidas: ['listar_slots', 'agendar_no_soc'],
    outcome: 'transferido',
    handoff_motivo: 'empresa_nao_cadastrada',
  },
};
