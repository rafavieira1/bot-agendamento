// bucket: A=infra B=dado_corrigivel C=conflito_horario D=bug_payload E=regra_negocio
// retry: ask_cnpj | start_cadastro_funcionario | ask_funcionario_data | ask_horario
//      | ask_tipo_exame | ask_payload | abort | abort_notify | retry_once

const MAP = {
  FailedAuthentication: { bucket: 'A', retry: 'abort_notify', userMsg: 'Tivemos um problema técnico de autenticação. Equipe Safe já foi avisada.' },
  InvalidSecurity:      { bucket: 'A', retry: 'abort_notify', userMsg: 'Tivemos um problema técnico. Equipe Safe já foi avisada.' },
  MessageExpired:       { bucket: 'A', retry: 'retry_once',   userMsg: null },
  'SOC-201':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Erro desconhecido no SOC. Equipe Safe já foi avisada.' },
  'SOC-311':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Problema técnico. Equipe Safe já foi avisada.' },
  'SOC-314':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Problema técnico. Equipe Safe já foi avisada.' },
  'SOC-343':            { bucket: 'A', retry: 'abort_notify', userMsg: 'Problema técnico ao processar. Equipe avisada.' },

  'SOC-202': { bucket: 'B', retry: 'ask_cnpj', userMsg: 'Não localizei essa empresa. Você pode confirmar o CNPJ?' },
  'SOC-304': { bucket: 'B', retry: 'ask_cnpj', userMsg: 'CNPJ inválido. Pode confirmar o número?' },
  'SOC-303': { bucket: 'B', retry: 'start_cadastro_funcionario', userMsg: null },
  'SOC-315': { bucket: 'B', retry: 'ask_tipo_exame', userMsg: 'Tipo de exame não localizado. Qual exame você precisa? (admissional, periódico, demissional, mudança função, retorno, consulta)' },
  'SOC-316': { bucket: 'B', retry: 'ask_tipo_exame', userMsg: 'Tipo de compromisso inválido. Pode me dizer de novo?' },
  'SOC-341': { bucket: 'B', retry: 'ask_tipo_exame', userMsg: 'Esse funcionário está inativo no sistema. Só posso agendar exame demissional. Quer prosseguir?' },

  'SOC-306': { bucket: 'C', retry: 'ask_horario', userMsg: 'Esse horário não está mais disponível. Posso oferecer outro?' },
  'SOC-307': { bucket: 'C', retry: 'ask_horario', userMsg: 'Já existe um agendamento nesse horário. Quer outro horário?' },
  'SOC-308': { bucket: 'C', retry: 'ask_horario', userMsg: 'A agenda atingiu o limite nesse dia. Que tal outro dia?' },
  'SOC-327': { bucket: 'C', retry: 'ask_horario', userMsg: 'Horário não disponível na grade. Posso ofertar outro?' },
  'SOC-340': { bucket: 'C', retry: 'ask_horario', userMsg: 'Limite diário de agendamentos atingido. Que tal outro dia?' },
  'SOC-353': { bucket: 'C', retry: 'ask_horario', userMsg: 'Horário final indisponível. Posso ofertar outro horário?' },

  'SOC-210': { bucket: 'D', retry: 'abort_notify', userMsg: 'Tive um problema processando os dados. Equipe Safe avisada.' },
  'SOC-325': { bucket: 'D', retry: 'ask_payload', userMsg: 'A data não está válida. Pode confirmar no formato DD/MM/AAAA?' },
  'SOC-326': { bucket: 'D', retry: 'ask_payload', userMsg: 'O horário não está válido. Pode confirmar?' },
  'SOC-329': { bucket: 'D', retry: 'ask_payload', userMsg: 'Hora final inválida. Vou tentar de novo.' },
  'SOC-330': { bucket: 'D', retry: 'ask_payload', userMsg: 'Horário de chegada inválido.' },
  'SOC-331': { bucket: 'D', retry: 'ask_payload', userMsg: 'Horário de saída inválido.' },

  'SOC-206': { bucket: 'E', retry: 'abort_notify', userMsg: 'Sua empresa não está habilitada para esse serviço. Equipe Safe entrará em contato.' },
  'SOC-209': { bucket: 'E', retry: 'abort_notify', userMsg: 'Permissões insuficientes no sistema. Equipe Safe avisada.' },
  'SOC-342': { bucket: 'E', retry: 'abort_notify', userMsg: 'Permissões insuficientes. Equipe Safe avisada.' },
  'SOC-332': { bucket: 'E', retry: 'abort',        userMsg: 'Identificamos pendência financeira na sua empresa. Por favor regularize com nosso comercial antes do agendamento.' },
  'SOC-336': { bucket: 'E', retry: 'abort',        userMsg: 'Não é permitido agendar sem funcionário neste contexto.' },
  'SOC-339': { bucket: 'E', retry: 'abort',        userMsg: 'Configuração de usuário externo impede essa ação.' },
};

export function mapError({ codigo }) {
  return MAP[codigo] || {
    bucket: 'A',
    retry: 'abort_notify',
    userMsg: `Erro desconhecido (${codigo}). Equipe Safe já foi avisada.`,
  };
}
