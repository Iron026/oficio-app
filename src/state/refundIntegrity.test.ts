/**
 * 0.5.0-beta.3 — integridade dos estornos entre aparelhos. Offline, dois aparelhos podem estornar o mesmo
 * pagamento sem saber um do outro, ou um exclui o pagamento enquanto o outro o estorna. Nada pode ser
 * apagado automaticamente nem apresentado como coerente: o conflito é detectado de forma determinística
 * (igual nos dois aparelhos) e resolvido pela pessoa, com trilha.
 */
import { totals } from '../domain/finance';
import { paymentSummary, duplicatePaymentIds } from '../domain/payments';
import { isAcknowledged, refundGroups, refundIssues, reviewLog } from '../domain/refundReview';
import type { Transaction } from '../domain/types';
import { totalXp } from '../gamification/engine';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { MemoryRemote } from '../sync/memoryRemote';
import { TrackedStorage } from '../sync/tracked';
import { AppService } from './service';

let clock = new Date(2026, 10, 7, 10, 0);
const now = () => clock;
const tick = () => { clock = new Date(clock.getTime() + 1000); };
beforeEach(() => { clock = new Date(2026, 10, 7, 10, 0); });

const tx = (id: string, extra: Partial<Transaction> & { payment?: Record<string, unknown> | null }): Transaction => ({
  id, type: 'despesa', amount: 0, description: '', category: 'Estorno', date: '2026-11-07', appointmentId: 'a1', createdAt: `2026-11-07T10:00:0${id.length % 10}Z`, updatedAt: 'x', ...extra,
});

describe('detecção determinística', () => {
  const pay = tx('p', { type: 'receita', amount: 10_000, payment: { kind: 'pagamento' } });
  const rA = tx('rA', { amount: 10_000, payment: { kind: 'estorno', of: 'p' }, createdAt: '2026-11-07T10:00:01Z' });
  const rB = tx('rB', { amount: 4_000, payment: { kind: 'estorno', of: 'p' }, createdAt: '2026-11-07T10:00:02Z' });

  it('estornos acima do pago: um grupo, excesso exato, mesma assinatura em qualquer ordem', () => {
    const g = refundIssues([pay, rA, rB]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ kind: 'acima-do-pago', paid: 10_000, refunded: 14_000, excess: 4_000, appointmentId: 'a1' });
    expect(g[0]!.refunds.map((r) => r.id)).toEqual(['rA', 'rB']);
    expect(refundIssues([rB, pay, rA])[0]!.signature).toBe(g[0]!.signature);
    // Dentro do pago: nenhum alerta.
    expect(refundIssues([pay, { ...rA, amount: 6_000 }, rB])).toEqual([]);
  });

  it('estorno sem pagamento (excluído em outro aparelho) também vai para revisão', () => {
    expect(refundIssues([rB])).toMatchObject([{ kind: 'sem-pagamento', paymentId: 'p', paid: 0, excess: 4_000 }]);
  });

  it('confirmação vale só para o conjunto revisado: um estorno novo ou um valor diferente reabre', () => {
    const [g] = refundGroups([pay, rA, rB]);
    const ack = (r: Transaction) => ({ ...r, payment: { ...r.payment, review: { ack: g!.signature, at: 'x' } } });
    expect(refundIssues([pay, ack(rA), ack(rB)])).toEqual([]);
    expect(isAcknowledged(refundGroups([pay, ack(rA), ack(rB)])[0]!)).toBe(true);
    expect(refundIssues([pay, ack(rA), { ...ack(rB), amount: 5_000 }])).toHaveLength(1);
    expect(refundIssues([pay, ack(rA), ack(rB), tx('rC', { amount: 100, payment: { kind: 'estorno', of: 'p' } })])).toHaveLength(1);
  });

  it('a limpeza da sincronização nunca remove estornos (nem os antigos, com chave repetida)', () => {
    const k = { kind: 'estorno', of: 'p', key: 'estorno:p:0' };
    expect(duplicatePaymentIds([pay, { ...rA, payment: k }, { ...rB, amount: 10_000, payment: k }])).toEqual([]);
  });
});

describe('dois aparelhos offline', () => {
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
    const ap = (await a.service.saveAppointment({ title: 'Coloração', clientId: '', date: '2026-11-07', time: '14:00', price: '100,00', notes: '' })).appointment;
    const { transaction: p } = await a.service.registerPayment(ap.id, { amount: 10_000 });
    await all(a, b);
    return { remote, a, b, ap, p: p! };
  }
  const all = async (...ds: { sync: SyncEngine }[]) => { for (let i = 0; i < 2; i++) for (const d of ds) await d.sync.sync(); };
  const view = (s: AppService) => ({
    refunds: s.data.transactions.filter((t) => t.type === 'despesa').map((t) => t.amount).sort((x, y) => x - y),
    issues: refundIssues(s.data.transactions).map((g) => [g.kind, g.excess]),
    state: paymentSummary(s.data.appointments[0]!, s.data.transactions).state,
    totals: totals(s.data.transactions),
  });

  it('R$ 100 pagos, estorno de R$ 100 em A e R$ 40 em B: os dois ficam, a revisão aparece igual nos dois, nada é apagado', async () => {
    const { remote, a, b, p } = await pair();
    const xp = totalXp(a.service.data.xpEvents);
    remote.offline = true;
    await a.service.refundPayment(p.id, { amount: 'total' });
    tick();
    await b.service.refundPayment(p.id, { amount: 4_000 });
    // Sem conexão: cada aparelho é coerente sozinho.
    expect(view(a.service).issues).toEqual([]);
    expect(view(b.service).issues).toEqual([]);
    remote.offline = false;
    await all(a, b);
    await all(a, b); // repetir a sincronização não muda nada
    for (const d of [a, b]) {
      expect(view(d.service)).toEqual({ refunds: [4_000, 10_000], issues: [['acima-do-pago', 4_000]], state: 'revisar', totals: { income: 10_000, refund: 14_000, expense: 0, balance: -4_000 } });
      // Nada "a receber" nem "pago" enquanto os valores estão incertos.
      expect(paymentSummary(d.service.data.appointments[0]!, d.service.data.transactions).pending).toBe(0);
    }
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
    expect(totalXp(a.service.data.xpEvents)).toBe(xp);
  });

  it('resolver removendo o estorno lançado por engano: sincroniza, deixa trilha no pagamento e some dos dois', async () => {
    const { remote, a, b, p } = await pair();
    remote.offline = true;
    await a.service.refundPayment(p.id, { amount: 'total' });
    tick();
    const { transaction: wrong } = await b.service.refundPayment(p.id, { amount: 4_000 });
    remote.offline = false;
    await all(a, b);
    const [issue] = refundIssues(a.service.data.transactions);
    tick();
    await a.service.resolveRefundIssue(issue!.signature, { remove: wrong.id });
    await all(a, b);
    for (const d of [a, b]) {
      // Estorno total do pagamento de R$ 100: nada recebido de fato, tudo a receber de novo.
      expect(view(d.service)).toMatchObject({ refunds: [10_000], issues: [], state: 'pendente' });
      const log = reviewLog(d.service.data.transactions.find((t) => t.id === p.id));
      expect(log).toEqual([{ at: expect.any(String), decision: 'removido', refund: { id: wrong.id, amount: 4_000, date: '2026-11-07', createdAt: wrong.createdAt } }]);
      expect(totals(d.service.data.transactions)).toMatchObject({ refund: 10_000, balance: 0 });
    }
  });

  it('resolver mantendo os dois (aconteceram de verdade): confirmação sincroniza; Desfazer reabre a revisão', async () => {
    const { remote, a, b, p } = await pair();
    remote.offline = true;
    await a.service.refundPayment(p.id, { amount: 'total' });
    tick();
    await b.service.refundPayment(p.id, { amount: 4_000 });
    remote.offline = false;
    await all(a, b);
    const [issue] = refundIssues(b.service.data.transactions);
    const undo = await b.service.resolveRefundIssue(issue!.signature, { keep: true });
    await all(a, b);
    for (const d of [a, b]) {
      expect(refundIssues(d.service.data.transactions)).toEqual([]);
      expect(view(d.service).refunds).toEqual([4_000, 10_000]); // nada removido
      expect(view(d.service).state).not.toBe('revisar');
    }
    await b.service.undo(undo);
    expect(refundIssues(b.service.data.transactions)).toHaveLength(1);
    // Assinatura antiga não resolve um conjunto que mudou.
    await expect(a.service.resolveRefundIssue('outra', { keep: true })).rejects.toThrow(/mudaram/);
  });

  it('"estornar tudo" nos dois aparelhos: não some nenhum silenciosamente — vai para revisão', async () => {
    const { remote, a, b, p } = await pair();
    remote.offline = true;
    await a.service.refundPayment(p.id, { amount: 'total' });
    tick();
    await b.service.refundPayment(p.id, { amount: 'total' });
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) expect(view(d.service)).toMatchObject({ refunds: [10_000, 10_000], issues: [['acima-do-pago', 10_000]] });
  });

  it('pagamento excluído em A enquanto B o estornava: estorno órfão vai para revisão; nada é apagado sozinho', async () => {
    const { remote, a, b, p } = await pair();
    remote.offline = true;
    await a.service.deleteTransaction(p.id);
    tick();
    await b.service.refundPayment(p.id, { amount: 3_000 });
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.transactions.some((t) => t.id === p.id)).toBe(false);
      expect(view(d.service)).toMatchObject({ refunds: [3_000], issues: [['sem-pagamento', 3_000]] });
    }
  });
});
