import { describe, it, expect } from 'vitest';
import { buildIncluirAgendamento } from '../../../src/soap/xml-builders/incluir-agendamento.js';

const baseInput = {
  identificacao: {
    codigoEmpresaPrincipal: 12345,
    codigoResponsavel: 67890,
    codigoUsuario: 'U111',
  },
  dadosAgendamento: {
    tipoBuscaEmpresa: 'CODIGO_SOC',
    codigoEmpresa: 555,
    tipoBuscaFuncionario: 'CPF_ATIVO',
    codigoFuncionario: '12345678900',
    codigoUsuarioAgenda: 99,
    data: '02/06/2026',
    horaInicial: '09:00',
    tipoCompromisso: 'PERIODICO',
  },
};

describe('buildIncluirAgendamento', () => {
  it('gera <ser:incluirAgendamento> com identificacao e dadosAgendamento', () => {
    const xml = buildIncluirAgendamento(baseInput);
    expect(xml).toContain('<ser:incluirAgendamento>');
    expect(xml).toContain('<IncluirAgendamentoWsVo>');
    expect(xml).toContain('<codigoEmpresaPrincipal>12345</codigoEmpresaPrincipal>');
    expect(xml).toContain('<codigoResponsavel>67890</codigoResponsavel>');
    expect(xml).toContain('<codigoUsuario>U111</codigoUsuario>');
    expect(xml).toContain('<tipoBuscaEmpresa>CODIGO_SOC</tipoBuscaEmpresa>');
    expect(xml).toContain('<codigoEmpresa>555</codigoEmpresa>');
    expect(xml).toContain('<tipoBuscaFuncionario>CPF_ATIVO</tipoBuscaFuncionario>');
    expect(xml).toContain('<codigoFuncionario>12345678900</codigoFuncionario>');
    expect(xml).toContain('<codigoUsuarioAgenda>99</codigoUsuarioAgenda>');
    expect(xml).toContain('<data>02/06/2026</data>');
    expect(xml).toContain('<horaInicial>09:00</horaInicial>');
    expect(xml).toContain('<tipoCompromisso>PERIODICO</tipoCompromisso>');
    expect(xml).toContain('</ser:incluirAgendamento>');
  });

  it('omite campos opcionais não fornecidos', () => {
    const xml = buildIncluirAgendamento(baseInput);
    expect(xml).not.toContain('<horaFinal>');
    expect(xml).not.toContain('<detalhes>');
    expect(xml).not.toContain('<emailWsVo>');
  });

  it('inclui horaFinal quando fornecida', () => {
    const xml = buildIncluirAgendamento({
      ...baseInput,
      dadosAgendamento: { ...baseInput.dadosAgendamento, horaFinal: '09:30' },
    });
    expect(xml).toContain('<horaFinal>09:30</horaFinal>');
  });

  it('inclui codigoPrestador quando fornecido', () => {
    const xml = buildIncluirAgendamento({
      ...baseInput,
      dadosAgendamento: { ...baseInput.dadosAgendamento, codigoPrestador: 42 },
    });
    expect(xml).toContain('<codigoPrestador>42</codigoPrestador>');
  });

  it('escapa caracteres especiais em detalhes', () => {
    const xml = buildIncluirAgendamento({
      ...baseInput,
      dadosAgendamento: {
        ...baseInput.dadosAgendamento,
        detalhes: 'Obs <importante> & "marcar"',
      },
    });
    expect(xml).toContain('Obs &lt;importante&gt; &amp; &quot;marcar&quot;');
    expect(xml).not.toContain('Obs <importante>');
  });
});
