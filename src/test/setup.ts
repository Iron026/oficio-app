import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

// Isolamento entre testes: desmonta o que foi renderizado (o que dispara a limpeza dos
// componentes, inclusive temporizadores) e garante que nenhum teste deixe relógio simulado ativo.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
