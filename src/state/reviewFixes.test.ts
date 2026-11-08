/**
 * 0.5.0-beta.3 — regressões encontradas na revisão de código independente (uma por achado).
 */
import { refundIssues, reviewLog } from '../domain/refundReview';
import { paymentSummary } from '../domain/payments';
import { seriesOf } from '../domain/recurrence';
import type { AppointmentInput, RepeatInput } from '../lib/validation';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { MemoryRemote } from '../sync/memoryRemote';
import { TrackedStorage } from '../sync/tracked';
import { AppService } from './service';

let clock = new Date(2026, 10, 2, 9, 0);
const now = () => clock;
const advanceDays = (n: number) => { clock = new Date(clock.getTime() + n * 86_400_000); };
beforeEach(() => { clock = new Date(2026, 10, 2, 9, 0); });
const flush = () => new Promise((r) => setTimeout(r, 0));

const repeat = (r: Partial<RepeatInput> = {}): RepeatInput => ({ freq: 'semanal', interval: '1', days: [0], end: 'nunca', until: '', count: '', ...r });
const input = (r?: Partial<RepeatInput>, extra: Partial<AppointmentInput> = {}): AppointmentInput => ({ title: 'Manicure', clientId: '', date: '2026-11-02', time: '10:00', price: '50,00', notes: '', ...(r ? { repeat: repeat(r) } : {}), ...extra });
async function app(storage = createMemoryAdapter()) {
  const s = await AppService.load(storage, now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return s;
}
const sorted = (s: AppService) => [...s.data.appointments].sort((a, b) => (a.date < b.date ? -1 : 1));

describe('revisão: recorrência', () => {
  it('#1 duas exclusões seguidas não fazem a primeira voltar', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    advanceDays(7);
    await s.extendSeries(); // N: gerada sozinha neste dia
    const all = sorted(s);
    const n = all.at(-1)!;
    const p = all.at(-2)!;
    await s.deleteAppointment(n.id);
    await s.deleteAppointment(p.id);
    await s.extendSeries();
    expect(s.data.appointments.some((a) => a.id === n.id || a.id === p.id)).toBe(false);
  });

  it('#4 e #6 mudar a regra com exceção paga: nenhuma data em dobro; a âncora mantém a origem', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    const [, second, third] = sorted(s);
    await s.registerPayment(third!.id, { amount: 1_000 });
    await s.saveAppointment(input({ days: [0], interval: '1', end: 'vezes', count: '20' }, { time: '16:00', date: second!.date }), second!.id, 'proximas');
    const dates = s.data.appointments.filter((a) => a.status === 'agendado').map((a) => a.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(seriesOf(s.data.appointments.find((a) => a.id === third!.id)!)).toMatchObject({ detached: true });
    expect(seriesOf(s.data.appointments.find((a) => a.id === second!.id)!)!.auto).toBe(true);
    expect(s.data.transactions).toHaveLength(1);
  });
});

describe('revisão: sincronização', () => {
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
  const all = async (...ds: { sync: SyncEngine }[]) => { for (let i = 0; i < 3; i++) { for (const d of ds) await d.sync.sync(); await flush(); } };

  it('#3 série cancelada em A enquanto B (offline, regra antiga) gerava: as geradas por B saem depois da sincronização', async () => {
    const { remote, a, b } = await pair();
    await a.service.saveAppointment(input({}));
    await all(a, b);
    const second = sorted(a.service)[1]!;
    remote.offline = true;
    await a.service.cancelSeries(second.id, 'proximas');
    advanceDays(21);
    await b.service.extendSeries(); // B ainda não sabe do cancelamento
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) {
      const open = d.service.data.appointments.filter((x) => x.status === 'agendado').map((x) => x.date);
      expect(open).toEqual(['2026-11-02']);
    }
  });

  it('#2 receber tudo, estornar tudo e receber tudo de novo: o segundo recebimento não é apagado pela sincronização', async () => {
    const { a, b } = await pair();
    const ap = (await a.service.saveAppointment(input())).appointment;
    const tick = () => { clock = new Date(clock.getTime() + 1000); };
    const { transaction: p1 } = await a.service.registerPayment(ap.id, { amount: 'restante' });
    tick();
    await a.service.refundPayment(p1!.id, { amount: 'total' });
    tick();
    await a.service.registerPayment(ap.id, { amount: 'restante' }); // mais novo que o primeiro
    await all(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.transactions.filter((t) => t.type === 'receita')).toHaveLength(2);
      expect(paymentSummary(d.service.data.appointments[0]!, d.service.data.transactions)).toMatchObject({ net: 5_000, pending: 0 });
    }
  });
});

describe('revisão: estornos de receita da 0.4', () => {
  it('#5 remover um estorno na revisão não transforma a receita automática da 0.4 em pagamento da 0.5', async () => {
    const s = await app();
    const ap = (await s.saveAppointment(input())).appointment;
    const json = JSON.parse(s.exportBackup());
    json.data.transactions.push({ id: 'leg', type: 'receita', amount: 5_000, description: 'Manicure', category: 'Atendimento', date: '2026-11-02', appointmentId: ap.id, createdAt: 'a', updatedAt: 'a' });
    json.data.transactions.push({ id: 'r1', type: 'despesa', amount: 5_000, description: 'Estorno', category: 'Estorno', date: '2026-11-02', appointmentId: ap.id, payment: { kind: 'estorno', of: 'leg' }, createdAt: 'b', updatedAt: 'b' });
    json.data.transactions.push({ id: 'r2', type: 'despesa', amount: 2_000, description: 'Estorno', category: 'Estorno', date: '2026-11-02', appointmentId: ap.id, payment: { kind: 'estorno', of: 'leg' }, createdAt: 'c', updatedAt: 'c' });
    await s.importBackup(JSON.stringify(json));
    const [issue] = refundIssues(s.data.transactions);
    await s.resolveRefundIssue(issue!.signature, { remove: 'r2' });
    const leg = s.data.transactions.find((t) => t.id === 'leg')!;
    expect(leg.payment ?? null).toBeNull();
    expect(reviewLog(leg)).toHaveLength(1);
    expect(paymentSummary(s.data.appointments[0]!, s.data.transactions).entries.find((e) => e.tx.id === 'leg')!.kind).toBe('legado');
    // O backup guarda a trilha.
    const r = await app();
    await r.importBackup(s.exportBackup());
    expect(reviewLog(r.data.transactions.find((t) => t.id === 'leg'))).toHaveLength(1);
  });
});
