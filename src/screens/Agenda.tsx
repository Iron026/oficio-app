import { useMemo, useState } from 'react';
import { CalendarPlus, Plus } from 'lucide-react';
import type { Appointment } from '../domain/types';
import { relativeDayLabel } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { Button } from '../ui/Button';
import { EmptyState, Segmented } from '../ui/Misc';
import { AppointmentItem } from './AppointmentItem';
import { AppointmentFormSheet } from './forms/AppointmentForm';
import { Fab } from './Shell';

type Tab = 'abertos' | 'concluidos' | 'todos';

function groupByDate(items: Appointment[]): [string, Appointment[]][] {
  const map = new Map<string, Appointment[]>();
  for (const a of items) map.set(a.date, [...(map.get(a.date) ?? []), a]);
  return [...map.entries()];
}

const byDateAsc = (a: Appointment, b: Appointment) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'));

export function Agenda() {
  const { data, profession } = useApp();
  const t = profession.terms;
  const [tab, setTab] = useState<Tab>('abertos');
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const all = data.appointments;
    if (tab === 'abertos') return all.filter((a) => a.status === 'agendado').sort(byDateAsc);
    if (tab === 'concluidos') return all.filter((a) => a.status === 'concluido').sort((a, b) => -byDateAsc(a, b));
    return [...all].sort((a, b) => -byDateAsc(a, b));
  }, [data.appointments, tab]);

  return (
    <div>
      <Segmented
        label="Filtrar agenda"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'abertos', label: 'A fazer' },
          { value: 'concluidos', label: t.completedLabelPlural.charAt(0).toUpperCase() + t.completedLabelPlural.slice(1) },
          { value: 'todos', label: 'Todos' },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={28} />}
          title={tab === 'concluidos' ? `Nenhum${t.serviceArticle === 'a' ? 'a' : ''} ${t.service.toLowerCase()} ${t.completedLabel} ainda` : 'Nada agendado'}
          text={`Cadastre ${t.services.toLowerCase()} com data, horário, cliente e valor. Ao concluir, a receita pode ser lançada automaticamente.`}
          action={<Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>Agendar {t.service.toLowerCase()}</Button>}
        />
      ) : (
        <div className="mt-4 space-y-5">
          {groupByDate(list).map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{relativeDayLabel(date)}</h2>
              <div className="space-y-2.5">{items.map((a) => <AppointmentItem key={a.id} a={a} />)}</div>
            </section>
          ))}
        </div>
      )}
      {/* Sem itens, o estado vazio já oferece "Agendar": o botão flutuante seria a mesma ação repetida. */}
      {list.length > 0 && <Fab label="Agendar" icon={<Plus size={20} />} onClick={() => setCreating(true)} />}
      <AppointmentFormSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
