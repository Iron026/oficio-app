/**
 * Pagamentos (0.5): separa o serviço realizado do dinheiro recebido. Tudo aqui é derivado dos
 * lançamentos (nada é gravado) e em centavos inteiros. Contrato de dados em
 * docs/COMPATIBILIDADE-0.5.md:
 *  - pagamento = receita com `appointmentId` e `payment: { kind: 'pagamento', … }`;
 *  - estorno   = despesa com `appointmentId` e `payment: { kind: 'estorno', of: <id do pagamento> }`;
 *  - receita automática da 0.4 (sem marcador) = pagamento integral legado.
 */
import type { Appointment, Transaction } from './types';

export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao' | 'transferencia' | 'outra';
export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'pix', label: 'Pix' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao', label: 'Cartão' },
  { id: 'transferencia', label: 'Transferência' },
  { id: 'outra', label: 'Outra' },
];
export const methodLabel = (m: unknown) => PAYMENT_METHODS.find((x) => x.id === m)?.label ?? null;

/** Marcador gravado em `transaction.payment`. Campos extras de versões futuras são preservados. */
export interface PaymentMark {
  kind: 'pagamento' | 'estorno';
  method?: PaymentMethod | null;
  /** Estorno: id do pagamento estornado. */
  of?: string | null;
  /** Chave de idempotência entre aparelhos (ver `duplicatePaymentIds`). */
  key?: string | null;
}

type Tx = Pick<Transaction, 'id' | 'type' | 'amount' | 'date' | 'appointmentId' | 'createdAt'> & { payment?: Record<string, unknown> | null };
type Ap = Pick<Appointment, 'id' | 'price' | 'status' | 'date'> & { payments?: boolean; transactionId?: string | null };

const mark = (t: { payment?: unknown }) => (t.payment && typeof t.payment === 'object' ? (t.payment as Record<string, unknown>) : null);
export const isRefund = (t: Tx) => t.type === 'despesa' && mark(t) != null && mark(t)!.kind === 'estorno';
/** Receita vinculada a um serviço: pagamento da 0.5 ou receita automática da 0.4. */
export const isLinkedIncome = (t: Tx) => t.type === 'receita' && typeof t.appointmentId === 'string' && t.appointmentId !== '';
export const isPayment = (t: Tx) => isLinkedIncome(t) && mark(t) != null;
export const refundOf = (t: Tx): string | null => (isRefund(t) && typeof mark(t)!.of === 'string' ? (mark(t)!.of as string) : null);

export type PaymentState =
  | 'sem-valor' // preço 0 e nada recebido
  | 'nao-registrado' // legado: concluído antes da 0.5 sem receita — nem pago, nem pendente
  | 'pendente' // nada recebido
  | 'parcial'
  | 'pago'
  | 'excedente' // recebido acima do combinado
  | 'cancelado'; // cancelado: nada é devido; o que entrou continua visível

export interface PaymentEntry {
  tx: Tx;
  kind: 'pagamento' | 'legado' | 'estorno';
  /** Pagamento: quanto já foi estornado dele. */
  refunded: number;
  /** Pagamento: quanto ainda pode ser estornado. */
  refundable: number;
  method: string | null;
  /** Pagamento feito antes da data do serviço. */
  early: boolean;
}

export interface PaymentSummary {
  contracted: number;
  received: number;
  refunded: number;
  /** recebido − estornado (pode ser negativo só se houver estorno acima do pago, o que a interface impede). */
  net: number;
  /** Quanto falta (0 quando não há controle de pagamento, está cancelado ou já foi pago). */
  pending: number;
  excess: number;
  state: PaymentState;
  tracked: boolean;
  /** Algum pagamento antes da data do serviço. */
  advance: boolean;
  entries: PaymentEntry[];
}

/** Lançamentos vinculados ao serviço, do mais antigo para o mais recente. */
export function linkedTransactions<T extends Tx>(appointmentId: string, transactions: readonly T[]): T[] {
  return transactions
    .filter((t) => t.appointmentId === appointmentId && (t.type === 'receita' || isRefund(t)))
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));
}

export function paymentSummary(a: Ap, transactions: readonly Tx[]): PaymentSummary {
  const linked = linkedTransactions(a.id, transactions);
  const refundsByPayment = new Map<string, number>();
  let refunded = 0;
  for (const t of linked) {
    if (!isRefund(t)) continue;
    refunded += t.amount;
    const of = refundOf(t);
    if (of) refundsByPayment.set(of, (refundsByPayment.get(of) ?? 0) + t.amount);
  }
  let received = 0;
  const entries: PaymentEntry[] = linked.map((t) => {
    if (isRefund(t)) return { tx: t, kind: 'estorno', refunded: 0, refundable: 0, method: null, early: false };
    received += t.amount;
    const r = refundsByPayment.get(t.id) ?? 0;
    return {
      tx: t, kind: mark(t) ? 'pagamento' : 'legado', refunded: r, refundable: Math.max(0, t.amount - r),
      method: methodLabel(mark(t)?.method), early: t.date < a.date,
    };
  });
  const net = received - refunded;
  const legacyPaid = !!a.transactionId && linked.some((t) => t.id === a.transactionId);
  const tracked = a.payments === true || received > 0 || refunded > 0 || legacyPaid;
  const excess = Math.max(0, net - a.price);
  let state: PaymentState;
  let pending = 0;
  if (a.status === 'cancelado') state = 'cancelado';
  else if (!tracked && a.status === 'concluido') state = 'nao-registrado';
  else if (a.price === 0 && net <= 0) state = 'sem-valor';
  else {
    pending = Math.max(0, a.price - net);
    state = excess > 0 ? 'excedente' : pending === 0 ? 'pago' : net > 0 ? 'parcial' : 'pendente';
  }
  return {
    contracted: a.price, received, refunded, net, pending, excess, state, tracked,
    advance: entries.some((e) => e.kind !== 'estorno' && e.early), entries,
  };
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  'sem-valor': 'Sem valor',
  'nao-registrado': 'Pagamento não registrado',
  pendente: 'A receber',
  parcial: 'Pago em parte',
  pago: 'Pago',
  excedente: 'Recebido acima do combinado',
  cancelado: 'Cancelado',
};

/** Total a receber (serviços concluídos com controle ativo). Previsto (agendados) fica separado. */
export function receivables(appointments: readonly Ap[], transactions: readonly Tx[]): { pending: number; count: number } {
  let pending = 0;
  let count = 0;
  for (const a of appointments) {
    if (a.status !== 'concluido') continue;
    const s = paymentSummary(a, transactions);
    if (s.pending > 0) { pending += s.pending; count++; }
  }
  return { pending, count };
}

/**
 * Pagamentos repetidos entre aparelhos: "recebi tudo que faltava" registrado offline nos dois a partir
 * do mesmo saldo gera dois registros com a mesma chave. Mantém o mais antigo (desempate pelo id) —
 * todos os aparelhos chegam ao mesmo resultado. Nunca remove um pagamento que já tenha estorno, nem
 * registros sem chave (parciais legítimos).
 */
export function duplicatePaymentIds(transactions: readonly { id: string; type?: unknown; payment?: unknown; createdAt?: unknown }[]): string[] {
  const refunded = new Set<string>();
  for (const t of transactions) {
    const m = mark(t);
    if (t.type === 'despesa' && m?.kind === 'estorno' && typeof m.of === 'string') refunded.add(m.of);
  }
  const groups = new Map<string, { id: string; createdAt: string }[]>();
  for (const t of transactions) {
    const key = mark(t)?.key;
    if (typeof key !== 'string' || !key) continue;
    const g = groups.get(key) ?? [];
    g.push({ id: t.id, createdAt: String(t.createdAt ?? '') });
    groups.set(key, g);
  }
  const remove: string[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
    for (const x of g.slice(1)) if (!refunded.has(x.id)) remove.push(x.id);
  }
  return remove;
}
