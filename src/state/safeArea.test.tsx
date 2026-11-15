/**
 * Estabilização da 0.5.0 — avisos "Error injecting safe area CSS" no logcat do Android. O Capacitor (SystemBars)
 * tenta gravar --safe-area-inset-* antes de a página existir (erro inofensivo, no código do Capacitor) e grava de
 * novo depois que ela aparece. A cor dos ícones da barra de status depende desse valor: o app só reavaliava uma
 * vez, 600 ms depois de montar, e uma injeção mais tarde era ignorada (ícones escuros sobre o cabeçalho verde).
 */
import { render } from '@testing-library/react';
import { useThemeEffect } from './AppContext';

const calls: [boolean, string | undefined][] = [];
vi.mock('../platform/native', async (orig) => ({
  ...(await orig<typeof import('../platform/native')>()),
  setSystemBarsDark: async (dark: boolean, bar?: string) => { calls.push([dark, bar]); },
}));

function Probe() { useThemeEffect('light'); return null; }

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { document.documentElement.style.removeProperty('--safe-area-inset-top'); calls.length = 0; vi.useRealTimers(); });

describe('estabilização 0.5.0: área segura injetada pelo Capacitor', () => {
  it('injeção que chega depois da reavaliação de 600 ms ainda ajusta a barra de status (tela inteira)', async () => {
    vi.useFakeTimers();
    render(<Probe />);
    vi.advanceTimersByTime(1_000);
    expect(calls.at(-1)).toEqual([false, undefined]); // sem área segura: segue o tema do sistema (claro)
    calls.length = 0;
    document.documentElement.style.setProperty('--safe-area-inset-top', '24px'); // injeção tardia do Capacitor
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(calls).toContainEqual([true, 'status']); // ícones claros sobre o cabeçalho verde-petróleo
    expect(calls).toContainEqual([false, 'navigation']);
  });
});
