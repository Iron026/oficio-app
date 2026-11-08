/**
 * Agenda inteligente (0.5): intervalos, visões dia/semana/mês e conflitos. Funções puras.
 *
 * Horários são "de parede": data (AAAA-MM-DD) + hora (HH:mm) locais, exatamente como a pessoa
 * agendou. Os cálculos usam minutos absolutos por dia de calendário (Date.UTC), nunca `Date` local:
 * horário de verão, mudança de fuso no aparelho ou viagem não deslocam nem encurtam atendimentos.
 */
import type { Appointment } from './types';

/**
 * Duração é opcional (beta.2): sem `duration` (ausente ou null) o fim é desconhecido. Nada é presumido:
 * o atendimento ocupa só o horário de início para conflitos e aparece na grade com uma altura mínima
 * (`UNKNOWN_DURATION_DISPLAY`), apenas visual.
 */
export const UNKNOWN_DURATION_DISPLAY = 45;
export const MIN_DURATION = 5;
export const MAX_DURATION = 1440;

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 720, 1440];

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const DAY = 1440;
/** Número do dia de calendário (independe do fuso e do horário de verão). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}
export function keyFromDay(n: number): string {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export const addDaysKey = (key: string, n: number) => keyFromDay(dayNumber(key) + n);
/** 0 = segunda … 6 = domingo. */
export const weekdayIndex = (key: string) => (((dayNumber(key) + 3) % 7) + 7) % 7;

type Ap = Pick<Appointment, 'id' | 'date' | 'time' | 'status'> & { duration?: number | null };

/** Duração informada, ou null quando não foi informada (nunca um valor presumido). */
export const durationOf = (a: { duration?: number | null }): number | null =>
  typeof a.duration === 'number' && a.duration >= MIN_DURATION && a.duration <= MAX_DURATION ? a.duration : null;

/**
 * Intervalo em minutos absolutos [início, fim). Sem horário: null (não entra em conflitos nem na grade).
 * Sem duração: `known: false` e `end === start` (só o instante de início é conhecido).
 */
export function intervalOf(a: Ap): { start: number; end: number; known: boolean } | null {
  if (!/^\d{2}:\d{2}$/.test(a.time)) return null;
  const [h, m] = a.time.split(':').map(Number);
  const start = dayNumber(a.date) * DAY + (h ?? 0) * 60 + (m ?? 0);
  const d = durationOf(a);
  return { start, end: start + (d ?? 0), known: d !== null };
}

type Iv = { start: number; end: number; known: boolean };
/**
 * Sobreposição sem presumir fins desconhecidos: dois intervalos conhecidos se sobrepõem quando se
 * cruzam (encostar não conta); um início sem duração conflita só se cair dentro de um intervalo
 * conhecido ou coincidir com outro início sem duração.
 */
function overlaps(x: Iv, y: Iv): boolean {
  if (x.known && y.known) return x.start < y.end && y.start < x.end;
  if (!x.known && !y.known) return x.start === y.start;
  const [p, k] = x.known ? [y, x] : [x, y];
  return k.start <= p.start && p.start < k.end;
}

/** "23:00–01:00 (+1 dia)"; sem duração, só o início ("14:00"). */
export function timeRange(a: Ap): string {
  const iv = intervalOf(a);
  if (!iv) return 'Sem horário';
  const fmt = (min: number) => `${String(Math.floor((((min % DAY) + DAY) % DAY) / 60)).padStart(2, '0')}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;
  if (!iv.known) return fmt(iv.start);
  const days = Math.floor(iv.end / DAY) - Math.floor(iv.start / DAY) - (iv.end % DAY === 0 ? 1 : 0);
  return `${fmt(iv.start)}–${fmt(iv.end)}${days > 0 ? ` (+${days} dia${days > 1 ? 's' : ''})` : ''}`;
}

/**
 * Conflitos: atendimentos não cancelados com horário cujos intervalos se sobrepõem (encostar não é
 * conflito: 14:00–15:00 e 15:00–16:00 estão livres; sem duração, ver `overlaps`). Retorna, por id,
 * os ids em conflito.
 */
export function conflictMap(appointments: readonly Ap[]): Map<string, string[]> {
  const items = appointments
    .filter((a) => a.status !== 'cancelado')
    .flatMap((a) => { const iv = intervalOf(a); return iv ? [{ id: a.id, ...iv }] : []; })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = new Map<string, string[]>();
  const add = (x: string, y: string) => out.set(x, [...(out.get(x) ?? []), y]);
  const active: typeof items = [];
  for (const it of items) {
    // Ordenados pelo início: sai quem termina até aqui (ou, sem duração, quem começou antes).
    for (let i = active.length - 1; i >= 0; i--) {
      const o = active[i]!;
      if (o.known ? o.end <= it.start : o.start < it.start) active.splice(i, 1);
    }
    for (const o of active) if (overlaps(o, it)) { add(o.id, it.id); add(it.id, o.id); }
    active.push(it);
  }
  return out;
}

/** Conflitos de um atendimento ainda não salvo (para o aviso ao salvar). */
export function conflictsFor(candidate: Ap, others: readonly Ap[]): string[] {
  const iv = intervalOf(candidate);
  if (!iv || candidate.status === 'cancelado') return [];
  return others.filter((o) => {
    if (o.id === candidate.id || o.status === 'cancelado') return false;
    const ov = intervalOf(o);
    return !!ov && overlaps(iv, ov);
  }).map((o) => o.id);
}

export interface DayItem<T> {
  a: T;
  /** Minuto de início e fim dentro do dia (0–1440), já recortados. */
  from: number;
  to: number;
  /** Começou no dia anterior / termina no dia seguinte. */
  fromPrev: boolean;
  toNext: boolean;
  /** Sem duração informada: `to` é só a altura mínima da grade, não um fim presumido. */
  unknownEnd: boolean;
  /** Coluna e total de colunas para mostrar sobrepostos lado a lado. */
  lane: number;
  lanes: number;
}

/**
 * Atendimentos que ocupam o dia (inclusive os que vêm da noite anterior e atravessam a meia-noite),
 * com colunas para os sobrepostos. Sem horário ficam em `untimed`.
 */
export function dayLayout<T extends Ap>(appointments: readonly T[], key: string): { timed: DayItem<T>[]; untimed: T[] } {
  const d0 = dayNumber(key) * DAY;
  const d1 = d0 + DAY;
  const untimed = appointments.filter((a) => a.date === key && !intervalOf(a));
  const timed = appointments
    .flatMap((a) => {
      const iv = intervalOf(a);
      if (!iv) return [];
      // Sem duração: ocupa na grade só uma altura mínima a partir do início, sem atravessar o dia.
      const end = iv.known ? iv.end : Math.min(iv.start + UNKNOWN_DURATION_DISPLAY, dayNumber(a.date) * DAY + DAY);
      return iv.start < d1 && end > d0 ? [{ a, iv: { ...iv, end } }] : [];
    })
    .sort((x, y) => x.iv.start - y.iv.start || y.iv.end - x.iv.end)
    .map(({ a, iv }) => ({ a, from: Math.max(iv.start, d0) - d0, to: Math.min(iv.end, d1) - d0, fromPrev: iv.start < d0, toNext: iv.end > d1, unknownEnd: !iv.known, lane: 0, lanes: 1 }));
  // Colunas: grupos de sobreposição; em cada grupo, a primeira coluna livre.
  let group: DayItem<T>[] = [];
  let groupEnd = -1;
  const close = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); for (const g of group) g.lanes = n; group = []; };
  for (const it of timed) {
    if (it.from >= groupEnd) { close(); groupEnd = -1; }
    const used = new Set(group.filter((g) => g.to > it.from).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    it.lane = lane;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.to);
  }
  close();
  return { timed, untimed };
}

/** Atendimentos por dia numa faixa de datas (inclui quem atravessa a meia-noite nos dois dias). */
export function byDay<T extends Ap>(appointments: readonly T[], keys: readonly string[]): Map<string, T[]> {
  const out = new Map<string, T[]>(keys.map((k) => [k, []]));
  for (const k of keys) {
    const d0 = dayNumber(k) * DAY;
    for (const a of appointments) {
      const iv = intervalOf(a);
      if (iv?.known ? iv.start < d0 + DAY && iv.end > d0 : a.date === k) out.get(k)!.push(a);
    }
    out.get(k)!.sort((x, y) => (intervalOf(x)?.start ?? Infinity) - (intervalOf(y)?.start ?? Infinity));
  }
  return out;
}

/** Os 7 dias (segunda a domingo) da semana que contém `key`. */
export function weekKeys(key: string): string[] {
  const start = addDaysKey(key, -weekdayIndex(key));
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/** Grade do mês: semanas completas (segunda a domingo) cobrindo o mês de `key`. */
export function monthGrid(key: string): string[][] {
  const first = `${key.slice(0, 7)}-01`;
  const [y, m] = first.split('-').map(Number);
  const last = keyFromDay(dayNumber(`${m === 12 ? (y ?? 0) + 1 : y}-${String(m === 12 ? 1 : (m ?? 0) + 1).padStart(2, '0')}-01`) - 1);
  const weeks: string[][] = [];
  let cur = addDaysKey(first, -weekdayIndex(first));
  while (dayNumber(cur) <= dayNumber(last)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysKey(cur, i)));
    cur = addDaysKey(cur, 7);
  }
  return weeks;
}

export const addMonthsKey = (key: string, n: number): string => {
  const [y, m] = key.split('-').map(Number);
  const total = (y ?? 0) * 12 + ((m ?? 1) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
};
