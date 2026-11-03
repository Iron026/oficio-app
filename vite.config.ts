/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// Caminho base dos arquivos publicados:
// - GitHub Pages: o workflow define VITE_BASE=/oficio-app/
//   (https://iron026.github.io/oficio-app/).
// - Padrão './' (caminhos relativos): funciona no Capacitor (Android),
//   em arquivo único e em qualquer subpasta.
const base = process.env.VITE_BASE || './';

export default defineConfig(({ mode }) => ({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/*.emulator.test.ts'],
    css: false,
  },
}));
