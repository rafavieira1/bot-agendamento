import { sb } from '../supabase.js';
import { matchHierarquia } from '../../../src/hierarquia/match.js';

const TEST_UNIDADE = 'teste carlos'; // LS/AG estão hardcoded nessa unidade (verificado 2026-06-01)

// buscar_empresa — read real Supabase. Shape: BE - Output.
export async function buscar_empresa(args, ctx) {
  const cnpj = String(args.cnpj || '').replace(/\D/g, '');
  const rows = await sb(ctx.env, `empresas_cache?cnpj=eq.${cnpj}&limit=1`);
  const row = rows[0];
  if (row && row.codigo_empresa != null) {
    return { ok: true, codigo_empresa: row.codigo_empresa, razao_social: row.razao_social, unidades: row.unidades || [], defaults_funcionario: row.defaults_funcionario || {} };
  }
  return { ok: false, erro: 'empresa_nao_cadastrada' };
}

// buscar_funcionario — read real do cache. Shape: BF - Return Cache / Not Found.
// FIDELITY GAP (documentado na spec): NÃO replica o probe SOC no cache-miss. Cenários usam
// CPFs seedados (cache hit) ou CPFs claramente falsos (not found) — o outcome bate.
export async function buscar_funcionario(args, ctx) {
  const cpf = String(args.cpf || '').replace(/\D/g, '');
  const rows = await sb(ctx.env, `funcionarios_cache?cpf=eq.${cpf}&codigo_empresa=eq.${args.codigo_empresa}&limit=1`);
  const row = rows[0];
  if (row && row.cpf) {
    const out = { ok: true, ativo: row.ativo, from_cache: true };
    if (row.codigo_funcionario != null) out.codigo_funcionario = row.codigo_funcionario;
    return out;
  }
  return { ok: false, erro: 'nao_encontrado' };
}

// validar_hierarquia — read real do SOC Exporta Dados 191874 (latin1 — gotcha 20). Shape VH.
export async function validar_hierarquia(args, ctx) {
  const parametro = JSON.stringify({ empresa: String(args.codigo_empresa), codigo: ctx.env.SOC_EXPORTA_HIERARQUIA_CODIGO, chave: ctx.env.SOC_EXPORTA_HIERARQUIA_CHAVE, tipoSaida: 'json' });
  const url = 'https://ws1.soc.com.br/WebSoc/exportadados?parametro=' + encodeURIComponent(parametro);
  let rows = [];
  try {
    const r = await fetch(url);
    rows = JSON.parse(Buffer.from(await r.arrayBuffer()).toString('latin1'));
  } catch { rows = []; }
  return matchHierarquia(rows, { unidade: args.unidade, setor: args.setor, cargo: args.cargo });
}

// listar_slots — determinístico local por padrão (slots_config menos ocupados); shape LS.
// Override por cenário: mocks.listar_slots.slots = [{data,hora}] força o array (slot ocupado/esgotado).
export async function listar_slots(args, ctx) {
  const mock = ctx.mocks && ctx.mocks.listar_slots;
  if (mock && Array.isArray(mock.slots)) {
    return { ok: true, slots: mock.slots.map((s) => ({ ...s, codigo_usuario_agenda: 1463919 })), sync: { mode: 'mock' } };
  }
  const tipo = encodeURIComponent(args.tipo_compromisso || '');
  const agendas = await sb(ctx.env, `agendas_config?unidade=eq.${encodeURIComponent(TEST_UNIDADE)}&tipo_compromisso=eq.${tipo}&ativo=eq.true&limit=1`);
  const agenda = agendas[0];
  if (!agenda) return { ok: false, erro: 'sem_agenda' };
  const slotsCfg = await sb(ctx.env, `slots_config?agenda_config_id=eq.${agenda.id}&ativo=eq.true&limit=2000`);
  const slots = expandLocalSlots(slotsCfg, args.data_de, args.data_ate, agenda.codigo_usuario_agenda, (mock && mock.ocupados) || []);
  return { ok: true, slots, sync: { mode: 'local_slots_config' } };
}

function dateFromBr(s) { const [d, m, y] = String(s || '').split('/'); return new Date(+y, +m - 1, +d); }
function brFromDate(dt) { return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`; }

function expandLocalSlots(slotsCfg, dataDe, dataAte, codigoAgenda, ocupados) {
  const from = dateFromBr(dataDe);
  const to = dateFromBr(dataAte || dataDe);
  const ocup = new Set(ocupados); // formato 'DD/MM/AAAA|HH:MM' ou 'HH:MM'
  const out = [];
  for (let dt = new Date(from); dt <= to; dt.setDate(dt.getDate() + 1)) {
    const ds = dt.getDay() + 1; // domingo=1 ... sabado=7 (mesma convenção do WF4)
    const dstr = brFromDate(dt);
    for (const s of slotsCfg) {
      if (s.dia_semana === ds) {
        const h = String(s.hora_inicial).slice(0, 5);
        if (!ocup.has(`${dstr}|${h}`) && !ocup.has(h)) out.push({ data: dstr, hora: h, codigo_usuario_agenda: codigoAgenda });
      }
    }
  }
  // ordena por data real (DD/MM/AAAA lexicográfico erra em range cross-month) + hora
  return out.sort((a, b) => (dateFromBr(a.data) - dateFromBr(b.data)) || a.hora.localeCompare(b.hora));
}
