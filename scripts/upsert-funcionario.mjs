// scripts/upsert-funcionario.mjs
// One-off: cadastra/atualiza funcionario no SOC (criar+atualizar=true) deriva hierarquia do exporta dados.
// uso: node scripts/upsert-funcionario.mjs
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildSecurityHeader } from '../src/soap/ws-security.js';
import { buildEnvelope } from '../src/soap/envelope.js';
import { buildImportacaoFuncionario } from '../src/soap/xml-builders/importacao-funcionario.js';
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
  const buf = Buffer.from(await r.arrayBuffer());
  return JSON.parse(buf.toString('latin1'));
}

async function main() {
  const env = loadEnv();
  // dados exatos que o bot coletou (mensagens.tool_args do cadastrar_funcionario, conversa 65f169f6)
  const args = {
    codigo_empresa: 291130, cpf: '57782554039', nome: 'Rafael Vieira',
    data_nascimento: '03/12/2002', sexo: 'MASCULINO', estado_civil: 'SOLTEIRO',
    ctps: {}, data_admissao: '29/05/2026', unidade: 'Safe T', setor: 'administracao', cargo: 'motorista',
  };
  const cpf = stripDigits(args.cpf);
  const ident = { codigoEmpresaPrincipal: env.SOC_EMPRESA, codigoResponsavel: env.SOC_WS_CODIGO_RESPONSAVEL, codigoUsuario: 'U' + env.SOC_CODIGO_USUARIO };

  const rows = await fetchHierarquia(env, args.codigo_empresa);
  const hier = matchHierarquia(rows, { unidade: args.unidade, setor: args.setor, cargo: args.cargo });
  console.log('hierarquia match:', JSON.stringify(hier));
  if (!hier.valido) { console.log('[STOP] hierarquia nao encontrada'); return; }

  const body = buildImportacaoFuncionario({
    identificacao: ident,
    flags: { criarFuncionario: true, atualizarFuncionario: true, criarSetor: false, criarCargo: false, criarUnidade: false },
    funcionario: {
      codigoEmpresa: String(args.codigo_empresa), tipoBuscaEmpresa: 'CODIGO_SOC', chaveProcuraFuncionario: 'CPF',
      cpf, naoPossuiMatricula: true, nomeFuncionario: args.nome, dataNascimento: args.data_nascimento,
      dataAdmissao: args.data_admissao, sexo: args.sexo, estadoCivil: args.estado_civil,
      regimeTrabalho: 'NORMAL', tipoContratacao: 'CLT', situacao: 'ATIVO', codigoCategoriaESocial: 101,
      nrCtps: args.ctps.nr, serieCtps: args.ctps.serie, ufCtps: args.ctps.uf,
    },
    unidade: { nome: hier.unidade_canonica, tipoBusca: 'NOME' },
    setor: { nome: hier.setor_canonico, tipoBusca: 'NOME' },
    cargo: { nome: hier.cargo_canonico, tipoBusca: 'NOME', cbo: hier.cbo },
  });
  const r = await callSoc({ url: env.SOC_WS_FUNCIONARIO_URL, body, env });
  console.log('HTTP', r.status, '| parsed:', JSON.stringify(parseSoapResponse(r.xml), null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
