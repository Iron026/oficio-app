/**
 * beta.5 — correções do teste no S26: receita de serviço concluído, "Lançar receita" sem
 * duplicar nem dar XP, e "Desfazer" que reverte de verdade (dados, vínculos, totais, sincronização).
 */
import { totals } from '../domain/finance';
import { totalXp } from '../gamification/engine';
import { missingIncome } from '../screens/AppointmentItem';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { MemoryRemote } from '../sync/memoryRemote';
import { TrackedStorage } from '../sync/tracked';
import { AppService, UNDO_TTL_MS } from './service';

let clock = new Date(2026, 10, 5, 10, 0);
const now = () => clock;
beforeEach(() => { clock = new Date(2026, 10, 5, 10, 0); });

async function app() {
  const s = await AppService.load(createMemoryAdapter(), now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return s;
}
const appt = (s: AppService, price = '300,00') =>
  s.saveAppointment({ title: 'Coloração', clientId: '', date: '2026-11-05', time: '14:00', price, notes: '' }).then((r) => r.appointment);
const ap = (s: AppService, id: string) => s.data.appointments.find((a) => a.id === id)!;
const income = (s: AppService) => totals(s.data.transactions).income;

describe('concluir, excluir a receita e lançar de novo', () => {
  it('2. concluir cria a receita vinculada nos dois sentidos', async () => {
    const s = await app();
    const a = await appt(s);
    const fb = await s.completeAppointment(a.id, { registerIncome: true });
    const tx = s.data.transactions[0]!;
    expect(tx).toMatchObject({ type: 'receita', amount: 30_000, appointmentId: a.id, date: '2026-11-05' });
    expect(ap(s, a.id)).toMatchObject({ status: 'concluido', transactionId: tx.id });
    expect(fb.undo?.label).toMatch(/concluíd/i);
  });

  it('3. excluir a receita mantém o serviço concluído e o marca como sem lançamento', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: true });
    await s.deleteTransaction(s.data.transactions[0]!.id);
    expect(ap(s, a.id)).toMatchObject({ status: 'concluido', transactionId: null });
    expect(ap(s, a.id).completedAt).not.toBeNull();
    expect(missingIncome(ap(s, a.id), s.data.transactions)).toBe(true);
    expect(income(s)).toBe(0);
  });

  it('4. "Lançar receita" relança sem reabrir, sem duplicar e sem XP novo', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: true });
    const xp = totalXp(s.data.xpEvents);
    const xpKeys = s.data.xpEvents.map((e) => e.key).sort();
    await s.deleteTransaction(s.data.transactions[0]!.id);

    const r1 = await s.registerAppointmentIncome(a.id);
    const r2 = await s.registerAppointmentIncome(a.id); // segundo toque: nada
    expect(r1.transaction).toMatchObject({ amount: 30_000, appointmentId: a.id, date: '2026-11-05' });
    expect(r2.transaction).toBeNull();
    expect(s.data.transactions).toHaveLength(1);
    expect(ap(s, a.id)).toMatchObject({ status: 'concluido', transactionId: r1.transaction!.id });
    expect(totalXp(s.data.xpEvents)).toBe(xp);
    expect(s.data.xpEvents.map((e) => e.key).sort()).toEqual(xpKeys);
    expect(missingIncome(ap(s, a.id), s.data.transactions)).toBe(false);
  });

  it('concluir sem lançar e lançar depois; serviço sem valor ou não concluído não lança', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: false });
    expect(missingIncome(ap(s, a.id), s.data.transactions)).toBe(true);
    await s.registerAppointmentIncome(a.id);
    expect(income(s)).toBe(30_000);
    const free = await appt(s, '');
    await s.completeAppointment(free.id, { registerIncome: true });
    expect((await s.registerAppointmentIncome(free.id)).transaction).toBeNull();
    const open = await appt(s);
    await expect(s.registerAppointmentIncome(open.id)).rejects.toThrow(/concluído/);
  });

  it('compatível com pagamentos da 0.5: lança só o que falta', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: false });
    const json = JSON.parse(s.exportBackup());
    json.data.transactions.push({ id: 'pg-1', createdAt: 'x', updatedAt: 'x', type: 'receita', amount: 10_000, description: 'Sinal', category: 'Serviços', date: '2026-11-01', appointmentId: a.id, payment: { method: 'pix' } });
    await s.importBackup(JSON.stringify(json));
    expect(missingIncome(ap(s, a.id), s.data.transactions)).toBe(false); // há pagamento: não está "sem receita"
    const r = await s.registerAppointmentIncome(a.id);
    expect(r.transaction?.amount).toBe(20_000);
    expect(income(s)).toBe(30_000);
  });
});

describe('5. desfazer com integridade financeira', () => {
  it('desfazer a conclusão volta a agendado, remove a receita criada e não repete XP ao concluir de novo', async () => {
    const s = await app();
    const a = await appt(s);
    const before = ap(s, a.id);
    const fb = await s.completeAppointment(a.id, { registerIncome: true });
    const xp = totalXp(s.data.xpEvents);
    await s.undo(fb.undo!);
    expect(ap(s, a.id)).toMatchObject({ status: 'agendado', completedAt: null, transactionId: null, price: before.price, title: before.title });
    expect(s.data.transactions).toEqual([]);
    expect(income(s)).toBe(0);
    const again = await s.completeAppointment(a.id, { registerIncome: true });
    expect(again.xpGained).toBe(0);
    expect(totalXp(s.data.xpEvents)).toBe(xp);
    expect(s.data.transactions).toHaveLength(1);
  });

  it('desfazer a exclusão do lançamento devolve a receita e o vínculo com o serviço', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: true });
    const tx = s.data.transactions[0]!;
    const undo = await s.deleteTransaction(tx.id);
    await s.undo(undo!);
    expect(s.data.transactions).toEqual([expect.objectContaining({ id: tx.id, amount: 30_000, appointmentId: a.id })]);
    expect(ap(s, a.id).transactionId).toBe(tx.id);
    expect(income(s)).toBe(30_000);
  });

  it('desfazer reabrir devolve concluído e a receita automática removida', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: true });
    const tx = s.data.transactions[0]!;
    const undo = await s.setAppointmentStatus(a.id, 'agendado');
    expect(s.data.transactions).toEqual([]);
    await s.undo(undo);
    expect(ap(s, a.id)).toMatchObject({ status: 'concluido', transactionId: tx.id });
    expect(s.data.transactions.map((t) => t.id)).toEqual([tx.id]);
  });

  it('desfazer o relançamento remove a receita nova e volta a "sem lançamento"', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: false });
    const r = await s.registerAppointmentIncome(a.id);
    await s.undo(r.undo!);
    expect(s.data.transactions).toEqual([]);
    expect(missingIncome(ap(s, a.id), s.data.transactions)).toBe(true);
  });

  it('recusa desfazer quando o registro mudou depois, quando venceu o prazo ou não é a última ação', async () => {
    const s = await app();
    const a = await appt(s);
    const fb = await s.completeAppointment(a.id, { registerIncome: true });
    await s.saveTransaction({ type: 'receita', amount: '310,00', description: 'Coloração', category: 'Serviços', date: '2026-11-05' }, s.data.transactions[0]!.id);
    const snapshot = JSON.stringify(s.data);
    await expect(s.undo(fb.undo!)).rejects.toThrow(/alterado depois/);
    expect(JSON.stringify(s.data)).toBe(snapshot);

    const b = await appt(s);
    const fb2 = await s.completeAppointment(b.id, { registerIncome: true });
    clock = new Date(clock.getTime() + UNDO_TTL_MS + 1);
    await expect(s.undo(fb2.undo!)).rejects.toThrow(/Não é mais possível/);

    const c = await appt(s);
    const first = await s.completeAppointment(c.id, { registerIncome: true });
    await s.deleteTransaction(s.data.transactions.find((t) => t.appointmentId === b.id)!.id);
    await expect(s.undo(first.undo!)).rejects.toThrow(/Não é mais possível/);
  });

  it('restaurar um backup invalida o desfazer pendente', async () => {
    const s = await app();
    const a = await appt(s);
    const json = s.exportBackup();
    const fb = await s.completeAppointment(a.id, { registerIncome: true });
    await s.importBackup(json);
    await expect(s.undo(fb.undo!)).rejects.toThrow(/Não é mais possível/);
  });
});

describe('6. persistência e sincronização offline', () => {
  async function device(remote: MemoryRemote, storage = createMemoryAdapter()) {
    const tracked = new TrackedStorage(storage);
    const service = await AppService.load(tracked, now);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => !remote.offline });
    return { service, sync, storage };
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

  it('concluir e desfazer offline: ao voltar a conexão, o outro aparelho vê o serviço agendado e nenhuma receita', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service);
    await both(a, b);
    remote.offline = true;
    const fb = await a.service.completeAppointment(x.id, { registerIncome: true });
    await a.service.undo(fb.undo!);
    remote.offline = false;
    await both(a, b);
    expect(b.service.data.appointments[0]).toMatchObject({ status: 'agendado', transactionId: null });
    expect(b.service.data.transactions).toEqual([]);
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });

  it('excluir a receita e desfazer depois de sincronizar a exclusão: a receita volta nos dois aparelhos', async () => {
    const { a, b } = await pair();
    const x = await appt(a.service);
    await a.service.completeAppointment(x.id, { registerIncome: true });
    await both(a, b);
    const undo = await a.service.deleteTransaction(a.service.data.transactions[0]!.id);
    await both(a, b);
    expect(b.service.data.transactions).toEqual([]);
    expect(b.service.data.appointments[0]).toMatchObject({ status: 'concluido', transactionId: null });
    await a.service.undo(undo!);
    await both(a, b);
    for (const d of [a, b]) {
      expect(totals(d.service.data.transactions).income).toBe(30_000);
      expect(d.service.data.appointments[0]!.transactionId).toBe(d.service.data.transactions[0]!.id);
    }
  });

  it('"Lançar receita" offline nos dois aparelhos não duplica depois de sincronizar', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service);
    await a.service.completeAppointment(x.id, { registerIncome: false });
    await both(a, b);
    remote.offline = true;
    await a.service.registerAppointmentIncome(x.id);
    clock = new Date(clock.getTime() + 1000);
    await b.service.registerAppointmentIncome(x.id);
    remote.offline = false;
    await both(a, b);
    await both(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.transactions).toHaveLength(1);
      expect(totals(d.service.data.transactions).income).toBe(30_000);
      expect(d.service.data.appointments[0]!.transactionId).toBe(d.service.data.transactions[0]!.id);
    }
  });

  it('o estado depois de desfazer persiste ao reabrir o app', async () => {
    const storage = createMemoryAdapter();
    const s = await AppService.load(storage, now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const x = await appt(s);
    const fb = await s.completeAppointment(x.id, { registerIncome: true });
    await s.undo(fb.undo!);
    const reopened = await AppService.load(storage, now);
    expect(reopened.data.appointments[0]).toMatchObject({ status: 'agendado', transactionId: null });
    expect(reopened.data.transactions).toEqual([]);
  });
});

describe('7. backups e versões anteriores', () => {
  it('backup da beta.4 (serviço concluído sem receita) restaura e permite lançar a receita', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { registerIncome: true });
    await s.deleteTransaction(s.data.transactions[0]!.id);
    const json = JSON.parse(s.exportBackup());
    json.appVersion = '0.4.0-beta.4';
    const t = await app();
    await t.importBackup(JSON.stringify(json));
    const restored = t.data.appointments[0]!;
    expect(restored).toMatchObject({ status: 'concluido', transactionId: null });
    expect(missingIncome(restored, t.data.transactions)).toBe(true);
    await t.registerAppointmentIncome(restored.id);
    expect(totals(t.data.transactions).income).toBe(30_000);
  });
});
