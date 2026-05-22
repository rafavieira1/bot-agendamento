import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const N8N_EVAL_URL = process.env.N8N_EVAL_URL;

if (!N8N_EVAL_URL) {
  console.error('Set N8N_EVAL_URL env var pointing to the eval webhook (ver Task 31 step 2 do plano).');
  process.exit(1);
}

const DIR = path.join(__dirname, 'transcripts');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
let pass = 0;
let fail = 0;

for (const file of files) {
  const transcript = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  let res;
  try {
    res = await fetch(N8N_EVAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
  } catch (err) {
    console.log(`FAIL ${file}: HTTP request failed —`, err.message);
    fail++;
    continue;
  }

  if (!res.ok) {
    console.log(`FAIL ${file}: HTTP ${res.status}`);
    fail++;
    continue;
  }

  const out = await res.json();

  let ok = true;
  for (let i = 0; i < transcript.turns.length; i++) {
    const expected = transcript.turns[i];
    const actual = (out.turns && out.turns[i]) || {};

    if (expected.expected_tools) {
      const missing = expected.expected_tools.filter(t => !(actual.tools_called || []).includes(t));
      if (missing.length) {
        ok = false;
        console.log(`FAIL ${file} turn ${i}: missing tools`, missing);
      }
    }

    if (expected.expected_status_after && actual.status !== expected.expected_status_after) {
      ok = false;
      console.log(`FAIL ${file} turn ${i}: status ${actual.status} != ${expected.expected_status_after}`);
    }
  }

  if (ok) {
    pass++;
    console.log(`PASS ${file}`);
  } else {
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} transcripts passing`);
process.exit(fail > 0 ? 1 : 0);
