import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: true,
});

export function parseSoapResponse(xml) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return { kind: 'unknown', raw: xml };
  }

  const body = doc?.Envelope?.Body;
  if (!body) return { kind: 'unknown', raw: xml };

  if (body.Fault) {
    return {
      kind: 'fault',
      faultcode: String(body.Fault.faultcode ?? ''),
      faultstring: String(body.Fault.faultstring ?? ''),
    };
  }

  const incluirResp = body.incluirAgendamentoResponse;
  const alterarResp = body.alterarAgendamentoResponse;
  const excluirResp = body.excluirAgendamentoResponse;
  const funcResp = body.importacaoFuncionarioResponse;

  if (incluirResp || alterarResp || excluirResp) {
    const op = incluirResp ? 'incluirAgendamento'
             : alterarResp ? 'alterarAgendamento'
             : 'excluirAgendamento';
    const respNode = incluirResp || alterarResp || excluirResp;
    const ret = respNode.AgendamentoRetorno
             || respNode.AgendamentoRetornoAlteracao
             || respNode.AgendamentoRetornoExclusao;

    const info = ret?.informacaoGeral || {};
    const codigo = String(info.codigoMensagem ?? '');

    if (codigo === 'SOC-100' || codigo === '') {
      return {
        kind: 'success',
        operation: op,
        codigoAgendamento: ret?.codigoAgendamento ? Number(ret.codigoAgendamento) : undefined,
        dadosAgendamento: ret?.dadosAgendamento || {},
        info,
      };
    }

    const detList = info.mensagemOperacaoDetalheList;
    const detalhes = !detList ? []
      : Array.isArray(detList) ? detList : [detList];

    return {
      kind: 'error_consistency',
      operation: op,
      codigoMensagem: codigo,
      mensagem: String(info.mensagem ?? ''),
      detalhes: detalhes.map(d => ({
        codigo: String(d.codigo ?? ''),
        mensagem: String(d.mensagem ?? ''),
      })),
    };
  }

  if (funcResp) {
    const ret = funcResp.FuncionarioRetorno || {};
    return {
      kind: 'success',
      operation: 'importacaoFuncionario',
      encontrouFuncionario: ret.encontrouFuncionario === true || ret.encontrouFuncionario === 'true',
      incluiuFuncionario: ret.incluiuFuncionario === true || ret.incluiuFuncionario === 'true',
      atualizouFuncionario: ret.atualizouFuncionario === true || ret.atualizouFuncionario === 'true',
      encontrouErro: ret.encontrouErro === true || ret.encontrouErro === 'true',
      descricaoErro: String(ret.descricaoErro ?? ''),
      raw: ret,
    };
  }

  return { kind: 'unknown', raw: xml };
}
