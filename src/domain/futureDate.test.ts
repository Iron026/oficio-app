import { futureServiceDateFor, totals } from './finance';
import { isFutureDateKey } from '../lib/dates';
import type { Transaction } from './types';

// Os testes rodam com TZ=America/Sao_Paulo (UTC-3), ver package.json.
const lateNight = new Date(2026, 10, 2, 23, 30); // 02/11/2026 23:30 local = 03/11 02:30 UTC

describe('data futura usa a data LOCAL do aparelho', () => {
  it('o cenário de teste realmente cruza a meia-noite em UTC', () => {
    expect(lateNight.toISOString().slice(0, 10)).toBe('2026-11-03');
  });

  it('hoje e datas passadas não são futuras; amanhã é', () => {
    expect(isFutureDateKey('2026-11-02', lateNight)).toBe(false);
    expect(isFutureDateKey('2026-11-01', lateNight)).toBe(false);
    expect(isFutureDateKey('2026-11-03', lateNight)).toBe(true);
  });
});

describe('indicador "Data futura" em Finanças', () => {
  const tx = (over: Partial<Transaction> = {}): Transaction => ({
    id: 't1', createdAt: '', updatedAt: '', type: 'receita', amount: 5000, description: 'Corte', category: 'Atendimento', date: '2026-11-02', appointmentId: 'a1', ...over,
  });
  const appt = (date: string, status = 'concluido') => [{ id: 'a1', date, status }];

  it('aparece na receita vinculada a serviço concluído com data futura', () => {
    expect(futureServiceDateFor(tx(), appt('2026-11-05'), lateNight)).toBe('2026-11-05');
  });

  it('desaparece quando a data do serviço chega', () => {
    const dia5 = new Date(2026, 10, 5, 8, 0);
    expect(futureServiceDateFor(tx(), appt('2026-11-05'), dia5)).toBeNull();
  });

  it('desaparece se o serviço passa a ter data atual/anterior', () => {
    expect(futureServiceDateFor(tx(), appt('2026-11-02'), lateNight)).toBeNull();
  });

  it('não marca despesas, lançamentos avulsos nem serviços não concluídos', () => {
    expect(futureServiceDateFor(tx({ type: 'despesa' }), appt('2026-11-05'), lateNight)).toBeNull();
    expect(futureServiceDateFor(tx({ appointmentId: null }), appt('2026-11-05'), lateNight)).toBeNull();
    expect(futureServiceDateFor(tx(), appt('2026-11-05', 'agendado'), lateNight)).toBeNull();
  });

  it('não altera os cálculos financeiros', () => {
    const list = [tx(), tx({ id: 't2', type: 'despesa', amount: 1000, appointmentId: null })];
    expect(totals(list)).toEqual({ income: 5000, expense: 1000, balance: 4000 });
  });
});
