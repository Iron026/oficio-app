import { useState } from 'react';
import { Ban, Check, Clock, MessageCircle, Pencil, RotateCcw, Trash2, User } from 'lucide-react';
import type { Appointment } from '../domain/types';
import { formatDateShort, isFutureDateKey, relativeDayLabel, todayKey } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useApp, useErrorHandler, useFeedback } from '../state/AppContext';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { cx } from '../ui/cx';
import { DemoBadge } from '../ui/Misc';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { AppointmentFormSheet } from './forms/AppointmentForm';

export function whatsappLink(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (d.length < 10) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}`;
}

function StatusPill({ a }: { a: Appointment }) {
  const { profession } = useApp();
  const overdue = a.status === 'agendado' && a.date < todayKey();
  const map = {
    concluido: ['bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200', profession.terms.completedLabel],
    cancelado: ['bg-surface-2 text-muted', 'cancelado'],
    agendado: overdue ? ['bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', 'pendente'] : ['bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', 'agendado'],
  } as const;
  const [cls, label] = map[a.status];
  return <span className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', cls)}>{label}</span>;
}

/** Item de agendamento clicável, com painel de ações. */
export function AppointmentItem({ a, showDate }: { a: Appointment; showDate?: boolean }) {
  const { data } = useApp();
  const [open, setOpen] = useState(false);
  const client = data.clients.find((c) => c.id === a.clientId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx('flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2 active:scale-[0.99]', a.status === 'cancelado' && 'opacity-60')}
      >
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-surface-2 py-2">
          <Clock size={14} className="text-muted" aria-hidden="true" />
          <span className="mt-0.5 text-sm font-bold tabular-nums">{a.time || '--:--'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cx('truncate font-semibold', a.status === 'cancelado' && 'line-through')}>{a.title}</p>
          <p className="truncate text-[13px] text-muted">
            {showDate && `${relativeDayLabel(a.date)} · `}
            {client?.name ?? 'Sem cliente'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill a={a} />
            {a.isDemo && <DemoBadge />}
          </div>
        </div>
        {a.price > 0 && <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(a.price)}</span>}
      </button>
      <AppointmentActions a={a} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AppointmentActions({ a, open, onClose }: { a: Appointment; open: boolean; onClose: () => void }) {
  const { service, data, profession } = useApp();
  const t = profession.terms;
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const confirm = useConfirm();
  const toast = useToast();
  const [registerIncome, setRegisterIncome] = useState(true);
  const [editing, setEditing] = useState(false);
  const client = data.clients.find((c) => c.id === a.clientId);
  const wa = client ? whatsappLink(client.phone) : null;

  async function complete() {
    // Conclusão antecipada: só pergunta quando a data do serviço é futura
    // (data local do aparelho). Não impede a conclusão.
    if (isFutureDateKey(a.date)) {
      const este = t.serviceArticle === 'a' ? 'Esta' : 'Este';
      const agendado = t.serviceArticle === 'a' ? 'agendada' : 'agendado';
      const ok = await confirm({
        title: 'Data futura',
        message: `${este} ${t.service.toLowerCase()} está ${agendado} para uma data futura (${formatDateShort(a.date)}). Deseja marcá-l${t.serviceArticle} como ${t.completedLabel} mesmo assim?`,
        cancelLabel: 'Voltar',
        confirmLabel: 'Concluir mesmo assim',
      });
      if (!ok) return;
    }
    try {
      const fb = await service.completeAppointment(a.id, { registerIncome });
      feedback(`${t.service} ${t.completedLabel}!`, fb, registerIncome && a.price > 0 ? `Receita de ${formatMoney(a.price)} lançada.` : undefined);
      onClose();
    } catch (err) {
      onError(err);
    }
  }
  async function setStatus(status: 'agendado' | 'cancelado') {
    if (a.transactionId) {
      const ok = await confirm({ title: status === 'agendado' ? 'Reabrir?' : 'Cancelar?', message: `A receita lançada automaticamente para est${t.serviceArticle === 'a' ? 'a' : 'e'} ${t.service.toLowerCase()} será removida do financeiro.`, confirmLabel: 'Continuar' });
      if (!ok) return;
    }
    try {
      await service.setAppointmentStatus(a.id, status);
      toast({ title: status === 'agendado' ? 'Reaberto' : 'Cancelado', tone: 'info' });
      onClose();
    } catch (err) {
      onError(err);
    }
  }
  async function remove() {
    const ok = await confirm({
      title: `Excluir ${t.service.toLowerCase()}?`,
      message: a.transactionId ? 'O registro e a receita gerada por ele serão excluídos permanentemente.' : 'Este registro será excluído permanentemente.',
      confirmLabel: 'Excluir', danger: true,
    });
    if (!ok) return;
    try {
      await service.deleteAppointment(a.id);
      toast({ title: 'Excluído', tone: 'info' });
      onClose();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <>
      <Sheet open={open && !editing} onClose={onClose} title={a.title}>
        <dl className="mb-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Data</dt><dd className="font-semibold">{relativeDayLabel(a.date)}{a.time && ` · ${a.time}`}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Valor</dt><dd className="font-semibold">{a.price ? formatMoney(a.price) : '—'}</dd></div>
          <div className="col-span-2 flex items-center gap-2 rounded-xl bg-surface-2 p-3">
            <User size={16} className="text-muted" aria-hidden="true" />
            <dd className="flex-1 font-semibold">{client?.name ?? 'Sem cliente vinculado'}</dd>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-[13px] font-semibold text-white">
                <MessageCircle size={14} aria-hidden="true" /> WhatsApp
              </a>
            )}
          </div>
          {a.notes && <div className="col-span-2 rounded-xl bg-surface-2 p-3"><dt className="text-muted">Observações</dt><dd className="whitespace-pre-wrap">{a.notes}</dd></div>}
        </dl>

        {a.status === 'agendado' && (
          <div className="mb-3 space-y-3">
            {a.price > 0 && (
              <label className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" checked={registerIncome} onChange={(e) => setRegisterIncome(e.target.checked)} className="h-5 w-5 accent-brand-600" />
                <span>Lançar receita de <strong>{formatMoney(a.price)}</strong> no financeiro</span>
              </label>
            )}
            <Button block size="lg" icon={<Check size={20} />} onClick={complete}>{t.completeVerb}</Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Editar</Button>
          {a.status === 'agendado' ? (
            <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setStatus('cancelado')}>Cancelar</Button>
          ) : (
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setStatus('agendado')}>Reabrir</Button>
          )}
          <Button variant="ghost" className="col-span-2 text-red-600 dark:text-red-400" icon={<Trash2 size={16} />} onClick={remove}>Excluir</Button>
        </div>
      </Sheet>
      <AppointmentFormSheet open={open && editing} appointment={a} onClose={() => { setEditing(false); onClose(); }} />
    </>
  );
}
