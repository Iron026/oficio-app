import { useState } from 'react';
import { Ban, Check, MessageCircle, Pencil, RotateCcw, Trash2, User } from 'lucide-react';
import { paymentSummary, type PaymentEntry } from '../domain/payments';
import type { Appointment } from '../domain/types';
import { formatDateShort, isFutureDateKey, relativeDayLabel, todayKey } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useApp, useErrorHandler, useUndoAction } from '../state/AppContext';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { cx } from '../ui/cx';
import { StatusBadge } from '../ui/Badge';
import { DemoBadge } from '../ui/Misc';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { AppointmentFormSheet } from './forms/AppointmentForm';
import { CompleteSheet, PaymentBadge, PaymentPanel, PaymentSheet, RefundSheet } from './payments/PaymentSheets';

export function whatsappLink(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (d.length < 10) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}`;
}

function StatusPill({ a }: { a: Appointment }) {
  const { profession } = useApp();
  const overdue = a.status === 'agendado' && a.date < todayKey();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (a.status === 'concluido') return <StatusBadge tone="success" icon={<Check size={14} strokeWidth={3} aria-hidden="true" />}>{cap(profession.terms.completedLabel)}</StatusBadge>;
  if (a.status === 'cancelado') return <StatusBadge tone="neutral">Cancelado</StatusBadge>;
  return overdue ? <StatusBadge tone="warning">Pendente</StatusBadge> : <StatusBadge tone="info">Agendado</StatusBadge>;
}

/**
 * Serviço concluído com controle de pagamento e nada recebido (0.5: "a receber"). Mantido pelo
 * nome antigo para os testes da 0.4; serviços antigos "não registrados" não contam como faltando.
 */
export function missingIncome(a: Appointment, transactions: Parameters<typeof paymentSummary>[1]): boolean {
  if (a.status !== 'concluido' || a.price <= 0) return false;
  const s = paymentSummary(a, transactions);
  return s.net <= 0 && (s.state === 'pendente' || s.state === 'nao-registrado');
}

/** Item de agendamento clicável, com painel de ações. */
export function AppointmentItem({ a, showDate }: { a: Appointment; showDate?: boolean }) {
  const { data } = useApp();
  const pay = paymentSummary(a, data.transactions);
  const [open, setOpen] = useState(false);
  const client = data.clients.find((c) => c.id === a.clientId);
  const cancelled = a.status === 'cancelado';
  // Retorno visual só na TRANSIÇÃO para concluído (não ao abrir a tela nem ao rolar a lista).
  const [prevStatus, setPrevStatus] = useState(a.status);
  const [justDone, setJustDone] = useState(false);
  if (prevStatus !== a.status) {
    setPrevStatus(a.status);
    setJustDone(a.status === 'concluido');
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onAnimationEnd={() => setJustDone(false)}
        className={cx(
          'press-soft flex w-full items-stretch gap-3 rounded-2xl border bg-surface p-3 text-left transition-colors hover:bg-surface-2',
          justDone && 'animate-celebrate',
          cancelled ? 'border-dashed border-line bg-surface-2' : 'border-line',
        )}
      >
        <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 px-1 py-2 text-center dark:bg-bg">
          <span className="num text-base font-bold leading-tight">{a.time || '--:--'}</span>
          {showDate && <span className="mt-0.5 text-xs leading-tight text-muted">{shortDay(a.date)}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p className={cx('line-clamp-2 font-display font-semibold leading-snug', cancelled && 'text-muted line-through')}>{a.title}</p>
          <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted">
            <User size={14} className="mt-[3px] shrink-0" aria-hidden="true" />
            <span className="line-clamp-2 [overflow-wrap:anywhere]">{client?.name ?? 'Sem cliente'}</span>
          </p>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex flex-wrap items-center gap-2">
              <StatusPill a={a} />
              <PaymentBadge a={a} s={pay} />
              {a.isDemo && <DemoBadge />}
            </span>
            {a.price > 0 && <span className={cx('num text-base font-bold', cancelled && 'text-muted line-through')}>{formatMoney(a.price)}</span>}
          </div>
        </div>
      </button>
      <AppointmentActions a={a} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** "Hoje", "Amanhã", "Ontem" ou "06 nov". */
function shortDay(key: string): string {
  const rel = relativeDayLabel(key);
  return ['Hoje', 'Amanhã', 'Ontem'].includes(rel) ? rel : formatDateShort(key);
}

function AppointmentActions({ a, open, onClose }: { a: Appointment; open: boolean; onClose: () => void }) {
  const { service, data, profession } = useApp();
  const t = profession.terms;
  const onError = useErrorHandler();
  const confirm = useConfirm();
  const toast = useToast();
  const undoAction = useUndoAction();
  const [sheet, setSheet] = useState<null | 'editar' | 'concluir' | 'pagar'>(null);
  const [refund, setRefund] = useState<PaymentEntry | null>(null);
  const client = data.clients.find((c) => c.id === a.clientId);
  const wa = client ? whatsappLink(client.phone) : null;
  const pay = paymentSummary(a, data.transactions);
  // 0.5: dinheiro recebido nunca some ao reabrir, cancelar ou excluir; a confirmação diz isso.
  const keepsMoney = pay.net > 0 ? ` Os valores recebidos (${formatMoney(pay.net)}) continuam em Finanças e no histórico.` : '';

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
    setSheet('concluir');
  }
  async function setStatus(status: 'agendado' | 'cancelado') {
    if (keepsMoney) {
      const ok = await confirm({ title: status === 'agendado' ? 'Reabrir?' : 'Cancelar?', message: `${status === 'cancelado' ? 'Nada ficará a receber.' : `${t.service} volta para a agenda.`}${keepsMoney} Para devolver dinheiro, use “Estornar”.`, confirmLabel: 'Continuar' });
      if (!ok) return;
    }
    try {
      const undo = await service.setAppointmentStatus(a.id, status);
      toast({ title: status === 'agendado' ? 'Reaberto' : 'Cancelado', tone: 'info', action: undoAction(undo) });
      onClose();
    } catch (err) {
      onError(err);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Excluir ${t.service.toLowerCase()}?`,
      message: `Este registro será excluído.${keepsMoney ? `${keepsMoney.replace(' e no histórico', '')} (como “serviço excluído”).` : ''} Logo depois, dá para desfazer pelo aviso.`,
      confirmLabel: 'Excluir', danger: true,
    });
    if (!ok) return;
    try {
      const ticket = await service.deleteAppointment(a.id);
      toast({ title: ticket?.label ?? 'Excluído', description: pay.net > 0 ? 'Os valores recebidos continuam em Finanças.' : undefined, tone: 'info', action: undoAction(ticket) });
      onClose();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <>
      <Sheet open={open && !sheet && !refund} onClose={onClose} title={a.title}>
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Data</dt><dd className="font-semibold">{relativeDayLabel(a.date)}{a.time && ` · ${a.time}`}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Valor combinado</dt><dd className="font-semibold">{a.price ? <Money cents={a.price} /> : '—'}</dd></div>
          <div className="col-span-2 flex items-center gap-2 rounded-xl bg-surface-2 p-3">
            <User size={16} className="text-muted" aria-hidden="true" />
            <dd className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{client?.name ?? 'Sem cliente vinculado'}</dd>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-700 px-3 text-sm font-semibold text-white">
                <MessageCircle size={14} aria-hidden="true" /> WhatsApp
              </a>
            )}
          </div>
          {a.notes && <div className="col-span-2 rounded-xl bg-surface-2 p-3"><dt className="text-muted">Observações</dt><dd className="whitespace-pre-wrap">{a.notes}</dd></div>}
        </dl>

        <PaymentPanel a={a} onPay={() => setSheet('pagar')} onRefund={setRefund} />

        {a.status === 'agendado' && (
          <Button block size="lg" className="mb-3" icon={<Check size={20} />} onClick={complete}>{t.completeVerb}</Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setSheet('editar')}>Editar</Button>
          {a.status === 'agendado' ? (
            <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setStatus('cancelado')}>Cancelar</Button>
          ) : (
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setStatus('agendado')}>Reabrir</Button>
          )}
          <Button variant="ghost" className="col-span-2 text-red-700 dark:text-red-300" icon={<Trash2 size={16} />} onClick={remove}>Excluir</Button>
        </div>
      </Sheet>
      <CompleteSheet a={a} open={open && sheet === 'concluir'} onClose={() => setSheet(null)} onDone={() => { setSheet(null); onClose(); }} />
      <PaymentSheet a={a} open={open && sheet === 'pagar'} onClose={() => setSheet(null)} />
      <RefundSheet entry={open ? refund : null} onClose={() => setRefund(null)} />
      <AppointmentFormSheet open={open && sheet === 'editar'} appointment={a} onClose={() => { setSheet(null); onClose(); }} />
    </>
  );
}
