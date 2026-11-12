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
 * - Privacidade: por padrão, sem nome do cliente e sem valores; o canal do Android esconde o conteúdo na tela
 *   bloqueada.
 */
import type { Appointment, Client } from './types';

export const REMINDER_OFFSETS = [15, 30, 60, 1440] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];
export const REMINDER_DAYS = 30;
/** Teto de avisos agendados de uma vez (bem abaixo do limite de alarmes do Android). */
export const REMINDER_MAX = 120;

export interface ReminderPrefs {
  enabled: boolean;
  offsets: ReminderOffset[];
  /** Mostrar o nome do cliente no aviso (desligado por padrão). */
  showClient: boolean;
}
export const DEFAULT_REMINDERS: ReminderPrefs = { enabled: false, offsets: [], showClient: false };

export function readReminderPrefs(v: unknown): ReminderPrefs {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const offsets = Array.isArray(o.offsets) ? REMINDER_OFFSETS.filter((x) => (o.offsets as unknown[]).includes(x)) : [];
  return { enabled: o.enabled === true, offsets, showClient: o.showClient === true };
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
      const client = prefs.showClient && a.clientId ? names.get(a.clientId) : undefined;
      out.push({
        id, at, apptId: a.id, offset,
        title: `${serviceTerm} ${when(offset)} · ${a.time}`,
        body: `${a.title}${client ? ` · ${client}` : ''}`,
      });
    }
  }
  return out.sort((x, y) => x.at - y.at).slice(0, REMINDER_MAX);
}

export interface PendingReminder { id: number; at: number | null; title: string; body: string }

/** Diferença entre o agendado no aparelho e o planejado: só cancela/agenda o que mudou (sem duplicar). */
export function diffReminders(pending: readonly PendingReminder[], planned: readonly PlannedReminder[]): { cancel: number[]; schedule: PlannedReminder[] } {
  const want = new Map(planned.map((p) => [p.id, p]));
  const have = new Map(pending.map((p) => [p.id, p]));
  const same = (h: PendingReminder, p: PlannedReminder) => h.at === p.at && h.title === p.title && h.body === p.body;
  const cancel = pending.filter((h) => { const p = want.get(h.id); return !p || !same(h, p); }).map((h) => h.id);
  const schedule = planned.filter((p) => { const h = have.get(p.id); return !h || !same(h, p); });
  return { cancel, schedule };
}
