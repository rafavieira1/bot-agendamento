import { xmlEscape } from './_escape.js';

function tag(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

// bloco usado para UNIDADE (funcionarioUnidadeWsVo): sem boolean required
function unidadeBlock(data) {
  if (!data) return '';
  return `<unidadeWsVo>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('tipoBusca', data.tipoBusca)}
</unidadeWsVo>`;
}

// setorWsVo exige criarHistoricoDescricao (boolean required no WSDL)
function setorBlock(data) {
  if (!data) return '';
  return `<setorWsVo>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('tipoBusca', data.tipoBusca)}
  <criarHistoricoDescricao>${data.criarHistoricoDescricao === true ? 'true' : 'false'}</criarHistoricoDescricao>
</setorWsVo>`;
}

// cargoWsVo (funcionarioCargoWsVo) exige criarHistoricoDescricao +
// atualizaDescricaoRequisitosCargoPeloCbo (booleans required), aceita cbo
function cargoBlock(data) {
  if (!data) return '';
  return `<cargoWsVo>
  ${tag('codigo', data.codigo)}
  ${tag('codigoRh', data.codigoRh)}
  ${tag('nome', data.nome)}
  ${tag('cbo', data.cbo)}
  ${tag('tipoBusca', data.tipoBusca)}
  <criarHistoricoDescricao>${data.criarHistoricoDescricao === true ? 'true' : 'false'}</criarHistoricoDescricao>
  <atualizaDescricaoRequisitosCargoPeloCbo>${data.atualizaDescricaoRequisitosCargoPeloCbo === true ? 'true' : 'false'}</atualizaDescricaoRequisitosCargoPeloCbo>
</cargoWsVo>`;
}

// genérico para centroCusto/motivoLicenca/turno (mantém compat)
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
      ${tag('naoPossuiMatricula', funcionario.naoPossuiMatricula)}
      ${tag('cpf', funcionario.cpf)}
      ${tag('nomeFuncionario', funcionario.nomeFuncionario)}
      ${tag('dataNascimento', funcionario.dataNascimento)}
      ${tag('dataAdmissao', funcionario.dataAdmissao)}
      ${tag('sexo', funcionario.sexo)}
      ${tag('estadoCivil', funcionario.estadoCivil)}
      ${tag('regimeTrabalho', funcionario.regimeTrabalho)}
      ${tag('tipoContratacao', funcionario.tipoContratacao)}
      ${tag('situacao', funcionario.situacao)}
      ${tag('nrCtps', funcionario.nrCtps)}
      ${tag('serieCtps', funcionario.serieCtps)}
      ${tag('dataEmissaoCtps', funcionario.dataEmissaoCtps)}
      ${tag('ufCtps', funcionario.ufCtps)}
      ${tag('naoPossuiCtps', funcionario.naoPossuiCtps)}
      ${tag('funcao', funcionario.funcao)}
      ${tag('email', funcionario.email)}
      ${tag('telefoneCelular', funcionario.telefoneCelular)}
    </funcionarioWsVo>
    ${unidadeBlock(unidade)}
    ${setorBlock(setor)}
    ${cargoBlock(cargo)}
    ${hierarquia('centroCustoWsVo', centroCusto)}
    ${hierarquia('motivoLicencaWsVo', motivoLicenca)}
    ${hierarquia('turnoWsVo', turno)}
  </Funcionario>
</ser:importacaoFuncionario>`;
}
