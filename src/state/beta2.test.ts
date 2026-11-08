/**
 * 0.5.0-beta.2 — regressão dos ajustes do teste no S26: estornos como movimentação própria (fora das
 * despesas e dos gastos por categoria, deduzidos do saldo uma única vez), compatibilidade com os
 * registros da beta.1, estornos parciais, sincronização offline e duração opcional entre aparelhos.
 */
import { byCategory, monthTotals, movementKind, totals } from '../domain/finance';
import { buildStatement, statementCsv } from '../domain/statement';
import { paymentSummary } from '../domain/payments';
import { refundIssues } from '../domain/refundReview';
import type { Transaction } from '../domain/types';
import { totalXp } from '../gamification/engine';
import { statementPdf } from '../lib/statementPdf';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { MemoryRemote } from '../sync/memoryRemote';
import { TrackedStorage } from '../sync/tracked';
import { AppService } from './service';

let clock = new Date(2026, 10, 7, 10, 0);
const now = () => clock;
beforeEach(() => { clock = new Date(2026, 10, 7, 10, 0); });

async function app(storage = createMemoryAdapter()) {
  const s = await AppService.load(storage, now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return s;
}
const appt = (s: AppService, price = '300,00', extra: { duration?: string; time?: string } = {}) =>
  s.saveAppointment({ title: 'Coloração', clientId: '', date: '2026-11-07', time: extra.time ?? '14:00', price, notes: '', duration: extra.duration }).then((r) => r.appointment);
const expense = (s: AppService, amount: string, category = 'Material') =>
  s.saveTransaction({ type: 'despesa', amount, description: 'Compra', category, date: '2026-11-07' });
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('beta.2: estornos fora das despesas, deduzidos do saldo uma vez', () => {
  it('recebimentos brutos, estornos e despesas separados; saldo igual ao da beta.1', async () => {
    const s = await app();
    const a = await appt(s);
    const { transaction: p } = await s.registerPayment(a.id, { amount: 30_000 });
    await s.refundPayment(p!.id, { amount: 5_000 });
    await expense(s, '40,00');
    const t = totals(s.data.transactions);
    expect(t).toEqual({ income: 30_000, refund: 5_000, expense: 4_000, balance: 21_000 });
    // Sem dupla contagem: o saldo é o mesmo que a beta.1 mostrava (estorno somado às despesas).
    const beta1 = s.data.transactions.reduce((n, x) => n + (x.type === 'receita' ? x.amount : -x.amount), 0);
    expect(t.balance).toBe(beta1);
    expect(monthTotals(s.data.transactions, '2026-11')).toEqual(t);
    // "Para onde foi o dinheiro" (gastos por categoria) não inclui estornos.
    expect(byCategory(s.data.transactions, 'despesa')).toEqual([{ category: 'Material', amount: 4_000 }]);
    expect(s.data.transactions.map(movementKind).sort()).toEqual(['despesa', 'estorno', 'receita']);
  });

  it('despesa comum com a categoria "Estorno" (sem marcador de pagamento) continua sendo despesa', async () => {
    const s = await app();
    await expense(s, '15,00', 'Estorno');
    expect(totals(s.data.transactions)).toEqual({ income: 0, refund: 0, expense: 1_500, balance: -1_500 });
  });

  it('registros da beta.1 (mesmo marcador) são reclassificados sem gravar nada', async () => {
    const s = await app();
    const a = await appt(s);
    const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000 });
    await s.refundPayment(p!.id, { amount: 2_500 });
    // Backup como o da beta.1: restaurar mantém os registros idênticos e a nova leitura.
    const json = s.exportBackup();
    const r = await app();
    await r.importBackup(json);
    expect(JSON.stringify(r.data.transactions)).toBe(JSON.stringify(s.data.transactions));
    expect(totals(r.data.transactions)).toMatchObject({ income: 10_000, refund: 2_500, expense: 0, balance: 7_500 });
  });

  it('extrato: CSV com tipo "Estorno" negativo; PDF com o resumo de estornos; totais iguais aos da tela', async () => {
    const s = await app();
    const a = await appt(s);
    const { transaction: p } = await s.registerPayment(a.id, { amount: 20_000 });
    await s.refundPayment(p!.id, { amount: 3_000 });
    await expense(s, '10,00');
    const st = buildStatement(s.data, '2026-11', clock);
    expect(st.totals).toEqual(totals(s.data.transactions));
    expect(st.expenseByCategory).toEqual([{ category: 'Material', amount: 1_000 }]);
    const csv = statementCsv(st);
    expect(csv).toMatch(/;Estorno;Estorno;Estorno: Coloração;-30,00\r\n/);
    expect(csv).toMatch(/;Despesa;Material;Compra;-10,00\r\n/);
    const pdf = latin1(statementPdf(st, '0.5.0-beta.2'));
    expect(pdf).toContain('(Estornos)');
    expect(pdf).toContain('(Estorno)');
    // Mês sem estorno: o resumo do PDF continua com três quadros (sem "Estornos").
    const plain = await app();
    await expense(plain, '10,00');
    expect(latin1(statementPdf(buildStatement(plain.data, '2026-11', clock), '0.5.0-beta.2'))).not.toContain('(Estornos)');
  });
});

describe('beta.2: estornos parciais', () => {
  it('vários estornos parciais do mesmo pagamento: histórico completo, limite respeitado, saldo consistente', async () => {
    const s = await app();
    const a = await appt(s, '100,00');
    const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000 });
    await s.refundPayment(p!.id, { amount: 3_000 });
    clock = new Date(clock.getTime() + 1000);
    await s.refundPayment(p!.id, { amount: 2_000 });
    await expect(s.refundPayment(p!.id, { amount: 5_001 })).rejects.toThrow(/até 50,00/);
    expect(s.data.transactions.filter((t) => t.type === 'despesa')).toHaveLength(2);
    expect(s.data.transactions.find((t) => t.id === p!.id)).toMatchObject({ amount: 10_000 });
    expect(paymentSummary(s.data.appointments[0]!, s.data.transactions)).toMatchObject({ received: 10_000, refunded: 5_000, net: 5_000, pending: 5_000 });
    expect(totals(s.data.transactions)).toEqual({ income: 10_000, refund: 5_000, expense: 0, balance: 5_000 });
  });

  it('estornos não dão nem tiram XP', async () => {
    const s = await app();
    const a = await appt(s);
    const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000 });
    const xp = totalXp(s.data.xpEvents);
    await s.refundPayment(p!.id, { amount: 1_000 });
    await s.refundPayment(p!.id, { amount: 'total' });
    expect(totalXp(s.data.xpEvents)).toBe(xp);
  });
});

describe('beta.2: sincronização e modo offline', () => {
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
  const all = async (...ds: { sync: SyncEngine }[]) => { for (let i = 0; i < 2; i++) for (const d of ds) await d.sync.sync(); };
  const sorted = (txs: Transaction[]) => txs.map((t) => `${movementKind(t)}:${t.amount}`).sort();

  it('estornos parciais offline em dois aparelhos: os dois ficam, uma vez cada; totais iguais nos dois', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service, '100,00');
    const { transaction: p } = await a.service.registerPayment(x.id, { amount: 10_000 });
    await all(a, b);
    remote.offline = true;
    await a.service.refundPayment(p!.id, { amount: 3_000 });
    clock = new Date(clock.getTime() + 1000);
    await b.service.refundPayment(p!.id, { amount: 2_000 });
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) {
      expect(sorted(d.service.data.transactions)).toEqual(['estorno:2000', 'estorno:3000', 'receita:10000']);
      expect(totals(d.service.data.transactions)).toEqual({ income: 10_000, refund: 5_000, expense: 0, balance: 5_000 });
    }
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });

  it('beta.3: "estornar tudo" nos dois aparelhos offline mantém os dois e pede revisão (nada some sozinho)', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service, '100,00');
    const { transaction: p } = await a.service.registerPayment(x.id, { amount: 10_000 });
    await all(a, b);
    remote.offline = true;
    await a.service.refundPayment(p!.id, { amount: 'total' });
    clock = new Date(clock.getTime() + 1000);
    await b.service.refundPayment(p!.id, { amount: 'total' });
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) {
      expect(totals(d.service.data.transactions)).toEqual({ income: 10_000, refund: 20_000, expense: 0, balance: -10_000 });
      expect(refundIssues(d.service.data.transactions)).toMatchObject([{ kind: 'acima-do-pago', excess: 10_000 }]);
    }
  });

  it('duração: apagar num aparelho (null) sincroniza; sem duração nunca vira 60 min no outro', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service, '100,00', { duration: '90' });
    const y = await appt(a.service, '100,00', { time: '16:00' });
    await all(a, b);
    expect(b.service.data.appointments.find((q) => q.id === x.id)!.duration).toBe(90);
    expect('duration' in b.service.data.appointments.find((q) => q.id === y.id)!).toBe(false);
    remote.offline = true;
    const input = { title: 'Coloração', clientId: '', date: '2026-11-07', time: '14:00', price: '100,00', notes: '', duration: '' };
    await a.service.saveAppointment(input, x.id);
    remote.offline = false;
    await all(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.appointments.find((q) => q.id === x.id)!.duration).toBeNull();
      expect('duration' in d.service.data.appointments.find((q) => q.id === y.id)!).toBe(false);
    }
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });
});
