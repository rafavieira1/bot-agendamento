import { readFileSync } from 'node:fs';

// Carrega o .env da raiz do repo. Strip de comentário inline obrigatório (gotcha 2 do CLAUDE.md).
export function loadEnv() {
  const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].replace(/\s+#.*$/, '').trim();
  }
  return env;
}
