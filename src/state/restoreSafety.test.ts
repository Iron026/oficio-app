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

describe('revisão independente (beta.5)', () => {
  it('falha ao gravar o estado da sincronização durante a restauração: nada é enviado como exclusão', async () => {
    const remote = new MemoryRemote();
    const inner = createMemoryAdapter();
    let failSyncState = false;
    const raw = Object.create(inner) as StorageAdapter;
    raw.kvSet = async (k: string, v: unknown) => {
      if (failSyncState && k === 'sync:state') { failSyncState = false; throw new Error('Falha ao gravar o estado'); }
      return inner.kvSet(k, v);
    };
    const tracked = new TrackedStorage(raw);
    const service = await AppService.load(tracked, now);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => true });
    await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await sync.setUser('u');
    await sync.link('u', 'mesclar');
    await service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-12', time: '', price: '80,00', notes: '' });
    await sync.sync();
    const other = await AppService.load(createMemoryAdapter(), now);
    await other.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    failSyncState = true;
    await expect(service.importBackup(other.exportBackup())).rejects.toThrow(/estado/);
    expect(service.data.appointments).toHaveLength(1);
    await sync.sync();
    const cloud = await remote.pull('u', 0);
    expect(cloud.records.filter((r) => r.collection === 'appointments' && r.data !== null)).toHaveLength(1);
  });

  it('sincronização durante a gravação local da restauração não envia nada até a gravação terminar', async () => {
    const remote = new MemoryRemote();
    const inner = createMemoryAdapter();
    let release!: () => void;
    let hold = false;
    const raw = Object.create(inner) as StorageAdapter;
    raw.replaceAll = async (data) => {
      if (hold) await new Promise<void>((r) => { release = r; });
      return inner.replaceAll(data);
    };
    const tracked = new TrackedStorage(raw);
    const service = await AppService.load(tracked, now);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => true });
    await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await sync.setUser('u');
    await sync.link('u', 'mesclar');
    await service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-12', time: '', price: '80,00', notes: '' });
    await sync.sync();
    const other = await AppService.load(createMemoryAdapter(), now);
    await other.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    hold = true;
    const pending = service.importBackup(other.exportBackup());
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const during = sync.sync(); // começa no meio da gravação
    const mid = await remote.pull('u', 0);
    expect(mid.records.filter((r) => r.collection === 'appointments' && r.data !== null)).toHaveLength(1);
    release();
    await pending;
    await during;
    await sync.sync();
    const end = await remote.pull('u', 0);
    expect(end.records.filter((r) => r.collection === 'appointments' && r.data !== null)).toHaveLength(0);
  });
});

describe('falha depois da troca dos dados', () => {
  it('erro ao recalcular selos/comemoração não faz a restauração parecer que falhou', async () => {
    const s = await AppService.load(createMemoryAdapter(), now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const other = await AppService.load(createMemoryAdapter(), now);
    await other.completeOnboarding({ name: 'Bia', businessName: '', professionId: 'beleza' });
    const spy = vi.spyOn(s as unknown as { awardSeals: () => Promise<void> }, 'awardSeals').mockRejectedValueOnce(new Error('falha nos selos'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(s.importBackup(other.exportBackup())).resolves.toBeUndefined();
    expect(s.data.profile?.name).toBe('Bia');
    spy.mockRestore();
    err.mockRestore();
  });
});
