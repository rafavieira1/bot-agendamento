import { xmlEscape } from './_escape.js';

function tag(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function hierarquia(name, data) {
  if (!data) return '';
  return `<${name}>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('tipoBusca', data.tipoBusca)}
</${name}>`;
}

export function buildImportacaoFuncionario({
  identificacao = {},
  flags = {},
  funcionario = {},
  unidade,
  setor,
  cargo,
  centroCusto,
  motivoLicenca,
  turno,
  deficiencia,
}) {
  return `<ser:importacaoFuncionario>
  <Funcionario>
    ${tag('criarFuncionario', flags.criarFuncionario)}
    ${tag('atualizarFuncionario', flags.atualizarFuncionario)}
    ${tag('criarSetor', flags.criarSetor)}
    ${tag('atualizarSetor', flags.atualizarSetor)}
    ${tag('criarCargo', flags.criarCargo)}
    ${tag('atualizarCargo', flags.atualizarCargo)}
    ${tag('criarUnidade', flags.criarUnidade)}
    ${tag('atualizarUnidade', flags.atualizarUnidade)}
    ${tag('criarCentroCusto', flags.criarCentroCusto)}
    ${tag('criarMotivoLicenca', flags.criarMotivoLicenca)}
    ${tag('criarTurno', flags.criarTurno)}
    ${tag('criarHistorico', flags.criarHistorico)}
    <identificacaoWsVo>
      ${tag('chaveAcesso', identificacao.chaveAcesso)}
      ${tag('codigoEmpresaPrincipal', identificacao.codigoEmpresaPrincipal)}
      ${tag('codigoResponsavel', identificacao.codigoResponsavel)}
      ${tag('codigoUsuario', identificacao.codigoUsuario)}
    </identificacaoWsVo>
    <funcionarioWsVo>
      ${tag('codigoEmpresa', funcionario.codigoEmpresa)}
      ${tag('tipoBuscaEmpresa', funcionario.tipoBuscaEmpresa)}
      ${tag('chaveProcuraFuncionario', funcionario.chaveProcuraFuncionario)}
      ${tag('codigo', funcionario.codigo)}
      ${tag('matricula', funcionario.matricula)}
      ${tag('matriculaRh', funcionario.matriculaRh)}
      ${tag('cpf', funcionario.cpf)}
      ${tag('nomeFuncionario', funcionario.nomeFuncionario)}
      ${tag('dataNascimento', funcionario.dataNascimento)}
      ${tag('dataAdmissao', funcionario.dataAdmissao)}
      ${tag('sexo', funcionario.sexo)}
      ${tag('estadoCivil', funcionario.estadoCivil)}
      ${tag('regimeTrabalho', funcionario.regimeTrabalho)}
      ${tag('tipoContratacao', funcionario.tipoContratacao)}
      ${tag('situacao', funcionario.situacao)}
      ${tag('funcao', funcionario.funcao)}
      ${tag('email', funcionario.email)}
      ${tag('telefoneCelular', funcionario.telefoneCelular)}
    </funcionarioWsVo>
    ${hierarquia('unidadeWsVo', unidade)}
    ${hierarquia('setorWsVo', setor)}
    ${hierarquia('cargoWsVo', cargo)}
    ${hierarquia('centroCustoWsVo', centroCusto)}
    ${hierarquia('motivoLicencaWsVo', motivoLicenca)}
    ${hierarquia('turnoWsVo', turno)}
  </Funcionario>
</ser:importacaoFuncionario>`;
}
