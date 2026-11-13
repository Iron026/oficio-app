/**
 * Auditoria pré-RC (0.5.0) — sincronização interrompida: resposta perdida depois de a nuvem gravar, falha entre lotes
 * de um envio grande e app fechado com pendências. Nada duplica, nada some, nenhum conflito falso.
 */
import { isPayment, isRefund } from '../domain/paymentMarks';
import { createMemoryAdapter } from '../storage/memory';
import type { StorageAdapter } from '../storage/types';
import { AppService } from '../state/service';
import { MemoryRemote } from './memoryRemote';
import { SyncEngine } from './engine';
import { TrackedStorage } from './tracked';
import type { PushItem } from './types';

const now = () => new Date(2026, 10, 12, 9, 0);

/** Nuvem que grava o envio e "perde" a resposta (queda de conexão ou app fechado logo depois). */
class LossyRemote extends MemoryRemote {
  loseNextResponse = false;
  failOnChunk: number | null = null;
  private chunk = 0;
  override async push(uid: string, items: PushItem[], deviceId: string) {
    this.chunk++;
    if (this.failOnChunk !== null && this.chunk === this.failOnChunk) { this.failOnChunk = null; throw new Error('Conexão caiu entre lotes'); }
    const res = await super.push(uid, items, deviceId);
    if (this.loseNextResponse) { this.loseNextResponse = false; throw new Error('Resposta perdida'); }
    return res;
  }
}

async function device(remote: MemoryRemote, storage: StorageAdapter = createMemoryAdapter()) {
  const tracked = new TrackedStorage(storage);
  const service = await AppService.load(tracked, now);
  const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => !remote.offline });
  return { service, sync, storage };
}
const live = async (remote: MemoryRemote) => (await remote.pull('u', 0)).records.filter((r) => r.data !== null);

describe('auditoria pré-RC: sincronização interrompida', () => {
  it('resposta perdida depois de a nuvem gravar pagamento e estorno: reenviar não duplica nem cria conflito', async () => {
    const remote = new LossyRemote();
    const a = await device(remote);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await a.sync.setUser('u');
    await a.sync.link('u', 'mesclar');
    const ap = (await a.service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-10', time: '', price: '100,00', notes: '' })).appointment;
    const { transaction: p } = await a.service.registerPayment(ap.id, { amount: 8_000 });
    await a.service.refundPayment(p!.id, { amount: 1_000 });
    remote.loseNextResponse = true;
    await a.sync.sync().catch(() => undefined);
    await a.sync.sync();
    await a.sync.sync();
    expect(a.sync.conflicts).toEqual([]);
    expect(a.sync.pendingCount).toBe(0);
    const cloudTx = (await live(remote)).filter((r) => r.collection === 'transactions');
    expect(cloudTx).toHaveLength(2);
    expect(a.service.data.transactions.filter(isPayment)).toHaveLength(1);
    expect(a.service.data.transactions.filter(isRefund)).toHaveLength(1);
    const b = await device(remote);
    await b.sync.setUser('u');
    await b.sync.link('u', 'usarNuvem');
    expect(b.service.data.transactions.map((t) => `${t.id}:${t.amount}`).sort()).toEqual(a.service.data.transactions.map((t) => `${t.id}:${t.amount}`).sort());
  });

  it('conexão cai entre lotes de um envio grande: a próxima sincronização completa sem duplicar', async () => {
    const remote = new LossyRemote();
    const a = await device(remote);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    for (let i = 0; i < 120; i++) await a.service.saveClient({ name: `Cliente ${i}`, phone: '', email: '', address: '', notes: '' });
    remote.failOnChunk = 2;
    await a.sync.setUser('u');
    await a.sync.link('u', 'mesclar').catch(() => undefined);
    await a.sync.sync().catch(() => undefined);
    await a.sync.sync();
    const clients = (await live(remote)).filter((r) => r.collection === 'clients');
    expect(clients).toHaveLength(120);
    expect(new Set(clients.map((r) => r.id)).size).toBe(120);
    expect(a.sync.pendingCount).toBe(0);
    expect(a.sync.conflicts).toEqual([]);
  });

  it('app fechado no meio de um envio grande (progresso dos lotes ainda não gravado): ao reabrir, completa sem duplicar nem gerar conflito', async () => {
    const remote = new LossyRemote();
    const storage = createMemoryAdapter();
    const a = await device(remote, storage);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    for (let i = 0; i < 350; i++) await a.service.saveClient({ name: `Cliente ${i}`, phone: '', email: '', address: '', notes: '' });
    remote.failOnChunk = 4; // lotes 1–3 aceitos pela nuvem; o app "fecha" no 4º
    await a.sync.setUser('u');
    await a.sync.link('u', 'mesclar').catch(() => undefined);
    await a.sync.sync().catch(() => undefined);
    a.sync.dispose?.();
    // Reabre a partir do que ficou gravado (o progresso dos lotes 1–3 pode não ter sido salvo).
    const again = await device(remote, storage);
    await again.sync.setUser('u');
    await again.sync.sync();
    await again.sync.sync();
    const clients = (await live(remote)).filter((r) => r.collection === 'clients');
    expect(clients).toHaveLength(350);
    expect(new Set(clients.map((r) => r.id)).size).toBe(350);
    expect(again.sync.pendingCount).toBe(0);
    expect(again.sync.conflicts).toEqual([]);
    expect(again.service.data.clients).toHaveLength(350);
  });

  it('queda no meio de um envio grande grava o progresso dos lotes aceitos (memória e disco não divergem)', async () => {
    const remote = new LossyRemote();
    const storage = createMemoryAdapter();
    const a = await device(remote, storage);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await a.sync.setUser('u');
    await a.sync.link('u', 'mesclar');
    for (let i = 0; i < 350; i++) await a.service.saveClient({ name: `Cliente ${i}`, phone: '', email: '', address: '', notes: '' });
    remote.failOnChunk = 4; // lotes 1–3 (300) aceitos; o 4º cai
    const before = a.sync.pendingCount;
    await a.sync.sync().catch(() => undefined);
    const inMemory = a.sync.pendingCount;
    expect(inMemory).toBe(before - 300);
    // O que ficou gravado é o mesmo que está em memória.
    const reopened = await device(remote, storage);
    expect(reopened.sync.pendingCount).toBe(inMemory);
  });

  it('app fechado com pendências offline: ao abrir de novo, envia uma única vez', async () => {
    const remote = new LossyRemote();
    const storage = createMemoryAdapter();
    const a = await device(remote, storage);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await a.sync.setUser('u');
    await a.sync.link('u', 'mesclar');
    remote.offline = true;
    const ap = (await a.service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-10', time: '', price: '100,00', notes: '' })).appointment;
    await a.service.registerPayment(ap.id, { amount: 5_000 });
    await a.sync.sync().catch(() => undefined);
    a.sync.dispose?.();
    // Reabre o app (mesmo armazenamento): a pendência continua e vai uma vez só.
    remote.offline = false;
    const again = await device(remote, storage);
    await again.sync.setUser('u');
    await again.sync.sync();
    await again.sync.sync();
    expect((await live(remote)).filter((r) => r.collection === 'transactions')).toHaveLength(1);
    expect(again.sync.pendingCount).toBe(0);
    expect(again.sync.conflicts).toEqual([]);
  });
});
