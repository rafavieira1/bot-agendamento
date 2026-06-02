import { describe, it, expect } from 'vitest';
import { buildImportacaoFuncionario } from '../../../src/soap/xml-builders/importacao-funcionario.js';

const probeInput = {
  identificacao: {
    chaveAcesso: 'abc123',
    codigoEmpresaPrincipal: 12345,
    codigoResponsavel: 67890,
    codigoUsuario: 'U111',
  },
  flags: {
    criarFuncionario: false,
    atualizarFuncionario: false,
  },
  funcionario: {
    codigoEmpresa: '555',
    tipoBuscaEmpresa: 'CODIGO_SOC',
    chaveProcuraFuncionario: 'CPF_ATIVO',
    cpf: '12345678900',
  },
};

const novoFuncionario = {
  identificacao: probeInput.identificacao,
  flags: {
    criarFuncionario: true,
    criarSetor: false,
    criarCargo: false,
    criarUnidade: false,
  },
  funcionario: {
    codigoEmpresa: '555',
    tipoBuscaEmpresa: 'CODIGO_SOC',
    chaveProcuraFuncionario: 'CPF',
    cpf: '12345678900',
    nomeFuncionario: 'João Silva',
    dataNascimento: '12/05/1990',
    sexo: 'MASCULINO',
    estadoCivil: 'SOLTEIRO',
    dataAdmissao: '15/01/2024',
    regimeTrabalho: 'NORMAL',
    tipoContratacao: 'CLT',
    situacao: 'ATIVO',
  },
  unidade: { codigo: 1, tipoBusca: 'CODIGO' },
  setor: { codigo: 1, tipoBusca: 'CODIGO' },
  cargo: { codigo: 1, tipoBusca: 'CODIGO' },
};

describe('buildImportacaoFuncionario', () => {
  it('monta probe (criarFuncionario=false) com chaveProcuraFuncionario=CPF_ATIVO', () => {
    const xml = buildImportacaoFuncionario(probeInput);
    expect(xml).toContain('<ser:importacaoFuncionario>');
    expect(xml).toContain('<criarFuncionario>false</criarFuncionario>');
    expect(xml).toContain('<atualizarFuncionario>false</atualizarFuncionario>');
    expect(xml).toContain('<chaveProcuraFuncionario>CPF_ATIVO</chaveProcuraFuncionario>');
    expect(xml).toContain('<cpf>12345678900</cpf>');
    expect(xml).toContain('<chaveAcesso>abc123</chaveAcesso>');
  });

  it('monta cadastro novo com todos os campos obrigatórios', () => {
    const xml = buildImportacaoFuncionario(novoFuncionario);
    expect(xml).toContain('<criarFuncionario>true</criarFuncionario>');
    expect(xml).toContain('<nomeFuncionario>João Silva</nomeFuncionario>');
    expect(xml).toContain('<dataNascimento>12/05/1990</dataNascimento>');
    expect(xml).toContain('<sexo>MASCULINO</sexo>');
    expect(xml).toContain('<estadoCivil>SOLTEIRO</estadoCivil>');
    expect(xml).toContain('<dataAdmissao>15/01/2024</dataAdmissao>');
    expect(xml).toContain('<regimeTrabalho>NORMAL</regimeTrabalho>');
    expect(xml).toContain('<tipoContratacao>CLT</tipoContratacao>');
    expect(xml).toContain('<situacao>ATIVO</situacao>');
    expect(xml).toMatch(/<unidadeWsVo>[\s\S]*<codigo>1<\/codigo>[\s\S]*<\/unidadeWsVo>/);
    expect(xml).toMatch(/<setorWsVo>[\s\S]*<codigo>1<\/codigo>[\s\S]*<\/setorWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<codigo>1<\/codigo>[\s\S]*<\/cargoWsVo>/);
  });

  it('escapa caracteres especiais em nome', () => {
    const xml = buildImportacaoFuncionario({
      ...novoFuncionario,
      funcionario: { ...novoFuncionario.funcionario, nomeFuncionario: 'Maria & José' },
    });
    expect(xml).toContain('<nomeFuncionario>Maria &amp; José</nomeFuncionario>');
  });
});

describe('buildImportacaoFuncionario — admissional', () => {
  const base = {
    identificacao: { codigoEmpresaPrincipal: 1, codigoResponsavel: 2, codigoUsuario: 'U3' },
    flags: { criarFuncionario: true, criarSetor: false, criarCargo: false, criarUnidade: false },
    funcionario: {
      codigoEmpresa: '291130', tipoBuscaEmpresa: 'CODIGO_SOC', chaveProcuraFuncionario: 'CPF',
      cpf: '70372002048', nomeFuncionario: 'Cleber Teste', dataNascimento: '01/01/1990',
      sexo: 'MASCULINO', dataAdmissao: '01/06/2026',
      nrCtps: '1234567', serieCtps: '001', ufCtps: 'PR', naoPossuiMatricula: true,
      tipoContratacao: 'CLT', estadoCivil: 'SOLTEIRO', codigoCategoriaESocial: 101,
    },
    unidade: { nome: 'Safe T', tipoBusca: 'NOME' },
    setor: { nome: 'ADMINISTRAÇÃO', tipoBusca: 'NOME' },
    cargo: { nome: 'MOTORISTA', tipoBusca: 'NOME', cbo: '7825.10' },
  };

  it('emite CTPS e naoPossuiMatricula', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).toContain('<nrCtps>1234567</nrCtps>');
    expect(xml).toContain('<serieCtps>001</serieCtps>');
    expect(xml).toContain('<ufCtps>PR</ufCtps>');
    expect(xml).toContain('<naoPossuiMatricula>true</naoPossuiMatricula>');
  });

  it('emite campos exigidos pelo SOC no runtime (tipoContratacao, estadoCivil, codigoCategoriaESocial)', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).toContain('<tipoContratacao>CLT</tipoContratacao>');
    expect(xml).toContain('<estadoCivil>SOLTEIRO</estadoCivil>');
    expect(xml).toContain('<codigoCategoriaESocial>101</codigoCategoriaESocial>');
  });

  it('emite hierarquia por NOME', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).toMatch(/<unidadeWsVo>[\s\S]*<nome>Safe T<\/nome>[\s\S]*<tipoBusca>NOME<\/tipoBusca>[\s\S]*<\/unidadeWsVo>/);
    expect(xml).toMatch(/<setorWsVo>[\s\S]*<nome>ADMINISTRAÇÃO<\/nome>[\s\S]*<tipoBusca>NOME<\/tipoBusca>[\s\S]*<\/setorWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<nome>MOTORISTA<\/nome>[\s\S]*<tipoBusca>NOME<\/tipoBusca>[\s\S]*<\/cargoWsVo>/);
  });

  it('emite booleans required dos blocos hierarquia + cbo no cargo', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).toMatch(/<setorWsVo>[\s\S]*<criarHistoricoDescricao>false<\/criarHistoricoDescricao>[\s\S]*<\/setorWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<cbo>7825.10<\/cbo>[\s\S]*<\/cargoWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<criarHistoricoDescricao>false<\/criarHistoricoDescricao>[\s\S]*<\/cargoWsVo>/);
    expect(xml).toMatch(/<cargoWsVo>[\s\S]*<atualizaDescricaoRequisitosCargoPeloCbo>false<\/atualizaDescricaoRequisitosCargoPeloCbo>[\s\S]*<\/cargoWsVo>/);
  });

  it('omite dataEmissaoCtps quando não informado', () => {
    const xml = buildImportacaoFuncionario(base);
    expect(xml).not.toContain('<dataEmissaoCtps>');
  });
});
