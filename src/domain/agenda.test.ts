import { addDaysKey, addMonthsKey, byDay, conflictMap, conflictsFor, dayLayout, dayNumber, formatDuration, intervalOf, keyFromDay, monthGrid, timeRange, weekKeys, weekdayIndex } from './agenda';

const ap = (id: string, date: string, time: string, duration?: number | null, status: 'agendado' | 'concluido' | 'cancelado' = 'agendado') => ({ id, date, time, duration, status });

describe('agenda: horários de parede', () => {
  it('dias de calendário sem depender do fuso nem do horário de verão (inclusive datas com DST no passado)', () => {
    // 4/11/2018: início do horário de verão em Brasília (meia-noite não existiu no relógio local).
    expect(dayNumber('2018-11-04') - dayNumber('2018-11-03')).toBe(1);
    expect(keyFromDay(dayNumber('2018-11-04'))).toBe('2018-11-04');
    expect(intervalOf(ap('a', '2018-11-03', '23:30', 60))!.end - intervalOf(ap('a', '2018-11-03', '23:30', 60))!.start).toBe(60);
    expect(addDaysKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayIndex('2026-11-09')).toBe(0); // segunda
    expect(weekdayIndex('2026-11-08')).toBe(6); // domingo
  });

  it('beta.2: sem duração só o início é conhecido (nada presumido); faixa de horário com virada de dia', () => {
    expect(timeRange(ap('a', '2026-11-07', '14:00'))).toBe('14:00');
    expect(timeRange(ap('a', '2026-11-07', '14:00', null))).toBe('14:00');
    expect(intervalOf(ap('a', '2026-11-07', '14:00'))).toMatchObject({ known: false });
    expect(intervalOf(ap('a', '2026-11-07', '14:00'))!.end).toBe(intervalOf(ap('a', '2026-11-07', '14:00'))!.start);
    expect(timeRange(ap('a', '2026-11-07', '14:00', 60))).toBe('14:00–15:00');
    expect(timeRange(ap('a', '2026-11-07', '23:00', 120))).toBe('23:00–01:00 (+1 dia)');
    expect(timeRange(ap('a', '2026-11-07', '23:00', 60))).toBe('23:00–00:00');
    expect(timeRange(ap('a', '2026-11-07', ''))).toBe('Sem horário');
    expect(formatDuration(90)).toBe('1 h 30');
    expect(formatDuration(45)).toBe('45 min');
  });
});

describe('agenda: conflitos', () => {
  it('sobreposição é conflito; encostar não é; cancelados e sem horário ficam fora', () => {
    const list = [
      ap('a', '2026-11-07', '14:00', 60), ap('b', '2026-11-07', '14:30', 60), ap('c', '2026-11-07', '15:00', 30),
      ap('d', '2026-11-07', '14:15', 30, 'cancelado'), ap('e', '2026-11-07', ''),
    ];
    const m = conflictMap(list);
    expect(m.get('a')).toEqual(['b']);
    expect(m.get('b')!.sort()).toEqual(['a', 'c']);
    expect(m.get('c')).toEqual(['b']);
    expect(m.has('d') || m.has('e')).toBe(false);
  });

  it('beta.2: sem duração não gera conflito presumido — só início dentro de um intervalo conhecido ou mesmo início', () => {
    const list = [
      ap('corte', '2026-11-07', '14:00', 60),
      ap('semDur', '2026-11-07', '14:30'), // começa durante o corte: conflito real
      ap('depois', '2026-11-07', '15:00'), // começa quando o corte termina: livre
      ap('x', '2026-11-07', '16:00'), ap('y', '2026-11-07', '16:00', null), // mesmo início, ambos sem duração
      ap('z', '2026-11-07', '16:20'), // seria conflito se presumíssemos 30 ou 60 min para x/y
      ap('w', '2026-11-07', '17:00'), ap('k', '2026-11-07', '17:00', 30), // mesmo início, um com duração
    ];
    const m = conflictMap(list);
    expect(m.get('corte')).toEqual(['semDur']);
    expect(m.get('semDur')).toEqual(['corte']);
    expect(m.has('depois') || m.has('z')).toBe(false);
    expect(m.get('x')).toEqual(['y']);
    expect(m.get('w')).toEqual(['k']);
    // Aviso ao salvar segue a mesma regra.
    expect(conflictsFor(ap('novo', '2026-11-07', '13:45'), list)).toEqual([]);
    expect(conflictsFor(ap('novo', '2026-11-07', '13:30', 60), list)).toEqual(['corte']);
    expect(conflictsFor(ap('novo', '2026-11-07', '16:10', 30), list)).toEqual(['z']);
    expect(conflictsFor(ap('novo', '2026-11-07', '15:50', 15), list)).toEqual(['x', 'y']);
    expect(conflictsFor(ap('novo', '2026-11-07', '15:00'), list)).toEqual(['depois']);
  });

  it('atravessando a meia-noite conflita com o primeiro atendimento do dia seguinte', () => {
    const list = [ap('noite', '2026-11-07', '23:30', 90), ap('cedo', '2026-11-08', '00:30', 30)];
    expect(conflictMap(list).get('noite')).toEqual(['cedo']);
    expect(conflictsFor(ap('novo', '2026-11-08', '00:00', 15), list)).toEqual(['noite']);
    expect(conflictsFor(ap('novo', '2026-11-08', '01:00', 15), list)).toEqual([]);
  });
});

describe('agenda: visões', () => {
  it('dia: inclui quem vem da noite anterior, recorta no dia e põe sobrepostos lado a lado', () => {
    const list = [ap('noite', '2026-11-07', '23:00', 120), ap('a', '2026-11-08', '09:00', 60), ap('b', '2026-11-08', '09:30', 60), ap('c', '2026-11-08', '11:00', 30), ap('s', '2026-11-08', '')];
    const { timed, untimed } = dayLayout(list, '2026-11-08');
    expect(untimed.map((x) => x.id)).toEqual(['s']);
    const byId = Object.fromEntries(timed.map((t) => [t.a.id, t]));
    expect(byId.noite).toMatchObject({ from: 0, to: 60, fromPrev: true, toNext: false });
    expect([byId.a!.lane, byId.b!.lane, byId.a!.lanes]).toEqual([0, 1, 2]);
    expect(byId.c).toMatchObject({ lane: 0, lanes: 1 });
    const prev = dayLayout(list, '2026-11-07').timed[0]!;
    expect(prev).toMatchObject({ from: 23 * 60, to: 1440, toNext: true });
  });

  it('beta.2: sem duração aparece na grade com altura mínima só visual, sem atravessar a meia-noite', () => {
    const { timed } = dayLayout([ap('a', '2026-11-08', '09:00'), ap('b', '2026-11-08', '23:50')], '2026-11-08');
    expect(timed[0]).toMatchObject({ from: 540, to: 585, unknownEnd: true, toNext: false });
    expect(timed[1]).toMatchObject({ from: 1430, to: 1440, unknownEnd: true, toNext: false });
    expect(dayLayout([ap('b', '2026-11-08', '23:50')], '2026-11-09').timed).toHaveLength(0);
    expect(byDay([ap('b', '2026-11-08', '23:50')], ['2026-11-08', '2026-11-09']).get('2026-11-09')).toEqual([]);
  });

  it('semana de segunda a domingo e mês com semanas completas; navegação entre meses', () => {
    expect(weekKeys('2026-11-07')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    const g = monthGrid('2026-02-15');
    expect(g[0]![0]).toBe('2026-01-26');
    expect(g.at(-1)!.at(-1)).toBe('2026-03-01');
    expect(g.flat().filter((k) => k.startsWith('2026-02'))).toHaveLength(28);
    expect(addMonthsKey('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonthsKey('2026-01-31', -1)).toBe('2025-12-01');
    const days = byDay([ap('noite', '2026-11-07', '23:00', 120), ap('x', '2026-11-08', '')], weekKeys('2026-11-08'));
    expect(days.get('2026-11-07')!.map((a) => a.id)).toEqual(['noite']);
    expect(days.get('2026-11-08')!.map((a) => a.id)).toEqual(['noite', 'x']);
  });

  it('desempenho: mês com 1 000 atendimentos e conflitos calculados rapidamente', () => {
    const list = Array.from({ length: 1000 }, (_, i) => ap(`a${i}`, `2026-11-${String((i % 30) + 1).padStart(2, '0')}`, `${String(8 + (i % 10)).padStart(2, '0')}:00`, 45));
    const t0 = performance.now();
    conflictMap(list);
    byDay(list, monthGrid('2026-11-01').flat());
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
