import type { XpEvent } from '../domain/types';
import { signed } from '../test/backupFile';
import { createMemoryAdapter } from '../storage/memory';
import { AppService } from '../state/service';
import { CELEBRATION_KEY, isCelebrationDue, nextCelebration, readCelebration, tierRankValue } from './celebration';
import { totalXpForLevel } from './levels';
import { tierForLevel } from './tiers';

const xp = (n: number): XpEvent => ({ id: `seed-${n}`, key: `seed:${n}`, category: 'meta', xp: n, label: 'Histórico', createdAt: '2026-10-01T10:00:00.000Z' });

describe('comemoração de categoria: regras puras', () => {
  it('ordena categorias e graus do Diamante', () => {
    expect(tierRankValue('bronze:1')).toBeGreaterThan(tierRankValue('inicial:1'));
    expect(tierRankValue('diamante:2')).toBeGreaterThan(tierRankValue('diamante:1'));
    expect(tierRankValue('xyz:1')).toBe(-1);
    expect(readCelebration({ tier: 'nada' })).toBeNull();
  });

  it('só é devida quando a categoria atual passa da última comemorada; nunca volta para trás', () => {
    const ouro = tierForLevel(8);
    expect(isCelebrationDue(ouro, { tier: 'prata:1' })).toBe(true);
    expect(isCelebrationDue(ouro, { tier: 'ouro:1' })).toBe(false);
    expect(isCelebrationDue(ouro, null)).toBe(false); // sem registro: grava em silêncio
    expect(nextCelebration(tierForLevel(5), { tier: 'ouro:1' })).toEqual({ tier: 'ouro:1' });
    expect(isCelebrationDue(tierForLevel(21), { tier: 'diamante:1' })).toBe(true);
  });
});

describe('comemoração de categoria: no app', () => {
  async function serviceWith(xpTotal: number, celebrated?: string) {
    const storage = createMemoryAdapter();
    const s0 = await AppService.load(storage);
    await s0.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await storage.xpEvents.putMany([xp(xpTotal)]);
    if (celebrated === undefined) await storage.kvDelete(CELEBRATION_KEY);
    else await storage.kvSet(CELEBRATION_KEY, { tier: celebrated });
    return { storage, service: await AppService.load(storage) };
  }

  it('quem atualiza com categorias já conquistadas não recebe comemorações (migração silenciosa)', async () => {
    const { service, storage } = await serviceWith(totalXpForLevel(9));
    expect(service.celebrationDue()).toBeNull();
    expect(await storage.kvGet(CELEBRATION_KEY)).toEqual({ tier: 'ouro:1' });
  });

  it('categoria que subiu por sincronização é comemorada uma vez; depois não repete', async () => {
    const { service } = await serviceWith(totalXpForLevel(9), 'prata:1');
    expect(service.celebrationDue()?.id).toBe('ouro');
    await service.recordCelebration();
    expect(service.celebrationDue()).toBeNull();
    const again = await AppService.load((service as unknown as { storage: ReturnType<typeof createMemoryAdapter> }).storage);
    expect(again.celebrationDue()).toBeNull(); // reabrir o app não repete
  });

  it('backup importado não gera comemoração; apagar tudo limpa o registro', async () => {
    const { service, storage } = await serviceWith(totalXpForLevel(3), 'bronze:1');
    const backup = JSON.parse(service.exportBackup()) as { data: { xpEvents: XpEvent[] } };
    backup.data.xpEvents.push(xp(totalXpForLevel(13)));
    await service.importBackup(signed(backup));
    expect(service.celebrationDue()).toBeNull();
    expect(await storage.kvGet(CELEBRATION_KEY)).toEqual({ tier: 'platina:1' });
    await service.resetAll();
    expect(await storage.kvGet(CELEBRATION_KEY)).toBeUndefined();
  });

  it('ação local que sobe a categoria informa tierUp (a interface comemora e grava)', async () => {
    const { service } = await serviceWith(totalXpForLevel(3) - 5, 'inicial:1');
    const { feedback } = await service.saveClient({ name: 'Maria', phone: '', email: '', address: '', notes: '' });
    expect(feedback.tierUp?.id).toBe('bronze');
    expect(service.celebrationDue()?.id).toBe('bronze');
    await service.recordCelebration();
    expect(service.celebrationDue()).toBeNull();
  });
});
