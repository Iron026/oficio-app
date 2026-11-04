import { useId, useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { cx } from './cx';

/**
 * Escolha única em chips que quebram linha (nunca cortam o texto), com rótulo, erro e
 * navegação por setas como um grupo de rádio. Usada na categoria dos lançamentos.
 */
export function ChoiceChips({ label, options, value, onChange, error, optional }: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, options.indexOf(value));
  const move = (e: KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + options.length) % options.length;
    onChange(options[next]!);
    refs.current[next]?.focus();
  };
  return (
    <div className="space-y-1.5">
      <p id={`${id}-label`} className="block text-sm font-medium text-fg">
        {label} {optional && <span className="font-normal text-muted">(opcional)</span>}
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-msg` : undefined} aria-invalid={!!error} className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const active = o === value;
          return (
            <button
              key={o}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={i === current ? 0 : -1}
              onClick={() => onChange(o)}
              onKeyDown={(e) => move(e, i)}
              className={cx(
                'press inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-left text-sm font-medium [overflow-wrap:anywhere]',
                active ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : error ? 'border-red-500 bg-surface' : 'border-line bg-surface',
              )}
            >
              {active && <Check size={15} className="shrink-0" aria-hidden="true" />}
              {o}
            </button>
          );
        })}
      </div>
      {error && <p id={`${id}-msg`} role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
