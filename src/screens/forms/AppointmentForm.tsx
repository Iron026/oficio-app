import { useState } from 'react';
import { Pin, Settings2 } from 'lucide-react';
import { conflictsFor, DURATION_OPTIONS, formatDuration, timeRange } from '../../domain/agenda';
import { applyServiceChoice, serviceChoices } from '../../domain/serviceTypes';
import type { Appointment } from '../../domain/types';
import { todayKey } from '../../lib/dates';
import { centsToInput, formatMoney } from '../../lib/money';
import { hasErrors, validateAppointment, type AppointmentInput, type Errors } from '../../lib/validation';
import { useApp, useErrorHandler, useFeedback } from '../../state/AppContext';
import { Button } from '../../ui/Button';
import { effectiveRule, repeatFromRule, seriesGroups, seriesOf } from '../../domain/recurrence';
import type { RepeatInput } from '../../lib/validation';
import type { EditScope } from '../../state/service';
import { EMPTY_REPEAT, RepeatFields } from '../agenda/Recurrence';
import { useConfirm } from '../../ui/Confirm';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Chip } from '../../ui/Misc';
import { Sheet } from '../../ui/Sheet';
import { useHideValues } from '../../ui/privacy';
import { ServiceTypesSheet } from '../ServiceTypesSheet';

interface Props { open: boolean; onClose: () => void; appointment?: Appointment; defaultClientId?: string; defaultDate?: string; scope?: EditScope }

export function AppointmentFormSheet({ open, onClose, appointment, defaultClientId, defaultDate, scope = 'esta' }: Props) {
  const { profession } = useApp();
  const t = profession.terms;
  const batch = appointment && seriesOf(appointment) && scope !== 'esta';
  return (
    <Sheet open={open} onClose={onClose} title={appointment ? (batch ? (scope === 'serie' ? 'Editar toda a série' : 'Editar esta e as próximas') : `Editar ${t.service.toLowerCase()}`) : `Agendar ${t.service.toLowerCase()}`}>
      {open && <AppointmentForm appointment={appointment} defaultClientId={defaultClientId} defaultDate={defaultDate} scope={scope} onDone={onClose} />}
    </Sheet>
  );
}

function AppointmentForm({ appointment, defaultClientId, defaultDate, scope, onDone }: { appointment?: Appointment; defaultClientId?: string; defaultDate?: string; scope: EditScope; onDone: () => void }) {
  const { service, data, profession } = useApp();
  const t = profession.terms;
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const confirm = useConfirm();
  const [v, setV] = useState<AppointmentInput>(
    appointment
      ? { title: appointment.title, clientId: appointment.clientId ?? '', date: appointment.date, time: appointment.time, price: centsToInput(appointment.price), notes: appointment.notes, duration: appointment.duration ? String(appointment.duration) : '' }
      : { title: '', clientId: defaultClientId ?? '', date: defaultDate ?? todayKey(), time: '', price: '', notes: '', duration: '' },
  );
  // beta.3: repetição ao criar; ao editar "esta e as próximas" ou "toda a série", parte da regra atual.
  const batch = !!appointment && !!seriesOf(appointment) && scope !== 'esta';
  const [repeat, setRepeat] = useState<RepeatInput>(() => {
    if (!batch) return EMPTY_REPEAT;
    const rule = effectiveRule(seriesGroups(data.appointments).get(seriesOf(appointment!)!.id) ?? [appointment!]);
    return rule ? repeatFromRule(rule) : EMPTY_REPEAT;
  });
  const showRepeat = !appointment || batch;
  const [errors, setErrors] = useState<Errors<AppointmentInput>>({});
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  const hidden = useHideValues();
  const choices = serviceChoices(data.serviceTypes, profession.serviceTemplates);
  const set = (k: keyof AppointmentInput) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const clients = [...data.clients].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: AppointmentInput = { ...v, ...(showRepeat ? { repeat } : {}) };
    const errs = validateAppointment(input);
    setErrors(errs);
    if (hasErrors(errs)) return;
    // 0.5: conflito de horário avisa, mostra quem coincide e nunca bloqueia.
    const clash = conflictsFor(
      { id: appointment?.id ?? '__novo', date: v.date, time: v.time, duration: v.duration ? Number(v.duration) : null, status: appointment?.status ?? 'agendado' },
      data.appointments,
    ).map((id) => data.appointments.find((a) => a.id === id)!).filter(Boolean);
    if (clash.length) {
      const lines = clash.slice(0, 3).map((a) => `${a.title} · ${a.date === v.date ? '' : `${a.date.split('-').reverse().slice(0, 2).join('/')} `}${timeRange(a)}${a.clientId ? ` (${data.clients.find((c) => c.id === a.clientId)?.name ?? 'cliente'})` : ''}`);
      const ok = await confirm({
        title: 'Conflito de horário',
        message: `Este horário coincide com: ${lines.join('; ')}${clash.length > 3 ? ` e mais ${clash.length - 3}` : ''}. Você pode salvar assim mesmo.`,
        cancelLabel: 'Mudar horário',
        confirmLabel: 'Salvar mesmo assim',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await service.saveAppointment(input, appointment?.id, scope);
      feedback(appointment ? (batch ? 'Série atualizada' : 'Alterações salvas') : repeat.freq ? 'Atendimentos recorrentes agendados' : `${t.service} agendad${t.serviceArticle}`, res.feedback);
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField label={`Descrição d${t.serviceArticle} ${t.service.toLowerCase()}`} value={v.title} onChange={set('title')} error={errors.title} maxLength={80} />
      {!appointment && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm text-muted">{data.serviceTypes.length ? 'Seus serviços e sugestões:' : `Sugestões para ${profession.name.toLowerCase()}:`}</p>
            <button type="button" onClick={() => setManaging(true)} className="press-soft -my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <Settings2 size={16} aria-hidden="true" /> Gerenciar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <Chip
                key={`${c.source}-${c.name}`}
                active={v.title === c.name}
                onClick={() => setV((cur) => applyServiceChoice(cur, c))}
              >
                {c.pinned && <Pin size={13} className="shrink-0" aria-label="Fixado" />}
                <span>{c.name}{c.price ? <> · {hidden ? 'R$ •••••' : formatMoney(c.price)}</> : null}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      <SelectField label={t.client} value={v.clientId} onChange={set('clientId')} optional>
        <option value="">Sem cliente vinculado</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField label={batch ? 'Data (desta)' : 'Data'} type="date" value={v.date} onChange={set('date')} error={errors.date} disabled={batch} hint={batch ? 'Para mudar a data, edite só esta.' : undefined} />
        <TextField label="Horário" type="time" value={v.time} onChange={set('time')} error={errors.time} optional />
      </div>
      <SelectField label="Duração" value={v.duration ?? ''} onChange={set('duration')} error={errors.duration} optional hint={v.time ? (v.duration ? undefined : 'Sem duração, a agenda mostra só o início e não presume o término.') : 'A duração vale quando há horário.'}>
        <option value="">Não informar</option>
        {[...new Set([...DURATION_OPTIONS, ...(v.duration ? [Number(v.duration)] : [])])].sort((a, b) => a - b).map((m) => <option key={m} value={String(m)}>{formatDuration(m)}</option>)}
      </SelectField>
      <TextField label="Valor" prefix="R$" inputMode="decimal" placeholder="0,00" value={v.price} onChange={set('price')} error={errors.price} hint="Os preços sugeridos são apenas referência." optional />
      <TextArea label="Observações" value={v.notes} onChange={set('notes')} error={errors.notes} optional maxLength={500} />
      {showRepeat && <RepeatFields value={repeat} onChange={setRepeat} date={v.date} error={errors.repeat} />}
      <Button type="submit" block size="lg" disabled={saving}>{appointment ? 'Salvar alterações' : 'Agendar'}</Button>
    </form>
    {/* Fora do <form>: eventos do React atravessam portais e o envio do painel não pode enviar o agendamento. */}
    <ServiceTypesSheet open={managing} onClose={() => setManaging(false)} />
    </>
  );
}
