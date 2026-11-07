import { useState } from 'react';
import { Check, CircleDollarSign, Undo2 } from 'lucide-react';
import { PAYMENT_METHODS, PAYMENT_STATE_LABEL, paymentSummary, type PaymentEntry, type PaymentMethod, type PaymentSummary } from '../../domain/payments';
import type { Appointment } from '../../domain/types';
import { formatDateShort, todayKey } from '../../lib/dates';
import { newId } from '../../lib/id';
import { centsToInput, formatMoney, parseMoney } from '../../lib/money';
import { useApp, useErrorHandler, useFeedback, useUndoAction } from '../../state/AppContext';
import type { CompletePayment } from '../../state/service';
import { StatusBadge, type StatusTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { TextField } from '../../ui/Field';
import { Money } from '../../ui/Money';
import { useHideValues } from '../../ui/privacy';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';

const STATE_TONE: Record<PaymentSummary['state'], StatusTone> = {
  'sem-valor': 'neutral', 'nao-registrado': 'neutral', pendente: 'warning', parcial: 'warning', pago: 'success', excedente: 'info', cancelado: 'neutral',
};

/** Selo curto da situação financeira (lista da agenda e cabeçalho do resumo). */
export function PaymentBadge({ a, s }: { a: Appointment; s: PaymentSummary }) {
  const hidden = useHideValues();
  if (s.state === 'sem-valor' || s.state === 'cancelado') return null;
  if (a.status === 'agendado') {
    if (s.net <= 0) return null;
    return <StatusBadge tone="info">{s.pending === 0 ? 'Pago antecipado' : `Antecipado ${hidden ? '' : formatMoney(s.net)}`.trim()}</StatusBadge>;
  }
  const text = s.state === 'pendente' || s.state === 'parcial' ? `${s.state === 'parcial' ? 'Falta' : 'A receber'}${hidden ? '' : ` ${formatMoney(s.pending)}`}` : PAYMENT_STATE_LABEL[s.state];
  return <StatusBadge tone={STATE_TONE[s.state]}>{text}</StatusBadge>;
}

const KIND_LABEL: Record<PaymentEntry['kind'], string> = { pagamento: 'Pagamento', legado: 'Receita lançada (0.4)', estorno: 'Estorno' };

/** Resumo financeiro do atendimento: contratado, recebido, estornado, pendente e histórico. */
export function PaymentPanel({ a, onPay, onRefund }: { a: Appointment; onPay: () => void; onRefund: (e: PaymentEntry) => void }) {
  const { data } = useApp();
  const s = paymentSummary(a, data.transactions);
  if (a.price === 0 && s.entries.length === 0) return null;
  const pendingLabel = a.status === 'agendado' ? 'Falta receber' : s.state === 'nao-registrado' ? 'Pagamento' : 'Pendente';
  return (
    <section aria-labelledby={`pg-${a.id}`} className="mb-4 space-y-3 rounded-2xl border border-line p-3" data-payment-panel={s.state}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`pg-${a.id}`} className="font-display text-sm font-bold">Pagamento</h3>
        <PaymentBadge a={a} s={s} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface-2 p-2.5"><dt className="text-muted">Contratado</dt><dd className="font-semibold"><Money cents={s.contracted} /></dd></div>
        <div className="rounded-xl bg-surface-2 p-2.5"><dt className="text-muted">Recebido</dt><dd className="font-semibold"><Money cents={s.received} /></dd></div>
        {s.refunded > 0 && <div className="rounded-xl bg-surface-2 p-2.5"><dt className="text-muted">Estornado</dt><dd className="font-semibold text-expense"><Money cents={s.refunded} /></dd></div>}
        <div className={cx('rounded-xl p-2.5', s.pending > 0 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-surface-2')}>
          <dt className="text-muted">{s.excess > 0 ? 'Acima do combinado' : pendingLabel}</dt>
          <dd className="font-semibold">{s.state === 'nao-registrado' ? 'Não registrado' : s.state === 'cancelado' ? 'Nada a receber' : <Money cents={s.excess > 0 ? s.excess : s.pending} />}</dd>
        </div>
      </dl>
      {s.state === 'nao-registrado' && (
        <p className="text-xs text-muted">Concluído antes da 0.5 sem receita lançada. O app não presume se foi pago: registre o pagamento se tiver recebido.</p>
      )}
      {s.entries.length > 0 && (
        <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Histórico financeiro">
          {s.entries.map((e) => (
            <li key={e.tx.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-payment-entry={e.kind}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {KIND_LABEL[e.kind]}{e.early && e.kind !== 'estorno' ? ' antecipado' : ''}
                </span>
                <span className="block text-xs text-muted">
                  {formatDateShort(e.tx.date)}{e.method ? ` · ${e.method}` : ''}{e.refunded > 0 ? ` · ${e.refundable === 0 ? 'estornado' : 'estornado em parte'}` : ''}
                </span>
              </span>
              <Money cents={e.tx.amount} kind={e.kind === 'estorno' ? 'expense' : 'income'} className="font-semibold" />
              {e.kind !== 'estorno' && e.refundable > 0 && (
                <Button variant="ghost" size="sm" className="min-h-11" icon={<Undo2 size={14} />} onClick={() => onRefund(e)} aria-label={`Estornar ${formatMoney(e.refundable)} de ${formatDateShort(e.tx.date)}`}>Estornar</Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {a.status !== 'cancelado' && (s.pending > 0 || s.state === 'nao-registrado' || a.status === 'agendado') && (
        <Button block variant={a.status === 'concluido' ? 'primary' : 'secondary'} icon={<CircleDollarSign size={18} />} onClick={onPay}>
          {a.status === 'agendado' ? 'Registrar pagamento antecipado' : 'Registrar pagamento'}
        </Button>
      )}
    </section>
  );
}

function MethodPicker({ value, onChange }: { value: PaymentMethod | null; onChange: (m: PaymentMethod | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Forma de pagamento (opcional)" className="flex flex-wrap gap-2">
      {PAYMENT_METHODS.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={value === m.id} onClick={() => onChange(value === m.id ? null : m.id)}
          className={cx('press-soft min-h-10 rounded-full border px-3.5 text-sm font-semibold', value === m.id ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'border-line')}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Concluir com escolha explícita (0.5): nenhuma opção vem marcada e o botão só habilita depois da
 * escolha. "Recebi tudo que faltava" registra só o que falta (desconta antecipados) — nunca uma
 * segunda receita para um valor já recebido.
 */
export function CompleteSheet({ a, open, onClose, onDone }: { a: Appointment; open: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Concluir: ${a.title}`}>
      {open && <CompleteForm a={a} onDone={onDone} />}
    </Sheet>
  );
}

function CompleteForm({ a, onDone }: { a: Appointment; onDone: () => void }) {
  const { service, data, profession } = useApp();
  const t = profession.terms;
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const s = paymentSummary(a, data.transactions);
  const [opId] = useState(() => newId());
  const [mode, setMode] = useState<CompletePayment['mode'] | null>(a.price === 0 && s.net === 0 ? 'nenhum' : null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);
  const ready = mode === 'integral' || mode === 'nenhum' || (mode === 'parcial' && cents !== null && cents > 0);
  const options: { id: CompletePayment['mode']; title: string; text: string }[] = [
    { id: 'integral', title: s.pending > 0 ? 'Recebi tudo que faltava' : 'Já está pago', text: s.pending > 0 ? `Registra ${formatMoney(s.pending)} como recebido${s.net > 0 ? ` (já havia ${formatMoney(s.net)})` : ''}.` : 'Nada novo é registrado.' },
    { id: 'parcial', title: 'Recebi uma parte', text: 'Informe quanto entrou; o restante fica a receber.' },
    { id: 'nenhum', title: 'Ainda não recebi', text: s.pending > 0 ? `${formatMoney(s.pending)} fica a receber.` : 'Concluir sem registrar pagamento.' },
  ];
  async function submit() {
    if (!mode || !ready) return;
    if (mode === 'parcial' && (cents === null || cents <= 0)) { setError('Informe um valor válido. Ex.: 80,00'); return; }
    setBusy(true);
    try {
      const payment: CompletePayment = mode === 'nenhum' ? { mode } : mode === 'integral' ? { mode, method } : { mode, amount: cents!, method };
      const fb = await service.completeAppointment(a.id, { payment, opId });
      const desc = mode === 'integral' && s.pending > 0 ? `${formatMoney(s.pending)} registrados como recebidos.` : mode === 'parcial' ? `${formatMoney(cents!)} recebidos; ${formatMoney(Math.max(0, s.pending - cents!))} a receber.` : mode === 'nenhum' && s.pending > 0 ? `${formatMoney(s.pending)} a receber.` : undefined;
      feedback(`${t.service} ${t.completedLabel}!`, fb, desc);
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {a.price > 0 && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          Contratado <strong className="num"><Money cents={a.price} /></strong>
          {s.net > 0 && <> · já recebido <strong className="num"><Money cents={s.net} /></strong></>}
          {' · '}falta <strong className="num"><Money cents={s.pending} /></strong>
        </p>
      )}
      {a.price > 0 || s.net > 0 ? (
        <div role="radiogroup" aria-label="Recebimento" aria-required="true" className="space-y-2">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={mode === o.id} onClick={() => { setMode(o.id); setError(undefined); }}
              className={cx('press-soft flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left', mode === o.id ? 'border-brand-500' : 'border-line')}>
              <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', mode === o.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-line')} aria-hidden="true">
                {mode === o.id && <Check size={12} strokeWidth={3} />}
              </span>
              <span>
                <span className="block font-semibold">{o.title}</span>
                <span className="block text-sm text-muted">{o.text}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Sem valor combinado: não há pagamento a registrar.</p>
      )}
      {mode === 'parcial' && (
        <TextField label="Valor recebido" prefix="R$" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(undefined); }} error={error} placeholder={centsToInput(Math.max(0, s.pending)) || '0,00'} autoFocus />
      )}
      {(mode === 'integral' && s.pending > 0) || mode === 'parcial' ? <MethodPicker value={method} onChange={setMethod} /> : null}
      {!mode && <p className="text-sm text-muted" role="note">Escolha uma opção para concluir.</p>}
      <Button block size="lg" icon={<Check size={20} />} disabled={!ready || busy} onClick={submit}>{t.completeVerb}</Button>
    </div>
  );
}

/** Registrar pagamento (integral, parcial ou antecipado), com data e forma opcionais. */
export function PaymentSheet({ a, open, onClose }: { a: Appointment; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Registrar pagamento">
      {open && <PaymentForm a={a} onDone={onClose} />}
    </Sheet>
  );
}

function PaymentForm({ a, onDone }: { a: Appointment; onDone: () => void }) {
  const { service, data } = useApp();
  const toast = useToast();
  const undoAction = useUndoAction();
  const onError = useErrorHandler();
  const s = paymentSummary(a, data.transactions);
  const [opId] = useState(() => newId());
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => todayKey());
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);
  const early = date < a.date;
  const over = cents !== null && s.pending > 0 && cents > s.pending;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cents === null || cents <= 0) { setError('Informe um valor válido. Ex.: 80,00'); return; }
    setBusy(true);
    try {
      const r = await service.registerPayment(a.id, { amount: cents, method, date, opId });
      if (r.transaction) toast({ title: `Pagamento de ${formatMoney(r.transaction.amount)} registrado`, description: early ? 'Antecipado: antes da data do atendimento.' : undefined, tone: 'success', action: undoAction(r.undo) });
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="rounded-xl bg-surface-2 p-3 text-sm">
        {a.title} · contratado <strong className="num"><Money cents={a.price} /></strong>
        {s.net > 0 && <> · recebido <strong className="num"><Money cents={s.net} /></strong></>}
        {s.pending > 0 && <> · falta <strong className="num"><Money cents={s.pending} /></strong></>}
      </p>
      <TextField label="Valor recebido" prefix="R$" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(undefined); }} error={error} autoFocus />
      {s.pending > 0 && (
        <Button variant="secondary" size="sm" onClick={() => { setAmount(centsToInput(s.pending)); setError(undefined); }}>Usar o que falta ({formatMoney(s.pending)})</Button>
      )}
      {over && <p className="text-sm text-amber-700 dark:text-amber-300" role="status">Acima do que falta: {formatMoney(cents! - s.pending)} a mais que o combinado.</p>}
      <TextField label="Data do recebimento" type="date" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value || todayKey())} hint={early ? 'Antes da data do atendimento: fica registrado como antecipado.' : undefined} />
      <MethodPicker value={method} onChange={setMethod} />
      <Button type="submit" block size="lg" icon={<CircleDollarSign size={20} />} disabled={busy}>Registrar pagamento</Button>
    </form>
  );
}

/** Estorno: devolução total ou parcial de um pagamento, sem apagar o pagamento original. */
export function RefundSheet({ entry, onClose }: { entry: PaymentEntry | null; onClose: () => void }) {
  return (
    <Sheet open={!!entry} onClose={onClose} title="Estornar pagamento">
      {entry && <RefundForm entry={entry} onDone={onClose} />}
    </Sheet>
  );
}

function RefundForm({ entry, onDone }: { entry: PaymentEntry; onDone: () => void }) {
  const { service } = useApp();
  const toast = useToast();
  const undoAction = useUndoAction();
  const onError = useErrorHandler();
  const [opId] = useState(() => newId());
  const [amount, setAmount] = useState(() => centsToInput(entry.refundable));
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cents === null || cents <= 0) { setError('Informe um valor válido. Ex.: 80,00'); return; }
    if (cents > entry.refundable) { setError(`No máximo ${formatMoney(entry.refundable)}.`); return; }
    setBusy(true);
    try {
      const r = await service.refundPayment(entry.tx.id, { amount: cents === entry.refundable ? 'total' : cents, opId });
      toast({ title: `Estorno de ${formatMoney(r.transaction.amount)} registrado`, description: 'O pagamento original continua no histórico.', tone: 'info', action: undoAction(r.undo) });
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="rounded-xl bg-surface-2 p-3 text-sm">
        Pagamento de <strong className="num"><Money cents={entry.tx.amount} /></strong> em {formatDateShort(entry.tx.date)}
        {entry.refunded > 0 && <> · já estornado <strong className="num"><Money cents={entry.refunded} /></strong></>}
      </p>
      <TextField label="Valor a estornar" prefix="R$" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(undefined); }} error={error} hint={`Até ${formatMoney(entry.refundable)}. O saldo do mês cai pelo valor estornado.`} />
      <Button type="submit" block size="lg" variant="danger" icon={<Undo2 size={20} />} disabled={busy}>Registrar estorno</Button>
    </form>
  );
}
