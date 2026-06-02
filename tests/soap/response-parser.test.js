import { describe, it, expect } from 'vitest';
import { parseSoapResponse } from '../../src/soap/response-parser.js';

const SUCCESS_INCLUIR = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:incluirAgendamentoResponse xmlns:ns2="http://services.soc.age.com/">
      <AgendamentoRetorno>
        <dadosAgendamento>
          <codigoUsuarioAgenda>99</codigoUsuarioAgenda>
          <data>02/06/2026</data>
          <horaInicial>09:00</horaInicial>
        </dadosAgendamento>
        <informacaoGeral>
          <codigoMensagem>SOC-100</codigoMensagem>
          <mensagem>SUCESSO</mensagem>
          <numeroErros>0</numeroErros>
        </informacaoGeral>
        <codigoAgendamento>5555</codigoAgendamento>
      </AgendamentoRetorno>
    </ns2:incluirAgendamentoResponse>
  </soap:Body>
</soap:Envelope>`;

const ERRO_CONSISTENCIA = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:incluirAgendamentoResponse xmlns:ns2="http://services.soc.age.com/">
      <AgendamentoRetorno>
        <informacaoGeral>
          <codigoMensagem>SOC-200</codigoMensagem>
          <mensagem>ERRO. Operação não realizada.</mensagem>
          <mensagemOperacaoDetalheList>
            <codigo>SOC-306</codigo>
            <mensagem>Compromisso no mesmo dia e mesma hora.</mensagem>
          </mensagemOperacaoDetalheList>
          <numeroErros>1</numeroErros>
        </informacaoGeral>
      </AgendamentoRetorno>
    </ns2:incluirAgendamentoResponse>
  </soap:Body>
</soap:Envelope>`;

const FAULT_AUTH = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode xmlns:ns1="...">ns1:FailedAuthentication</faultcode>
      <faultstring>The security token could not be authenticated or authorized</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

const FUNC_PROBE_ENCONTRADO = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:importacaoFuncionarioResponse xmlns:ns2="http://services.soc.age.com/">
      <FuncionarioRetorno>
        <encontrouErro>false</encontrouErro>
        <encontrouFuncionario>true</encontrouFuncionario>
        <atualizouFuncionario>false</atualizouFuncionario>
        <incluiuFuncionario>false</incluiuFuncionario>
        <descricaoErro></descricaoErro>
      </FuncionarioRetorno>
    </ns2:importacaoFuncionarioResponse>
  </soap:Body>
</soap:Envelope>`;

describe('parseSoapResponse', () => {
  it('classifica sucesso de incluirAgendamento', () => {
    const r = parseSoapResponse(SUCCESS_INCLUIR);
    expect(r.kind).toBe('success');
    expect(r.operation).toBe('incluirAgendamento');
    expect(r.codigoAgendamento).toBe(5555);
    expect(r.dadosAgendamento.data).toBe('02/06/2026');
  });

  it('classifica erro de consistência (SOC-200 com detalhes)', () => {
    const r = parseSoapResponse(ERRO_CONSISTENCIA);
    expect(r.kind).toBe('error_consistency');
    expect(r.codigoMensagem).toBe('SOC-200');
    expect(r.detalhes).toHaveLength(1);
    expect(r.detalhes[0].codigo).toBe('SOC-306');
  });

  it('classifica soap:Fault', () => {
    const r = parseSoapResponse(FAULT_AUTH);
    expect(r.kind).toBe('fault');
    expect(r.faultcode).toContain('FailedAuthentication');
    expect(r.faultstring).toContain('security token');
  });

  it('classifica resposta de probe funcionário (encontrou)', () => {
    const r = parseSoapResponse(FUNC_PROBE_ENCONTRADO);
    expect(r.kind).toBe('success');
    expect(r.operation).toBe('importacaoFuncionario');
    expect(r.encontrouFuncionario).toBe(true);
    expect(r.incluiuFuncionario).toBe(false);
  });

  it('retorna unknown se XML inválido', () => {
    const r = parseSoapResponse('<not valid xml');
    expect(r.kind).toBe('unknown');
  });

  it('extrai codigoFuncionario do importacaoFuncionarioResponse', () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <importacaoFuncionarioResponse>
        <FuncionarioRetorno>
          <encontrouFuncionario>true</encontrouFuncionario>
          <incluiuFuncionario>true</incluiuFuncionario>
          <encontrouErro>false</encontrouErro>
          <codigoFuncionario>987654</codigoFuncionario>
        </FuncionarioRetorno>
      </importacaoFuncionarioResponse>
    </soap:Body>
  </soap:Envelope>`;
    const r = parseSoapResponse(xml);
    expect(r.kind).toBe('success');
    expect(r.operation).toBe('importacaoFuncionario');
    expect(r.codigoFuncionario).toBe('987654');
  });
});
