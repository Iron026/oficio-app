import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// Testes contra o emulador oficial do Firestore (regras de segurança e
// sincronização real). Executados por `npm run test:emulator` no CI.
export default defineConfig({
  // Mesma constante do app (vite.config.ts): o backup registra a versão que o gerou.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
