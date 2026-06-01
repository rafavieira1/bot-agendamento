import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // vitest 4 + Windows: pool 'threads' (default) quebra com "Cannot read properties
    // of undefined (reading 'config')" ao rodar multiplos arquivos. forks funciona.
    pool: 'forks',
  },
});
