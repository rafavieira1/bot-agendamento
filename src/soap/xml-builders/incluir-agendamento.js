import { xmlEscape } from './_escape.js';

function tag(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

export function buildIncluirAgendamento({ identificacao, dadosAgendamento }) {
  const i = identificacao;
  const d = dadosAgendamento;

  return `<ser:incluirAgendamento>
  <IncluirAgendamentoWsVo>
    <identificacaoWsVo>
      ${tag('codigoEmpresaPrincipal', i.codigoEmpresaPrincipal)}
      ${tag('codigoResponsavel', i.codigoResponsavel)}
      ${tag('codigoUsuario', i.codigoUsuario)}
    </identificacaoWsVo>
    <dadosAgendamentoWsVo>
      ${tag('tipoBuscaEmpresa', d.tipoBuscaEmpresa)}
      ${tag('codigoEmpresa', d.codigoEmpresa)}
      ${tag('reservarCompromissoParaEmpresa', d.reservarCompromissoParaEmpresa)}
      ${tag('tipoBuscaFuncionario', d.tipoBuscaFuncionario)}
      ${tag('codigoFuncionario', d.codigoFuncionario)}
      ${tag('codigoUsuarioAgenda', d.codigoUsuarioAgenda)}
      ${tag('data', d.data)}
      ${tag('horaInicial', d.horaInicial)}
      ${tag('horaFinal', d.horaFinal)}
      ${tag('codigoCompromisso', d.codigoCompromisso)}
      ${tag('usaOutroCompromisso', d.usaOutroCompromisso)}
      ${tag('conteudoOutroCompromisso', d.conteudoOutroCompromisso)}
      ${tag('tipoCompromisso', d.tipoCompromisso)}
      ${tag('detalhes', d.detalhes)}
      ${tag('codigoProfissionalAgenda', d.codigoProfissionalAgenda)}
      ${tag('horarioChegada', d.horarioChegada)}
      ${tag('horarioSaida', d.horarioSaida)}
      ${tag('priorizarAtendimento', d.priorizarAtendimento)}
      ${tag('usaEnviarEmail', d.usaEnviarEmail)}
      ${tag('usaEnviarSocms', d.usaEnviarSocms)}
      ${tag('codigoPrestador', d.codigoPrestador)}
      ${tag('convocacaoAgendada', d.convocacaoAgendada)}
    </dadosAgendamentoWsVo>
  </IncluirAgendamentoWsVo>
</ser:incluirAgendamento>`;
}
