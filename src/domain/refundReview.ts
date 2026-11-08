/**
 * Integridade dos estornos entre aparelhos (0.5.0-beta.3). Função pura, derivada só dos lançamentos.
 *
 * Offline, dois aparelhos podem registrar estornos do mesmo pagamento sem saber um do outro (ex.: R$ 100
 * pagos, R$ 100 estornados no aparelho A e R$ 40 no B). Também é possível excluir o pagamento num aparelho
 * enquanto o outro o estorna. Nenhum armazenamento offline consegue saber qual dessas movimentações
 * aconteceu de verdade — então nada é apagado automaticamente. O resultado incoerente é **detectado de
 * forma determinística** (todos os aparelhos chegam à mesma lista) e fica marcado para revisão até a
 * pessoa decidir:
 *
 *  - `acima-do-pago`: Σ estornos de um pagamento > valor do pagamento;
 *  - `sem-pagamento`: estorno cujo pagamento não existe mais.
 *
 * A decisão "manter" grava em cada estorno do grupo `payment.review = { ack: <assinatura>, at }`. A
 * assinatura descreve exatamente o conjunto revisado (pagamento, valor, estornos e valores): se surgir um
 * estorno novo ou um valor mudar, a assinatura muda e a revisão volta. A decisão "remover" exclui o
 * estorno escolhido e registra no pagamento (`reviews`, fora de `payment` — uma receita da 0.4 continua sendo
 * legado) o que foi removido, quando e por quê.
 */
import { isRefund, refundOf } from './paymentMarks';
import type { Transaction } from './types';

type Tx = Pick<Transaction, 'id' | 'type' | 'amount' | 'date' | 'appointmentId' | 'createdAt'> & { payment?: Record<string, unknown> | null };

export type RefundIssueKind = 'acima-do-pago' | 'sem-pagamento';

export interface RefundIssue<T extends Tx = Tx> {
  kind: RefundIssueKind;
  /** Pagamento estornado (id), mesmo que ele não exista mais. */
  paymentId: string;
  payment: T | null;
  /** Estornos do pagamento, do mais antigo para o mais recente. */
  refunds: T[];
  paid: number;
  refunded: number;
  /** Quanto os estornos passam do pago (no caso `sem-pagamento`, o total estornado). */
  excess: number;
  appointmentId: string | null;
  /** Identifica o conjunto revisado; muda se qualquer estorno ou valor mudar. */
  signature: string;
}

const reviewOf = (t: { payment?: unknown }) => {
  const p = t.payment && typeof t.payment === 'object' ? (t.payment as Record<string, unknown>) : null;
  const r = p?.review && typeof p.review === 'object' ? (p.review as Record<string, unknown>) : null;
  return typeof r?.ack === 'string' ? r.ack : null;
};

const byCreation = (a: Tx, b: Tx) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1);

export function issueSignature(kind: RefundIssueKind, paymentId: string, paid: number, refunds: readonly Tx[]): string {
  return `${kind}|${paymentId}|${paid}|${[...refunds].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => `${r.id}:${r.amount}`).join(',')}`;
}

/** Todos os grupos incoerentes (inclusive os já revisados). Ordem estável. */
export function refundGroups<T extends Tx>(transactions: readonly T[]): RefundIssue<T>[] {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const groups = new Map<string, T[]>();
  for (const t of transactions) {
    if (!isRefund(t)) continue;
    const of = refundOf(t);
    if (!of) continue;
    groups.set(of, [...(groups.get(of) ?? []), t]);
  }
  const out: RefundIssue<T>[] = [];
  for (const [paymentId, list] of groups) {
    const refunds = [...list].sort(byCreation);
    const refunded = refunds.reduce((n, r) => n + r.amount, 0);
    const payment = byId.get(paymentId) ?? null;
    const paid = payment && payment.type === 'receita' ? payment.amount : 0;
    let kind: RefundIssueKind | null = null;
    if (!payment || payment.type !== 'receita') kind = 'sem-pagamento';
    else if (refunded > paid) kind = 'acima-do-pago';
    if (!kind) continue;
    out.push({
      kind, paymentId, payment: payment && payment.type === 'receita' ? payment : null, refunds, paid, refunded,
      excess: kind === 'sem-pagamento' ? refunded : refunded - paid,
      appointmentId: (payment?.appointmentId ?? refunds[0]!.appointmentId) || null,
      signature: issueSignature(kind, paymentId, paid, refunds),
    });
  }
  return out.sort((a, b) => byCreation(a.refunds.at(-1)!, b.refunds.at(-1)!));
}

/** Um grupo está resolvido quando todos os estornos carregam a confirmação desta mesma assinatura. */
export const isAcknowledged = (issue: RefundIssue) => issue.refunds.every((r) => reviewOf(r) === issue.signature);

/** Grupos que precisam de revisão (não confirmados pela pessoa). */
export function refundIssues<T extends Tx>(transactions: readonly T[]): RefundIssue<T>[] {
  return refundGroups(transactions).filter((g) => !isAcknowledged(g));
}

/** Registros de revisão gravados no pagamento (trilha de auditoria). */
export interface RefundReviewLog { at: string; decision: 'removido'; refund: { id: string; amount: number; date: string; createdAt: string } }
export function reviewLog(payment: { reviews?: unknown } | null | undefined): RefundReviewLog[] {
  const list = payment?.reviews;
  return Array.isArray(list) ? (list as RefundReviewLog[]).filter((r) => r && typeof r === 'object' && typeof r.at === 'string') : [];
}
