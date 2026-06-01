export default {
  nome: 'recusa_primeira_confirmacao',
  descricao: 'Cliente recusa o 1o horario com frase aberta; bot oferece o proximo; cliente aceita.',
  cliente: {
    persona: 'cliente exigente com horario',
    objetivo: 'agendar periodico mas so aceita o segundo horario oferecido',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '33333333333', nome: 'Diego Chies', data_preferida: '04/06/2026' },
    // IMPORTANTE: frase aberta (nao "nao" seco) -> cai em ambiguous -> bot pula pro proximo slot (ver C5 da spec)
    comportamento: 'quando o atendente propor o primeiro horario, recuse dizendo "esse nao da pra mim, tem outro?"; no segundo horario proposto, aceite com "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
