import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus } from 'lucide-react';
import { cashHistory, monthReport, TICKET_DEFINITION, type HistoryPoint } from '../domain/reports';
import { addMonths, monthKey, monthLabel, parseDateKey } from '../lib/dates';
import { formatMoney, formatMoneyShort } from '../lib/money';
import { navigate } from '../state/router';
import { useApp } from '../state/AppContext';
import { IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { Card, ProgressBar, Segmented } from '../ui/Misc';
import { Money } from '../ui/Money';
import { useHideValues } from '../ui/privacy';
import { HeroSlot } from './Shell';

/** Variação em relação ao mês anterior (seta + %). Para despesas, subir é ruim. */
function Change({ pct, inverse }: { pct: number | null; inverse?: boolean }) {
  if (pct === null) return <span className="text-xs text-muted">sem base no mês anterior</span>;
  if (pct === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted"><Minus size={12} aria-hidden="true" />igual ao mês anterior</span>;
  const good = inverse ? pct < 0 : pct > 0;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-semibold', good ? 'text-income' : 'text-expense')}>
      <Icon size={12} aria-hidden="true" />{pct > 0 ? '+' : ''}{pct}% <span className="font-normal text-muted">vs. mês anterior</span>
    </span>
  );
}

function Row({ label, cents, kind, pct, inverse, strong }: { label: string; cents: number; kind: 'income' | 'expense' | 'balance' | 'neutral'; pct: number | null; inverse?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <dt className="min-w-0"><span className={cx('block text-sm', strong ? 'font-semibold' : 'text-muted')}>{label}</span><Change pct={pct} inverse={inverse} /></dt>
      <dd className={cx('shrink-0 font-bold', strong ? 'text-lg' : 'text-base')}><Money cents={cents} kind={kind} /></dd>
    </div>
  );
}

/** Gráfico de barras (recebimentos, estornos, despesas) com o saldo em pontos. SVG próprio, cores do tema. */
function CashChart({ points }: { points: HistoryPoint[] }) {
  const hidden = useHideValues();
  const W = 320;
  const H = 150;
  const top = 10;
  const bottom = 22;
  const max = Math.max(1, ...points.flatMap((p) => [p.gross, p.refunds, p.expense, Math.abs(p.balance)]));
  const minBal = Math.min(0, ...points.map((p) => p.balance));
  const range = max - minBal;
  const y = (v: number) => top + (H - top - bottom) * (1 - (v - minBal) / range);
  const zero = y(0);
  const slot = W / points.length;
  const bw = Math.max(2, Math.min(10, slot / 4.5));
  const summary = points.map((p) => `${monthLabel(p.month)}: recebido ${formatMoney(p.gross)}, estornos ${formatMoney(p.refunds)}, despesas ${formatMoney(p.expense)}, saldo ${formatMoney(p.balance)}`).join('; ');
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={hidden ? `Gráfico de ${points.length} meses (valores ocultos)` : `Recebimentos, estornos, despesas e saldo por mês. ${summary}`}>
        <line x1={0} x2={W} y1={zero} y2={zero} className="stroke-current text-line" strokeWidth={1} />
        {points.map((p, i) => {
          const cx0 = slot * i + slot / 2;
          const bar = (v: number, dx: number, cls: string) => v > 0 && <rect x={cx0 + dx - bw / 2} y={y(v)} width={bw} height={Math.max(1, zero - y(v))} rx={1.5} className={cls} />;
          return (
            <g key={p.month}>
              {bar(p.gross, -bw * 1.15, 'fill-current text-income')}
              {bar(p.refunds, 0, 'fill-current text-muted')}
              {bar(p.expense, bw * 1.15, 'fill-current text-expense')}
              <circle cx={cx0} cy={y(p.balance)} r={3} className={cx('fill-current', p.balance < 0 ? 'text-expense' : 'text-brand-600 dark:text-brand-300')} />
              <text x={cx0} y={H - 6} textAnchor="middle" className="fill-current text-muted" fontSize={9}>{monthLabel(p.month, true).replace('.', '')}</text>
            </g>
          );
        })}
        <polyline points={points.map((p, i) => `${slot * i + slot / 2},${y(p.balance)}`).join(' ')} fill="none" className="stroke-current text-brand-600 dark:text-brand-300" strokeWidth={1.5} strokeDasharray="3 2" />
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-income" />Recebido (bruto)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--muted)]" />Estornos</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-expense" />Despesas</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 border-t-2 border-dashed border-current text-brand-600 dark:text-brand-300" />Saldo</span>
      </figcaption>
    </figure>
  );
}

function HistoryTable({ points }: { points: HistoryPoint[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <caption className="sr-only">Valores por mês</caption>
        <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2 font-semibold">Mês</th><th className="py-1 pr-2 text-right font-semibold">Recebido</th><th className="py-1 pr-2 text-right font-semibold">Estornos</th><th className="py-1 pr-2 text-right font-semibold">Despesas</th><th className="py-1 text-right font-semibold">Saldo</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month} className="border-t border-line">
              <th scope="row" className="py-1.5 pr-2 text-left font-medium capitalize">{monthLabel(p.month, true)}</th>
              <td className="py-1.5 pr-2 text-right"><Money cents={p.gross} /></td>
              <td className="py-1.5 pr-2 text-right"><Money cents={p.refunds} /></td>
              <td className="py-1.5 pr-2 text-right"><Money cents={p.expense} /></td>
              <td className="py-1.5 text-right font-semibold"><Money cents={p.balance} kind="balance" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-muted">{children}</h3>;

/**
 * Relatórios gerenciais (beta.4), em Finanças → Relatórios. Só lê os dados: mesmos totais de Finanças e do
 * extrato; pendente e previsto separados do caixa; estornos em revisão sinalizados.
 */
export function Reports() {
  const { data, profession } = useApp();
  const t = profession.terms;
  const hidden = useHideValues();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [span, setSpan] = useState<'6' | '12'>('6');
  const r = useMemo(() => monthReport(data, month), [data, month]);
  const history = useMemo(() => cashHistory(data, month, span === '6' ? 6 : 12), [data, month, span]);
  const shift = (n: number) => setMonth((m) => monthKey(addMonths(parseDateKey(`${m}-01`), n)));
  const isCurrent = month === monthKey(new Date());
  const maxCat = Math.max(1, ...r.expenseByCategory.map((c) => c.amount));

  return (
    <div className="space-y-4" data-reports={month}>
      <HeroSlot overlap>
        <div className="flex items-center justify-between gap-2 pt-1">
          <IconButton label="Mês anterior" onClick={() => shift(-1)} className="!text-white hover:!bg-white/15"><ChevronLeft size={22} /></IconButton>
          <h2 className="text-center font-display text-lg font-bold first-letter:uppercase" aria-live="polite">{monthLabel(month)}</h2>
          <IconButton label="Próximo mês" onClick={() => shift(1)} disabled={isCurrent} className="!text-white hover:!bg-white/15 disabled:opacity-30"><ChevronRight size={22} /></IconButton>
        </div>
      </HeroSlot>

      {r.review.count > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-3.5 text-sm dark:border-red-500/40 dark:bg-red-500/10" data-report-review>
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-semibold text-red-800 dark:text-red-200">Totais ainda não reconciliados</span>
            <span className="block text-muted">{r.review.count === 1 ? 'Há estornos' : `Há ${r.review.count} grupos de estornos`} aguardando revisão{r.review.inMonth ? ', inclusive neste mês' : ''}. Os valores abaixo incluem esses estornos até você revisar.</span>
            <button type="button" onClick={() => navigate('financas')} className="mt-1 min-h-11 font-semibold text-red-800 underline dark:text-red-200">Revisar em Finanças</button>
          </span>
        </div>
      )}

      <Card className="!p-4 shadow-md">
        <H3>Caixa do mês</H3>
        {r.empty && <p className="mb-2 rounded-xl bg-surface-2 p-3 text-sm text-muted" data-report-empty>Sem lançamentos nem {t.services.toLowerCase()} {t.completedLabelPlural} neste mês. Os valores ficam em zero.</p>}
        <dl className="divide-y divide-line rounded-xl bg-surface-2 dark:divide-line/70">
          <Row label="Receita bruta (recebimentos)" cents={r.totals.gross} kind="income" pct={r.change.gross} />
          <Row label="Estornos" cents={r.totals.refunds} kind="expense" pct={null} />
          <Row label="Receita líquida de estornos" cents={r.totals.net} kind="neutral" pct={r.change.net} />
          <Row label="Despesas operacionais" cents={r.totals.expense} kind="expense" pct={r.change.expense} inverse />
          <Row label="Saldo" cents={r.totals.balance} kind="balance" pct={r.change.balance} strong />
        </dl>
        <p className="mt-2 text-xs text-muted">Saldo = recebimentos − estornos − despesas. Pagamentos parciais e antecipados contam na data em que entraram. Mesmos valores de Finanças e do extrato.</p>
      </Card>

      <Card className="!p-4">
        <H3>Fora do caixa</H3>
        <dl className="grid grid-cols-2 gap-2" data-report-offcash>
          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10"><dt className="text-sm text-muted">A receber (pendente)</dt><dd className="text-lg font-bold"><Money cents={r.pending.amount} /></dd><dd className="text-xs text-muted">{r.pending.count} {r.pending.count === 1 ? t.service.toLowerCase() : t.services.toLowerCase()} {r.pending.count === 1 ? t.completedLabel : t.completedLabelPlural}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-muted">Previsto no mês</dt><dd className="text-lg font-bold"><Money cents={r.forecast.amount} /></dd><dd className="text-xs text-muted">{r.forecast.count} agendado{r.forecast.count === 1 ? '' : 's'}, já descontado o antecipado</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">Pendente e previsto não entram no saldo nem nos recebimentos.</p>
      </Card>

      <Card className="!p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-muted">Evolução</h3>
          <div className="w-44"><Segmented label="Período do gráfico" value={span} onChange={setSpan} options={[{ value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} /></div>
        </div>
        <CashChart points={history} />
        <details className="mt-2 rounded-xl bg-surface-2 p-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Ver valores em texto</summary>
          <div className="mt-2"><HistoryTable points={history} /></div>
        </details>
      </Card>

      <Card className="!p-4">
        <H3>{t.services} {t.completedLabelPlural}</H3>
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-muted">No mês</dt><dd className="num text-lg font-bold">{r.completed}</dd><dd><Change pct={r.change.completed} /></dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-muted">Ticket médio</dt><dd className="text-lg font-bold">{r.ticket.value === null ? '—' : <Money cents={r.ticket.value} />}</dd>
            <dd className="text-xs text-muted">{r.ticket.denominator ? <>{hidden ? 'R$ •••••' : formatMoneyShort(r.ticket.numerator)} ÷ {r.ticket.denominator}</> : 'Nenhum concluído com valor recebido'}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">Ticket médio: {TICKET_DEFINITION}</p>
      </Card>

      <Card className="!p-4">
        <H3>Receitas por tipo de serviço</H3>
        {r.incomeByService.length ? (
          <ul className="space-y-1.5 text-sm" data-report-services>
            {r.incomeByService.map((s) => (
              <li key={s.service} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 [overflow-wrap:anywhere]">{s.service} <span className="text-xs text-muted">· {s.count} {s.count === 1 ? 'recebimento' : 'recebimentos'}</span></span>
                <Money cents={s.amount} className="shrink-0 font-semibold" />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nenhum recebimento neste mês.</p>}
      </Card>

      <Card className="!p-4">
        <H3>Despesas por categoria</H3>
        {r.expenseByCategory.length ? (
          <div className="space-y-3">
            {r.expenseByCategory.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{c.category}</span>
                  <span className="shrink-0 text-muted"><Money cents={c.amount} /> · <span className="num">{Math.round((c.amount / r.totals.expense) * 100)}%</span></span>
                </div>
                <ProgressBar value={c.amount / maxCat} label={`Despesas com ${c.category}`} tone="expense" className="!h-2" />
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">Nenhuma despesa neste mês. Estornos não entram aqui.</p>}
      </Card>

      <div className="grid gap-4 min-[480px]:grid-cols-2">
        <Card className="!p-4">
          <H3>Clientes recorrentes</H3>
          {r.recurringClients.length ? (
            <ul className="space-y-1.5 text-sm">{r.recurringClients.map((c) => <li key={c.clientId} className="flex justify-between gap-3"><span className="min-w-0 [overflow-wrap:anywhere]">{c.name}</span><span className="shrink-0 font-semibold">{c.count}×</span></li>)}</ul>
          ) : <p className="text-sm text-muted">Nenhum cliente com 2 ou mais {t.services.toLowerCase()} {t.completedLabelPlural} neste mês.</p>}
        </Card>
        <Card className="!p-4">
          <H3>Mais realizados</H3>
          {r.topServices.length ? (
            <ul className="space-y-1.5 text-sm">{r.topServices.map((s) => <li key={s.service} className="flex justify-between gap-3"><span className="min-w-0 [overflow-wrap:anywhere]">{s.service}</span><span className="shrink-0 font-semibold">{s.count}</span></li>)}</ul>
          ) : <p className="text-sm text-muted">Nenhum {t.service.toLowerCase()} {t.completedLabel} neste mês.</p>}
        </Card>
      </div>
    </div>
  );
}
