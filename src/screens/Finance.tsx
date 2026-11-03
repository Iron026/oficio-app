import { useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, CircleMinus, CirclePlus, Link2, Receipt } from 'lucide-react';
import { byCategory, futureServiceDateFor, sortByDateDesc, totals, transactionsInMonth } from '../domain/finance';
import type { Transaction, TransactionType } from '../domain/types';
import { addMonths, formatDateShort, monthKey, monthLabel, parseDateKey, relativeDayLabel } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { Button, IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { Card, DemoBadge, EmptyState, ProgressBar, Segmented } from '../ui/Misc';
import { Money } from '../ui/Money';
import { TransactionFormSheet } from './forms/TransactionForm';
import { HeroSlot } from './Shell';

type Filter = 'todos' | TransactionType;

export function Finance() {
  const { data } = useApp();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [filter, setFilter] = useState<Filter>('todos');
  const [creating, setCreating] = useState<TransactionType | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const monthTx = useMemo(() => transactionsInMonth(data.transactions, month), [data.transactions, month]);
  const sum = totals(monthTx);
  const list = sortByDateDesc(filter === 'todos' ? monthTx : monthTx.filter((t) => t.type === filter));
  const topExpenses = byCategory(monthTx, 'despesa').slice(0, 3);
  const shift = (n: number) => setMonth((m) => monthKey(addMonths(parseDateKey(`${m}-01`), n)));
  const isCurrent = month === monthKey(new Date());

  const grouped = new Map<string, Transaction[]>();
  for (const t of list) grouped.set(t.date, [...(grouped.get(t.date) ?? []), t]);

  return (
    <div>
      <HeroSlot overlap>
        <div className="flex items-center justify-between gap-2 pt-1">
          <IconButton label="Mês anterior" onClick={() => shift(-1)} className="!text-white hover:!bg-white/15"><ChevronLeft size={22} /></IconButton>
          <h2 className="text-center font-display text-lg font-bold first-letter:uppercase" aria-live="polite">{monthLabel(month)}</h2>
          <IconButton label="Próximo mês" onClick={() => shift(1)} disabled={isCurrent} className="!text-white hover:!bg-white/15 disabled:opacity-30"><ChevronRight size={22} /></IconButton>
        </div>
      </HeroSlot>

      <Card className="!p-5 shadow-md">
        <p className="text-sm text-muted">Saldo do mês</p>
        <p className="mt-1 text-title-1 font-extrabold tracking-tight sm:text-display">
          <Money cents={sum.balance} kind="balance" />
        </p>
        <p className="mt-1 text-sm text-muted">{sum.balance > 0 ? 'Saldo positivo' : sum.balance < 0 ? 'Saldo negativo: as despesas superaram as receitas' : 'Sem saldo neste mês'}</p>
        <dl className="mt-4 divide-y divide-line rounded-xl bg-surface-2 dark:divide-line/70">
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <dt className="flex items-center gap-2 text-sm text-muted"><CirclePlus size={18} className="text-income" aria-hidden="true" /> Receitas</dt>
            <dd className="text-lg font-bold"><Money cents={sum.income} kind="income" /></dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <dt className="flex items-center gap-2 text-sm text-muted"><CircleMinus size={18} className="text-expense" aria-hidden="true" /> Despesas</dt>
            <dd className="text-lg font-bold"><Money cents={sum.expense} kind="expense" /></dd>
          </div>
        </dl>
        {topExpenses.length > 0 && (
          <div className="mt-5 space-y-3">
            <p className="font-sans text-xs font-bold uppercase tracking-wider text-muted">Para onde foi o dinheiro</p>
            {topExpenses.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{c.category}</span>
                  <span className="shrink-0 text-muted"><Money cents={c.amount} /> · <span className="num">{Math.round((c.amount / sum.expense) * 100)}%</span></span>
                </div>
                <ProgressBar value={c.amount / sum.expense} label={`Despesas com ${c.category}`} tone="expense" className="!h-2" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" icon={<CirclePlus size={20} className="text-income" />} onClick={() => setCreating('receita')}>Receita</Button>
        <Button variant="secondary" icon={<CircleMinus size={20} className="text-expense" />} onClick={() => setCreating('despesa')}>Despesa</Button>
      </div>

      <div className="mt-5">
        <Segmented label="Filtrar lançamentos" value={filter} onChange={setFilter} options={[{ value: 'todos', label: 'Todos' }, { value: 'receita', label: 'Receitas' }, { value: 'despesa', label: 'Despesas' }]} />
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Receipt size={28} />} title="Sem lançamentos neste mês" text="Registre receitas e despesas para conhecer seu lucro real." />
      ) : (
        <div className="enter-stagger mt-4 grid gap-4">
          {[...grouped.entries()].map(([date, items]) => (
            <section key={date}>
              <h3 className="mb-2 text-sm font-semibold text-muted">{relativeDayLabel(date)}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {items.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setEditing(t)} className="press-soft flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-surface-2">
                      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', t.type === 'receita' ? 'bg-green-50 text-income dark:bg-green-500/10' : 'bg-orange-50 text-expense dark:bg-orange-500/10')}>
                        {t.type === 'receita' ? <CirclePlus size={20} aria-hidden="true" /> : <CircleMinus size={20} aria-hidden="true" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 font-medium leading-snug [overflow-wrap:anywhere]">{t.description}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                          <span className="sr-only">{t.type === 'receita' ? 'Receita,' : 'Despesa,'}</span>
                          {t.category}
                          {t.appointmentId && <Link2 size={12} aria-label="Gerado por serviço concluído" />}
                          {t.isDemo && <DemoBadge />}
                          <FutureServiceBadge date={futureServiceDateFor(t, data.appointments)} />
                        </span>
                      </span>
                      <span className="shrink-0 self-start pt-0.5 font-bold">
                        <Money cents={t.amount} kind={t.type === 'receita' ? 'income' : 'expense'} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <TransactionFormSheet open={!!creating} defaultType={creating ?? 'receita'} onClose={() => setCreating(null)} />
      <TransactionFormSheet open={!!editing} transaction={editing ?? undefined} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Selo discreto: receita de serviço concluído antes da data marcada. */
function FutureServiceBadge({ date }: { date: string | null }) {
  if (!date) return null;
  return (
    <span
      data-testid="data-futura"
      title="Serviço concluído antes da data marcada"
      className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-muted"
    >
      <CalendarClock size={12} aria-hidden="true" />
      Data futura · {formatDateShort(date)}
    </span>
  );
}
