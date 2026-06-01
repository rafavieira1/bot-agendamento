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
      const lines = [`# ${nome} (run ${run})`, '', `**Outcome:** ${outcome.derived} · **Pass:** ${result.pass}`, ''];
      for (const ev of log) {
        if (ev.kind === 'visible') lines.push(`${ev.who === 'cliente' ? '👤 Cliente' : '🤖 Bot'}: ${ev.text}`, '');
        else if (ev.kind === 'tool_call') lines.push(`🔧 \`${ev.tool}\` args: \`${JSON.stringify(ev.args)}\``);
        else if (ev.kind === 'tool_result') lines.push(`   ↳ result: \`${JSON.stringify(ev.result)}\``, '');
      }
      if (!result.pass) lines.push('', '## Falhas', ...result.falhas.map((f) => `- ${f}`));
      writeFileSync(path.join(dir, `${base}.md`), lines.join('\n'));
      // json máquina (Set não serializa — espalha toolsCalled pra array)
      const outcomeJson = { ...outcome, toolsCalled: [...(outcome.toolsCalled || [])] };
      writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ nome, run, outcome: outcomeJson, result, log }, null, 2));
      // linha no summary (escapa | das falhas pra não quebrar a coluna da tabela)
      const tools = [...(outcome.toolsCalled || [])].join(', ');
      const falhas = result.falhas.map((f) => f.replace(/\|/g, '\\|')).join('; ');
      appendFileSync(summaryPath, `| ${nome} | ${run} | ${result.pass ? '✅' : '❌'} | ${outcome.derived} | ${tools} | ${turns} | ${falhas} |\n`);
    },
  };
}
