/**
 * Auditoria pré-RC (0.5.0) — "A receber" (Painel, Finanças) e o relatório do mês recalculavam os pagamentos de cada
 * atendimento percorrendo todos os lançamentos: tempo quadrático (≈ 2 s com 15 mil atendimentos e 15 mil
 * lançamentos; ≈ 9 s com 30 mil). Agora cada atendimento recebe só os próprios lançamentos.
 * Orçamento folgado (o tempo linear fica bem abaixo de 100 ms); o quadrático passa de vários segundos.
 */
import type { Appointment, Transaction } from './types';
import { paymentSummary, receivables } from './payments';
import { monthReport } from './reports';

const N = 20_000;
const appts = Array.from({ length: N }, (_, i) => ({
  id: `a${i}`, createdAt: 'x', updatedAt: 'x', title: 'Corte', clientId: '', date: '2026-10-01', time: '10:00', price: 10_000, notes: '',
  status: 'concluido', completedAt: '2026-10-01T13:00:00.000Z', transactionId: null, payments: true,
})) as Appointment[];
const txs = Array.from({ length: N }, (_, i) => ({
  id: `t${i}`, createdAt: `x${i}`, updatedAt: 'x', type: 'receita', amount: i % 2 ? 10_000 : 4_000, category: 'Serviços', description: 'Corte',
  date: '2026-10-01', appointmentId: `a${i}`, payment: { kind: 'pagamento', method: null, key: null },
})) as unknown as Transaction[];

const ms = (fn: () => unknown) => { const t0 = performance.now(); fn(); return performance.now() - t0; };

describe('auditoria pré-RC: volume', () => {
  it('a receber com 20 mil atendimentos e 20 mil lançamentos é linear e dá o mesmo resultado', () => {
    let r!: { pending: number; count: number };
    expect(ms(() => { r = receivables(appts, txs); })).toBeLessThan(1_000);
    // Mesmo resultado que o cálculo atendimento a atendimento (amostra).
    expect(r).toEqual({ pending: (N / 2) * 6_000, count: N / 2 });
    for (const i of [0, 1, 777, N - 1]) expect(paymentSummary(appts[i]!, txs).pending).toBe(i % 2 ? 0 : 6_000);
  });

  it('relatório do mês com 20 mil atendimentos concluídos no mês é linear', () => {
    const data = { appointments: appts, transactions: txs, clients: [] } as unknown as Parameters<typeof monthReport>[0];
    let rep!: ReturnType<typeof monthReport>;
    expect(ms(() => { rep = monthReport(data, '2026-10'); })).toBeLessThan(1_500);
    expect(rep.pending).toEqual({ amount: (N / 2) * 6_000, count: N / 2 });
    expect(rep.ticket.denominator).toBe(N);
  });
});

describe('auditoria pré-RC: séries com volume', () => {
  it('agrupamento por série é calculado uma vez por lista (cada cartão da Agenda reagrupava todos os atendimentos)', async () => {
    const { seriesGroups, seriesGroupsOf } = await import('./recurrence');
    const rule = { id: 's', freq: 'semanal', interval: 1, days: [1], start: '2016-01-04', through: '2026-12-28', until: null, count: null, v: '1' };
    // Série semanal de 10 anos (~520 ocorrências) + avulsos.
    const list = [
      ...Array.from({ length: 520 }, (_, i) => ({ ...appts[i]!, id: `s-${i}`, date: `2016-${String((i % 12) + 1).padStart(2, '0')}-01`, series: rule })),
      ...appts.slice(0, 1000),
    ] as Appointment[];
    const g1 = seriesGroupsOf(list);
    expect(seriesGroupsOf(list)).toBe(g1); // mesma lista → mesmo resultado, sem recalcular
    expect(seriesGroupsOf([...list])).not.toBe(g1); // lista nova (estado mudou) → recalcula
    expect([...g1.get('s')!].map((a) => a.id)).toEqual([...seriesGroups(list).get('s')!].map((a) => a.id));
    expect(g1.get('s')).toHaveLength(520);
  });
});

describe('auditoria pré-RC: visão Mês da Agenda com volume', () => {
  // Implementação anterior (referência): percorria todos os atendimentos uma vez por dia da grade (42×).
  async function oldByDay<T extends Appointment>(list: readonly T[], keys: readonly string[]) {
    const { dayNumber, intervalOf } = await import('./agenda');
    const DAY = 1440;
    const out = new Map<string, T[]>(keys.map((k) => [k, []]));
    for (const k of keys) {
      const d0 = dayNumber(k) * DAY;
      for (const a of list) {
        const iv = intervalOf(a);
        if (iv?.known ? iv.start < d0 + DAY && iv.end > d0 : a.date === k) out.get(k)!.push(a);
      }
      out.get(k)!.sort((x, y) => (intervalOf(x)?.start ?? Infinity) - (intervalOf(y)?.start ?? Infinity));
    }
    return out;
  }

  it('mesmo resultado da implementação anterior (meia-noite, sem horário, sem duração, durações longas) e em uma passada', async () => {
    const { byDay, monthGrid } = await import('./agenda');
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const list = Array.from({ length: 4_000 }, (_, i) => ({
      ...appts[0]!, id: `x${i}`, status: ['agendado', 'concluido', 'cancelado'][rnd(3)],
      date: `2026-${String(9 + rnd(4)).padStart(2, '0')}-${String(1 + rnd(28)).padStart(2, '0')}`,
      time: rnd(8) === 0 ? '' : `${String(rnd(24)).padStart(2, '0')}:${['00', '15', '30', '45'][rnd(4)]}`,
      duration: [null, 30, 60, 90, 600, 1440, 2000][rnd(7)],
    })) as Appointment[];
    for (const month of ['2026-10-15', '2026-11-01', '2026-12-31']) {
      const keys = monthGrid(month).flat();
      const expected = await oldByDay(list, keys);
      const got = byDay(list, keys);
      for (const k of keys) expect(got.get(k)!.map((a) => a.id), k).toEqual(expected.get(k)!.map((a) => a.id));
    }
    const big = Array.from({ length: 30_000 }, (_, i) => ({ ...list[i % list.length]!, id: `y${i}` }));
    const keys = monthGrid('2026-11-01').flat();
    expect(ms(() => byDay(big, keys))).toBeLessThan(400);
  });
});

describe('auditoria pré-RC: cartões de atendimento com volume', () => {
  it('resumo de pagamentos indexado dá o mesmo resultado e reaproveita o índice da mesma lista', async () => {
    const { paymentSummaryIn } = await import('./payments');
    const refunds = Array.from({ length: 50 }, (_, i) => ({
      id: `r${i}`, createdAt: `y${i}`, updatedAt: 'y', type: 'despesa', amount: 1_000, category: 'Estorno', description: 'Estorno',
      date: '2026-10-02', appointmentId: `a${i * 2 + 1}`, payment: { kind: 'estorno', of: `t${i * 2 + 1}`, key: null },
    })) as unknown as Transaction[];
    const all = [...txs, ...refunds];
    for (const i of [0, 1, 3, 99, 101, N - 1]) expect(paymentSummaryIn(appts[i]!, all)).toEqual(paymentSummary(appts[i]!, all));
    const t = ms(() => { for (let i = 0; i < 2_000; i++) paymentSummaryIn(appts[i]!, all); });
    expect(t).toBeLessThan(500); // 2 mil cartões × 20 mil lançamentos; sem índice ≈ segundos
  });
});
