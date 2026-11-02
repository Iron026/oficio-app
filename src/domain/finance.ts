import { addMonths, isFutureDateKey, isInMonth, monthKey } from '../lib/dates';
import type { Transaction } from './types';

export interface Totals { income: number; expense: number; balance: number }

export function totals(transactions: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'receita') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

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

/** Soma por categoria, em ordem decrescente. */
export function byCategory(transactions: Transaction[], type: Transaction['type']): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) if (t.type === type) map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
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
