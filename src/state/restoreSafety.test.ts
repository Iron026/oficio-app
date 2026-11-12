/**
 * 0.5.0-beta.5 — restauração segura com conta conectada: se a gravação local falhar no meio, nada muda no aparelho
 * e a nuvem não recebe exclusões nem pendências da importação que não aconteceu.
 */
import { createMemoryAdapter } from '../storage/memory';
import type { StorageAdapter } from '../storage/types';
import { MemoryRemote } from '../sync/memoryRemote';
import { SyncEngine } from '../sync/engine';
import { TrackedStorage } from '../sync/tracked';
import { AppService } from './service';

const now = () => new Date(2026, 10, 12, 9, 0);

function failingOnce(inner: StorageAdapter): StorageAdapter & { failNext: boolean } {
  const s = Object.create(inner) as StorageAdapter & { failNext: boolean };
  s.failNext = false;
  s.replaceAll = async (data) => {
    if (s.failNext) { s.failNext = false; throw new Error('Falha de gravação simulada'); }
    return inner.replaceAll(data);
  };
  return s;
}

async function linkedDevice(remote: MemoryRemote) {
  const raw = failingOnce(createMemoryAdapter());
  const tracked = new TrackedStorage(raw);
  const service = await AppService.load(tracked, now);
  const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => true });
  await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await sync.setUser('u');
  await sync.link('u', 'mesclar');
  return { raw, service, sync };
}

describe('restauração com conta: falha no meio não deixa a conta incoerente', () => {
  it('gravação local falha → dados do aparelho iguais, nenhuma exclusão enviada à nuvem', async () => {
    const remote = new MemoryRemote();
    const { raw, service, sync } = await linkedDevice(remote);
    const a = (await service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-12', time: '', price: '80,00', notes: '' })).appointment;
    const { transaction: p } = await service.registerPayment(a.id, { amount: 8_000 });
    await service.refundPayment(p!.id, { amount: 2_000 });
    await sync.sync();
    const cloudBefore = await remote.pull('u', 0);
    const liveBefore = cloudBefore.records.filter((r) => r.data !== null).length;

    // Backup antigo: sem o atendimento, o pagamento e o estorno.
    const other = await AppService.load(createMemoryAdapter(), now);
    await other.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const backup = other.exportBackup();

    const before = JSON.stringify(service.data);
    raw.failNext = true;
    await expect(service.importBackup(backup)).rejects.toThrow(/falha de gravação/i);
    expect(JSON.stringify(service.data)).toBe(before);

    await sync.sync();
    const cloudAfter = await remote.pull('u', 0);
    expect(cloudAfter.records.filter((r) => r.data !== null).length).toBe(liveBefore);
    expect(cloudAfter.records.filter((r) => r.collection === 'transactions' && r.data !== null)).toHaveLength(2);
  });

  it('a mesma restauração, sem falha, remove da nuvem o que não está no arquivo (como avisado na tela)', async () => {
    const remote = new MemoryRemote();
    const { service, sync } = await linkedDevice(remote);
    await service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-12', time: '', price: '80,00', notes: '' });
    await sync.sync();
    const other = await AppService.load(createMemoryAdapter(), now);
    await other.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await service.importBackup(other.exportBackup());
    await sync.sync();
    const cloud = await remote.pull('u', 0);
    expect(cloud.records.filter((r) => r.collection === 'appointments' && r.data !== null)).toHaveLength(0);
  });
});
