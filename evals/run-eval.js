import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from './harness/env.js';
import { createSession } from './harness/session.js';
import { wf1Step } from './harness/wf1-layer.js';
import { runAgentInvocation } from './harness/agent-runner.js';
import { customerReply } from './harness/customer.js';
import { runAssertions, deriveOutcome } from './harness/assert.js';
import { createRecorder } from './harness/recorder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOJE = new Date().toISOString().slice(0, 10);
const MAX_TURNS = 20;

function parseArgs(argv) {
  const out = { only: null, repeat: 1, assert: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') out.only = argv[++i];
    else if (argv[i] === '--repeat') out.repeat = Number(argv[++i]) || 1;
    else if (argv[i] === '--no-assert') out.assert = false;
  }
  return out;
}

async function loadScenarios(only) {
  const dir = path.join(__dirname, 'scenarios');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const scenarios = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    const s = mod.default;
    const wanted = only ? only.split(',').map((x) => x.trim()).filter(Boolean) : null;
    if (!wanted || wanted.includes(s.nome)) scenarios.push(s);
  }
  return scenarios;
}

async function runScenario(cenario, env, recorder, run, doAssert = true) {
  const session = createSession({ telefone: '5519999990000', status: 'coletando' });
  const log = [];
  const outcome = { toolsCalled: new Set(), agendamento_efetuado: false, transferido: false, handoff_motivo: null };
  const recordVisible = (who, text) => log.push({ kind: 'visible', who, text });
  const ctx = { env, mocks: cenario.mocks || {}, outcome, recordVisible, log: (e) => log.push(e) };

  let turns = 0;
  while (turns < MAX_TURNS) {
    turns++;
    // cliente fala
    const visivel = log.filter((e) => e.kind === 'visible').map((e) => ({ who: e.who, text: e.text }));
    const fala = await customerReply({ env, cliente: cenario.cliente, visivel, hoje: HOJE });
    const stop = / *<STOP>/i.test(fala);
    const falaLimpa = fala.replace(/ *<STOP>/i, '').trim();
    if (falaLimpa) recordVisible('cliente', falaLimpa);

    // camada WF1
    const wf1 = wf1Step({ conversa: session.conversa, texto: falaLimpa });
    if (wf1.dropped) break; // transferido: bot mudo
    if (wf1.newStatus) session.setStatus(wf1.newStatus);
    if (falaLimpa) session.appendUser(falaLimpa);

    // invocação do agente
    if (falaLimpa) await runAgentInvocation({ session, hint: wf1.hint, hoje: HOJE, ctx });

    if (outcome.transferido) break;
    if (stop) break;
  }

  outcome.derived = deriveOutcome(outcome);
  const result = (doAssert && cenario.espera) ? runAssertions(cenario, outcome) : { pass: true, falhas: [] };
  recorder.writeScenario(cenario.nome, run, log, outcome, result, turns);
  return result.pass;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const scenarios = await loadScenarios(opts.only);
  const recorder = createRecorder(path.join(__dirname, 'runs'));
  let pass = 0, fail = 0;

  for (const cenario of scenarios) {
    for (let run = 1; run <= opts.repeat; run++) {
      try {
        const ok = await runScenario(cenario, env, recorder, run, opts.assert);
        if (ok) { pass++; console.log(`PASS ${cenario.nome} (run ${run})`); }
        else { fail++; console.log(`FAIL ${cenario.nome} (run ${run})`); }
      } catch (e) {
        fail++; console.log(`ERROR ${cenario.nome} (run ${run}): ${e.message}\n${e.stack || ''}`);
      }
    }
  }
  console.log(`\n${pass}/${pass + fail} runs passando — transcripts em ${recorder.dir}`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
