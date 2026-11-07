/**
 * 0.5 — pagamentos avançados: serviço realizado × dinheiro recebido. Cobre antecipado, parcial,
 * integral, estorno, excedente, operações repetidas, sincronização entre aparelhos, dados legados,
 * backup e integridade do XP. Tudo em centavos inteiros.
 */
import { totals } from '../domain/finance';
import { duplicatePaymentIds, paymentSummary, receivables } from '../domain/payments';
import { totalXp } from '../gamification/engine';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { MemoryRemote } from '../sync/memoryRemote';
import { TrackedStorage } from '../sync/tracked';
import { AppService, UNDO_TTL_MS } from './service';

let clock = new Date(2026, 10, 7, 10, 0);
const now = () => clock;
beforeEach(() => { clock = new Date(2026, 10, 7, 10, 0); });

async function app(storage = createMemoryAdapter()) {
  const s = await AppService.load(storage, now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return s;
}
const appt = (s: AppService, price = '300,00', date = '2026-11-10') =>
  s.saveAppointment({ title: 'Coloração', clientId: '', date, time: '14:00', price, notes: '' }).then((r) => r.appointment);
const ap = (s: AppService, id: string) => s.data.appointments.find((a) => a.id === id)!;
const sum = (s: AppService, id: string) => paymentSummary(ap(s, id), s.data.transactions);

describe('resumo: contratado, recebido, estornado, pendente', () => {
  it('serviço novo nasce com controle de pagamento e tudo a receber', async () => {
    const s = await app();
    const a = await appt(s);
    expect(ap(s, a.id).payments).toBe(true);
    expect(sum(s, a.id)).toMatchObject({ contracted: 30_000, received: 0, refunded: 0, net: 0, pending: 30_000, state: 'pendente' });
  });

  it('antecipado → parcial → concluir com "recebi tudo que faltava" registra só o restante, nunca uma segunda receita', async () => {
    const s = await app();
    const a = await appt(s);
    await s.registerPayment(a.id, { amount: 10_000, method: 'pix', date: '2026-11-07' });
    expect(sum(s, a.id)).toMatchObject({ net: 10_000, pending: 20_000, state: 'parcial', advance: true });
    await s.completeAppointment(a.id, { payment: { mode: 'integral', method: 'dinheiro' } });
    expect(s.data.transactions.map((t) => t.amount)).toEqual([10_000, 20_000]);
    expect(sum(s, a.id)).toMatchObject({ received: 30_000, pending: 0, state: 'pago' });
    // Concluir integral de um serviço já pago (reaberto e concluído de novo) não lança nada.
    await s.setAppointmentStatus(a.id, 'agendado');
    await s.completeAppointment(a.id, { payment: { mode: 'integral' } });
    expect(s.data.transactions).toHaveLength(2);
    expect(totals(s.data.transactions).income).toBe(30_000);
  });

  it('concluir sem pagamento deixa a receber; parcial mostra o pendente; caixa só tem o recebido', async () => {
    const s = await app();
    const a = await appt(s);
    await s.completeAppointment(a.id, { payment: { mode: 'nenhum' } });
    expect(s.data.transactions).toEqual([]);
    expect(sum(s, a.id)).toMatchObject({ pending: 30_000, state: 'pendente' });
    const b = await appt(s);
    await s.completeAppointment(b.id, { payment: { mode: 'parcial', amount: 10_000 } });
    expect(totals(s.data.transactions).income).toBe(10_000); // R$ 300 com R$ 100 pago: 100 no caixa
    expect(sum(s, b.id)).toMatchObject({ pending: 20_000, state: 'parcial' });
    expect(receivables(s.data.appointments, s.data.transactions)).toEqual({ pending: 50_000, count: 2 });
  });

  it('estorno reduz o líquido e o saldo sem apagar o pagamento; não estorna mais do que foi pago', async () => {
    const s = await app();
    const a = await appt(s);
    const { transaction: p } = await s.completeAppointment(a.id, { payment: { mode: 'integral' } }).then(() => ({ transaction: s.data.transactions[0]! }));
    await s.refundPayment(p.id, { amount: 5_000 });
    expect(s.data.transactions.find((t) => t.id === p.id)).toMatchObject({ amount: 30_000 }); // original intacto
    expect(sum(s, a.id)).toMatchObject({ received: 30_000, refunded: 5_000, net: 25_000, pending: 5_000, state: 'parcial' });
    const t = totals(s.data.transactions);
    expect([t.income, t.expense, t.balance]).toEqual([30_000, 5_000, 25_000]);
    await expect(s.refundPayment(p.id, { amount: 25_001 })).rejects.toThrow(/até 250,00/);
    await s.refundPayment(p.id, { amount: 'total' });
    expect(sum(s, a.id)).toMatchObject({ refunded: 30_000, net: 0, pending: 30_000 });
    await expect(s.refundPayment(p.id, { amount: 'total' })).rejects.toThrow(/maior que zero/);
    // Pagamento com estorno não pode ser apagado (o estorno ficaria órfão).
    await expect(s.deleteTransaction(p.id)).rejects.toThrow(/estorno/);
    expect(sum(s, a.id).entries.map((e) => e.kind)).toEqual(['pagamento', 'estorno', 'estorno']);
  });

  it('valor excedente: aceita, avisa e nunca vira pendência negativa', async () => {
    const s = await app();
    const a = await appt(s, '100,00');
    await s.registerPayment(a.id, { amount: 15_000 });
    expect(sum(s, a.id)).toMatchObject({ net: 15_000, pending: 0, excess: 5_000, state: 'excedente' });
  });

  it('cancelar: nada fica a receber, o que entrou continua; precisão em centavos com valores altos', async () => {
    const s = await app();
    const a = await appt(s, '999.999,99');
    await s.registerPayment(a.id, { amount: 33_333_333 });
    await s.registerPayment(a.id, { amount: 33_333_333 });
    expect(sum(s, a.id)).toMatchObject({ net: 66_666_666, pending: 33_333_333 });
    await s.setAppointmentStatus(a.id, 'cancelado');
    expect(sum(s, a.id)).toMatchObject({ pending: 0, state: 'cancelado', net: 66_666_666 });
    expect(Number.isInteger(totals(s.data.transactions).income)).toBe(true);
  });
});

describe('operações repetidas e Desfazer', () => {
  it('o mesmo id de operação nunca cria dois pagamentos ou estornos (toque duplo, reenvio)', async () => {
    const s = await app();
    const a = await appt(s);
    const r1 = await s.registerPayment(a.id, { amount: 10_000, opId: 'op-1' });
    const r2 = await s.registerPayment(a.id, { amount: 10_000, opId: 'op-1' });
    expect(r2.transaction!.id).toBe(r1.transaction!.id);
    expect(s.data.transactions).toHaveLength(1);
    await s.refundPayment(r1.transaction!.id, { amount: 1_000, opId: 'op-2' });
    await s.refundPayment(r1.transaction!.id, { amount: 1_000, opId: 'op-2' });
    expect(s.data.transactions).toHaveLength(2);
  });

  it('Desfazer um pagamento remove só ele; desfazer a conclusão remove o pagamento criado nela', async () => {
    const s = await app();
    const a = await appt(s);
    await s.registerPayment(a.id, { amount: 10_000 });
    const r = await s.registerPayment(a.id, { amount: 5_000 });
    await s.undo(r.undo!);
    expect(s.data.transactions.map((t) => t.amount)).toEqual([10_000]);
    const fb = await s.completeAppointment(a.id, { payment: { mode: 'integral' } });
    expect(s.data.transactions.map((t) => t.amount)).toEqual([10_000, 20_000]);
    await s.undo(fb.undo!);
    expect(s.data.transactions.map((t) => t.amount)).toEqual([10_000]);
    expect(ap(s, a.id).status).toBe('agendado');
    clock = new Date(clock.getTime() + UNDO_TTL_MS + 1);
  });

  it('reabrir, cancelar, editar e excluir o serviço nunca apagam pagamentos parciais nem estornos', async () => {
    const s = await app();
    const a = await appt(s);
    const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000 });
    await s.refundPayment(p!.id, { amount: 2_000 });
    await s.completeAppointment(a.id, { payment: { mode: 'parcial', amount: 5_000 } });
    await s.setAppointmentStatus(a.id, 'agendado');
    await s.saveAppointment({ title: 'Coloração e corte', clientId: '', date: '2026-11-11', time: '15:00', price: '350,00', notes: '' }, a.id);
    await s.setAppointmentStatus(a.id, 'cancelado');
    await s.deleteAppointment(a.id);
    expect(s.data.transactions.map((t) => [t.type, t.amount]).sort()).toEqual([['despesa', 2_000], ['receita', 10_000], ['receita', 5_000]].sort());
    expect(totals(s.data.transactions).balance).toBe(13_000);
  });
});

describe('XP', () => {
  it('pagamentos, estornos, Desfazer e restaurar nunca dão XP; concluir dá uma vez só', async () => {
    const s = await app();
    const a = await appt(s);
    const xp0 = totalXp(s.data.xpEvents);
    const r = await s.registerPayment(a.id, { amount: 10_000 });
    await s.refundPayment(r.transaction!.id, { amount: 1_000 });
    expect(totalXp(s.data.xpEvents)).toBe(xp0);
    const fb = await s.completeAppointment(a.id, { payment: { mode: 'integral' } });
    const xp1 = totalXp(s.data.xpEvents);
    expect(fb.xpGained).toBeGreaterThan(0);
    await s.undo(fb.undo!);
    await s.completeAppointment(a.id, { payment: { mode: 'integral' } });
    expect(totalXp(s.data.xpEvents)).toBe(xp1);
    await s.importBackup(s.exportBackup());
    expect(totalXp(s.data.xpEvents)).toBe(xp1);
    expect(s.data.xpEvents.filter((e) => e.key.startsWith('transaction_created')).length).toBe(0);
  });
});

describe('dados legados (0.4) não são reinterpretados', () => {
  async function legacy() {
    const s = await app();
    // Registros como a 0.4 gravava: sem `payments`, receita automática sem marcador.
    const json = JSON.parse(s.exportBackup());
    const base = { clientId: null, time: '', notes: '', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' };
    json.data.appointments.push(
      { ...base, id: 'old-pago', title: 'Corte', date: '2026-10-01', price: 6_000, status: 'concluido', completedAt: '2026-10-01T12:00:00.000Z', transactionId: 'old-tx' },
      { ...base, id: 'old-sem', title: 'Escova', date: '2026-10-02', price: 5_000, status: 'concluido', completedAt: '2026-10-02T12:00:00.000Z', transactionId: null },
      { ...base, id: 'old-agenda', title: 'Manicure', date: '2026-11-20', price: 4_000, status: 'agendado', completedAt: null, transactionId: null },
    );
    json.data.transactions.push({ id: 'old-tx', type: 'receita', amount: 6_000, description: 'Corte', category: 'Serviços', date: '2026-10-01', appointmentId: 'old-pago', createdAt: base.createdAt, updatedAt: base.updatedAt });
    await s.importBackup(JSON.stringify(json));
    return s;
  }

  it('receita automática antiga = pago; concluído sem receita = "pagamento não registrado" (fora do a receber); saldos iguais', async () => {
    const s = await legacy();
    const before = totals(s.data.transactions);
    expect(sum(s, 'old-pago')).toMatchObject({ state: 'pago', net: 6_000, pending: 0 });
    expect(sum(s, 'old-pago').entries[0]!.kind).toBe('legado');
    expect(sum(s, 'old-sem')).toMatchObject({ state: 'nao-registrado', pending: 0, tracked: false });
    expect(receivables(s.data.appointments, s.data.transactions).pending).toBe(0);
    expect(s.data.appointments.find((a) => a.id === 'old-sem')!.payments).toBeUndefined(); // nada gravado
    expect(totals(s.data.transactions)).toEqual(before);
  });

  it('registrar pagamento num legado ativa o controle só nele; estorno de receita automática antiga funciona', async () => {
    const s = await legacy();
    await s.registerPayment('old-sem', { amount: 5_000 });
    expect(sum(s, 'old-sem')).toMatchObject({ state: 'pago', tracked: true });
    expect(ap(s, 'old-sem').payments).toBe(true);
    await s.refundPayment('old-tx', { amount: 1_000 });
    expect(sum(s, 'old-pago')).toMatchObject({ net: 5_000, pending: 1_000, state: 'parcial' });
  });

  it('backup: exportar e restaurar preserva pagamentos, estornos e marcadores sem duplicar', async () => {
    const s = await legacy();
    const a = await appt(s);
    const r = await s.registerPayment(a.id, { amount: 10_000, method: 'pix' });
    await s.refundPayment(r.transaction!.id, { amount: 2_000 });
    const json = s.exportBackup();
    const t = await app();
    await t.importBackup(json);
    await t.importBackup(json); // restaurar duas vezes não duplica
    expect(t.data.transactions).toHaveLength(s.data.transactions.length);
    expect(paymentSummary(ap(t, a.id), t.data.transactions)).toMatchObject({ received: 10_000, refunded: 2_000, pending: 22_000 });
    expect(t.data.transactions.find((x) => x.id === r.transaction!.id)!.payment).toMatchObject({ kind: 'pagamento', method: 'pix' });
  });
});

describe('sincronização entre aparelhos', () => {
  async function device(remote: MemoryRemote) {
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, now);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => !remote.offline });
    return { service, sync, remote };
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

  it('pagamento offline sincroniza uma única vez, mesmo com várias sincronizações', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service);
    await all(a, b);
    remote.offline = true;
    await a.service.registerPayment(x.id, { amount: 10_000, opId: 'op-a' });
    await a.service.registerPayment(x.id, { amount: 10_000, opId: 'op-a' }); // reenvio offline
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.transactions).toHaveLength(1);
      expect(paymentSummary(d.service.data.appointments[0]!, d.service.data.transactions).net).toBe(10_000);
    }
  });

  it('"recebi tudo que faltava" nos dois aparelhos offline: um único recebimento; saldos iguais nos dois', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service);
    await a.service.registerPayment(x.id, { amount: 10_000 });
    await all(a, b);
    remote.offline = true;
    await a.service.completeAppointment(x.id, { payment: { mode: 'integral' } });
    clock = new Date(clock.getTime() + 1000);
    await b.service.completeAppointment(x.id, { payment: { mode: 'integral' } });
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.transactions.map((t) => t.amount).sort()).toEqual([10_000, 20_000]);
      expect(totals(d.service.data.transactions).income).toBe(30_000);
    }
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });

  it('parciais diferentes em dois aparelhos somam (legítimos) e o excedente aparece', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service, '100,00');
    await all(a, b);
    remote.offline = true;
    await a.service.registerPayment(x.id, { amount: 6_000 });
    await b.service.registerPayment(x.id, { amount: 6_000 });
    remote.offline = false;
    await all(a, b);
    for (const d of [a, b]) expect(paymentSummary(d.service.data.appointments[0]!, d.service.data.transactions)).toMatchObject({ net: 12_000, excess: 2_000, state: 'excedente' });
  });

  it('cancelar num aparelho e estornar no outro: nada se perde, histórico rastreável e saldos iguais', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service);
    const { transaction: p } = await a.service.registerPayment(x.id, { amount: 10_000 });
    await all(a, b);
    remote.offline = true;
    await a.service.setAppointmentStatus(x.id, 'cancelado');
    await b.service.refundPayment(p!.id, { amount: 'total' });
    remote.offline = false;
    await all(a, b);
    for (const d of [a, b]) {
      expect(d.service.data.appointments[0]!.status).toBe('cancelado');
      expect(d.service.data.transactions.map((t) => t.type).sort()).toEqual(['despesa', 'receita']);
      expect(totals(d.service.data.transactions).balance).toBe(0);
    }
  });

  it('excluir o serviço num aparelho não apaga pagamentos registrados no outro', async () => {
    const { remote, a, b } = await pair();
    const x = await appt(a.service);
    await all(a, b);
    remote.offline = true;
    await a.service.deleteAppointment(x.id);
    await b.service.registerPayment(x.id, { amount: 10_000 });
    remote.offline = false;
    await all(a, b);
    for (const d of [a, b]) expect(totals(d.service.data.transactions).income).toBe(10_000);
  });
});

describe('duplicatePaymentIds', () => {
  it('mantém o mais antigo da mesma chave; nunca remove sem chave nem pagamento com estorno', () => {
    const p = (id: string, key: string | null, createdAt: string) => ({ id, type: 'receita', createdAt, payment: { kind: 'pagamento', key } });
    expect(duplicatePaymentIds([p('b', 'k', '2'), p('a', 'k', '1'), p('c', null, '0'), p('d', null, '0')])).toEqual(['b']);
    const refund = { id: 'r', type: 'despesa', createdAt: '3', payment: { kind: 'estorno', of: 'b' } };
    expect(duplicatePaymentIds([p('b', 'k', '2'), p('a', 'k', '1'), refund])).toEqual([]);
  });
});
