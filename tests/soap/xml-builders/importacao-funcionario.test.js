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
