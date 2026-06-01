// scripts/probe-funcionario.mjs
// uso: node scripts/probe-funcionario.mjs <cpf>
// sonda (criarFuncionario=false) o funcionario na EMPRESA TESTE ALFA pra ver o que o SOC tem
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildSecurityHeader } from '../src/soap/ws-security.js';
import { buildEnvelope } from '../src/soap/envelope.js';
import { buildImportacaoFuncionario } from '../src/soap/xml-builders/importacao-funcionario.js';
import { parseSoapResponse } from '../src/soap/response-parser.js';
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

async function main() {
  const cpf = stripDigits(process.argv[2] || '');
  if (!cpf) { console.error('uso: node scripts/probe-funcionario.mjs <cpf>'); process.exit(1); }
  const env = loadEnv();
  const codigoEmpresa = 291130;
  const ident = { codigoEmpresaPrincipal: env.SOC_EMPRESA, codigoResponsavel: env.SOC_WS_CODIGO_RESPONSAVEL, codigoUsuario: 'U' + env.SOC_CODIGO_USUARIO };
  const body = buildImportacaoFuncionario({
    identificacao: ident,
    flags: { criarFuncionario: false, atualizarFuncionario: false },
    funcionario: { codigoEmpresa: String(codigoEmpresa), tipoBuscaEmpresa: 'CODIGO_SOC', chaveProcuraFuncionario: 'CPF', cpf },
  });
  const r = await callSoc({ url: env.SOC_WS_FUNCIONARIO_URL, body, env });
  const p = parseSoapResponse(r.xml);
  console.log('HTTP', r.status);
  console.log('parsed:', JSON.stringify(p, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
