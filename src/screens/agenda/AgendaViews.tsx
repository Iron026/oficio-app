import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MoonStar, User } from 'lucide-react';
import { byDay, conflictMap, dayLayout, formatDuration, durationOf, monthGrid, timeRange, weekKeys, type DayItem } from '../../domain/agenda';
import { paymentSummary } from '../../domain/payments';
import type { Appointment } from '../../domain/types';
import { todayKey } from '../../lib/dates';
import { useApp } from '../../state/AppContext';
import { cx } from '../../ui/cx';
import { AppointmentActions } from '../AppointmentItem';
import { PaymentBadge } from '../payments/PaymentSheets';

const HOUR = 56; // altura de uma hora na visão do dia (px)
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const dayTitle = (key: string, long = false) => {
  const [y, m, d] = key.split('-').map(Number);
  const w = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  const wd = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][w]!;
  return long ? `${wd}, ${d} de ${MONTHS[m! - 1]}` : `${wd.slice(0, 3)}, ${d} ${MONTHS[m! - 1]}`;
};

/** Abre o painel de ações do atendimento a partir de qualquer visão. */
function useActions() {
  const { data } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const a = openId ? data.appointments.find((x) => x.id === openId) : undefined;
  return { open: setOpenId, sheet: a ? <AppointmentActions a={a} open onClose={() => setOpenId(null)} /> : null };
}

const statusTone = (a: Appointment, overlap: boolean) => cx(
  'border-l-4',
  a.status === 'cancelado' ? 'border-l-line bg-surface-2 text-muted' : a.status === 'concluido' ? 'border-l-income bg-green-50 dark:bg-green-500/10' : 'border-l-brand-600 bg-brand-50 dark:bg-brand-500/15',
  overlap && a.status !== 'cancelado' && 'ring-2 ring-amber-500 ring-inset',
);

function ConflictMark({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
      <AlertTriangle size={13} aria-hidden="true" /> Conflito{n > 1 ? ` (${n})` : ''}
    </span>
  );
}

/** Visão do dia: grade de 00:00 a 24:00, abre no primeiro atendimento; sobrepostos lado a lado. */
export function DayView({ dateKey, items }: { dateKey: string; items: Appointment[] }) {
  const { data } = useApp();
  const { open, sheet } = useActions();
  const conflicts = useMemo(() => conflictMap(data.appointments), [data.appointments]);
  const { timed, untimed } = useMemo(() => dayLayout(items, dateKey), [items, dateKey]);
  const ref = useRef<HTMLDivElement>(null);
  const isToday = dateKey === todayKey();
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  // Abre rolado até o primeiro atendimento (ou até agora, hoje): madrugada e noite continuam acessíveis.
  useLayoutEffect(() => {
    const target = timed[0]?.from ?? (isToday ? nowMin : 8 * 60);
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY + (target / 60) * HOUR - 140;
    window.scrollTo({ top: Math.max(0, top) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);
  return (
    <div>
      {untimed.length > 0 && (
        <section className="mb-3 space-y-2" aria-label="Sem horário">
          <h3 className="font-display text-sm font-bold text-muted">Sem horário</h3>
          {untimed.map((a) => <AgendaRow key={a.id} a={a} conflict={0} onOpen={() => open(a.id)} />)}
        </section>
      )}
      {timed.length === 0 && untimed.length === 0 && <p className="mb-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">Dia livre. Toque em “Agendar” para marcar um horário.</p>}
      <div ref={ref} className="relative rounded-2xl border border-line bg-surface" style={{ height: 24 * HOUR }} role="list" aria-label={`Horários de ${dayTitle(dateKey, true)}`} data-day-grid={dateKey}>
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: h * HOUR }} aria-hidden="true">
            <span className="num absolute left-1.5 top-0.5 text-[0.6875rem] text-muted">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
        {isToday && (
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (nowMin / 60) * HOUR }} aria-hidden="true">
            <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
          </div>
        )}
        {timed.map((it) => <DayBlock key={it.a.id} it={it} conflict={conflicts.get(it.a.id)?.length ?? 0} onOpen={() => open(it.a.id)} />)}
      </div>
      {sheet}
    </div>
  );
}

function DayBlock({ it, conflict, onOpen }: { it: DayItem<Appointment>; conflict: number; onOpen: () => void }) {
  const { data } = useApp();
  const client = data.clients.find((c) => c.id === it.a.clientId);
  const pay = paymentSummary(it.a, data.transactions);
  const top = (it.from / 60) * HOUR;
  const height = Math.max(((it.to - it.from) / 60) * HOUR - 2, 40);
  const gutter = 48;
  return (
    <div role="listitem" className="absolute" style={{ top, height, left: `calc(${gutter}px + (100% - ${gutter + 4}px) * ${it.lane / it.lanes})`, width: `calc((100% - ${gutter + 4}px) / ${it.lanes} - 3px)` }}>
      <button type="button" onClick={onOpen} data-agenda-block={it.a.id}
        className={cx('press-soft flex h-full w-full flex-col overflow-hidden rounded-lg px-2 py-1 text-left text-xs', statusTone(it.a, conflict > 0))}>
        <span className="num font-semibold">{it.fromPrev ? '↑ ' : ''}{timeRange(it.a)}{it.toNext ? ' ↓' : ''}</span>
        <span className={cx('line-clamp-2 font-display text-sm font-semibold leading-tight', it.a.status === 'cancelado' && 'line-through')}>{it.a.title}</span>
        {client && <span className="truncate text-muted">{client.name}</span>}
        <span className="mt-auto flex flex-wrap items-center gap-1">
          {conflict > 0 && <ConflictMark n={conflict} />}
          {it.lanes === 1 && <PaymentBadge a={it.a} s={pay} />}
        </span>
      </button>
    </div>
  );
}

/** Linha compacta (semana, sem horário): horário e duração, serviço, cliente, situação e pagamento. */
function AgendaRow({ a, conflict, onOpen, dayKey }: { a: Appointment; conflict: number; onOpen: () => void; dayKey?: string }) {
  const { data } = useApp();
  const client = data.clients.find((c) => c.id === a.clientId);
  const pay = paymentSummary(a, data.transactions);
  const crosses = dayKey && a.date !== dayKey;
  return (
    <button type="button" onClick={onOpen} data-agenda-row={a.id}
      className={cx('press-soft flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left', statusTone(a, conflict > 0))}>
      <span className="num w-[6.5rem] shrink-0 text-sm font-semibold">
        {a.time ? timeRange(a) : 'Sem horário'}
        {a.time && <span className="block text-xs font-normal text-muted">{formatDuration(durationOf(a))}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-semibold leading-snug', a.status === 'cancelado' && 'line-through')}>
          {crosses && <MoonStar size={13} className="mr-1 inline" aria-label="Continua da noite anterior" />}{a.title}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted"><User size={12} aria-hidden="true" />{client?.name ?? 'Sem cliente'}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {a.status === 'cancelado' && <span className="text-xs text-muted">Cancelado</span>}
          {conflict > 0 && <ConflictMark n={conflict} />}
          <PaymentBadge a={a} s={pay} />
        </span>
      </span>
    </button>
  );
}

/** Visão da semana (segunda a domingo), em lista por dia — legível em 360 px. */
export function WeekView({ dateKey, items, onPickDay }: { dateKey: string; items: Appointment[]; onPickDay: (k: string) => void }) {
  const { data } = useApp();
  const { open, sheet } = useActions();
  const keys = useMemo(() => weekKeys(dateKey), [dateKey]);
  const days = useMemo(() => byDay(items, keys), [items, keys]);
  const conflicts = useMemo(() => conflictMap(data.appointments), [data.appointments]);
  const today = todayKey();
  return (
    <div className="grid gap-3" data-week={keys[0]}>
      {keys.map((k) => {
        const list = days.get(k) ?? [];
        return (
          <section key={k} aria-label={dayTitle(k, true)} className="rounded-2xl border border-line bg-surface p-2">
            <button type="button" onClick={() => onPickDay(k)} className="press-soft mb-1 flex min-h-11 w-full items-center justify-between rounded-lg px-1.5 text-left">
              <span className={cx('font-display text-sm font-bold capitalize', k === today && 'text-brand-700 dark:text-brand-300')}>{dayTitle(k)}{k === today ? ' · Hoje' : ''}</span>
              <span className="text-xs text-muted">{list.length ? `${list.length} ${list.length === 1 ? 'atendimento' : 'atendimentos'}` : 'Livre'}</span>
            </button>
            {list.length > 0 && <div className="grid gap-1.5">{list.map((a) => <AgendaRow key={`${k}-${a.id}`} a={a} dayKey={k} conflict={conflicts.get(a.id)?.length ?? 0} onOpen={() => open(a.id)} />)}</div>}
          </section>
        );
      })}
      {sheet}
    </div>
  );
}

/** Visão do mês: grade com contagem por dia e marcador de conflito; tocar no dia abre a visão do dia. */
export function MonthView({ dateKey, items, onPickDay }: { dateKey: string; items: Appointment[]; onPickDay: (k: string) => void }) {
  const { data } = useApp();
  const weeks = useMemo(() => monthGrid(dateKey), [dateKey]);
  const days = useMemo(() => byDay(items.filter((a) => a.status !== 'cancelado'), weeks.flat()), [items, weeks]);
  const conflicts = useMemo(() => conflictMap(data.appointments), [data.appointments]);
  const month = dateKey.slice(0, 7);
  const today = todayKey();
  return (
    <div className="rounded-2xl border border-line bg-surface p-2" data-month={month}>
      <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase text-muted" aria-hidden="true">
        {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
      </div>
      <div role="grid" aria-label="Dias do mês" className="grid gap-1">
        {weeks.map((w) => (
          <div role="row" key={w[0]} className="grid grid-cols-7 gap-1">
            {w.map((k) => {
              const list = days.get(k) ?? [];
              const clash = list.some((a) => (conflicts.get(a.id)?.length ?? 0) > 0);
              const inMonth = k.startsWith(month);
              const d = Number(k.slice(8));
              const label = `${dayTitle(k, true)}: ${list.length ? `${list.length} ${list.length === 1 ? 'atendimento' : 'atendimentos'}` : 'livre'}${clash ? ', com conflito de horário' : ''}`;
              return (
                <button key={k} type="button" role="gridcell" aria-label={label} aria-current={k === today ? 'date' : undefined}
                  onClick={() => onPickDay(k)} data-month-day={k}
                  className={cx('press-soft flex min-h-12 flex-col items-center justify-start rounded-lg py-1 text-sm', inMonth ? 'text-fg' : 'text-muted/60', k === today && 'bg-brand-600 font-bold text-white', k !== today && list.length > 0 && 'bg-surface-2')}>
                  <span className="num">{d}</span>
                  {list.length > 0 && (
                    <span className="mt-0.5 flex items-center gap-0.5 text-[0.6875rem] font-semibold">
                      {clash && <AlertTriangle size={11} className={k === today ? 'text-white' : 'text-amber-600'} aria-hidden="true" />}
                      <span className="num">{list.length}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
