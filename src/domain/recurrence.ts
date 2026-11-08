/**
 * Atendimentos recorrentes (0.5.0-beta.3). Funções puras; contrato em docs/COMPATIBILIDADE-0.5.md.
 *
 * - A regra fica **dentro de cada ocorrência** (`appointment.series`), sem coleção nova no Firestore.
 * - Ocorrências são agendamentos comuns, materializados até `HORIZON_DAYS` à frente e no máximo
 *   `MAX_OCCURRENCES` por série: pagamentos, histórico, sincronização e backup funcionam sem lógica nova.
 * - Ids determinísticos (`<série>-<aaaammdd>`): dois aparelhos que geram a mesma ocorrência produzem o mesmo
 *   registro, com os mesmos campos (`createdAt = updatedAt = regra.v`) — a sincronização não duplica.
 * - Nada reaparece: o gerador só cria datas **depois** do maior `through` já gravado na série e nunca antes
 *   de hoje. Uma ocorrência excluída, cancelada ou alterada nunca é recriada.
 * - Datas são "de parede" (dias de calendário em UTC): fuso e horário de verão não deslocam nada.
 */
import { addDaysKey, dayNumber, keyFromDay, weekdayIndex } from './agenda';
import type { Appointment } from './types';

export type Freq = 'diaria' | 'semanal' | 'mensal';
export const HORIZON_DAYS = 90;
export const MAX_OCCURRENCES = 120;
export const MAX_INTERVAL: Record<Freq, number> = { diaria: 30, semanal: 8, mensal: 12 };

export interface SeriesRule {
  id: string;
  freq: Freq;
  /** A cada N dias/semanas/meses (≥ 1). */
  interval: number;
  /** Semanal: dias da semana, 0 = segunda … 6 = domingo. */
  days?: number[] | null;
  /** Primeira data da série (âncora das contas). */
  start: string;
  /** Último dia possível (inclusive). */
  until?: string | null;
  /** Total de ocorrências desde o início. */
  count?: number | null;
  /** Até onde a série já foi materializada (inclusive). */
  through: string;
  /** Versão da regra (ISO). A regra efetiva é a de maior `v` entre as ocorrências. */
  v: string;
  /** Ocorrência criada pelo gerador (e não pela pessoa). */
  auto?: boolean;
  /** Exceção: alterada individualmente; fica fora de "esta e as próximas" e "toda a série". */
  detached?: boolean;
}

const isKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Lê `appointment.series` com segurança (dados de outras versões ou malformados viram null). */
export function seriesOf(a: { series?: unknown }): SeriesRule | null {
  const s = a.series && typeof a.series === 'object' ? (a.series as Record<string, unknown>) : null;
  if (!s || typeof s.id !== 'string' || !s.id) return null;
  if (s.freq !== 'diaria' && s.freq !== 'semanal' && s.freq !== 'mensal') return null;
  if (!isKey(s.start) || !isKey(s.through)) return null;
  const interval = Number.isInteger(s.interval) && (s.interval as number) >= 1 ? Math.min(s.interval as number, MAX_INTERVAL[s.freq]) : 1;
  const days = Array.isArray(s.days) ? [...new Set((s.days as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort() : null;
  return {
    ...(s as object),
    id: s.id, freq: s.freq, interval, days, start: s.start, through: s.through,
    until: isKey(s.until) ? s.until : null,
    count: Number.isInteger(s.count) && (s.count as number) >= 1 ? Math.min(s.count as number, MAX_OCCURRENCES) : null,
    v: typeof s.v === 'string' ? s.v : '',
    auto: s.auto === true, detached: s.detached === true,
  };
}

export const occurrenceId = (seriesId: string, date: string) => `${seriesId}-${date.replace(/-/g, '')}`;

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1–12

/**
 * Datas da regra em ordem, desde o início, respeitando `count`, `until` e o limite de 120; devolve só as
 * que estão em (after, to]. Mensal: o dia do início; em meses mais curtos (29, 30, 31), o último dia.
 */
export function seriesDates(rule: Pick<SeriesRule, 'freq' | 'interval' | 'days' | 'start' | 'until' | 'count'>, after: string | null, to: string): string[] {
  const limit = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const end = rule.until && rule.until < to ? rule.until : to;
  const out: string[] = [];
  let n = 0;
  const push = (k: string) => {
    if (k < rule.start) return true;
    if (k > end || n >= limit) return false;
    n++;
    if (!after || k > after) out.push(k);
    return true;
  };
  const step = Math.max(1, rule.interval);
  if (rule.freq === 'diaria') {
    for (let d = dayNumber(rule.start); ; d += step) if (!push(keyFromDay(d))) break;
  } else if (rule.freq === 'semanal') {
    const days = rule.days?.length ? rule.days : [weekdayIndex(rule.start)];
    const monday = dayNumber(rule.start) - weekdayIndex(rule.start);
    outer: for (let w = 0; ; w += step) {
      for (const d of days) if (!push(keyFromDay(monday + w * 7 + d))) break outer;
    }
  } else {
    const [y, m, dom] = rule.start.split('-').map(Number) as [number, number, number];
    for (let i = 0; ; i += step) {
      const total = y * 12 + (m - 1) + i;
      const yy = Math.floor(total / 12);
      const mm = (total % 12) + 1;
      const k = `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(dom, lastDayOfMonth(yy, mm))).padStart(2, '0')}`;
      if (!push(k)) break;
    }
  }
  return out;
}

/** Ocorrências agrupadas por série. */
export function seriesGroups<T extends Appointment>(appointments: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const a of appointments) {
    const s = seriesOf(a);
    if (s) out.set(s.id, [...(out.get(s.id) ?? []), a]);
  }
  for (const list of out.values()) list.sort((x, y) => (x.date === y.date ? (x.id < y.id ? -1 : 1) : x.date < y.date ? -1 : 1));
  return out;
}

/** Regra efetiva da série: a de maior `v` (empate: id); `through` é o maior gravado em qualquer ocorrência. */
export function effectiveRule(occurrences: readonly { series?: unknown; id: string }[]): SeriesRule | null {
  let best: SeriesRule | null = null;
  let bestId = '';
  let through = '';
  for (const o of occurrences) {
    const s = seriesOf(o);
    if (!s) continue;
    if (s.through > through) through = s.through;
    if (!best || s.v > best.v || (s.v === best.v && o.id > bestId)) { best = s; bestId = o.id; }
  }
  return best ? { ...best, through } : null;
}

/** Ocorrência gerada e nunca tocada (pode ceder a uma exclusão vinda de outro aparelho). */
export function isPristineOccurrence(a: Record<string, unknown> | { series?: unknown } | null | undefined): boolean {
  if (!a) return false;
  const r = a as Record<string, unknown>;
  const s = r.series && typeof r.series === 'object' ? (r.series as Record<string, unknown>) : null;
  return !!s && s.auto === true && s.detached !== true && r.status === 'agendado' && typeof r.createdAt === 'string' && r.createdAt === r.updatedAt;
}

/**
 * Ocorrências que faltam materializar (pura e determinística). Usa como modelo a ocorrência não destacada
 * mais recente; cria só datas depois de `through` e a partir de hoje, até hoje + 90 dias.
 */
export function pendingOccurrences(appointments: readonly Appointment[], today: string): Appointment[] {
  const existing = new Set(appointments.map((a) => a.id));
  const out: Appointment[] = [];
  for (const [, list] of seriesGroups(appointments)) {
    const rule = effectiveRule(list);
    if (!rule) continue;
    const horizon = addDaysKey(today, HORIZON_DAYS);
    const after = rule.through > addDaysKey(today, -1) ? rule.through : addDaysKey(today, -1);
    const dates = seriesDates(rule, after, horizon);
    if (!dates.length) continue;
    const template = [...list].reverse().find((a) => !seriesOf(a)!.detached) ?? list[list.length - 1]!;
    const through = rule.until && rule.until < horizon ? rule.until : horizon;
    for (const date of dates) {
      const id = occurrenceId(rule.id, date);
      if (existing.has(id)) continue;
      const { v, ...ruleFields } = rule;
      out.push({
        id, createdAt: v, updatedAt: v,
        title: template.title, clientId: template.clientId, date, time: template.time, price: template.price, notes: template.notes,
        status: 'agendado', completedAt: null, transactionId: null, payments: true,
        ...(template.duration != null ? { duration: template.duration } : {}),
        series: { ...ruleFields, v, through, auto: true, detached: false } as unknown as Record<string, unknown>,
      });
    }
  }
  return out;
}

const WEEKDAY_NAMES = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
/** "Toda semana (ter, qui) · até 31/12/2026", "Todo mês, dia 31 (último dia nos meses curtos)". */
export function describeRule(rule: SeriesRule): string {
  const every = rule.interval > 1;
  let base: string;
  if (rule.freq === 'diaria') base = every ? `A cada ${rule.interval} dias` : 'Todos os dias';
  else if (rule.freq === 'semanal') {
    const days = (rule.days?.length ? rule.days : [weekdayIndex(rule.start)]).map((d) => WEEKDAY_NAMES[d]).join(', ');
    base = `${rule.interval === 2 ? 'A cada 2 semanas' : every ? `A cada ${rule.interval} semanas` : 'Toda semana'} (${days})`;
  } else {
    const dom = Number(rule.start.slice(8));
    base = `${every ? `A cada ${rule.interval} meses` : 'Todo mês'}, dia ${dom}${dom > 28 ? ' (no último dia nos meses mais curtos)' : ''}`;
  }
  const br = (k: string) => `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
  const end = rule.until ? ` · até ${br(rule.until)}` : rule.count ? ` · ${rule.count} ${rule.count === 1 ? 'vez' : 'vezes'}` : '';
  return base + end;
}

/** Regra a partir do formulário ("Repetir"). `quinzenal` = semanal a cada 2 semanas. */
export function ruleFromRepeat(r: { freq: string; interval: string; days: number[]; end: string; until: string; count: string }, start: string, id: string, v: string): Omit<SeriesRule, 'through'> | null {
  if (!r.freq) return null;
  const freq: Freq = r.freq === 'quinzenal' ? 'semanal' : (r.freq as Freq);
  const interval = r.freq === 'quinzenal' ? 2 : Math.min(Math.max(1, Number(r.interval) || 1), MAX_INTERVAL[freq]);
  return {
    id, freq, interval, start, v,
    days: freq === 'semanal' ? [...new Set(r.days)].sort() : null,
    until: r.end === 'data' ? r.until : null,
    count: r.end === 'vezes' ? Math.min(Number(r.count), MAX_OCCURRENCES) : null,
  };
}

/** Formulário a partir da regra (edição de "esta e as próximas" / "toda a série"). */
export function repeatFromRule(rule: SeriesRule) {
  const quinzenal = rule.freq === 'semanal' && rule.interval === 2;
  return {
    freq: (quinzenal ? 'quinzenal' : rule.freq) as '' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal',
    interval: String(rule.interval), days: rule.days?.length ? rule.days : [weekdayIndex(rule.start)],
    end: (rule.until ? 'data' : rule.count ? 'vezes' : 'nunca') as 'nunca' | 'data' | 'vezes',
    until: rule.until ?? '', count: rule.count ? String(rule.count) : '',
  };
}

/** Mesma regra (frequência, intervalo, dias e término)? */
export const sameRule = (a: Pick<SeriesRule, 'freq' | 'interval' | 'days' | 'until' | 'count'>, b: Pick<SeriesRule, 'freq' | 'interval' | 'days' | 'until' | 'count'>) =>
  a.freq === b.freq && a.interval === b.interval && (a.until ?? null) === (b.until ?? null) && (a.count ?? null) === (b.count ?? null)
  && (a.freq !== 'semanal' || JSON.stringify([...(a.days ?? [])].sort()) === JSON.stringify([...(b.days ?? [])].sort()));

/** Versão nova da regra, sempre maior que a anterior (mesmo no mesmo milissegundo): "X" < "X+" < "X++". */
export const nextVersion = (prev: string, stamp: string) => (stamp > prev ? stamp : `${prev}+`);
