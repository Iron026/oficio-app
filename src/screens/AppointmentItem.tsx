import { useState } from 'react';
import { Ban, Check, CircleDollarSign, MessageCircle, Pencil, RotateCcw, Trash2, User } from 'lucide-react';
import { paidForAppointment, paymentsOf, removableAutoIncome } from '../domain/compat';
import type { Appointment } from '../domain/types';
import { formatDateShort, isFutureDateKey, relativeDayLabel, todayKey } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useApp, useErrorHandler, useFeedback, useUndoAction } from '../state/AppContext';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { cx } from '../ui/cx';
import { StatusBadge } from '../ui/Badge';
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
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (a.status === 'concluido') return <StatusBadge tone="success" icon={<Check size={14} strokeWidth={3} aria-hidden="true" />}>{cap(profession.terms.completedLabel)}</StatusBadge>;
  if (a.status === 'cancelado') return <StatusBadge tone="neutral">Cancelado</StatusBadge>;
  return overdue ? <StatusBadge tone="warning">Pendente</StatusBadge> : <StatusBadge tone="info">Agendado</StatusBadge>;
}

/**
 * Serviço concluído com valor e sem nenhuma receita vinculada (receita excluída em Finanças ou
 * "Lançar receita" desmarcado ao concluir). Continua concluído; só falta o lançamento.
 */
export function missingIncome(a: Appointment, transactions: Parameters<typeof paidForAppointment>[1]): boolean {
  return a.status === 'concluido' && a.price > 0 && paidForAppointment(a.id, transactions) === 0;
}

/** Item de agendamento clicável, com painel de ações. */
export function AppointmentItem({ a, showDate }: { a: Appointment; showDate?: boolean }) {
  const { data } = useApp();
  const noIncome = missingIncome(a, data.transactions);
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
              {noIncome && <StatusBadge tone="warning">Sem receita lançada</StatusBadge>}
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
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const confirm = useConfirm();
  const toast = useToast();
  const undoAction = useUndoAction();
  const [registerIncome, setRegisterIncome] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [editing, setEditing] = useState(false);
  const client = data.clients.find((c) => c.id === a.clientId);
  const wa = client ? whatsappLink(client.phone) : null;
  // beta.4: pagamentos registrados pela 0.5 (inclusive antecipados) já entraram no caixa.
  const paid = paidForAppointment(a.id, data.transactions);
  const due = Math.max(0, a.price - paid);
  const payments = paymentsOf(a.id, data.transactions);
  const paymentsTotal = payments.reduce((s, p) => s + (p.amount as number), 0);
  const autoIncome = removableAutoIncome(a.transactionId, data.transactions);
  const keepsPayments = payments.length ? ` ${payments.length === 1 ? 'O pagamento registrado' : `Os ${payments.length} pagamentos registrados`} (${formatMoney(paymentsTotal)}) ${payments.length === 1 ? 'continua' : 'continuam'} em Finanças.` : '';

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
      feedback(`${t.service} ${t.completedLabel}!`, fb, registerIncome && due > 0 ? `Receita de ${formatMoney(due)} lançada.` : undefined);
      onClose();
    } catch (err) {
      onError(err);
    }
  }
  async function setStatus(status: 'agendado' | 'cancelado') {
    if (autoIncome) {
      const ok = await confirm({ title: status === 'agendado' ? 'Reabrir?' : 'Cancelar?', message: `A receita lançada automaticamente para est${t.serviceArticle === 'a' ? 'a' : 'e'} ${t.service.toLowerCase()} (${formatMoney(autoIncome.amount as number)}) será removida do financeiro.${keepsPayments}`, confirmLabel: 'Continuar' });
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
  async function launchIncome() {
    setLaunching(true);
    try {
      const res = await service.registerAppointmentIncome(a.id);
      if (res.transaction) toast({ title: `Receita de ${formatMoney(res.transaction.amount)} lançada`, description: 'Sem XP novo: o XP da conclusão já foi contado.', tone: 'success', action: undoAction(res.undo) });
    } catch (err) {
      onError(err);
    } finally {
      setLaunching(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Excluir ${t.service.toLowerCase()}?`,
      message: `${autoIncome ? 'O registro e a receita gerada por ele serão excluídos.' : 'Este registro será excluído.'}${keepsPayments} Logo depois, dá para desfazer pelo aviso.`,
      confirmLabel: 'Excluir', danger: true,
    });
    if (!ok) return;
    try {
      const ticket = await service.deleteAppointment(a.id);
      toast({ title: ticket?.label ?? 'Excluído', description: autoIncome ? 'A receita automática também saiu de Finanças.' : undefined, tone: 'info', action: undoAction(ticket) });
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
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Valor</dt><dd className="num font-semibold">{a.price ? formatMoney(a.price) : '—'}</dd></div>
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

        {a.status === 'agendado' && (
          <div className="mb-3 space-y-3">
            {due > 0 && (
              <label className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" checked={registerIncome} onChange={(e) => setRegisterIncome(e.target.checked)} className="h-5 w-5 accent-brand-600" />
                <span>
                  Lançar receita de <strong className="num">{formatMoney(due)}</strong> no financeiro
                  {paid > 0 && <span className="block text-muted">{formatMoney(paid)} já recebidos</span>}
                </span>
              </label>
            )}
            {a.price > 0 && due === 0 && paid > 0 && (
              <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Já recebido: <strong className="num text-fg">{formatMoney(paid)}</strong>. Nenhuma receita nova será lançada.</p>
            )}
            <Button block size="lg" icon={<Check size={20} />} onClick={complete}>{t.completeVerb}</Button>
          </div>
        )}
        {a.status === 'concluido' && a.price > 0 && due > 0 && (
          <div className="mb-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10" data-testid="sem-receita">
            <p>
              <strong className="block">{paid > 0 ? 'Lançamento financeiro incompleto' : 'Sem lançamento financeiro'}</strong>
              <span className="text-muted">
                {paid > 0 ? `${formatMoney(paid)} recebidos de ${formatMoney(a.price)}.` : `Este ${t.service.toLowerCase()} continua ${t.completedLabel}, mas nenhuma receita está lançada em Finanças.`}
              </span>
            </p>
            <Button block variant="secondary" icon={<CircleDollarSign size={18} />} onClick={launchIncome} disabled={launching}>
              Lançar receita de <span className="num">{formatMoney(due)}</span>
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Editar</Button>
          {a.status === 'agendado' ? (
            <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setStatus('cancelado')}>Cancelar</Button>
          ) : (
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setStatus('agendado')}>Reabrir</Button>
          )}
          <Button variant="ghost" className="col-span-2 text-red-700 dark:text-red-300" icon={<Trash2 size={16} />} onClick={remove}>Excluir</Button>
        </div>
      </Sheet>
      <AppointmentFormSheet open={open && editing} appointment={a} onClose={() => { setEditing(false); onClose(); }} />
    </>
  );
}
