/**
 * 0.5.0-beta.4 — relatórios gerenciais: fórmulas, separação entre caixa, pendente e previsto, estornos (inclusive
 * em revisão), meses vazios, valores altos e coerência com Finanças e o extrato.
 */
import { monthTotals } from '../domain/finance';
import { signed } from '../test/backupFile';
import { buildStatement } from '../domain/statement';
import { cashHistory, monthReport } from '../domain/reports';
import { totalXp } from '../gamification/engine';
import { createMemoryAdapter } from '../storage/memory';
import { AppService } from './service';

const clock = new Date(2026, 10, 12, 9, 0);
const now = () => clock;

async function setup() {
  const s = await AppService.load(createMemoryAdapter(), now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const carla = (await s.saveClient({ name: 'Carla', phone: '', email: '', address: '', notes: '' })).client;
  const juli = (await s.saveClient({ name: 'Juliana', phone: '', email: '', address: '', notes: '' })).client;
  const ap = (title: string, clientId: string, date: string, price: string) => s.saveAppointment({ title, clientId, date, time: '10:00', price, notes: '' }).then((r) => r.appointment);
  // Outubro: antecipado em outubro de um serviço de novembro; despesa grande → saldo negativo.
  const col = await ap('Coloração', carla.id, '2026-11-05', '300,00');
  await s.registerPayment(col.id, { amount: 10_000, date: '2026-10-28' });
  await s.saveTransaction({ type: 'despesa', amount: '500,00', description: 'Aluguel', category: 'Aluguel', date: '2026-10-05' });
  // Novembro.
  await s.completeAppointment(col.id, { payment: { mode: 'integral', date: '2026-11-05' } }); // +200 (restante)
  const corte = await ap('Corte', carla.id, '2026-11-06', '60,00');
  await s.completeAppointment(corte.id, { payment: { mode: 'parcial', amount: 2_000, date: '2026-11-06' } }); // pendente 40
  const corte2 = await ap('corte ', juli.id, '2026-11-07', '60,00');
  const { transaction: p } = (await s.registerPayment(corte2.id, { amount: 6_000, date: '2026-11-07' }));
  await s.completeAppointment(corte2.id, { payment: { mode: 'nenhum' } });
  await s.refundPayment(p!.id, { amount: 1_000, date: '2026-11-08' }); // estorno parcial
  const mani = await ap('Manicure', juli.id, '2026-11-09', '50,00');
  await s.completeAppointment(mani.id, { payment: { mode: 'nenhum' } }); // tudo pendente
  await ap('Escova', carla.id, '2026-11-20', '80,00'); // previsto
  await s.saveTransaction({ type: 'receita', amount: '30,00', description: 'Venda de produto', category: 'Venda de produtos', date: '2026-11-10' });
  await s.saveTransaction({ type: 'despesa', amount: '45,00', description: 'Tintas', category: 'Produtos', date: '2026-11-03' });
  return { s, carla, juli };
}

describe('relatórios: fórmulas', () => {
  it('novembro: bruta, estornos, líquida, despesas e saldo; antecipado contado no mês em que entrou', async () => {
    const { s } = await setup();
    const r = monthReport(s.data, '2026-11');
    // Recebimentos de novembro: 200 (restante) + 20 (parcial) + 60 + 30 (avulsa) = 310.
    expect(r.totals).toEqual({ gross: 31_000, refunds: 1_000, net: 30_000, expense: 4_500, balance: 25_500 });
    // Outubro: antecipado de 100 − aluguel de 500 = −400 (negativo).
    expect(r.previous).toEqual({ gross: 10_000, refunds: 0, net: 10_000, expense: 50_000, balance: -40_000 });
    expect(r.change.gross).toBe(210);
  });

  it('pendente e previsto separados do caixa; nunca entram no saldo', async () => {
    const { s } = await setup();
    const r = monthReport(s.data, '2026-11');
    expect(r.pending).toEqual({ amount: 4_000 + 1_000 + 5_000, count: 3 }); // corte 40, corte2 10 (estorno), manicure 50
    expect(r.forecast).toEqual({ amount: 8_000, count: 1 });
    expect(r.totals.balance).toBe(r.totals.gross - r.totals.refunds - r.totals.expense);
  });

  it('ticket médio, serviços, clientes recorrentes e categorias', async () => {
    const { s } = await setup();
    const r = monthReport(s.data, '2026-11');
    // Concluídos em novembro com algo recebido: Coloração 300, Corte 20, corte2 50 → 370 ÷ 3.
    expect(r.ticket).toEqual({ value: 12_333, numerator: 37_000, denominator: 3 });
    expect(r.completed).toBe(4);
    expect(r.incomeByService).toEqual([
      { service: 'Coloração', amount: 20_000, count: 1 },
      { service: 'corte', amount: 6_000, count: 1 },
      { service: 'Outras receitas', amount: 3_000, count: 1 },
      { service: 'Corte', amount: 2_000, count: 1 },
    ]);
    expect(r.incomeByService.reduce((n, x) => n + x.amount, 0)).toBe(r.totals.gross);
    expect(r.recurringClients).toEqual([{ clientId: expect.any(String), name: 'Carla', count: 2 }, { clientId: expect.any(String), name: 'Juliana', count: 2 }]);
    expect(r.topServices[0]).toEqual({ service: 'Coloração', count: 1 });
    expect(r.expenseByCategory).toEqual([{ category: 'Produtos', amount: 4_500 }]);
  });

  it('bate com Finanças e o extrato (mesma fonte) e o histórico de 6/12 meses inclui meses vazios com zero', async () => {
    const { s } = await setup();
    const fin = monthTotals(s.data.transactions, '2026-11');
    const st = buildStatement(s.data, '2026-11', clock).totals;
    const r = monthReport(s.data, '2026-11').totals;
    expect([r.gross, r.refunds, r.expense, r.balance]).toEqual([fin.income, fin.refund, fin.expense, fin.balance]);
    expect([r.gross, r.refunds, r.expense, r.balance]).toEqual([st.income, st.refund, st.expense, st.balance]);
    const h6 = cashHistory(s.data, '2026-11', 6);
    expect(h6.map((x) => x.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(h6[0]).toEqual({ month: '2026-06', gross: 0, refunds: 0, net: 0, expense: 0, balance: 0 });
    expect(cashHistory(s.data, '2026-11', 12)).toHaveLength(12);
  });

  it('mês sem movimentação: zero (não erro) e marcado como vazio', async () => {
    const { s } = await setup();
    const r = monthReport(s.data, '2026-03');
    expect(r).toMatchObject({ empty: true, completed: 0, ticket: { value: null }, totals: { gross: 0, balance: 0 } });
    expect(r.incomeByService).toEqual([]);
  });

  it('estorno integral e estorno em revisão: o relatório sinaliza que os totais não estão reconciliados', async () => {
    const { s } = await setup();
    const json = JSON.parse(s.exportBackup());
    const pay = json.data.transactions.find((t: { description: string; type: string }) => t.type === 'receita' && t.description === 'corte');
    json.data.transactions.push({ ...json.data.transactions.find((t: { type: string; payment?: { kind?: string } }) => t.payment?.kind === 'estorno'), id: 'outro', amount: 6_000, date: '2026-11-09', createdAt: '2026-11-09T10:00:00Z' });
    await s.importBackup(signed(json));
    const r = monthReport(s.data, '2026-11');
    expect(r.review).toEqual({ count: 1, inMonth: true });
    expect(r.totals.refunds).toBe(7_000);
    expect(pay).toBeTruthy();
    expect(monthReport(s.data, '2026-09').review).toEqual({ count: 1, inMonth: false });
  });

  it('valores altos em centavos inteiros; consultar relatórios não muda dados nem XP', async () => {
    const { s } = await setup();
    for (let i = 0; i < 120; i++) await s.saveTransaction({ type: 'receita', amount: '1.000.000,00', description: `Contrato ${i}`, category: 'Atendimento', date: '2026-11-11' });
    const before = JSON.stringify(s.data);
    const xp = totalXp(s.data.xpEvents);
    const r = monthReport(s.data, '2026-11');
    expect(r.totals.gross).toBe(31_000 + 120 * 100_000_000);
    expect(Number.isSafeInteger(r.totals.balance)).toBe(true);
    expect(JSON.stringify(s.data)).toBe(before);
    expect(totalXp(s.data.xpEvents)).toBe(xp);
  });
});
