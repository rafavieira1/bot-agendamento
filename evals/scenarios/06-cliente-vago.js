export default {
  nome: 'cliente_vago',
  descricao: 'Periódico, cliente responde pouco; bot puxa info aos poucos.',
  cliente: {
    persona: 'cliente disperso, manda mensagens curtas e vagas',
    objetivo: 'agendar periodico mas sem dar tudo de uma vez',
    fatos: { cidade: 'Medianeira', cnpj: '05435277000160', tipo_exame: 'periodico', cpf: '57782554039', nome: 'Rafael Vieira', data_preferida: '05/06/2026' },
    comportamento: 'comece so com "oi quero marcar um exame"; depois va respondendo so o que for perguntado, uma coisa por vez; aceite o primeiro horario com "sim"',
  },
  espera: {
    tools_chamadas: ['buscar_empresa', 'buscar_funcionario', 'listar_slots', 'enviar_confirmacao', 'agendar_no_soc'],
    outcome: 'agendamento_efetuado',
  },
};
