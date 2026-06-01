import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

// Cria a pasta da run e grava md/json por cenário + summary.md.
export function createRecorder(rootDir) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(rootDir, ts);
  mkdirSync(dir, { recursive: true });
  const summaryPath = path.join(dir, 'summary.md');
  writeFileSync(summaryPath, `# Eval run ${ts}\n\n| Cenário | Run | Pass | Outcome | Tools | Turns | Falhas |\n|---|---|---|---|---|---|---|\n`);

  return {
    dir,
    writeScenario(nome, run, log, outcome, result, turns) {
      const base = `${nome}${run ? '_run' + run : ''}`;
      // markdown legível
      const lines = [`# ${nome} (run ${run})`, '', `**Outcome:** ${outcome} · **Pass:** ${result.pass}`, ''];
      for (const ev of log) {
        if (ev.kind === 'visible') lines.push(`${ev.who === 'cliente' ? '👤 Cliente' : '🤖 Bot'}: ${ev.text}`, '');
        else if (ev.kind === 'tool_call') lines.push(`🔧 \`${ev.tool}\` args: \`${JSON.stringify(ev.args)}\``);
        else if (ev.kind === 'tool_result') lines.push(`   ↳ result: \`${JSON.stringify(ev.result)}\``, '');
      }
      if (!result.pass) lines.push('', '## Falhas', ...result.falhas.map((f) => `- ${f}`));
      writeFileSync(path.join(dir, `${base}.md`), lines.join('\n'));
      // json máquina
      writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ nome, run, outcome, result, log }, null, 2));
      // linha no summary
      const tools = [...(outcome.toolsCalled || [])].join(', ');
      appendFileSync(summaryPath, `| ${nome} | ${run} | ${result.pass ? '✅' : '❌'} | ${outcome.derived} | ${tools} | ${turns} | ${result.falhas.join('; ')} |\n`);
    },
  };
}
