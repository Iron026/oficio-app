/**
 * beta.7 — "Desfazer" ao excluir cliente e atendimento. Restaura tudo como estava (campos,
 * vínculos, receita automática), não mexe em XP nem em selos, funciona offline e sincroniza.
 *
 * Comportamento por situação do atendimento excluído:
 *  - agendado: volta agendado, com cliente, data, valor e observações;
 *  - concluído com receita automática: volta concluído e a receita volta com o mesmo vínculo;
 *  - concluído sem receita: volta concluído, "Sem receita lançada" como antes;
 *  - cancelado: volta cancelado;
 *  - com pagamentos da 0.5: os pagamentos nunca saem de Finanças; desfazer devolve o atendimento.
 */
import { totals } from '../domain/finance';
import { totalXp } from '../gamification/engine';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { MemoryRemote } from '../sync/memoryRemote';
import { TrackedStorage } from '../sync/tracked';
import { AppService, UNDO_TTL_MS } from './service';

let clock = new Date(2026, 10, 6, 10, 0);
const now = () => clock;
beforeEach(() => { clock = new Date(2026, 10, 6, 10, 0); });

async function app(storage = createMemoryAdapter()) {
  const s = await AppService.load(storage, now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return s;
}
const client = (s: AppService, name = 'Maria Oliveira') =>
  s.saveClient({ name, phone: '11912340001', email: 'maria@ex.com', address: 'Rua A, 10', notes: 'Prefere manhã' }).then((r) => r.client);
const appt = (s: AppService, clientId = '', title = 'Coloração') =>
  s.saveAppointment({ title, clientId, date: '2026-11-06', time: '14:00', price: '300,00', notes: 'Tom 7' }).then((r) => r.appointment);
const strip = <T extends { updatedAt: string }>(x: T) => ({ ...x, updatedAt: '' });

describe('excluir cliente e desfazer', () => {
  it('devolve o cliente com todos os campos (inclusive desconhecidos) e o vínculo dos atendimentos', async () => {
    const s = await app();
    const c = await client(s);
    // Campo gravado por uma versão mais nova (0.5) também volta.
    const withFuture = { ...s.data.clients[0]!, tags: ['vip'] } as typeof c;
    await (s as unknown as { storage: { clients: { put(x: unknown): Promise<void> } } }).storage.clients.put(withFuture);
    const reloaded = await AppService.load((s as unknown as { storage: never }).storage, now);
    const a1 = await appt(reloaded, c.id);
    const a2 = await appt(reloaded, c.id, 'Corte');
    await reloaded.completeAppointment(a2.id, { registerIncome: true });
    const xp = totalXp(reloaded.data.xpEvents);
    const before = { client: strip(reloaded.data.clients[0]!), appts: reloaded.data.appointments.map(strip) };

    const ticket = await reloaded.deleteClient(c.id);
    expect(ticket).toMatchObject({ label: 'Cliente excluído' });
    expect(reloaded.data.clients).toEqual([]);
    expect(reloaded.data.appointments.every((a) => a.clientId === null)).toBe(true);

    await reloaded.undo(ticket!);
    expect(strip(reloaded.data.clients[0]!)).toEqual(before.client);
    expect((reloaded.data.clients[0] as unknown as { tags: string[] }).tags).toEqual(['vip']);
    expect(reloaded.data.appointments.map(strip)).toEqual(before.appts);
    expect(reloaded.data.appointments.map((a) => a.id)).toEqual([a1.id, a2.id]);
    expect(totalXp(reloaded.data.xpEvents)).toBe(xp); // excluir e desfazer não mexem no XP
  });

  it('persiste ao reabrir; recusa depois do prazo, se o atendimento mudou ou se veio outra ação', async () => {
    const storage = createMemoryAdapter();
    const s = await app(storage);
    const c = await client(s);
    await s.undo((await s.deleteClient(c.id))!);
    expect((await AppService.load(storage, now)).data.clients.map((x) => x.name)).toEqual(['Maria Oliveira']);

    let t = await s.deleteClient(c.id);
    clock = new Date(clock.getTime() + UNDO_TTL_MS + 1);
    await expect(s.undo(t!)).rejects.toThrow(/não é mais possível/i);
    expect(s.data.clients).toEqual([]);

    const c2 = await client(s, 'Carla Mendes');
    const a = await appt(s, c2.id);
    t = await s.deleteClient(c2.id);
    await s.saveAppointment({ title: 'Coloração', clientId: '', date: '2026-11-06', time: '15:00', price: '300,00', notes: '' }, a.id);
    await expect(s.undo(t!)).rejects.toThrow(/alterado depois/i);
    expect(s.data.clients).toEqual([]);

    const c3 = await client(s, 'Fernanda Lima');
    t = await s.deleteClient(c3.id);
    await client(s, 'Outra');
    await expect(s.undo(t!)).resolves.toBeUndefined(); // criar outro cliente não registra desfazer
    const c4 = s.data.clients.find((x) => x.name === 'Outra')!;
    const t4 = await s.deleteClient(c4.id);
    await expect(s.undo(t!)).rejects.toThrow(/não é mais possível/i); // só a última ação
    await s.undo(t4!);
  });
});

describe('excluir atendimento e desfazer, por situação', () => {
  it('agendado: volta igual, com cliente e observações', async () => {
    const s = await app();
    const c = await client(s);
    const a = await appt(s, c.id);
    const before = strip(s.data.appointments[0]!);
    const t = await s.deleteAppointment(a.id);
    expect(t).toMatchObject({ label: 'Atendimento excluído' });
    expect(s.data.appointments).toEqual([]);
    await s.undo(t!);
    expect(strip(s.data.appointments[0]!)).toEqual(before);
  });

  it('concluído com receita automática: volta concluído e a receita volta vinculada; XP não repete', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: true });
    const xp = totalXp(s.data.xpEvents);
    const tx = s.data.transactions[0]!;
    const t = await s.deleteAppointment(a.id);
    expect(s.data.transactions).toEqual([]);
    await s.undo(t!);
    expect(s.data.appointments[0]).toMatchObject({ status: 'concluido', transactionId: tx.id });
    expect(strip(s.data.transactions[0]!)).toEqual(strip(tx));
    expect(totals(s.data.transactions).income).toBe(30_000);
    expect(totalXp(s.data.xpEvents)).toBe(xp);
  });

  it('concluído sem receita: volta concluído e sem lançamento', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: false });
    const t = await s.deleteAppointment(a.id);
    await s.undo(t!);
    expect(s.data.appointments[0]).toMatchObject({ status: 'concluido', transactionId: null });
    expect(s.data.transactions).toEqual([]);
  });

  it('cancelado: volta cancelado', async () => {
    const s = await app();
    const a = await appt(s);
    await s.setAppointmentStatus(a.id, 'cancelado');
    const t = await s.deleteAppointment(a.id);
    await s.undo(t!);
    expect(s.data.appointments[0]).toMatchObject({ status: 'cancelado' });
  });

  it('pagamento da 0.5 nunca sai de Finanças; desfazer devolve o atendimento sem duplicar o pagamento', async () => {
    const s = await app();
    const a = await appt(s);
    const { transaction: pay } = await s.saveTransaction({ type: 'receita', amount: '100,00', description: 'Sinal', category: 'Serviços', date: '2026-11-06' });
    const store = (s as unknown as { storage: { transactions: { put(x: unknown): Promise<void> } } }).storage;
    await store.transactions.put({ ...pay, appointmentId: a.id, payment: { kind: 'pagamento', method: 'pix' } });
    const s2 = await AppService.load(store as never, now);
    const t = await s2.deleteAppointment(a.id);
    expect(s2.data.transactions).toHaveLength(1);
    await s2.undo(t!);
    expect(s2.data.appointments).toHaveLength(1);
    expect(s2.data.transactions).toHaveLength(1);
  });

  it('o rótulo segue o termo da profissão (feminino em Limpeza)', async () => {
    const s = await AppService.load(createMemoryAdapter(), now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'limpeza' });
    const a = await appt(s);
    expect(await s.deleteAppointment(a.id)).toMatchObject({ label: 'Limpeza excluída' });
  });
});

describe('desfazer exclusões com sincronização', () => {
  async function device(remote: MemoryRemote) {
    const tracked = new TrackedStorage(createMemoryAdapter());
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
  const both = async (...ds: { sync: SyncEngine }[]) => { for (const d of ds) await d.sync.sync(); for (const d of ds) await d.sync.sync(); };

  it('excluir cliente e desfazer offline: ao voltar a conexão, o outro aparelho continua com o cliente e o vínculo', async () => {
    const { remote, a, b } = await pair();
    const c = await client(a.service);
    await appt(a.service, c.id);
    await both(a, b);
    remote.offline = true;
    await a.service.undo((await a.service.deleteClient(c.id))!);
    remote.offline = false;
    await both(a, b);
    expect(b.service.data.clients.map((x) => x.name)).toEqual(['Maria Oliveira']);
    expect(b.service.data.appointments[0]!.clientId).toBe(c.id);
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });

  it('excluir atendimento concluído, sincronizar a exclusão e desfazer: atendimento e receita voltam nos dois aparelhos', async () => {
    const { a, b } = await pair();
    const x = await appt(a.service);
    await a.service.completeAppointment(x.id, { registerIncome: true });
    await both(a, b);
    const t = await a.service.deleteAppointment(x.id);
    await both(a, b);
    expect(b.service.data.appointments).toEqual([]);
    expect(b.service.data.transactions).toEqual([]);
    await a.service.undo(t!);
    await both(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.appointments[0]).toMatchObject({ id: x.id, status: 'concluido' });
      expect(totals(d.service.data.transactions).income).toBe(30_000);
      expect(d.service.data.appointments[0]!.transactionId).toBe(d.service.data.transactions[0]!.id);
    }
  });
});
