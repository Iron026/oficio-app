import { getProfession } from '../domain/professions';
import type { AppService } from '../state/service';
import { nativeReminderPlatform, reconcileReminders, type ReconcileResult, type ReminderPlatform } from './reminders';
import { isNative } from './native';

/** Plataforma de lembretes do app (substituível nos testes). */
let current: ReminderPlatform | null = null;
export function reminderPlatform(): ReminderPlatform {
  return (current ??= nativeReminderPlatform());
}
export function setReminderPlatform(p: ReminderPlatform | null) {
  current = p;
}

/** Último resultado da reconciliação (para a tela de Lembretes mostrar quantos estão agendados). */
let last: ReconcileResult | null = null;
const listeners = new Set<() => void>();
export const lastReconcile = () => last;
export function subscribeReconcile(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Mantém os lembretes do aparelho iguais à agenda (beta.4): ao abrir o app, ao voltar do segundo plano, ao alterar
 * agendamentos ou preferências e depois de sincronizar (toda mudança de dados passa por `service.subscribe`).
 * Espera um instante para juntar várias mudanças seguidas. Nunca pede permissão.
 */
export function startReminderSync(service: AppService, opts: { debounceMs?: number; now?: () => Date } = {}) {
  const debounce = opts.debounceMs ?? 1500;
  const now = opts.now ?? (() => new Date());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<ReconcileResult | null> | null = null;
  let again = false;
  let stopped = false;
  // A primeira reconciliação depois de o app iniciar reagenda tudo (ver reconcileReminders, `force`).
  let fresh = true;

  const run = async (): Promise<ReconcileResult | null> => {
    if (stopped) return null;
    if (running) { again = true; return running; }
    running = (async () => {
      try {
        const d = service.data;
        last = await reconcileReminders(reminderPlatform(), {
          appointments: d.appointments, clients: d.clients, prefs: service.devicePrefs.reminders, now: now(),
          serviceTerm: getProfession(d.profile?.professionId).terms.service,
        }, { force: fresh });
        if (last.permission !== 'indisponivel') fresh = false;
        listeners.forEach((l) => l());
        return last;
      } catch {
        return null; // sem plugin (web) ou falha pontual: tenta de novo na próxima mudança
      } finally {
        running = null;
        if (again) { again = false; void run(); }
      }
    })();
    return running;
  };
  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void run(), debounce);
  };

  const offData = service.subscribe(schedule);
  const offPrefs = service.subscribePrefs(schedule);
  let offResume: (() => void) | undefined;
  if (isNative()) {
    void import('@capacitor/app').then(({ App }) => App.addListener('resume', () => void run())).then((sub) => {
      if (stopped) void sub.remove();
      else offResume = () => void sub.remove();
    });
  }
  void run();
  return {
    runNow: run,
    stop() {
      stopped = true;
      clearTimeout(timer);
      offData();
      offPrefs();
      offResume?.();
    },
  };
}
