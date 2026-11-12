import { diffReminders, lateReminders, planReminders, type PendingReminder, type PlannedReminder, type ReminderPrefs } from '../domain/reminders';
import type { Appointment, Client } from '../domain/types';
import { isNative } from './native';

/**
 * Lembretes no aparelho (beta.4). Android: `@capacitor/local-notifications`, agendamento **não exato**
 * (`isExactNotification: false`, `allowWhileIdle`) — o app não pede "alarmes exatos" e o manifesto remove
 * SCHEDULE_EXACT_ALARM. O Android pode atrasar alguns minutos para economizar bateria.
 * Web: navegadores não avisam com a página fechada sem um servidor; aqui não há agendamento.
 */
export type NotifyPermission = 'granted' | 'denied' | 'prompt';

export interface ReminderPlatform {
  available(): boolean;
  checkPermission(): Promise<NotifyPermission>;
  requestPermission(): Promise<NotifyPermission>;
  pending(): Promise<PendingReminder[]>;
  cancel(ids: number[]): Promise<void>;
  schedule(list: PlannedReminder[]): Promise<void>;
}

export const CHANNEL_ID = 'lembretes';

const asPermission = (v: string | undefined): NotifyPermission => (v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'prompt');

/** Plataforma nativa (Android). Carregada sob demanda: o plugin só existe no app. */
export function nativeReminderPlatform(): ReminderPlatform {
  // O plugin do Capacitor é um Proxy que "tem" qualquer método, inclusive `then`: devolvê-lo direto de uma função
  // async faria o `await` chamar `LocalNotifications.then()` (falha no Android). Por isso vai dentro de um objeto.
  const plugin = async () => ({ ln: (await import('@capacitor/local-notifications')).LocalNotifications });
  let channel = false;
  return {
    available: () => isNative(),
    async checkPermission() {
      return asPermission((await (await plugin()).ln.checkPermissions()).display);
    },
    async requestPermission() {
      return asPermission((await (await plugin()).ln.requestPermissions()).display);
    },
    async pending() {
      const { notifications } = await (await plugin()).ln.getPending();
      return notifications.map((n) => ({ id: n.id, at: n.schedule?.at ? new Date(n.schedule.at).getTime() : null, title: n.title ?? '', body: n.body ?? '' }));
    },
    async cancel(ids) {
      if (ids.length) await (await plugin()).ln.cancel({ notifications: ids.map((id) => ({ id })) });
    },
    async schedule(list) {
      if (!list.length) return;
      const { ln } = await plugin();
      if (!channel) {
        // O Android ignora a visibilidade de canal pedida por apps (só o sistema a muda); o plugin marca cada aviso
        // como privado, o que só oculta o conteúdo se a pessoa configurou a tela bloqueada assim. Por isso o texto
        // padrão do aviso já não tem detalhes (domain/reminders.ts).
        await ln.createChannel({ id: CHANNEL_ID, name: 'Lembretes de atendimentos', description: 'Avisos antes dos atendimentos agendados', importance: 4, visibility: 0 });
        channel = true;
      }
      await ln.schedule({
        notifications: list.map((r) => ({
          id: r.id, title: r.title, body: r.body, channelId: CHANNEL_ID,
          schedule: { at: new Date(r.at), allowWhileIdle: true },
          isExactNotification: false,
          extra: { apptId: r.apptId, offset: r.offset },
        })),
      });
    },
  };
}

export interface ReconcileResult { scheduled: number; cancelled: number; total: number; permission: NotifyPermission | 'indisponivel' }

/**
 * Deixa o agendado no aparelho igual ao planejado. Idempotente: rodar de novo sem mudanças não agenda nem
 * cancela nada. Desligado (ou sem permissão): cancela os avisos pendentes do app. Nunca pede permissão.
 */
export async function reconcileReminders(
  platform: ReminderPlatform,
  input: { appointments: readonly Appointment[]; clients: readonly Pick<Client, 'id' | 'name'>[]; prefs: ReminderPrefs; now: Date; serviceTerm?: string },
): Promise<ReconcileResult> {
  if (!platform.available()) return { scheduled: 0, cancelled: 0, total: 0, permission: 'indisponivel' };
  const permission = await platform.checkPermission();
  const granted = permission === 'granted';
  const planned = granted ? planReminders(input.appointments, input.clients, input.prefs, input.now, input.serviceTerm) : [];
  const late = granted ? lateReminders(input.appointments, input.clients, input.prefs, input.now, input.serviceTerm) : [];
  const pending = await platform.pending();
  const { cancel, schedule } = diffReminders(pending, planned, late);
  await platform.cancel(cancel);
  await platform.schedule(schedule);
  return { scheduled: schedule.length, cancelled: cancel.length, total: planned.length, permission };
}

/** Plataforma em memória (testes e diagnóstico): simula permissão e o que fica pendente. */
export function memoryReminderPlatform(initial: NotifyPermission = 'prompt', answer: NotifyPermission = 'granted') {
  const state = { permission: initial, requests: 0, pending: new Map<number, PendingReminder>(), scheduleCalls: 0, cancelCalls: 0 };
  const platform: ReminderPlatform = {
    available: () => true,
    checkPermission: async () => state.permission,
    requestPermission: async () => { state.requests++; state.permission = answer; return state.permission; },
    pending: async () => [...state.pending.values()],
    cancel: async (ids) => { if (ids.length) state.cancelCalls++; for (const id of ids) state.pending.delete(id); },
    schedule: async (list) => { if (list.length) state.scheduleCalls++; for (const r of list) state.pending.set(r.id, { id: r.id, at: r.at, title: r.title, body: r.body }); },
  };
  return { platform, state };
}
