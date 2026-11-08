import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDaysKey, addMonthsKey, weekKeys } from '../domain/agenda';
import type { Appointment } from '../domain/types';
import { relativeDayLabel, todayKey } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, Segmented } from '../ui/Misc';
import { AppointmentItem } from './AppointmentItem';
import { dayTitle, DayView, MonthView, WeekView } from './agenda/AgendaViews';
import { AppointmentFormSheet } from './forms/AppointmentForm';
import { Fab, HeroSlot } from './Shell';

type Tab = 'abertos' | 'concluidos' | 'todos';
/** 0.5: a lista continua sendo a visão inicial; dia, semana e mês ficam a um toque. */
type View = 'lista' | 'dia' | 'semana' | 'mes';

function groupByDate(items: Appointment[]): [string, Appointment[]][] {
  const map = new Map<string, Appointment[]>();
  for (const a of items) map.set(a.date, [...(map.get(a.date) ?? []), a]);
  return [...map.entries()];
}

const byDateAsc = (a: Appointment, b: Appointment) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'));
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function periodLabel(view: View, key: string): string {
  if (view === 'dia') return relativeDayLabel(key) === 'Hoje' ? `Hoje · ${dayTitle(key)}` : dayTitle(key, true);
  if (view === 'semana') {
    const w = weekKeys(key);
    const [a, b] = [w[0]!, w[6]!];
    return `${Number(a.slice(8))}${a.slice(5, 7) === b.slice(5, 7) ? '' : ` ${MONTHS[Number(a.slice(5, 7)) - 1]!.slice(0, 3)}`} a ${Number(b.slice(8))} de ${MONTHS[Number(b.slice(5, 7)) - 1]}`;
  }
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} de ${key.slice(0, 4)}`;
}

export function Agenda() {
  const { data, profession, service } = useApp();
  // beta.3: ao abrir a Agenda, completa as séries que chegaram ao horizonte (dias depois, outro aparelho).
  useEffect(() => { void service.extendSeries().catch(() => undefined); }, [service]);
  const t = profession.terms;
  const [tab, setTab] = useState<Tab>('abertos');
  const [view, setView] = useState<View>('lista');
  const [cursor, setCursor] = useState(() => todayKey());
  const [creating, setCreating] = useState(false);
  const todayCount = data.appointments.filter((a) => a.status === 'agendado' && a.date === todayKey()).length;
  const todayLine = `${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${todayCount} ${todayCount === 1 ? t.service.toLowerCase() : t.services.toLowerCase()} hoje`;

  const list = useMemo(() => {
    const all = data.appointments;
    if (tab === 'abertos') return all.filter((a) => a.status === 'agendado').sort(byDateAsc);
    if (tab === 'concluidos') return all.filter((a) => a.status === 'concluido').sort((a, b) => -byDateAsc(a, b));
    return [...all].sort((a, b) => -byDateAsc(a, b));
  }, [data.appointments, tab]);

  const step = (n: number) => setCursor((k) => (view === 'mes' ? addMonthsKey(k, n) : addDaysKey(k, view === 'semana' ? 7 * n : n)));
  const pickDay = (k: string) => { setCursor(k); setView('dia'); };

  return (
    <div>
      <HeroSlot>
        <p className="pt-1 text-sm text-on-hero-soft">{todayLine}</p>
        <div className="mt-3 space-y-2">
          <Segmented
            onHero
            label="Visualização da agenda"
            value={view}
            onChange={(v) => { setView(v); if (v !== 'lista') setCursor(todayKey()); }}
            options={[{ value: 'lista', label: 'Lista' }, { value: 'dia', label: 'Dia' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }]}
          />
          {view === 'lista' ? (
            <Segmented
              onHero
              label="Filtrar agenda"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'abertos', label: 'A fazer' },
                { value: 'concluidos', label: t.completedLabelPlural.charAt(0).toUpperCase() + t.completedLabelPlural.slice(1) },
                { value: 'todos', label: 'Todos' },
              ]}
            />
          ) : (
            <div className="flex items-center gap-1" data-agenda-nav>
              <IconButton label={view === 'mes' ? 'Mês anterior' : view === 'semana' ? 'Semana anterior' : 'Dia anterior'} onClick={() => step(-1)} className="!text-white hover:!bg-white/15"><ChevronLeft size={22} /></IconButton>
              <h2 className="min-w-0 flex-1 text-center font-display text-base font-bold first-letter:uppercase" aria-live="polite">{periodLabel(view, cursor)}</h2>
              <IconButton label={view === 'mes' ? 'Próximo mês' : view === 'semana' ? 'Próxima semana' : 'Próximo dia'} onClick={() => step(1)} className="!text-white hover:!bg-white/15"><ChevronRight size={22} /></IconButton>
              <button type="button" onClick={() => setCursor(todayKey())} disabled={view === 'dia' ? cursor === todayKey() : view === 'semana' ? weekKeys(cursor).includes(todayKey()) : cursor.slice(0, 7) === todayKey().slice(0, 7)}
                className="press min-h-11 rounded-full border border-white/40 px-3 text-sm font-semibold text-white disabled:opacity-40">Hoje</button>
            </div>
          )}
        </div>
      </HeroSlot>
      {view === 'dia' && <DayView dateKey={cursor} items={data.appointments} />}
      {view === 'semana' && <WeekView dateKey={cursor} items={data.appointments} onPickDay={pickDay} />}
      {view === 'mes' && <MonthView dateKey={cursor} items={data.appointments} onPickDay={pickDay} />}
      {view === 'lista' && (list.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={28} />}
          title={tab === 'concluidos' ? `Nenhum${t.serviceArticle === 'a' ? 'a' : ''} ${t.service.toLowerCase()} ${t.completedLabel} ainda` : 'Nada agendado'}
          text={`Cadastre ${t.services.toLowerCase()} com data, horário, duração, cliente e valor. Ao concluir, você registra quanto recebeu.`}
          action={<Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>Agendar {t.service.toLowerCase()}</Button>}
        />
      ) : (
        <div className="enter-stagger grid gap-[var(--gap-section)]">
          {groupByDate(list).map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-2 font-display text-sm font-bold text-muted">{relativeDayLabel(date)}</h2>
              <div className="grid gap-[var(--gap-list)]">{items.map((a) => <AppointmentItem key={a.id} a={a} />)}</div>
            </section>
          ))}
        </div>
      ))}
      {/* Sem itens na lista, o estado vazio já oferece "Agendar": o botão flutuante seria a mesma ação repetida. */}
      {(view !== 'lista' || list.length > 0) && <Fab label="Agendar" icon={<Plus size={20} />} onClick={() => setCreating(true)} />}
      <AppointmentFormSheet open={creating} onClose={() => setCreating(false)} defaultDate={view === 'lista' ? undefined : cursor} />
    </div>
  );
}
