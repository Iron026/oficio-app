import { useEffect, useState, useSyncExternalStore } from 'react';
import { BatteryWarning, BellOff, BellRing, Info } from 'lucide-react';
import { OFFSET_LABEL, REMINDER_DAYS, REMINDER_OFFSETS, type ReminderOffset } from '../../domain/reminders';
import { isNative } from '../../platform/native';
import { lastReconcile, reminderPlatform, subscribeReconcile } from '../../platform/reminderSync';
import type { NotifyPermission } from '../../platform/reminders';
import { useApp, useErrorHandler, usePrefs } from '../../state/AppContext';
import { cx } from '../../ui/cx';
import { Card, Switch } from '../../ui/Misc';
import { Group, SettingsSubpage } from './shared';

/**
 * Lembretes de atendimentos (beta.4), por aparelho. Desligados por padrão. A permissão de notificações só é pedida
 * quando a pessoa liga os lembretes; recusada, o app respeita e mostra o estado, sem pedir de novo sozinho.
 */
export function RemindersPage({ native = isNative() }: { native?: boolean }) {
  const { service } = useApp();
  const prefs = usePrefs();
  const onError = useErrorHandler();
  const r = prefs.reminders;
  const [permission, setPermission] = useState<NotifyPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useSyncExternalStore(subscribeReconcile, lastReconcile);

  useEffect(() => {
    if (!native) return;
    let alive = true;
    reminderPlatform().checkPermission().then((p) => alive && setPermission(p), () => undefined);
    // Ao voltar das configurações do Android (o app reconcilia no "resume"), a tela acompanha a permissão atual.
    const off = subscribeReconcile(() => {
      const l = lastReconcile();
      if (alive && l && l.permission !== 'indisponivel') setPermission(l.permission);
    });
    return () => { alive = false; off(); };
  }, [native]);

  const save = (patch: Partial<typeof r>) => service.updateDevicePrefs({ reminders: { ...r, ...patch } }).catch(onError);

  async function toggle(on: boolean) {
    if (!on) return save({ enabled: false });
    setBusy(true);
    try {
      const platform = reminderPlatform();
      let p = await platform.checkPermission();
      if (p !== 'granted') p = await platform.requestPermission(); // só por ação da pessoa
      setPermission(p);
      if (p !== 'granted') return;
      await save({ enabled: true, offsets: r.offsets.length ? r.offsets : [30] });
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const toggleOffset = (o: ReminderOffset) => {
    const next = r.offsets.includes(o) ? r.offsets.filter((x) => x !== o) : [...r.offsets, o];
    void save({ offsets: REMINDER_OFFSETS.filter((x) => next.includes(x)) });
  };

  if (!native) {
    return (
      <SettingsSubpage id="lembretes">
        <Card className="space-y-2 !p-4" data-reminders="web">
          <p className="flex items-start gap-2 font-semibold"><BellOff size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> Lembretes funcionam no app Android</p>
          <p className="text-sm text-muted">No navegador, o Ofício não consegue avisar com a página fechada (isso exigiria um servidor de notificações). Instale o app Android para receber lembretes antes dos atendimentos.</p>
        </Card>
      </SettingsSubpage>
    );
  }

  const blocked = permission === 'denied';
  const active = r.enabled && permission === 'granted';
  return (
    <SettingsSubpage id="lembretes">
      <Card className="!py-1">
        <Switch checked={active} onChange={(v) => void (busy ? undefined : toggle(v))} label="Lembretes de atendimentos" description="Avisos neste aparelho antes de cada atendimento agendado. Desligados por padrão." />
      </Card>
      {blocked && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10" data-reminders-blocked>
          <BellOff size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Notificações do Ofício estão bloqueadas no Android. Para usar lembretes, permita em Configurações › Apps › Ofício › Notificações e volte aqui. O app não pede de novo sozinho.</span>
        </p>
      )}
      {r.enabled && permission !== 'granted' && !blocked && permission !== null && (
        <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Os lembretes estão pausados até a permissão de notificações ser concedida.</p>
      )}
      <Group title="Quando avisar" hint="Escolha uma ou mais antecedências.">
        <div role="group" aria-label="Antecedência dos lembretes" className="grid grid-cols-2 gap-2">
          {REMINDER_OFFSETS.map((o) => {
            const on = r.offsets.includes(o);
            return (
              <button key={o} type="button" aria-pressed={on} disabled={!active} onClick={() => toggleOffset(o)}
                className={cx('press-soft min-h-12 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50', on ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'border-line')}>
                {OFFSET_LABEL[o]}
              </button>
            );
          })}
        </div>
      </Group>
      <Card className="!py-1">
        <Switch checked={r.showClient} onChange={(v) => void save({ showClient: v })} label="Mostrar o nome do cliente" description="Desligado: o aviso mostra só o serviço e o horário. Na tela bloqueada, o conteúdo fica oculto." />
      </Card>
      {active && last && last.permission === 'granted' && (
        <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite" data-reminders-count={last.total}>
          <BellRing size={16} aria-hidden="true" /> {last.total === 0 ? 'Nenhum lembrete' : last.total === 1 ? '1 lembrete agendado' : `${last.total} lembretes agendados`} para os próximos {REMINDER_DAYS} dias.
        </p>
      )}
      <div className="space-y-2 text-sm text-muted">
        <p className="flex items-start gap-2"><BatteryWarning size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> O Android pode atrasar os avisos alguns minutos para economizar bateria, principalmente com a otimização de bateria ativada.</p>
        <p className="flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> Só os atendimentos dos próximos {REMINDER_DAYS} dias são agendados; o app atualiza os lembretes ao abrir, ao mudar a agenda e depois de sincronizar. Esta configuração vale só para este aparelho.</p>
      </div>
    </SettingsSubpage>
  );
}
