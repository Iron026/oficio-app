/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Caminho base dos arquivos publicados:
// - GitHub Pages: o workflow define VITE_BASE=/oficio-app/
//   (https://iron026.github.io/oficio-app/).
// - Padrão './' (caminhos relativos): funciona no Capacitor (Android),
//   em arquivo único e em qualquer subpasta.
const base = process.env.VITE_BASE || './';

export default defineConfig(({ mode }) => ({
  base,
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
