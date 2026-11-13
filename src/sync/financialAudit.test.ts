/**
 * Auditoria pré-RC (0.5.0) — integridade financeira com aparelhos offline e importação de backup. Nenhum pagamento
 * ou estorno real some em silêncio, e Finanças, Painel, Relatórios, extrato, recibos e histórico do cliente mostram
 * os mesmos números nos dois aparelhos.
 */
import { clientHistory } from '../domain/clientHistory';
import { monthTotals } from '../domain/finance';
import { receivables, paymentSummary } from '../domain/payments';
import { isPayment, isRefund } from '../domain/paymentMarks';
import { receiptFor } from '../domain/receipt';
import { refundIssues } from '../domain/refundReview';
import { monthReport } from '../domain/reports';
import { buildStatement } from '../domain/statement';
import type { AppData } from '../domain/types';
import { createMemoryAdapter } from '../storage/memory';
import { AppService } from '../state/service';
import { MemoryRemote } from './memoryRemote';
import { SyncEngine } from './engine';
import { TrackedStorage } from './tracked';

let clock = new Date(2026, 10, 12, 9, 0);
const now = () => clock;
const tick = () => { clock = new Date(clock.getTime() + 60_000); };
const MONTH = '2026-11';
beforeEach(() => { clock = new Date(2026, 10, 12, 9, 0); });

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
type Dev = Awaited<ReturnType<typeof device>>;
const all = async (...ds: Dev[]) => { for (let i = 0; i < 3; i++) for (const d of ds) await d.sync.sync(); };

/** Os mesmos totais em todas as telas (mesmo aparelho) — e o que aparece em cada uma bate com os lançamentos. */
function expectCoherent(d: AppData) {
  const fin = monthTotals(d.transactions, MONTH); // Finanças e Painel usam esta mesma função
  const rep = monthReport(d, MONTH).totals;
  const st = buildStatement(d, MONTH, now()).totals;
  expect({ income: rep.gross, refund: rep.refunds, expense: rep.expense, balance: rep.balance }).toEqual(fin);
  expect(st).toEqual(fin);
  expect(monthReport(d, MONTH).pending.amount).toBe(receivables(d.appointments, d.transactions).pending);
  // Recibos: líquido = pago − estornos do próprio pagamento.
  for (const p of d.transactions.filter(isPayment)) {
    const r = receiptFor(d, p.id)!;
    const refunded = d.transactions.filter((t) => isRefund(t) && (t.payment as { of?: string }).of === p.id).reduce((n, t) => n + t.amount, 0);
    expect(r.net).toBe(p.amount - refunded);
  }
  // Histórico do cliente: recebido/estornado = soma dos atendimentos dele.
  for (const c of d.clients) {
    const h = clientHistory(c.id, d.appointments, d.transactions, '2026-11-30');
    const mine = d.appointments.filter((a) => a.clientId === c.id).map((a) => paymentSummary(a, d.transactions));
    expect(h.received).toBe(mine.reduce((n, s) => n + s.received, 0));
    expect(h.refunded).toBe(mine.reduce((n, s) => n + s.refunded, 0));
  }
}
const money = (d: AppData) => d.transactions.filter((t) => isPayment(t) || isRefund(t)).map((t) => `${t.id}:${t.amount}`).sort();

describe('auditoria pré-RC: importação de backup enquanto outro aparelho está offline', () => {
  it('pagamento e estorno feitos offline em B sobrevivem a uma restauração em A; o estorno de um pagamento que a restauração removeu vai para revisão', async () => {
    const { remote, a, b } = await pair();
    const backup = a.service.exportBackup(); // antes de qualquer atendimento
    const c = (await a.service.saveClient({ name: 'Carla', phone: '', email: '', address: '', notes: '' })).client;
    const ap = (await a.service.saveAppointment({ title: 'Corte', clientId: c.id, date: '2026-11-10', time: '', price: '100,00', notes: '' })).appointment;
    const { transaction: p } = await a.service.registerPayment(ap.id, { amount: 6_000, date: '2026-11-10' });
    await all(a, b);

    remote.offline = true;
    tick();
    await b.service.registerPayment(ap.id, { amount: 4_000, date: '2026-11-12' }); // novo, só em B
    await b.service.refundPayment(p!.id, { amount: 1_000, date: '2026-11-12' }); // estorno do pagamento que A vai remover
    remote.offline = false;
    tick();
    await a.service.importBackup(backup); // A restaura um backup sem o atendimento e o pagamento
    await all(a, b);

    for (const d of [a, b]) {
      const data = d.service.data;
      // O pagamento novo de B não some; o estorno de B também não — vai para revisão (pagamento removido).
      expect(data.transactions.some((t) => isPayment(t) && t.amount === 4_000)).toBe(true);
      expect(data.transactions.filter(isRefund).map((t) => t.amount)).toEqual([1_000]);
      expect(refundIssues(data.transactions).map((i) => i.kind)).toEqual(['sem-pagamento']);
      expectCoherent(data);
    }
    expect(money(a.service.data)).toEqual(money(b.service.data));
  });

  it('pagamento alterado offline em B e removido por uma restauração em A: volta e fica sinalizado (não some)', async () => {
    const { remote, a, b } = await pair();
    const backup = a.service.exportBackup();
    const ap = (await a.service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-10', time: '', price: '100,00', notes: '' })).appointment;
    const { transaction: p } = await a.service.registerPayment(ap.id, { amount: 6_000, date: '2026-11-10' });
    await all(a, b);
    remote.offline = true;
    tick();
    await b.service.saveTransaction({ type: 'receita', amount: '70,00', description: 'Corte', category: p!.category, date: p!.date }, p!.id);
    remote.offline = false;
    tick();
    await a.service.importBackup(backup);
    await all(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.transactions.find((t) => t.id === p!.id)?.amount).toBe(7_000);
      expectCoherent(d.service.data);
    }
    expect(a.sync.conflicts.length + b.sync.conflicts.length).toBeGreaterThan(0);
  });
});

describe('auditoria pré-RC: operações concorrentes offline — totais coerentes nos dois aparelhos', () => {
  it('quitação, estorno, exclusão de lançamento e reconciliação simultâneos: nada some sem registro; telas batem', async () => {
    const { remote, a, b } = await pair();
    const c = (await a.service.saveClient({ name: 'Carla', phone: '', email: '', address: '', notes: '' })).client;
    const ap1 = (await a.service.saveAppointment({ title: 'Coloração', clientId: c.id, date: '2026-11-10', time: '', price: '300,00', notes: '' })).appointment;
    const ap2 = (await a.service.saveAppointment({ title: 'Corte', clientId: c.id, date: '2026-11-11', time: '', price: '80,00', notes: '' })).appointment;
    const { transaction: p1 } = await a.service.registerPayment(ap1.id, { amount: 10_000, date: '2026-11-10' });
    const { transaction: p2 } = await a.service.registerPayment(ap2.id, { amount: 8_000, date: '2026-11-11' });
    const exp = (await a.service.saveTransaction({ type: 'despesa', amount: '20,00', description: 'Tinta', category: 'Produtos', date: '2026-11-05' })).transaction;
    await all(a, b);

    remote.offline = true;
    tick();
    // A: quita a coloração (recebi tudo que faltava) e exclui a despesa.
    await a.service.completeAppointment(ap1.id, { payment: { mode: 'integral', date: '2026-11-12' } });
    await a.service.deleteTransaction(exp.id);
    // B: quita a mesma coloração, estorna o corte inteiro e estorna parte da coloração.
    await b.service.completeAppointment(ap1.id, { payment: { mode: 'integral', date: '2026-11-12' } });
    await b.service.refundPayment(p2!.id, { amount: 'total', date: '2026-11-12' });
    await b.service.refundPayment(p1!.id, { amount: 3_000, date: '2026-11-12' });
    remote.offline = false;
    await all(a, b);

    const da = a.service.data;
    const db = b.service.data;
    expect(money(da)).toEqual(money(db));
    // Quitação nos dois aparelhos: um único recebimento do restante (R$ 200).
    expect(da.transactions.filter((t) => isPayment(t) && t.appointmentId === ap1.id).map((t) => t.amount).sort()).toEqual([10_000, 20_000]);
    // Estornos feitos em B continuam; despesa excluída em A sai dos dois (exclusão explícita).
    expect(da.transactions.filter(isRefund).map((t) => t.amount).sort()).toEqual([3_000, 8_000]);
    expect(da.transactions.some((t) => t.id === exp.id)).toBe(false);
    for (const d of [da, db]) expectCoherent(d);
    expect(monthTotals(da.transactions, MONTH)).toEqual(monthTotals(db.transactions, MONTH));
  });

  it('remover um estorno na revisão em A enquanto B confirma "Manter" offline: os dois aparelhos convergem e nada some sem trilha', async () => {
    const { remote, a, b } = await pair();
    const ap = (await a.service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-10', time: '', price: '100,00', notes: '' })).appointment;
    const { transaction: p } = await a.service.registerPayment(ap.id, { amount: 10_000, date: '2026-11-10' });
    await all(a, b);
    remote.offline = true;
    await a.service.refundPayment(p!.id, { amount: 'total' });
    await b.service.refundPayment(p!.id, { amount: 6_000 });
    remote.offline = false;
    await all(a, b);
    const issue = refundIssues(a.service.data.transactions)[0]!;
    const wrong = issue.refunds.find((r) => r.amount === 6_000)!;
    remote.offline = true;
    tick();
    await a.service.resolveRefundIssue(issue.signature, { remove: wrong.id });
    await b.service.resolveRefundIssue(issue.signature, { keep: true });
    remote.offline = false;
    await all(a, b);
    expect(money(a.service.data)).toEqual(money(b.service.data));
    for (const d of [a, b]) {
      const data = d.service.data;
      const still = data.transactions.some((t) => t.id === wrong.id);
      const trail = JSON.stringify(data.transactions.find((t) => t.id === p!.id)?.reviews ?? []);
      // Ou o estorno continua (alteração de B venceu a exclusão e fica sinalizada), ou a remoção ficou registrada.
      expect(still || trail.includes(wrong.id)).toBe(true);
      // Antes da correção, A via o estorno que tinha removido reaparecer sem aviso; agora os dois aparelhos sinalizam.
      if (still) expect(refundIssues(data.transactions).length + d.sync.conflicts.length).toBeGreaterThan(0);
      expectCoherent(data);
    }
  });
});
