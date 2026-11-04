import { addMonths, inRange, isInMonth, monthKey, toDateKey, weekRange } from '../lib/dates';
import { monthTotals } from './finance';
import type { AppData, Appointment } from './types';

type Data = Pick<AppData, 'clients' | 'appointments' | 'transactions'>;

/** Data (YYYY-MM-DD local) em que o serviço foi concluído. */
export function completionDateKey(a: Appointment): string {
  return a.completedAt ? toDateKey(new Date(a.completedAt)) : a.date;
}

export const isCompleted = (a: Appointment) => a.status === 'concluido';

export function completedInRange(appointments: Appointment[], start: string, end: string): Appointment[] {
  return appointments.filter((a) => isCompleted(a) && inRange(completionDateKey(a), start, end));
}

export function completedInMonth(appointments: Appointment[], mKey: string): Appointment[] {
  return appointments.filter((a) => isCompleted(a) && isInMonth(completionDateKey(a), mKey));
}

export interface MonthSnapshot {
  month: string;
  income: number;
  expense: number;
  balance: number;
  servicesCompleted: number;
  newClients: number;
}

/** Histórico mensal dos últimos `months` meses (mais antigo primeiro). */
export function monthlyHistory(data: Data, now: Date, months = 6): MonthSnapshot[] {
  const out: MonthSnapshot[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const mKey = monthKey(addMonths(now, -i));
    const t = monthTotals(data.transactions, mKey);
    out.push({
      month: mKey,
      ...t,
      servicesCompleted: completedInMonth(data.appointments, mKey).length,
      newClients: data.clients.filter((c) => isInMonth(toDateKey(new Date(c.createdAt)), mKey)).length,
    });
  }
  return out;
}

export function weekServicesCompleted(appointments: Appointment[], now: Date): number {
  const { start, end } = weekRange(now);
  return completedInRange(appointments, start, end).length;
}

/** Próximos agendamentos (a partir de hoje), em ordem cronológica. */
export function upcoming(appointments: Appointment[], now: Date, limit = 5): Appointment[] {
  const today = toDateKey(now);
  return appointments
    .filter((a) => a.status === 'agendado' && a.date >= today)
    .sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')))
    .slice(0, limit);
}

/** Agendamentos passados que ainda não foram concluídos nem cancelados. */
export function overdue(appointments: Appointment[], now: Date): Appointment[] {
  const today = toDateKey(now);
  return appointments.filter((a) => a.status === 'agendado' && a.date < today);
}

/** Atendimentos concluídos por cliente, num único passe (listas grandes sem custo quadrático). */
export function completedCountByClient(appointments: readonly Appointment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of appointments) if (a.clientId && a.status === 'concluido') out.set(a.clientId, (out.get(a.clientId) ?? 0) + 1);
  return out;
}
