/**
 * 0.5.0-beta.5 — Painel personalizável no serviço e na sincronização: persiste ao reabrir, sincroniza entre aparelhos,
 * mudanças offline em aparelhos diferentes não se perdem, não toca em dados nem em XP, funciona sem conta.
 */
import { dashboardEntries, effectiveOrder, moveCard, readDashboard, resetDashboard, setCardVisible } from '../domain/dashboard';
import { totalXp } from '../gamification/engine';
import { createMemoryAdapter } from '../storage/memory';
import { MemoryRemote } from '../sync/memoryRemote';
import { SyncEngine } from '../sync/engine';
import { TrackedStorage } from '../sync/tracked';
import { AppService } from './service';

let clock = new Date(2026, 10, 12, 9, 0);
const now = () => clock;
const tick = () => { clock = new Date(clock.getTime() + 60_000); };
const visible = (s: AppService) => dashboardEntries(readDashboard(s.data.settings.dashboard)).filter((e) => e.visible).map((e) => e.id);

async function device(remote: MemoryRemote, storage = createMemoryAdapter()) {
  const tracked = new TrackedStorage(storage);
  const service = await AppService.load(tracked, now);
  const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => !remote.offline });
  return { service, sync };
}
async function pair() {
  const remote = new MemoryRemote();
  const a = await device(remote);
  await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await a.sync.setUser('u');
  await a.sync.link('u', 'mesclar');
  const b = await device(remote);
  await b.sync.setUser('u');
  await b.sync.link('u', 'usarNuvem');
  return { remote, a, b };
}
const all = async (...ds: { sync: SyncEngine }[]) => { for (let i = 0; i < 2; i++) for (const d of ds) await d.sync.sync(); };

describe('Painel no serviço (sem conta)', () => {
  it('persiste ao reabrir; não altera dados, totais nem XP', async () => {
    const storage = createMemoryAdapter();
    const s = await AppService.load(storage, now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await s.saveTransaction({ type: 'receita', amount: '100,00', description: 'x', category: 'Serviço', date: '2026-11-12' });
    const before = { tx: JSON.stringify(s.data.transactions), xp: totalXp(s.data.xpEvents), events: s.data.xpEvents.length };
    await s.updateDashboard((l, at) => setCardVisible(l, 'nivel', false, at));
    await s.updateDashboard((l, at) => setCardVisible(l, 'receber', true, at));
    await s.updateDashboard((l, at) => moveCard(l, 'proximos', -1, at));
    const again = await AppService.load(storage, now);
    expect(visible(again)).toEqual(visible(s));
    expect(visible(again)).toContain('receber');
    expect(visible(again)).not.toContain('nivel');
    expect(JSON.stringify(again.data.transactions)).toBe(before.tx);
    expect(totalXp(again.data.xpEvents)).toBe(before.xp);
    expect(again.data.xpEvents).toHaveLength(before.events);
    await again.updateDashboard((l, at) => resetDashboard(l, at));
    expect(visible(again)).toEqual(['saldo', 'movimento', 'nivel', 'atalhos', 'semana', 'proximos', 'missoes', 'dica']);
  });

  it('toques rápidos seguidos não se perdem (fila do serviço)', async () => {
    const s = await AppService.load(createMemoryAdapter(), now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await Promise.all([
      s.updateDashboard((l, at) => moveCard(l, 'dica', -1, at)),
      s.updateDashboard((l, at) => moveCard(l, 'dica', -1, at)),
      s.updateDashboard((l, at) => setCardVisible(l, 'missoes', false, at)),
    ]);
    const order = effectiveOrder(readDashboard(s.data.settings.dashboard));
    expect(order.indexOf('dica')).toBe(order.length - 3);
    expect(visible(s)).not.toContain('missoes');
  });

  it('backup leva a organização do Painel junto (preferência da conta)', async () => {
    const s = await AppService.load(createMemoryAdapter(), now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await s.updateDashboard((l, at) => setCardVisible(l, 'dica', false, at));
    const other = await AppService.load(createMemoryAdapter(), now);
    await other.importBackup(s.exportBackup());
    expect(visible(other)).not.toContain('dica');
  });
});

describe('Painel entre aparelhos', () => {
  beforeEach(() => { clock = new Date(2026, 10, 12, 9, 0); });

  it('mudança em um aparelho chega ao outro', async () => {
    const { a, b } = await pair();
    await a.service.updateDashboard((l, at) => setCardVisible(l, 'receber', true, at));
    await all(a, b);
    expect(visible(b.service)).toContain('receber');
  });

  it('offline: um oculta, outro reordena — as duas mudanças ficam nos dois aparelhos', async () => {
    const { remote, a, b } = await pair();
    await all(a, b);
    remote.offline = true;
    await a.service.updateDashboard((l, at) => setCardVisible(l, 'missoes', false, at));
    tick();
    // Sobe "Próximos" três posições (passa por "Meta do mês" e "A receber", ocultos, e por "Semana").
    for (let i = 0; i < 3; i++) await b.service.updateDashboard((l, at) => moveCard(l, 'proximos', -1, at));
    remote.offline = false;
    await all(a, b);
    for (const d of [a, b]) {
      expect(visible(d.service)).not.toContain('missoes');
      const order = effectiveOrder(readDashboard(d.service.data.settings.dashboard));
      expect(order.indexOf('proximos')).toBeLessThan(order.indexOf('semana'));
    }
    expect(a.service.data.settings.dashboard).toEqual(b.service.data.settings.dashboard);
    expect(a.sync.conflicts).toHaveLength(0);
  });

  it('offline: cada um oculta um cartão diferente — os dois ficam ocultos', async () => {
    const { remote, a, b } = await pair();
    await all(a, b);
    remote.offline = true;
    await a.service.updateDashboard((l, at) => setCardVisible(l, 'missoes', false, at));
    tick();
    await b.service.updateDashboard((l, at) => setCardVisible(l, 'dica', false, at));
    remote.offline = false;
    await all(a, b);
    for (const d of [a, b]) {
      expect(visible(d.service)).not.toContain('missoes');
      expect(visible(d.service)).not.toContain('dica');
    }
  });

  it('aparelho na beta.4 (sem o Painel) preserva o layout ao mudar outra preferência', async () => {
    const { a, b } = await pair();
    await a.service.updateDashboard((l, at) => setCardVisible(l, 'dica', false, at));
    await all(a, b);
    // A beta.4 só conhece `accent`: grava as preferências inteiras com o campo que veio da nuvem.
    await b.service.updateSettings({ accent: 'oceano' });
    await all(a, b);
    expect(a.service.data.settings.accent).toBe('oceano');
    expect(visible(a.service)).not.toContain('dica');
  });
});
