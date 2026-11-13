/**
 * Auditoria pré-RC (0.5.0) — custo da sincronização com volume. Cada alteração local gravava de novo o estado
 * inteiro da sincronização (que guarda a base de todos os registros); gravações em lote (ex.: ocorrências de
 * séries geradas ao abrir o app, serviços de um cliente excluído) faziam isso uma vez POR registro, e o envio
 * procurava cada registro com uma busca linear. Medido: 0,9 s → 12,8 s por alteração entre 6 mil e 60 mil
 * registros; envio inicial 1,6 s → 149 s.
 */
import { createMemoryAdapter } from '../storage/memory';
import type { StorageAdapter } from '../storage/types';
import { AppService } from '../state/service';
import { MemoryRemote } from './memoryRemote';
import { SyncEngine } from './engine';
import { TrackedStorage } from './tracked';

let clock = new Date(2026, 10, 2, 9, 0);
const now = () => clock;

function counting(inner: StorageAdapter) {
  const counter = { stateWrites: 0 };
  const kvSet = inner.kvSet.bind(inner);
  inner.kvSet = async (k: string, v: unknown) => { if (k === 'sync:state') counter.stateWrites++; return kvSet(k, v); };
  return { storage: inner, counter };
}

async function linked() {
  const { storage, counter } = counting(createMemoryAdapter());
  const tracked = new TrackedStorage(storage);
  const service = await AppService.load(tracked, now);
  await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const remote = new MemoryRemote();
  const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => true });
  await sync.setUser('u');
  await sync.link('u', 'mesclar');
  return { service, sync, counter, remote };
}

describe('auditoria pré-RC: sincronização com volume', () => {
  beforeEach(() => { clock = new Date(2026, 10, 2, 9, 0); });

  it('ocorrências geradas ao abrir o app gravam o estado da sincronização uma vez, não uma por ocorrência', async () => {
    const { service, sync, counter } = await linked();
    for (let i = 0; i < 20; i++) {
      await service.saveAppointment({ title: `Série ${i}`, clientId: '', date: '2026-11-02', time: '10:00', price: '50,00', notes: '', repeat: { freq: 'semanal', interval: '1', days: [1], end: 'nunca', until: '', count: '' } });
    }
    await sync.sync();
    clock = new Date(2026, 11, 14, 9, 0); // seis semanas depois: ~6 ocorrências novas por série
    const before = service.data.appointments.length;
    counter.stateWrites = 0;
    const created = await service.extendSeries();
    expect(created).toBeGreaterThanOrEqual(100);
    expect(service.data.appointments.length).toBe(before + created);
    expect(counter.stateWrites).toBeLessThanOrEqual(2);
    expect(sync.pendingCount).toBe(created);
  });

  it('excluir um cliente com muitos serviços grava o estado uma vez e tudo vai para a nuvem', async () => {
    const { service, sync, counter, remote } = await linked();
    const c = (await service.saveClient({ name: 'Carla', phone: '', email: '', address: '', notes: '' })).client;
    for (let i = 0; i < 60; i++) await service.saveAppointment({ title: `S${i}`, clientId: c.id, date: '2026-11-02', time: '10:00', price: '50,00', notes: '' });
    await sync.sync();
    counter.stateWrites = 0;
    await service.deleteClient(c.id);
    expect(counter.stateWrites).toBeLessThanOrEqual(3);
    await sync.sync();
    const cloud = (await remote.pull('u', 0)).records.filter((r) => r.collection === 'appointments' && r.data);
    expect(cloud).toHaveLength(60);
    expect(cloud.every((r) => (r.data as unknown as { clientId: unknown }).clientId === null)).toBe(true);
  });

  it('envio inicial de 20 mil registros sem busca linear por registro', async () => {
    const { storage } = counting(createMemoryAdapter());
    const tracked = new TrackedStorage(storage);
    const service = await AppService.load(tracked, now);
    await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const base = (await service.saveClient({ name: 'Modelo', phone: '', email: '', address: '', notes: '' })).client;
    await tracked.clients.putMany(Array.from({ length: 20_000 }, (_, i) => ({ ...base, id: `c${i}`, name: `Cliente ${i}` })));
    const reloaded = await AppService.load(tracked, now);
    const remote = new MemoryRemote();
    const sync = await SyncEngine.create(reloaded, tracked, remote, { autoSync: false, now, isOnline: () => true });
    await sync.setUser('u');
    const t0 = performance.now();
    await sync.link('u', 'mesclar');
    const ms = performance.now() - t0;
    expect((await remote.pull('u', 0)).records.filter((r) => r.collection === 'clients')).toHaveLength(20_001);
    expect(sync.pendingCount).toBe(0);
    expect(ms).toBeLessThan(5_000); // antes: ≈ 12 s (estado gravado a cada lote)
  }, 120_000);

  it('usar os dados da nuvem com 200 mil registros não estoura a pilha (cursor calculado sem espalhar argumentos)', async () => {
    const remote = new MemoryRemote();
    const a = await linked();
    const base = (await a.service.saveClient({ name: 'Modelo', phone: '', email: '', address: '', notes: '' })).client;
    await a.sync.sync();
    const items = Array.from({ length: 200_000 }, (_, i) => ({ collection: 'clients' as const, id: `c${i}`, data: { ...base, id: `c${i}` }, expectedRev: 0 }));
    for (let i = 0; i < items.length; i += 20_000) await remote.push('u', items.slice(i, i + 20_000), 'outro');
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, now);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => true });
    await sync.setUser('u');
    await sync.link('u', 'usarNuvem');
    expect(service.data.clients).toHaveLength(200_000);
  }, 120_000);
});
