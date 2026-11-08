/**
 * 0.5.0-beta.3 — histórico do cliente: totais batem com Finanças, tipos de pagamento, legado não presumido,
 * estornos, cliente excluído e nenhum XP.
 */
import { clientHistory } from '../domain/clientHistory';
import { totals } from '../domain/finance';
import { totalXp } from '../gamification/engine';
import { createMemoryAdapter } from '../storage/memory';
import { AppService } from './service';

const clock = new Date(2026, 10, 10, 9, 0);
const now = () => clock;
const TODAY = '2026-11-10';

async function setup() {
  const s = await AppService.load(createMemoryAdapter(), now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const { client } = await s.saveClient({ name: 'Carla', phone: '', email: '', address: '', notes: '' });
  const ap = (title: string, date: string, price: string) => s.saveAppointment({ title, clientId: client.id, date, time: '10:00', price, notes: '' }).then((r) => r.appointment);
  const integral = await ap('Corte', '2026-11-02', '60,00');
  await s.completeAppointment(integral.id, { payment: { mode: 'integral' } });
  const partial = await ap('Coloração', '2026-11-05', '300,00');
  await s.completeAppointment(partial.id, { payment: { mode: 'parcial', amount: 10_000 } });
  const future = await ap('Escova', '2026-11-20', '80,00');
  await s.registerPayment(future.id, { amount: 3_000, date: TODAY }); // antecipado
  const refunded = await ap('Manicure', '2026-11-06', '50,00');
  await s.completeAppointment(refunded.id, { payment: { mode: 'integral' } });
  await s.refundPayment(s.data.transactions.find((t) => t.appointmentId === refunded.id)!.id, { amount: 2_000 });
  // Outro cliente e lançamento avulso não entram.
  await s.saveAppointment({ title: 'Outro', clientId: '', date: '2026-11-03', time: '', price: '999,00', notes: '' });
  await s.saveTransaction({ type: 'receita', amount: '500,00', description: 'Avulsa', category: 'Outros', date: TODAY });
  return { s, client, integral, partial, future, refunded };
}

describe('histórico do cliente', () => {
  it('resumo: realizados, último, contratado, recebido, estornado, pendente — batendo com os lançamentos', async () => {
    const { s, client, future } = await setup();
    const h = clientHistory(client.id, s.data.appointments, s.data.transactions, TODAY);
    // Pendente: Coloração R$ 200 + Manicure R$ 20 (estornado de um pagamento integral de R$ 50).
    expect(h).toMatchObject({ completedCount: 3, contracted: 41_000, received: 6_000 + 10_000 + 3_000 + 5_000, refunded: 2_000, pending: 22_000, advanceOpen: 3_000, notRegistered: 0, inReview: 0 });
    expect(h.lastCompleted!.title).toBe('Manicure');
    expect(h.upcoming.map((a) => a.id)).toEqual([future.id]);
    // Mesma fonte de Finanças: Σ das receitas vinculadas do cliente.
    const linked = s.data.transactions.filter((t) => s.data.appointments.some((a) => a.id === t.appointmentId && a.clientId === client.id));
    const t = totals(linked);
    expect([t.income, t.refund]).toEqual([h.received, h.refunded]);
  });

  it('linha do tempo: mais recente primeiro; pagamentos antecipado, parcial e integral, e estorno', async () => {
    const { s, client } = await setup();
    const h = clientHistory(client.id, s.data.appointments, s.data.transactions, TODAY);
    const money = h.timeline.filter((e) => e.kind === 'dinheiro').map((e) => (e.kind === 'dinheiro' ? `${e.a.title}:${e.money}` : ''));
    expect(money).toEqual(expect.arrayContaining(['Corte:integral', 'Coloração:parcial', 'Escova:antecipado', 'Manicure:integral', 'Manicure:estorno']));
    const dates = h.timeline.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(h.timeline.some((e) => e.kind === 'atendimento' && e.a.title === 'Escova')).toBe(false); // futuro fica em "Próximos"
  });

  it('serviço antigo sem receita: "não registrado" (não vira pendente); cliente excluído some do histórico; consulta não dá XP', async () => {
    const { s, client } = await setup();
    const json = JSON.parse(s.exportBackup());
    json.data.appointments.push({ id: 'velho', title: 'Antigo', clientId: client.id, date: '2026-10-01', time: '', price: 4_000, status: 'concluido', notes: '', completedAt: 'x', transactionId: null, createdAt: 'x', updatedAt: 'x' });
    await s.importBackup(JSON.stringify(json));
    const xp = totalXp(s.data.xpEvents);
    const h = clientHistory(client.id, s.data.appointments, s.data.transactions, TODAY);
    expect(h).toMatchObject({ notRegistered: 1, pending: 22_000, completedCount: 4 }); // o antigo não soma ao pendente
    expect(totalXp(s.data.xpEvents)).toBe(xp);
    await s.deleteClient(client.id);
    expect(clientHistory(client.id, s.data.appointments, s.data.transactions, TODAY).timeline).toEqual([]);
  });
});
