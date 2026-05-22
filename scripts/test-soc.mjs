#!/usr/bin/env node
// Test direto SOC: buscar funcionário + (opcional) agendar
// uso: node scripts/test-soc.mjs <cpf> <data DD/MM/AAAA> <hora HH:MM> <tipo PERIODICO|DEMISSIONAL>
// ex:  node scripts/test-soc.mjs 70372002048 28/05/2026 08:00 PERIODICO

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildSecurityHeader } from '../src/soap/ws-security.js';
import { buildEnvelope } from '../src/soap/envelope.js';
import { buildImportacaoFuncionario } from '../src/soap/xml-builders/importacao-funcionario.js';
import { buildIncluirAgendamento } from '../src/soap/xml-builders/incluir-agendamento.js';
import { parseSoapResponse } from '../src/soap/response-parser.js';

function loadEnv() {
  const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].replace(/\s+#.*$/, '').trim();
    env[k] = v;
  }
  return env;
}

async function callSoc({ url, body, env }) {
  const sec = buildSecurityHeader({
    codigoUsuario: env.SOC_CODIGO_USUARIO,
    password: env.SOC_WS_PASSWORD || env.SOC_PASSWORD,
  });
  const envelope = buildEnvelope({ securityHeaderXml: sec, bodyXml: body });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: envelope,
  });
  const buf = Buffer.from(await r.arrayBuffer());
  let xml;
  try { xml = gunzipSync(buf).toString('utf8'); } catch { xml = buf.toString('utf8'); }
  return { status: r.status, xml };
}

async function main() {
  const [, , cpfRaw, data, hora, tipo = 'PERIODICO'] = process.argv;
  if (!cpfRaw || !data || !hora) {
    console.error('uso: node scripts/test-soc.mjs <cpf> <data DD/MM/AAAA> <hora HH:MM> [tipo]');
    process.exit(1);
  }
  const cpf = cpfRaw.replace(/\D/g, '');
  const env = loadEnv();
  const codigoEmpresa = 291130; // EMPRESA TESTE ALFA
  const codigoUsuarioAgenda = 1463919; // teste carlos

  const ident = {
    codigoEmpresaPrincipal: env.SOC_EMPRESA,
    codigoResponsavel: env.SOC_WS_CODIGO_RESPONSAVEL,
    codigoUsuario: 'U' + env.SOC_CODIGO_USUARIO,
  };

  console.log('\n=== PASSO 1: buscar_funcionario (probe) ===');
  const bodyBF = buildImportacaoFuncionario({
    identificacao: ident,
    flags: { criarFuncionario: false, atualizarFuncionario: false },
    funcionario: {
      codigoEmpresa: String(codigoEmpresa),
      tipoBuscaEmpresa: 'CODIGO_SOC',
      chaveProcuraFuncionario: 'CPF_ATIVO',
      cpf,
    },
  });
  const r1 = await callSoc({ url: env.SOC_WS_FUNCIONARIO_URL, body: bodyBF, env });
  const p1 = parseSoapResponse(r1.xml);
  console.log('HTTP', r1.status, '| parsed:', JSON.stringify(p1, null, 2));

  if (p1.kind !== 'success' || !p1.encontrouFuncionario) {
    console.log('\n[STOP] Funcionário não encontrado. Não vou agendar.');
    return;
  }

  console.log('\n=== PASSO 2: agendar_no_soc ===');
  const bodyAG = buildIncluirAgendamento({
    identificacao: ident,
    dadosAgendamento: {
      tipoBuscaEmpresa: 'CODIGO_SOC',
      codigoEmpresa: String(codigoEmpresa),
      tipoBuscaFuncionario: 'CPF_ATIVO',
      codigoFuncionario: cpf,
      codigoUsuarioAgenda: String(codigoUsuarioAgenda),
      data,
      horaInicial: hora,
      tipoCompromisso: tipo,
      codigoCompromisso: '1',
      reservarCompromissoParaEmpresa: false,
      usaOutroCompromisso: false,
      priorizarAtendimento: false,
      usaEnviarEmail: false,
      usaEnviarSocms: false,
      convocacaoAgendada: false,
    },
  });
  const r2 = await callSoc({ url: env.SOC_WS_AGENDAMENTO_URL, body: bodyAG, env });
  const p2 = parseSoapResponse(r2.xml);
  console.log('HTTP', r2.status, '| parsed:', JSON.stringify(p2, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
