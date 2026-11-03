import type { ReactNode } from 'react';
import { cx } from './cx';

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'li' }) {
  return <As className={cx('rounded-2xl border border-line bg-surface p-4', className)}>{children}</As>;
}

export function ProgressBar({ value, label, tone = 'brand', className }: { value: number; label: string; tone?: 'brand' | 'xp'; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cx('h-2.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 ease-out', tone === 'xp' ? 'bg-gradient-to-r from-xp-400 to-xp-500' : 'bg-gradient-to-r from-brand-400 to-brand-600')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function DemoBadge() {
  return <span className="inline-flex shrink-0 items-center rounded-md bg-violet-100 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">Demonstração</span>;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center justify-between">
      <h2 className="font-sans text-xs font-bold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-9 flex-1 rounded-lg text-sm font-semibold transition-all', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ children, onClick, active }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-line bg-surface text-fg hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}
