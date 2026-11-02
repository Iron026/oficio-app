import { byCategory, growthPercent, monthTotals, totals } from './finance';
import type { Transaction } from './types';

const tx = (type: Transaction['type'], amount: number, date: string, category = 'X'): Transaction => ({
  id: `${type}-${amount}-${date}`, createdAt: '', updatedAt: '', type, amount, date, category, description: '', appointmentId: null,
});

describe('finanças', () => {
  const list = [tx('receita', 10000, '2026-11-01'), tx('despesa', 3000, '2026-11-05', 'Material'), tx('despesa', 1000, '2026-11-06', 'Transporte'), tx('receita', 5000, '2026-10-30')];

  it('separa receitas, despesas e saldo', () => {
    expect(totals(list)).toEqual({ income: 15000, expense: 4000, balance: 11000 });
    expect(monthTotals(list, '2026-11')).toEqual({ income: 10000, expense: 4000, balance: 6000 });
  });

  it('agrupa por categoria', () => {
    expect(byCategory(list, 'despesa')).toEqual([{ category: 'Material', amount: 3000 }, { category: 'Transporte', amount: 1000 }]);
  });

  it('calcula crescimento', () => {
    expect(growthPercent(150, 100)).toBe(50);
    expect(growthPercent(50, 100)).toBe(-50);
    expect(growthPercent(10, 0)).toBeNull();
    expect(growthPercent(0, 0)).toBe(0);
  });
});
