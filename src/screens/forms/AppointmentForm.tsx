import { useState } from 'react';
import { Pin, Settings2 } from 'lucide-react';
import { serviceChoices } from '../../domain/serviceTypes';
import type { Appointment } from '../../domain/types';
import { todayKey } from '../../lib/dates';
import { centsToInput, formatMoney } from '../../lib/money';
import { hasErrors, validateAppointment, type AppointmentInput, type Errors } from '../../lib/validation';
import { useApp, useErrorHandler, useFeedback } from '../../state/AppContext';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Chip } from '../../ui/Misc';
import { Sheet } from '../../ui/Sheet';
import { useHideValues } from '../../ui/privacy';
import { ServiceTypesSheet } from '../ServiceTypesSheet';

interface Props { open: boolean; onClose: () => void; appointment?: Appointment; defaultClientId?: string }

export function AppointmentFormSheet({ open, onClose, appointment, defaultClientId }: Props) {
  const { profession } = useApp();
  const t = profession.terms;
  return (
    <Sheet open={open} onClose={onClose} title={appointment ? `Editar ${t.service.toLowerCase()}` : `Agendar ${t.service.toLowerCase()}`}>
      {open && <AppointmentForm appointment={appointment} defaultClientId={defaultClientId} onDone={onClose} />}
    </Sheet>
  );
}

function AppointmentForm({ appointment, defaultClientId, onDone }: { appointment?: Appointment; defaultClientId?: string; onDone: () => void }) {
  const { service, data, profession } = useApp();
  const t = profession.terms;
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const [v, setV] = useState<AppointmentInput>(
    appointment
      ? { title: appointment.title, clientId: appointment.clientId ?? '', date: appointment.date, time: appointment.time, price: centsToInput(appointment.price), notes: appointment.notes }
      : { title: '', clientId: defaultClientId ?? '', date: todayKey(), time: '', price: '', notes: '' },
  );
  const [errors, setErrors] = useState<Errors<AppointmentInput>>({});
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  const hidden = useHideValues();
  const choices = serviceChoices(data.serviceTypes, profession.serviceTemplates);
  const set = (k: keyof AppointmentInput) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const clients = [...data.clients].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateAppointment(v);
    setErrors(errs);
    if (hasErrors(errs)) return;
    setSaving(true);
    try {
      const res = await service.saveAppointment(v, appointment?.id);
      feedback(appointment ? 'Alterações salvas' : `${t.service} agendad${t.serviceArticle}`, res.feedback);
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
                onClick={() => setV((cur) => ({ ...cur, title: c.name, price: cur.price || (c.price ? centsToInput(c.price) : '') }))}
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
        <TextField label="Data" type="date" value={v.date} onChange={set('date')} error={errors.date} />
        <TextField label="Horário" type="time" value={v.time} onChange={set('time')} error={errors.time} optional />
      </div>
      <TextField label="Valor" prefix="R$" inputMode="decimal" placeholder="0,00" value={v.price} onChange={set('price')} error={errors.price} hint="Os preços sugeridos são apenas referência." optional />
      <TextArea label="Observações" value={v.notes} onChange={set('notes')} error={errors.notes} optional maxLength={500} />
      <Button type="submit" block size="lg" disabled={saving}>{appointment ? 'Salvar alterações' : 'Agendar'}</Button>
    </form>
    {/* Fora do <form>: eventos do React atravessam portais e o envio do painel não pode enviar o agendamento. */}
    <ServiceTypesSheet open={managing} onClose={() => setManaging(false)} />
    </>
  );
}
