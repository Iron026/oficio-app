/** Utilitários de data trabalhando em horário local, com datas "YYYY-MM-DD". */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function todayKey(now = new Date()): string {
  return toDateKey(now);
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Início da semana (segunda-feira). */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (r.getDay() + 6) % 7; // segunda = 0
  r.setDate(r.getDate() - day);
  return r;
}

export function weekRange(now: Date): { start: string; end: string } {
  const s = startOfWeek(now);
  return { start: toDateKey(s), end: toDateKey(addDays(s, 6)) };
}

/** Identificador da semana, ex.: "2026-11-02" (segunda-feira). */
export function weekKey(now: Date): string {
  return toDateKey(startOfWeek(now));
}

/** "YYYY-MM" */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function inRange(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end;
}

export function isInMonth(dateKey: string, mKey: string): boolean {
  return dateKey.startsWith(mKey);
}

const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthLabel(mKey: string, short = false): string {
  const [y, m] = mKey.split('-').map(Number);
  const name = monthNames[(m ?? 1) - 1] ?? '';
  if (short) return name.slice(0, 3);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

export function formatDateLong(key: string): string {
  return parseDateKey(key).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateShort(key: string): string {
  return parseDateKey(key).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

/** Rótulo amigável: Hoje, Amanhã, Ontem ou data por extenso. */
export function relativeDayLabel(key: string, now = new Date()): string {
  const today = todayKey(now);
  if (key === today) return 'Hoje';
  if (key === toDateKey(addDays(now, 1))) return 'Amanhã';
  if (key === toDateKey(addDays(now, -1))) return 'Ontem';
  const label = formatDateLong(key);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
