// scripts/test-admissional.mjs
// uso: node scripts/test-admissional.mjs <cpf-descartavel> <data DD/MM/AAAA> <hora HH:MM>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildSecurityHeader } from '../src/soap/ws-security.js';
import { buildEnvelope } from '../src/soap/envelope.js';
import { buildImportacaoFuncionario } from '../src/soap/xml-builders/importacao-funcionario.js';
import { buildIncluirAgendamento } from '../src/soap/xml-builders/incluir-agendamento.js';
import { parseSoapResponse } from '../src/soap/response-parser.js';
import { matchHierarquia } from '../src/hierarquia/match.js';
import { stripDigits } from '../src/funcionario/normalize.js';

function loadEnv() {
  const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].replace(/\s+#.*$/, '').trim();
  }
  return env;
}

async function callSoc({ url, body, env }) {
  const sec = buildSecurityHeader({ codigoUsuario: env.SOC_CODIGO_USUARIO, password: env.SOC_WS_PASSWORD || env.SOC_PASSWORD });
  const envelope = buildEnvelope({ securityHeaderXml: sec, bodyXml: body });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' }, body: envelope });
  const buf = Buffer.from(await r.arrayBuffer());
  let xml; try { xml = gunzipSync(buf).toString('utf8'); } catch { xml = buf.toString('utf8'); }
  return { status: r.status, xml };
}

async function fetchHierarquia(env, codigoEmpresa) {
  const parametro = JSON.stringify({ empresa: String(codigoEmpresa), codigo: env.SOC_EXPORTA_HIERARQUIA_CODIGO, chave: env.SOC_EXPORTA_HIERARQUIA_CHAVE, tipoSaida: 'json' });
  const url = 'https://ws1.soc.com.br/WebSoc/exportadados?parametro=' + encodeURIComponent(parametro);
  const r = await fetch(url);
  return JSON.parse(await r.text());
}

async function main() {
  const [, , cpfRaw, data, hora] = process.argv;
  if (!cpfRaw || !data || !hora) { console.error('uso: node scripts/test-admissional.mjs <cpf> <data DD/MM/AAAA> <hora HH:MM>'); process.exit(1); }
  const cpf = stripDigits(cpfRaw);
  const env = loadEnv();
  const codigoEmpresa = 291130;          // EMPRESA TESTE ALFA
  const codigoUsuarioAgenda = 1463919;   // teste carlos
  const triplaCliente = { unidade: 'Safe T', setor: 'ADMINISTRAÇÃO', cargo: 'MOTORISTA' };
  const ident = { codigoEmpresaPrincipal: env.SOC_EMPRESA, codigoResponsavel: env.SOC_WS_CODIGO_RESPONSAVEL, codigoUsuario: 'U' + env.SOC_CODIGO_USUARIO };

  console.log('\n=== PASSO 1: validar hierarquia (Exporta Dados 191874) ===');
  const rows = await fetchHierarquia(env, codigoEmpresa);
  const hier = matchHierarquia(rows, triplaCliente);
  console.log('match:', JSON.stringify(hier, null, 2));
  if (!hier.valido) { console.log('[STOP] tripla não existe na empresa — transferiria humano.'); return; }

  console.log('\n=== PASSO 2: cadastrar funcionário (criarFuncionario=true) ===');
  const bodyCad = buildImportacaoFuncionario({
    identificacao: ident,
    flags: { criarFuncionario: true, criarSetor: false, criarCargo: false, criarUnidade: false },
    funcionario: {
      codigoEmpresa: String(codigoEmpresa), tipoBuscaEmpresa: 'CODIGO_SOC', chaveProcuraFuncionario: 'CPF',
      cpf, nomeFuncionario: 'TESTE ADMISSIONAL BOT', dataNascimento: '01/01/1990',
      sexo: 'MASCULINO', dataAdmissao: data, naoPossuiMatricula: true,
    },
    unidade: { nome: hier.unidade_canonica, tipoBusca: 'NOME' },
    setor: { nome: hier.setor_canonico, tipoBusca: 'NOME' },
    cargo: { nome: hier.cargo_canonico, tipoBusca: 'NOME', cbo: hier.cbo },
  });
  const rCad = await callSoc({ url: env.SOC_WS_FUNCIONARIO_URL, body: bodyCad, env });
  const pCad = parseSoapResponse(rCad.xml);
  console.log('HTTP', rCad.status, '| parsed:', JSON.stringify(pCad, null, 2));
  if (pCad.kind !== 'success' || pCad.encontrouErro) { console.log('[STOP] cadastro falhou.'); return; }

  console.log('\n=== PASSO 3: agendar ADMISSIONAL ===');
  const bodyAg = buildIncluirAgendamento({
    identificacao: ident,
    dadosAgendamento: {
      tipoBuscaEmpresa: 'CODIGO_SOC', codigoEmpresa: String(codigoEmpresa),
      tipoBuscaFuncionario: 'CPF', codigoFuncionario: cpf,
      codigoUsuarioAgenda: String(codigoUsuarioAgenda),
      data, horaInicial: hora, tipoCompromisso: 'ADMISSIONAL', codigoCompromisso: '1',
      reservarCompromissoParaEmpresa: false, usaOutroCompromisso: false, priorizarAtendimento: false,
      usaEnviarEmail: false, usaEnviarSocms: false, convocacaoAgendada: false,
    },
  });
  const rAg = await callSoc({ url: env.SOC_WS_AGENDAMENTO_URL, body: bodyAg, env });
  console.log('HTTP', rAg.status, '| parsed:', JSON.stringify(parseSoapResponse(rAg.xml), null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
