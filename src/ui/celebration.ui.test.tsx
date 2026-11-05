import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { popBack } from '../platform/backStack';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { CELEBRATION_MS, TEMPO, celebrate, celebrationTiming } from './celebrate';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const ORDER = [
  { id: 'inicial', rank: 1 }, { id: 'bronze', rank: 1 }, { id: 'prata', rank: 1 }, { id: 'ouro', rank: 1 }, { id: 'platina', rank: 1 },
  { id: 'diamante', rank: 1 }, { id: 'diamante', rank: 2 }, { id: 'diamante', rank: 3 }, { id: 'diamante', rank: 4 },
];

describe('9. comemorações de categoria: etapas, pausa e acessibilidade', () => {
  it('mais calmas que antes e progressivamente mais longas de Inicial até os graus do Diamante', () => {
    const totals = ORDER.map((t) => celebrationTiming(t, false).total);
    for (let i = 1; i < totals.length; i++) expect(totals[i]!).toBeGreaterThan(totals[i - 1]!);
    expect(TEMPO).toBeGreaterThan(1.5);
    expect(CELEBRATION_MS.inicial).toBeGreaterThan(1000); // antes: 700 ms
    for (const t of ORDER) {
      const tm = celebrationTiming(t, false);
      expect(tm.hold).toBeGreaterThanOrEqual(1400); // pausa para contemplar o medalhão pronto
      expect(tm.textAt).toBeLessThan(tm.build); // título entra no fim da montagem
      expect(tm.total).toBeLessThan(9000); // nunca longa a ponto de atrapalhar
    }
  });

  it('com "Reduzir animações": só um esmaecer, sem movimento, e tempo de leitura igual para todas', () => {
    for (const t of ORDER) expect(celebrationTiming(t, true)).toEqual({ build: 160, textAt: 0, hold: 2200, total: 2360 });
    const calls: Keyframe[][] = [];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.tier = 'diamante';
    Object.assign(svg, { getAnimations: () => [], animate: (kf: Keyframe[]) => { calls.push(kf); return {} as Animation; } });
    celebrate(svg, { reduce: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.every((k) => Object.keys(k).every((p) => p === 'opacity'))).toBe(true);
  });

  async function evolution(motion?: 'reduzir') {
    const dbName = `cel-${Math.random()}`;
    const s = await AppService.load(await createIndexedDbAdapter(dbName));
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    if (motion) await s.updateDevicePrefs({ motion });
    window.location.hash = '#/evolucao';
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    return { user: userEvent.setup(), reload: async () => AppService.load(await createIndexedDbAdapter(dbName)) };
  }

  it('rever pela trilha abre a comemoração; Voltar do Android fecha; não fica comemoração pendente', async () => {
    const { user, reload } = await evolution();
    await user.click(await screen.findByRole('button', { name: /inicial: você está aqui/i }));
    const layer = document.querySelector('[data-celebration]')!;
    expect(layer).not.toBeNull();
    expect(Number(layer.getAttribute('data-hold'))).toBeGreaterThanOrEqual(1400);
    expect(layer.getAttribute('aria-hidden')).toBe('true'); // decorativa: leitor de tela não fica preso nela
    act(() => { expect(popBack()).toBe(true); });
    await waitFor(() => expect(document.querySelector('[data-celebration]')).toBeNull());
    expect((await reload()).celebrationDue()).toBeNull();
  });

  it('com "Reduzir animações" a camada usa a versão sem movimento', async () => {
    const { user } = await evolution('reduzir');
    await user.click(await screen.findByRole('button', { name: /inicial: você está aqui/i }));
    const layer = document.querySelector('[data-celebration]')!;
    expect(layer.getAttribute('data-build')).toBe('160');
    expect(layer.querySelector('.animate-fade-up')).toBeNull();
  });
});
