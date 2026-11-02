import { defineConfig } from 'vitest/config';

// Testes contra o emulador oficial do Firestore (regras de segurança e
// sincronização real). Executados por `npm run test:emulator` no CI.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.emulator.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
