/**
 * Compatibilidade 0.4.0-beta.4 ↔ 0.5 (dois aparelhos em versões diferentes).
 *
 * O aparelho "0.5" é simulado gravando registros com os campos reservados para a 0.5
 * pelo mesmo caminho que o app usa (TrackedStorage → SyncEngine). O aparelho "0.4" usa
 * o AppService desta versão. Os campos e o marcador de pagamento estão descritos em
 * docs/COMPATIBILIDADE-0.5.md.
 */
import { totals } from '../domain/finance';
import type { AppData, Appointment, ServiceType, Transaction } from '../domain/types';
import { paidForAppointment } from '../domain/compat';
import { AppService } from '../state/service';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from './engine';
import { duplicateAutoIncomeIds } from './merge';
import { MemoryRemote } from './memoryRemote';
import { TrackedStorage } from './tracked';
import { SYNC_COLLECTIONS } from './types';

const NOW = new Date(2026, 10, 4, 10, 0);
const STAMP = NOW.toISOString();
type Dev = Awaited<ReturnType<typeof device>>;

async function device(remote: MemoryRemote) {
  const storage = createMemoryAdapter();
  const tracked = new TrackedStorage(storage);
  const service = await AppService.load(tracked, () => NOW);
  const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now: () => NOW, isOnline: () => !remote.offline, collections: SYNC_COLLECTIONS });
  return { service, sync, tracked };
}

/** Dois aparelhos na mesma conta: A faz o papel da 0.5 e B é esta versão (0.4). */
async function pair() {
  const remote = new MemoryRemote();
  const a = await device(remote);
  await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await a.sync.setUser('uid-1');
  await a.sync.link('uid-1', 'mesclar');
  const b = await device(remote);
  await b.sync.setUser('uid-1');
  await b.sync.link('uid-1', 'usarNuvem');
  return { remote, a, b };
}

/** Grava um registro como a 0.5 fará: pelo armazenamento rastreado, com campos que a 0.4 não conhece. */
async function write05<K extends 'appointments' | 'transactions' | 'clients' | 'serviceTypes'>(d: Dev, collection: K, entity: AppData[K][number] & Record<string, unknown>) {
  await d.service.exclusive(async () => {
    await (d.tracked[collection] as unknown as { put(e: unknown): Promise<void> }).put(entity);
    const list = (d.service.data[collection] as unknown as { id: string }[]).filter((x) => x.id !== entity.id);
    const next = { ...d.service.data, [collection]: [...list, entity] } as AppData;
    await d.tracked.untracked(() => d.service.applySyncedData(next));
  });
}

const appt = (d: Dev, title: string, price: string) =>
  d.service.saveAppointment({ title, clientId: '', date: '2026-11-06', time: '14:00', price, notes: '' }).then((r) => r.appointment);

/** Pagamento da 0.5: receita vinculada ao serviço com o marcador `payment`. */
const payment = (id: string, appointmentId: string, amount: number, date: string, extra: Record<string, unknown> = {}): Transaction & Record<string, unknown> => ({
  id, createdAt: STAMP, updatedAt: STAMP, type: 'receita', amount, description: 'Pagamento', category: 'Serviços', date, appointmentId,
  payment: { method: 'pix' }, ...extra,
});

const find = (d: Dev, id: string) => d.service.data.appointments.find((x) => x.id === id) as (Appointment & Record<string, unknown>) | undefined;
const linked = (d: Dev, id: string) => d.service.data.transactions.filter((t) => t.appointmentId === id);
const syncAll = async (...ds: Dev[]) => { for (const d of ds) await d.sync.sync(); for (const d of ds) await d.sync.sync(); };

describe('beta.4: campos da 0.5 sobrevivem às edições feitas na 0.4', () => {
  it('editar um serviço offline na 0.4 mantém duração, recorrência e controle de pagamento', async () => {
    const { remote, a, b } = await pair();
    const ap = await appt(a, 'Coloração', '300,00');
    const series = { id: 'serie-1', freq: 'semanal', interval: 1, days: [5], until: null, count: null, through: '2027-02-04' };
    await write05(a, 'appointments', { ...find(a, ap.id)!, duration: 90, series, payments: true, updatedAt: STAMP });
    await syncAll(a, b);
    expect(find(b, ap.id)?.duration).toBe(90);

    remote.offline = true;
    await b.service.saveAppointment({ title: 'Coloração e corte', clientId: '', date: '2026-11-06', time: '15:00', price: '320,00', notes: 'Sem amônia' }, ap.id);
    remote.offline = false;
    await syncAll(b, a);

    for (const d of [a, b]) {
      const x = find(d, ap.id)!;
      expect(x).toMatchObject({ title: 'Coloração e corte', time: '15:00', price: 32_000, notes: 'Sem amônia', duration: 90, payments: true });
      expect(x.series).toEqual(series);
    }
    expect(a.sync.conflicts).toEqual([]);
  });

  it('editar cliente, lançamento e tipo de serviço na 0.4 mantém os campos desconhecidos', async () => {
    const { a, b } = await pair();
    const { client } = await a.service.saveClient({ name: 'Maria', phone: '', email: '', address: '', notes: '' });
    await write05(a, 'clients', { ...client, birthday: '03-15' });
    const { transaction } = await a.service.saveTransaction({ type: 'receita', amount: '50,00', description: 'Avulsa', category: 'Serviços', date: '2026-11-04' });
    await write05(a, 'transactions', { ...transaction, payment: { method: 'dinheiro' } });
    const st = await a.service.saveServiceType({ name: 'Corte', price: '60,00' });
    await write05(a, 'serviceTypes', { ...st, duration: 45 } as ServiceType & Record<string, unknown>);
    await syncAll(a, b);

    await b.service.saveClient({ name: 'Maria Souza', phone: '', email: '', address: '', notes: 'Prefere à tarde' }, client.id);
    await b.service.saveTransaction({ type: 'receita', amount: '55,00', description: 'Avulsa corrigida', category: 'Serviços', date: '2026-11-04' }, transaction.id);
    await b.service.saveServiceType({ name: 'Corte masculino', price: '65,00' }, st.id);
    await b.service.setServiceTypePinned(st.id, true);
    await syncAll(b, a);

    for (const d of [a, b]) {
      expect(d.service.data.clients[0]).toMatchObject({ name: 'Maria Souza', birthday: '03-15' });
      expect(d.service.data.transactions.find((t) => t.id === transaction.id)).toMatchObject({ amount: 5_500, payment: { method: 'dinheiro' } });
      expect(d.service.data.serviceTypes[0]).toMatchObject({ name: 'Corte masculino', pinned: true, duration: 45 });
    }
  });
});

describe('beta.4: pagamentos registrados na 0.5', () => {
  async function partial() {
    const ctx = await pair();
    const ap = await appt(ctx.a, 'Coloração', '300,00');
    await write05(ctx.a, 'appointments', { ...find(ctx.a, ap.id)!, payments: true });
    await write05(ctx.a, 'transactions', payment('pg-1', ap.id, 10_000, '2026-11-01'));
    await syncAll(ctx.a, ctx.b);
    return { ...ctx, ap };
  }

  it('concluir na 0.4 lança só o que falta (R$ 300 com R$ 100 antecipados → receita de R$ 200)', async () => {
    const { a, b, ap } = await partial();
    expect(paidForAppointment(ap.id, b.service.data.transactions)).toBe(10_000);
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    await syncAll(b, a);
    for (const d of [a, b]) {
      expect(linked(d, ap.id).map((t) => t.amount).sort((x, y) => x - y)).toEqual([10_000, 20_000]);
      expect(paidForAppointment(ap.id, d.service.data.transactions)).toBe(30_000);
      expect(totals(d.service.data.transactions).income).toBe(30_000);
    }
  });

  it('pago integralmente antes: concluir não lança receita nova', async () => {
    const { a, b, ap } = await partial();
    await write05(a, 'transactions', payment('pg-2', ap.id, 20_000, '2026-11-03'));
    await syncAll(a, b);
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    await syncAll(b, a);
    expect(linked(a, ap.id).map((t) => t.id).sort()).toEqual(['pg-1', 'pg-2']);
    expect(find(a, ap.id)).toMatchObject({ status: 'concluido', transactionId: null, payments: true });
  });

  it('acima do combinado: nada é lançado nem apagado', async () => {
    const { a, b, ap } = await partial();
    await write05(a, 'transactions', payment('pg-2', ap.id, 25_000, '2026-11-03'));
    await syncAll(a, b);
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    await syncAll(b, a);
    expect(paidForAppointment(ap.id, a.service.data.transactions)).toBe(35_000);
    expect(linked(b, ap.id)).toHaveLength(2);
  });

  it('dois pagamentos do mesmo serviço não são tratados como receita automática duplicada', async () => {
    const { a, b, ap } = await partial();
    await write05(a, 'transactions', payment('pg-2', ap.id, 5_000, '2026-11-02'));
    await syncAll(a, b);
    await syncAll(b, a);
    for (const d of [a, b]) expect(linked(d, ap.id).map((t) => t.id).sort()).toEqual(['pg-1', 'pg-2']);
    expect(duplicateAutoIncomeIds(b.service.data.transactions).remove).toEqual([]);
  });

  it('a receita automática da 0.4 continua sem duplicar quando dois aparelhos concluem offline', async () => {
    const { remote, a, b, ap } = await partial();
    remote.offline = true;
    await a.service.completeAppointment(ap.id, { registerIncome: true });
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    remote.offline = false;
    await syncAll(a, b);
    await syncAll(a, b);
    for (const d of [a, b]) {
      expect(linked(d, ap.id)).toHaveLength(2); // pagamento da 0.5 + uma única receita automática de R$ 200
      expect(paidForAppointment(ap.id, d.service.data.transactions)).toBe(30_000);
    }
  });

  it('reabrir na 0.4 remove só a receita automática dela; o pagamento da 0.5 fica', async () => {
    const { a, b, ap } = await partial();
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    await b.service.setAppointmentStatus(ap.id, 'agendado');
    await syncAll(b, a);
    for (const d of [a, b]) {
      expect(linked(d, ap.id).map((t) => t.id)).toEqual(['pg-1']);
      expect(find(d, ap.id)).toMatchObject({ status: 'agendado', payments: true });
    }
  });

  it('cancelar e excluir na 0.4 nunca apagam pagamentos da 0.5', async () => {
    const { a, b, ap } = await partial();
    await b.service.setAppointmentStatus(ap.id, 'cancelado');
    await syncAll(b, a);
    expect(linked(a, ap.id).map((t) => t.id)).toEqual(['pg-1']);
    expect(find(a, ap.id)).toMatchObject({ status: 'cancelado', payments: true });

    await b.service.deleteAppointment(ap.id);
    await syncAll(b, a);
    expect(find(a, ap.id)).toBeUndefined();
    expect(a.service.data.transactions.find((t) => t.id === 'pg-1')).toMatchObject({ amount: 10_000, appointmentId: ap.id });
  });

  it('pagamento que a 0.5 apontou em transactionId também é preservado ao reabrir e excluir', async () => {
    const { a, b, ap } = await partial();
    await write05(a, 'appointments', { ...find(a, ap.id)!, status: 'concluido', completedAt: STAMP, transactionId: 'pg-1' });
    await syncAll(a, b);
    await b.service.setAppointmentStatus(ap.id, 'agendado');
    expect(linked(b, ap.id).map((t) => t.id)).toEqual(['pg-1']);
    await b.service.deleteAppointment(ap.id);
    await syncAll(b, a);
    expect(a.service.data.transactions.map((t) => t.id)).toContain('pg-1');
  });

  it('corrigir e excluir um pagamento na 0.4 mantém o vínculo e o marcador; a exclusão chega ao outro aparelho', async () => {
    const { a, b, ap } = await partial();
    await b.service.saveTransaction({ type: 'receita', amount: '80,00', description: 'Pagamento', category: 'Serviços', date: '2026-11-01' }, 'pg-1');
    await syncAll(b, a);
    expect(a.service.data.transactions.find((t) => t.id === 'pg-1')).toMatchObject({ amount: 8_000, appointmentId: ap.id, payment: { method: 'pix' } });
    await b.service.deleteTransaction('pg-1');
    await syncAll(b, a);
    expect(linked(a, ap.id)).toEqual([]);
    expect(find(a, ap.id)?.payments).toBe(true);
  });

  it('alterações offline nos dois aparelhos (novo pagamento na 0.5, observação na 0.4) são mescladas sem perda', async () => {
    const { remote, a, b, ap } = await partial();
    remote.offline = true;
    await write05(a, 'transactions', payment('pg-2', ap.id, 5_000, '2026-11-05'));
    await write05(a, 'appointments', { ...find(a, ap.id)!, duration: 120, updatedAt: '2026-11-04T13:01:00.000Z' });
    await b.service.saveAppointment({ title: 'Coloração', clientId: '', date: '2026-11-06', time: '14:00', price: '300,00', notes: 'Trazer foto de referência' }, ap.id);
    remote.offline = false;
    await syncAll(a, b);
    await syncAll(a, b);
    for (const d of [a, b]) {
      expect(find(d, ap.id)).toMatchObject({ duration: 120, notes: 'Trazer foto de referência', payments: true });
      expect(paidForAppointment(ap.id, d.service.data.transactions)).toBe(15_000);
    }
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });
});

describe('beta.4: comportamento de sempre para dados sem campos da 0.5', () => {
  it('concluir, reabrir e excluir um serviço antigo funcionam como na 0.4 (receita automática com o valor cheio)', async () => {
    const { a, b } = await pair();
    const ap = await appt(b, 'Corte', '60,00');
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    expect(linked(b, ap.id).map((t) => t.amount)).toEqual([6_000]);
    expect(find(b, ap.id)?.transactionId).toBe(linked(b, ap.id)[0]!.id);
    await b.service.setAppointmentStatus(ap.id, 'agendado');
    expect(linked(b, ap.id)).toEqual([]);
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    await b.service.deleteAppointment(ap.id);
    await syncAll(b, a);
    expect(a.service.data.transactions).toEqual([]);
  });

  it('nenhum campo novo é gravado pela 0.4 (os registros continuam no formato de sempre)', async () => {
    const { b } = await pair();
    const ap = await appt(b, 'Corte', '60,00');
    await b.service.completeAppointment(ap.id, { registerIncome: true });
    expect(Object.keys(find(b, ap.id)!).sort()).toEqual(['clientId', 'completedAt', 'createdAt', 'date', 'id', 'notes', 'price', 'status', 'time', 'title', 'transactionId', 'updatedAt']);
    expect(Object.keys(b.service.data.transactions[0]!).sort()).toEqual(['amount', 'appointmentId', 'category', 'createdAt', 'date', 'description', 'id', 'type', 'updatedAt']);
  });
});

describe('beta.4: backup com campos da 0.5', () => {
  it('exportar na 0.5 e restaurar na 0.4 mantém os campos novos', async () => {
    const { a, b } = await pair();
    const ap = await appt(a, 'Coloração', '300,00');
    await write05(a, 'appointments', { ...find(a, ap.id)!, duration: 90, payments: true, series: { id: 's', freq: 'mensal', interval: 1 } });
    await write05(a, 'transactions', payment('pg-1', ap.id, 10_000, '2026-11-01'));
    const st = await a.service.saveServiceType({ name: 'Corte', price: '' });
    await write05(a, 'serviceTypes', { ...st, duration: 30 } as ServiceType & Record<string, unknown>);
    await b.service.importBackup(a.service.exportBackup());
    expect(find(b, ap.id)).toMatchObject({ duration: 90, payments: true, series: { id: 's' } });
    expect(b.service.data.transactions[0]).toMatchObject({ payment: { method: 'pix' } });
    expect(b.service.data.serviceTypes[0]).toMatchObject({ duration: 30 });
  });

  it('arquivo com campo da 0.5 malformado é recusado inteiro, sem alterar nada', async () => {
    const { a } = await pair();
    const ap = await appt(a, 'Corte', '60,00');
    const json = JSON.parse(a.service.exportBackup());
    json.data.appointments[0].duration = -5;
    const before = JSON.stringify(a.service.data);
    await expect(a.service.importBackup(JSON.stringify(json))).rejects.toThrow(/appointments.*duração/);
    expect(JSON.stringify(a.service.data)).toBe(before);
    json.data.appointments[0].duration = 60;
    json.data.transactions = [{ ...payment('x', ap.id, 100, '2026-11-01'), payment: 'pix' }];
    await expect(a.service.importBackup(JSON.stringify(json))).rejects.toThrow(/transactions.*pagamento/);
  });

  it('a prévia avisa quando o arquivo vem de uma versão mais nova do app', async () => {
    const { a } = await pair();
    const json = JSON.parse(a.service.exportBackup());
    expect(a.service.previewBackup(JSON.stringify(json)).newerApp).toBe(false);
    json.appVersion = '0.5.0';
    expect(a.service.previewBackup(JSON.stringify(json)).newerApp).toBe(true);
    json.version = 2;
    expect(() => a.service.previewBackup(JSON.stringify(json))).toThrow(/versão mais nova/);
  });
});
