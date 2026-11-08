import type { Appointment } from './types';
import { describeRule, effectiveRule, isPristineOccurrence, occurrenceId, pendingOccurrences, seriesDates, seriesOf, type SeriesRule } from './recurrence';

const rule = (r: Partial<SeriesRule>): SeriesRule => ({ id: 's1', freq: 'semanal', interval: 1, days: null, start: '2026-11-02', until: null, count: null, through: '2026-11-02', v: '2026-11-01T10:00:00.000Z', ...r });

describe('recorrência: datas', () => {
  it('diária com intervalo; término por data (inclusive) e por quantidade', () => {
    expect(seriesDates(rule({ freq: 'diaria', interval: 2 }), null, '2026-11-10')).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10']);
    expect(seriesDates(rule({ freq: 'diaria', until: '2026-11-04' }), null, '2026-12-31')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(seriesDates(rule({ freq: 'diaria', count: 3 }), null, '2026-12-31')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    // `after` só filtra; a contagem continua desde o início (nunca passa de count).
    expect(seriesDates(rule({ freq: 'diaria', count: 3 }), '2026-11-03', '2026-12-31')).toEqual(['2026-11-04']);
  });

  it('semanal com dias da semana; quinzenal (a cada 2 semanas) ancorada na semana do início', () => {
    // 4/11/2026 é quarta; dias ter (1) e qui (3).
    expect(seriesDates(rule({ start: '2026-11-04', days: [1, 3] }), null, '2026-11-19')).toEqual(['2026-11-05', '2026-11-10', '2026-11-12', '2026-11-17', '2026-11-19']);
    expect(seriesDates(rule({ start: '2026-11-04', interval: 2 }), null, '2026-12-02')).toEqual(['2026-11-04', '2026-11-18', '2026-12-02']);
  });

  it('mensal: dia 31, 30 e 29 caem no último dia dos meses mais curtos (inclusive fevereiro bissexto)', () => {
    expect(seriesDates(rule({ freq: 'mensal', start: '2027-01-31' }), null, '2027-05-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
    expect(seriesDates(rule({ freq: 'mensal', start: '2027-11-30' }), null, '2028-03-30')).toEqual(['2027-11-30', '2027-12-30', '2028-01-30', '2028-02-29', '2028-03-30']);
    expect(seriesDates(rule({ freq: 'mensal', start: '2026-01-29', interval: 1 }), null, '2026-03-29')).toEqual(['2026-01-29', '2026-02-28', '2026-03-29']);
    expect(seriesDates(rule({ freq: 'mensal', start: '2026-10-31', interval: 3 }), null, '2027-07-31')).toEqual(['2026-10-31', '2027-01-31', '2027-04-30', '2027-07-31']);
  });

  it('nunca passa de 120 ocorrências por série', () => {
    expect(seriesDates(rule({ freq: 'diaria' }), null, '2030-01-01')).toHaveLength(120);
    expect(seriesDates(rule({ freq: 'diaria', count: 500 }), null, '2030-01-01')).toHaveLength(120);
  });
});

const occ = (date: string, s: Partial<SeriesRule> = {}, extra: Partial<Appointment> = {}): Appointment => ({
  id: occurrenceId('s1', date), createdAt: 'c', updatedAt: 'u', title: 'Manicure', clientId: 'cli', date, time: '10:00', price: 5_000, notes: '',
  status: 'agendado', completedAt: null, transactionId: null, payments: true, series: rule({ through: date, ...s }) as unknown as Record<string, unknown>, ...extra,
});

describe('recorrência: gerador', () => {
  it('ids determinísticos e registros idênticos: dois aparelhos geram exatamente a mesma coisa', () => {
    const base = [occ('2026-11-02', { through: '2026-11-02' })];
    const a = pendingOccurrences(base, '2026-11-02');
    const b = pendingOccurrences(structuredClone(base), '2026-11-02');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0]).toMatchObject({ id: 's1-20261109', date: '2026-11-09', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', title: 'Manicure', status: 'agendado' });
    expect(a.every((x) => isPristineOccurrence(x))).toBe(true);
    expect(a.every((x) => x.date <= '2027-01-31')).toBe(true); // horizonte de 90 dias
  });

  it('nada reaparece: só datas depois do maior "through" já gravado; lacunas (excluídas) ficam vazias', () => {
    const list = [occ('2026-11-02', { through: '2026-11-30' }), occ('2026-11-23', { through: '2026-11-30' })]; // 9 e 16 excluídas
    const gen = pendingOccurrences(list, '2026-11-02').map((a) => a.date);
    expect(gen[0]).toBe('2026-12-07');
    expect(gen).not.toContain('2026-11-09');
    expect(gen).not.toContain('2026-11-16');
  });

  it('nunca gera datas passadas (aparelho que ficou meses sem abrir)', () => {
    const gen = pendingOccurrences([occ('2026-01-05', { start: '2026-01-05', through: '2026-01-05' })], '2026-11-02').map((a) => a.date);
    expect(gen[0]).toBe('2026-11-02');
  });

  it('regra efetiva = maior versão: encerrar a série num registro para a geração em todos', () => {
    const list = [occ('2026-11-02', { through: '2026-11-30' }), occ('2026-11-09', { until: '2026-11-09', v: '2026-11-05T00:00:00.000Z', through: '2026-11-09' }, { status: 'cancelado' })];
    expect(effectiveRule(list)).toMatchObject({ until: '2026-11-09', through: '2026-11-30' });
    expect(pendingOccurrences(list, '2026-11-02')).toEqual([]);
  });

  it('usa a ocorrência não destacada mais recente como modelo; exceções não contaminam', () => {
    const list = [occ('2026-11-02'), occ('2026-11-09', { through: '2026-11-09' }, { title: 'Manicure (só hoje)', series: { ...rule({ through: '2026-11-09' }), detached: true } })];
    expect(pendingOccurrences(list, '2026-11-02')[0]!.title).toBe('Manicure');
  });

  it('lê com segurança regras malformadas ou de outras versões', () => {
    expect(seriesOf({ series: null })).toBeNull();
    expect(seriesOf({ series: { id: 'x', freq: 'anual', start: '2026-01-01', through: '2026-01-01' } })).toBeNull();
    expect(seriesOf({ series: { id: 'x', freq: 'semanal', start: '2026-01-01', through: '2026-01-01', interval: 99, days: [9, 1, 1], extra: 1 } })).toMatchObject({ interval: 8, days: [1], extra: 1 });
  });

  it('descrição legível da regra', () => {
    expect(describeRule(rule({ start: '2026-11-04', days: [1, 3], until: '2026-12-31' }))).toBe('Toda semana (ter, qui) · até 31/12/2026');
    expect(describeRule(rule({ start: '2026-11-04', interval: 2 }))).toBe('A cada 2 semanas (qua)');
    expect(describeRule(rule({ freq: 'mensal', start: '2027-01-31', count: 6 }))).toBe('Todo mês, dia 31 (no último dia nos meses mais curtos) · 6 vezes');
  });
});
