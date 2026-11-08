import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { weekdayIndex } from '../../domain/agenda';
import { HORIZON_DAYS, MAX_OCCURRENCES } from '../../domain/recurrence';
import type { RepeatInput } from '../../lib/validation';
import type { EditScope } from '../../state/service';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { SelectField, TextField } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';

export const EMPTY_REPEAT: RepeatInput = { freq: '', interval: '1', days: [], end: 'nunca', until: '', count: '' };
const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const UNIT: Record<string, [string, string]> = { diaria: ['dia', 'dias'], semanal: ['semana', 'semanas'], mensal: ['mês', 'meses'] };

/** Campos de repetição do formulário (beta.3). Sem repetição = "Não repete". */
export function RepeatFields({ value, onChange, date, error }: { value: RepeatInput; onChange: (r: RepeatInput) => void; date: string; error?: string }) {
  const set = (patch: Partial<RepeatInput>) => onChange({ ...value, ...patch });
  const weekly = value.freq === 'semanal' || value.freq === 'quinzenal';
  const dom = Number(date.slice(8)) || 1;
  return (
    <fieldset className="space-y-3 rounded-2xl border border-line p-3" data-repeat>
      <legend className="sr-only">Repetição</legend>
      <SelectField label="Repetir" value={value.freq} error={error} optional onChange={(e) => {
        const freq = e.target.value as RepeatInput['freq'];
        set({ freq, days: (freq === 'semanal' || freq === 'quinzenal') && !value.days.length ? [weekdayIndex(date)] : value.days, interval: value.interval || '1' });
      }}>
        <option value="">Não repete</option>
        <option value="diaria">Todos os dias</option>
        <option value="semanal">Toda semana</option>
        <option value="quinzenal">A cada 2 semanas (quinzenal)</option>
        <option value="mensal">Todo mês</option>
      </SelectField>
      {value.freq && (
        <>
          {value.freq !== 'quinzenal' && (
            <TextField label={`A cada quantos ${UNIT[value.freq]![1]}`} inputMode="numeric" value={value.interval}
              onChange={(e) => set({ interval: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              hint={value.interval === '1' ? `Todo${value.freq === 'diaria' ? ' dia' : value.freq === 'semanal' ? 'a semana' : ' mês'}.` : undefined} />
          )}
          {weekly && (
            <div role="group" aria-label="Dias da semana" className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const on = value.days.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} aria-label={DAY_NAMES[i]} onClick={() => set({ days: on ? value.days.filter((x) => x !== i) : [...value.days, i].sort() })}
                    className={cx('press-soft min-h-11 min-w-11 rounded-full border px-2 text-sm font-semibold', on ? 'border-brand-500 bg-brand-600 text-white' : 'border-line')}>
                    {d}
                  </button>
                );
              })}
            </div>
          )}
          {value.freq === 'mensal' && (
            <p className="text-sm text-muted">Dia {dom} de cada mês{dom > 28 ? '; nos meses mais curtos, no último dia' : ''}.</p>
          )}
          <div role="radiogroup" aria-label="Termina" className="flex flex-wrap gap-2">
            {([['nunca', 'Sem término'], ['data', 'Em uma data'], ['vezes', 'Depois de N vezes']] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={value.end === k} onClick={() => set({ end: k })}
                className={cx('press-soft min-h-10 rounded-full border px-3.5 text-sm font-semibold', value.end === k ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'border-line')}>
                {label}
              </button>
            ))}
          </div>
          {value.end === 'data' && <TextField label="Último dia" type="date" min={date} value={value.until} onChange={(e) => set({ until: e.target.value })} />}
          {value.end === 'vezes' && <TextField label="Quantas vezes" inputMode="numeric" value={value.count} onChange={(e) => set({ count: e.target.value.replace(/\D/g, '').slice(0, 3) })} hint={`No máximo ${MAX_OCCURRENCES}.`} />}
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Repeat size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            As datas aparecem na agenda até {HORIZON_DAYS} dias à frente e vão sendo completadas sozinhas (no máximo {MAX_OCCURRENCES} por série).
          </p>
        </>
      )}
    </fieldset>
  );
}

const SCOPE_TEXT: Record<'editar' | 'cancelar', Record<EditScope, [string, string]>> = {
  editar: {
    esta: ['Só esta', 'Muda apenas esta data; as outras continuam como estão.'],
    proximas: ['Esta e as próximas', 'Muda esta e as seguintes em aberto. As anteriores, concluídas e alteradas à parte ficam como estão.'],
    serie: ['Toda a série', 'Muda desde a primeira em aberto. Concluídas e alteradas à parte ficam como estão.'],
  },
  cancelar: {
    esta: ['Só esta', 'Cancela apenas esta data. Ela não volta a ser criada.'],
    proximas: ['Esta e as próximas', 'Cancela esta e encerra a repetição. Datas seguintes sem pagamento saem da agenda; as que têm pagamento ficam canceladas, com o dinheiro preservado.'],
    serie: ['Toda a série', 'Cancela desde a primeira em aberto e encerra a repetição. Concluídas e pagamentos continuam no histórico.'],
  },
};

/** Escolha do alcance ao editar ou cancelar uma ocorrência de série. Nada vem pré-selecionado. */
export function ScopeSheet({ open, kind, onClose, onChoose }: { open: boolean; kind: 'editar' | 'cancelar'; onClose: () => void; onChoose: (s: EditScope) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={kind === 'editar' ? 'Editar atendimento recorrente' : 'Cancelar atendimento recorrente'}>
      {open && <ScopeForm kind={kind} onChoose={onChoose} />}
    </Sheet>
  );
}

function ScopeForm({ kind, onChoose }: { kind: 'editar' | 'cancelar'; onChoose: (s: EditScope) => void }) {
  const [scope, setScope] = useState<EditScope | null>(null);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Aplicar a" className="grid gap-2">
        {(Object.keys(SCOPE_TEXT[kind]) as EditScope[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setScope(s)}
            className={cx('press-soft rounded-2xl border p-3 text-left', scope === s ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-line')}>
            <span className="block font-semibold">{SCOPE_TEXT[kind][s][0]}</span>
            <span className="block text-sm text-muted">{SCOPE_TEXT[kind][s][1]}</span>
          </button>
        ))}
      </div>
      <Button block size="lg" variant={kind === 'cancelar' ? 'danger' : 'primary'} disabled={!scope} onClick={() => scope && onChoose(scope)}>
        {kind === 'editar' ? 'Continuar' : 'Cancelar atendimentos'}
      </Button>
    </div>
  );
}
