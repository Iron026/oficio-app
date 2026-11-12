/**
 * Lembretes de atendimentos (0.5.0-beta.4). Funções puras: o que deve estar agendado no aparelho, dado os
 * agendamentos e as preferências locais. A reconciliação (platform/reminders.ts) compara com o que já está
 * agendado e só cancela/agenda a diferença — nunca duplica.
 *
 * - Só atendimentos "agendado" com horário, cujo início está nos próximos 30 dias e cujo aviso ainda não passou.
 *   Cancelados, concluídos, excluídos e antigos ficam de fora (e são cancelados na reconciliação).
 * - Horário de parede: o aviso dispara no horário local do aparelho (data + hora do atendimento).
 * - Id numérico estável por (atendimento, antecedência): ocorrências de séries têm ids próprios, então cada uma
 *   gera seus avisos uma única vez; reagendar muda só o horário do mesmo id.
 * - Privacidade: por padrão o aviso diz só "Atendimento em 15 minutos · 10:00" — sem a descrição do atendimento,
 *   sem o nome do cliente e sem valores, porque a tela bloqueada pode mostrar o conteúdo (o Android só oculta
 *   avisos privados se a pessoa configurou isso). Detalhes só se a pessoa ligar "Mostrar detalhes no aviso".
 */
import type { Appointment, Client } from './types';

export const REMINDER_OFFSETS = [15, 30, 60, 1440] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];
export const REMINDER_DAYS = 30;
/** Teto de avisos agendados de uma vez (bem abaixo do limite de alarmes do Android). */
export const REMINDER_MAX = 120;
/**
 * Avisos não exatos podem chegar depois da hora marcada (no Android 12+, até ~1 h). Um aviso que já passou da hora
 * mas continua pendente no aparelho é mantido por até 2 h — desde que o atendimento ainda não tenha começado e
 * continue igual —; nunca é agendado de novo.
 */
export const REMINDER_LATE_GRACE_MS = 2 * 3_600_000;

export interface ReminderPrefs {
  enabled: boolean;
  offsets: ReminderOffset[];
  /** Mostrar a descrição do atendimento e o nome do cliente no aviso (desligado por padrão). */
  showDetails: boolean;
}
export const DEFAULT_REMINDERS: ReminderPrefs = { enabled: false, offsets: [], showDetails: false };

export function readReminderPrefs(v: unknown): ReminderPrefs {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const offsets = Array.isArray(o.offsets) ? REMINDER_OFFSETS.filter((x) => (o.offsets as unknown[]).includes(x)) : [];
  return { enabled: o.enabled === true, offsets, showDetails: o.showDetails === true };
}

export const OFFSET_LABEL: Record<ReminderOffset, string> = { 15: '15 minutos antes', 30: '30 minutos antes', 60: '1 hora antes', 1440: '1 dia antes' };

export interface PlannedReminder {
  id: number;
  /** Instante do aviso (ms desde 1970). */
  at: number;
  apptId: string;
  offset: ReminderOffset;
  title: string;
  body: string;
}

/** Id positivo de 31 bits, estável (FNV-1a), nunca zero. */
export function reminderId(apptId: string, offset: number): number {
  let h = 0x811c9dc5;
  const s = `${apptId}|${offset}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h & 0x7fffffff) || 1;
}

/** Início do atendimento no horário local do aparelho (null sem horário). */
export function localStart(a: Pick<Appointment, 'date' | 'time'>): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !/^\d{2}:\d{2}$/.test(a.time)) return null;
  const [y, m, d] = a.date.split('-').map(Number) as [number, number, number];
  const [h, mi] = a.time.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

/** Texto do aviso sem detalhes (padrão). */
export const GENERIC_BODY = 'Toque para ver os detalhes no Ofício.';

const when = (offset: ReminderOffset) => (offset === 1440 ? 'amanhã' : offset === 60 ? 'em 1 hora' : `em ${offset} minutos`);

export function planReminders(
  appointments: readonly Appointment[],
  clients: readonly Pick<Client, 'id' | 'name'>[],
  prefs: ReminderPrefs,
  now: Date,
  serviceTerm = 'Atendimento',
): PlannedReminder[] {
  if (!prefs.enabled || !prefs.offsets.length) return [];
  const limit = now.getTime() + REMINDER_DAYS * 86_400_000;
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const out: PlannedReminder[] = [];
  const seen = new Set<number>();
  for (const a of appointments) {
    if (a.status !== 'agendado' || a.isDemo) continue;
    const start = localStart(a);
    if (!start || start.getTime() <= now.getTime() || start.getTime() > limit) continue;
    for (const offset of prefs.offsets) {
      const at = start.getTime() - offset * 60_000;
      if (at <= now.getTime()) continue; // aviso que já teria passado
      const id = reminderId(a.id, offset);
      if (seen.has(id)) continue;
      seen.add(id);
      const client = prefs.showDetails && a.clientId ? names.get(a.clientId) : undefined;
      out.push({
        id, at, apptId: a.id, offset,
        title: `${serviceTerm} ${when(offset)} · ${a.time}`,
        body: prefs.showDetails ? `${a.title}${client ? ` · ${client}` : ''}` : GENERIC_BODY,
      });
    }
  }
  return out.sort((x, y) => x.at - y.at).slice(0, REMINDER_MAX);
}

/** Avisos cuja hora já passou, mas que ainda valem se o Android não os entregou (ver REMINDER_LATE_GRACE_MS). */
export function lateReminders(
  appointments: readonly Appointment[],
  clients: readonly Pick<Client, 'id' | 'name'>[],
  prefs: ReminderPrefs,
  now: Date,
  serviceTerm?: string,
): PlannedReminder[] {
  const t = now.getTime();
  return planReminders(appointments, clients, prefs, new Date(t - REMINDER_LATE_GRACE_MS), serviceTerm)
    .filter((p) => p.at <= t && p.at + p.offset * 60_000 > t);
}

export interface PendingReminder { id: number; at: number | null; title: string; body: string }

/**
 * Diferença entre o agendado no aparelho e o planejado: só cancela/agenda o que mudou (sem duplicar).
 * `late`: avisos atrasados que continuam valendo — mantidos se ainda pendentes e idênticos, nunca agendados.
 */
export function diffReminders(
  pending: readonly PendingReminder[],
  planned: readonly PlannedReminder[],
  late: readonly PlannedReminder[] = [],
): { cancel: number[]; schedule: PlannedReminder[] } {
  const want = new Map([...late, ...planned].map((p) => [p.id, p]));
  const have = new Map(pending.map((p) => [p.id, p]));
  const same = (h: PendingReminder, p: PlannedReminder) => h.at === p.at && h.title === p.title && h.body === p.body;
  const cancel = pending.filter((h) => { const p = want.get(h.id); return !p || !same(h, p); }).map((h) => h.id);
  const schedule = planned.filter((p) => { const h = have.get(p.id); return !h || !same(h, p); });
  return { cancel, schedule };
}
