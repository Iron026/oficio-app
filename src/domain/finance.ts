import { addMonths, isFutureDateKey, isInMonth, monthKey } from '../lib/dates';
import { isRefund } from './payments';
import type { Transaction } from './types';

/**
 * Totais do período (beta.2): `income` = recebimentos brutos; `refund` = estornos de pagamentos
 * (movimentação própria, fora das despesas); `expense` = despesas operacionais. O saldo deduz cada
 * valor uma única vez: receitas − estornos − despesas (o mesmo saldo da beta.1, que somava os
 * estornos às despesas). Estornos são reconhecidos pelo marcador `payment.kind = 'estorno'`; uma
 * despesa comum com a categoria "Estorno" (sem marcador) continua sendo despesa.
 */
export interface Totals { income: number; refund: number; expense: number; balance: number }

export function totals(transactions: Transaction[]): Totals {
  let income = 0;
  let refund = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'receita') income += t.amount;
    else if (isRefund(t)) refund += t.amount;
    else expense += t.amount;
  }
  return { income, refund, expense, balance: income - refund - expense };
}

/** Tipo de movimentação exibido (beta.2): estorno é separado de despesa. */
export type MovementKind = 'receita' | 'despesa' | 'estorno';
export const movementKind = (t: Transaction): MovementKind => (t.type === 'receita' ? 'receita' : isRefund(t) ? 'estorno' : 'despesa');

export function transactionsInMonth(transactions: Transaction[], mKey: string): Transaction[] {
  return transactions.filter((t) => isInMonth(t.date, mKey));
}

export function monthTotals(transactions: Transaction[], mKey: string): Totals {
  return totals(transactionsInMonth(transactions, mKey));
}

/** Variação percentual. Retorna null quando não há base de comparação. */
export function growthPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function previousMonthKey(now: Date): string {
  return monthKey(addMonths(now, -1));
}

/** Soma por categoria, em ordem decrescente. Despesas não incluem estornos (beta.2). */
export function byCategory(transactions: Transaction[], type: Transaction['type']): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) if (movementKind(t) === type) map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

export function sortByDateDesc<T extends { date: string; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

/**
 * Receita gerada pela conclusão antecipada de um serviço cuja data ainda é
 * futura. Retorna a data do serviço (para exibir) ou null.
 * É derivado (não é gravado): some sozinho quando a data chega ou é alterada.
 * Não altera valores nem cálculos financeiros.
 */
export function futureServiceDateFor(
  t: Transaction,
  appointments: { id: string; date: string; status: string }[],
  now = new Date(),
): string | null {
  if (t.type !== 'receita' || !t.appointmentId) return null;
  const a = appointments.find((x) => x.id === t.appointmentId);
  if (!a || a.status !== 'concluido') return null;
  return isFutureDateKey(a.date, now) ? a.date : null;
}

/** Nome exibido do lançamento: a descrição ou, quando vazia, a categoria. */
export function transactionLabel(t: { description: string; category: string }): string {
  return t.description.trim() || t.category.trim() || 'Lançamento';
}
