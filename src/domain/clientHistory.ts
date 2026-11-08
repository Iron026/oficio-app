/**
 * Histórico do cliente (0.5.0-beta.3). Derivado dos agendamentos e dos lançamentos reais vinculados a eles
 * (fonte única dos valores): nada é copiado nem gravado. Função pura.
 */
import { paymentSummary, type PaymentState, type PaymentSummary } from './payments';
import type { Appointment, Transaction } from './types';

export type MoneyKind = 'antecipado' | 'parcial' | 'integral' | 'legado' | 'estorno';

export type TimelineEntry =
  | { kind: 'atendimento'; key: string; date: string; a: Appointment; s: PaymentSummary }
  | { kind: 'dinheiro'; key: string; date: string; a: Appointment; tx: Transaction; money: MoneyKind };

export interface ClientHistory {
  /** Agendados de hoje em diante, do mais próximo para o mais distante. */
  upcoming: Appointment[];
  completedCount: number;
  lastCompleted: Appointment | null;
  /** Σ valor combinado dos serviços concluídos. */
  contracted: number;
  /** Σ recebido em todos os serviços do cliente (inclui antecipados de agendados). */
  received: number;
  refunded: number;
  /** Recebido antes do serviço, em agendamentos ainda em aberto. */
  advanceOpen: number;
  /** Σ pendente dos concluídos com controle de pagamento. */
  pending: number;
  /** Concluídos antes da 0.5 sem receita: o app não presume se foram pagos. */
  notRegistered: number;
  /** Serviços com estornos aguardando revisão. */
  inReview: number;
  /** Passado (concluídos, cancelados, agendados vencidos) e movimentações, do mais recente ao mais antigo. */
  timeline: TimelineEntry[];
}

const STATES_WITH_PENDING: PaymentState[] = ['pendente', 'parcial'];

export function clientHistory(clientId: string, appointments: readonly Appointment[], transactions: readonly Transaction[], today: string): ClientHistory {
  const mine = appointments.filter((a) => a.clientId === clientId);
  const byAppt = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.appointmentId) continue;
    byAppt.set(t.appointmentId, [...(byAppt.get(t.appointmentId) ?? []), t]);
  }
  const h: ClientHistory = {
    upcoming: [], completedCount: 0, lastCompleted: null, contracted: 0, received: 0, refunded: 0, advanceOpen: 0, pending: 0, notRegistered: 0, inReview: 0, timeline: [],
  };
  for (const a of mine) {
    const s = paymentSummary(a, byAppt.get(a.id) ?? []);
    h.received += s.received;
    h.refunded += s.refunded;
    if (s.state === 'revisar') h.inReview++;
    if (a.status === 'concluido') {
      h.completedCount++;
      h.contracted += a.price;
      if (STATES_WITH_PENDING.includes(s.state)) h.pending += s.pending;
      if (s.state === 'nao-registrado') h.notRegistered++;
      if (!h.lastCompleted || a.date > h.lastCompleted.date) h.lastCompleted = a;
    }
    if (a.status === 'agendado' && a.date >= today) {
      h.upcoming.push(a);
      h.advanceOpen += Math.max(0, s.net);
    } else {
      h.timeline.push({ kind: 'atendimento', key: `a:${a.id}`, date: a.date, a, s });
    }
    for (const e of s.entries) {
      const money: MoneyKind = e.kind === 'estorno' ? 'estorno' : e.kind === 'legado' ? 'legado'
        : e.early ? 'antecipado' : e.tx.amount >= a.price && a.price > 0 ? 'integral' : 'parcial';
      h.timeline.push({ kind: 'dinheiro', key: `t:${e.tx.id}`, date: e.tx.date, a, tx: e.tx as Transaction, money });
    }
  }
  h.upcoming.sort((x, y) => (x.date + (x.time || '99')).localeCompare(y.date + (y.time || '99')));
  // Mais recente primeiro; no mesmo dia, o atendimento antes das movimentações dele.
  const order = (e: TimelineEntry) => (e.kind === 'atendimento' ? `${e.date}~${e.a.time || '99'}` : `${e.date}~${'tx' in e ? e.tx.createdAt : ''}`);
  h.timeline.sort((x, y) => (order(x) < order(y) ? 1 : order(x) > order(y) ? -1 : 0));
  return h;
}

export const MONEY_LABEL: Record<MoneyKind, string> = {
  antecipado: 'Pagamento antecipado',
  parcial: 'Pagamento parcial',
  integral: 'Pagamento integral',
  legado: 'Receita lançada (0.4)',
  estorno: 'Estorno',
};

