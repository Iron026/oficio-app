import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, Link2, Receipt } from 'lucide-react';
import { byCategory, futureServiceDateFor, sortByDateDesc, totals, transactionsInMonth } from '../domain/finance';
import type { Transaction, TransactionType } from '../domain/types';
import { addMonths, formatDateShort, monthKey, monthLabel, parseDateKey, relativeDayLabel } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useApp } from '../state/AppContext';
import { Button, IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { Card, DemoBadge, EmptyState, ProgressBar, Segmented } from '../ui/Misc';
import { TransactionFormSheet } from './forms/TransactionForm';

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
      <div className="flex items-center justify-between">
        <IconButton label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft size={22} /></IconButton>
        <h2 className="text-base font-semibold" aria-live="polite">{monthLabel(month)}</h2>
        <IconButton label="Próximo mês" onClick={() => shift(1)} disabled={isCurrent} className="disabled:opacity-30"><ChevronRight size={22} /></IconButton>
      </div>

      <Card className="mt-3">
        <p className="text-[13px] text-muted">Saldo do mês</p>
        <p className={cx('text-3xl font-bold tabular-nums tracking-tight', sum.balance < 0 && 'text-expense')}>{formatMoney(sum.balance)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="flex items-center gap-1 text-[13px] text-muted"><ArrowUpRight size={14} className="text-income" aria-hidden="true" /> Receitas</p>
            <p className="font-semibold tabular-nums text-income">{formatMoney(sum.income)}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="flex items-center gap-1 text-[13px] text-muted"><ArrowDownRight size={14} className="text-expense" aria-hidden="true" /> Despesas</p>
            <p className="font-semibold tabular-nums text-expense">{formatMoney(sum.expense)}</p>
          </div>
        </div>
        {topExpenses.length > 0 && (
          <div className="mt-4 space-y-2.5">
            <p className="text-[13px] font-medium text-muted">Para onde foi o dinheiro</p>
            {topExpenses.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex justify-between text-[13px]"><span>{c.category}</span><span className="tabular-nums text-muted">{formatMoney(c.amount)}</span></div>
                <ProgressBar value={c.amount / sum.expense} label={`Despesas com ${c.category}`} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" icon={<ArrowUpRight size={18} className="text-income" />} onClick={() => setCreating('receita')}>Receita</Button>
        <Button variant="secondary" icon={<ArrowDownRight size={18} className="text-expense" />} onClick={() => setCreating('despesa')}>Despesa</Button>
      </div>

      <div className="mt-5">
        <Segmented label="Filtrar lançamentos" value={filter} onChange={setFilter} options={[{ value: 'todos', label: 'Todos' }, { value: 'receita', label: 'Receitas' }, { value: 'despesa', label: 'Despesas' }]} />
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Receipt size={28} />} title="Sem lançamentos neste mês" text="Registre receitas e despesas para conhecer seu lucro real." />
      ) : (
        <div className="mt-4 space-y-4">
          {[...grouped.entries()].map(([date, items]) => (
            <section key={date}>
              <h3 className="mb-2 text-sm font-semibold text-muted">{relativeDayLabel(date)}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {items.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setEditing(t)} className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-surface-2">
                      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', t.type === 'receita' ? 'bg-green-50 text-income dark:bg-green-500/10' : 'bg-orange-50 text-expense dark:bg-orange-500/10')}>
                        {t.type === 'receita' ? <ArrowUpRight size={20} aria-hidden="true" /> : <ArrowDownRight size={20} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.description}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                          {t.category}
                          {t.appointmentId && <Link2 size={12} aria-label="Gerado por serviço concluído" />}
                          {t.isDemo && <DemoBadge />}
                          <FutureServiceBadge date={futureServiceDateFor(t, data.appointments)} />
                        </span>
                      </span>
                      <span className={cx('shrink-0 font-semibold tabular-nums', t.type === 'receita' ? 'text-income' : 'text-expense')}>
                        {t.type === 'receita' ? '+' : '−'} {formatMoney(t.amount)}
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
      className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted"
    >
      <CalendarClock size={12} aria-hidden="true" />
      Data futura · {formatDateShort(date)}
    </span>
  );
}
