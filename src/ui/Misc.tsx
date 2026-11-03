import type { ReactNode } from 'react';
import { cx } from './cx';

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'li' }) {
  return <As className={cx('rounded-2xl border border-line bg-surface p-4', className)}>{children}</As>;
}

export function ProgressBar({ value, label, tone = 'brand', className }: { value: number; label: string; tone?: 'brand' | 'xp' | 'expense'; className?: string }) {
  const v = Math.min(1, Math.max(0, value));
  const pct = Math.round(v * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cx('h-2.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      {/* Preenche com transform (sem recalcular o layout) e anima ao aparecer (@starting-style). */}
      <div
        className={cx('bar-fill h-full w-full rounded-full', tone === 'xp' ? 'bg-gradient-to-r from-xp-400 to-xp-500' : tone === 'expense' ? 'bg-expense' : 'bg-gradient-to-r from-brand-400 to-brand-600')}
        style={{ transform: `scaleX(${v})` }}
      />
    </div>
  );
}

export function DemoBadge() {
  return <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-violet-500 px-2 py-px text-xs font-semibold text-violet-700 dark:border-violet-300 dark:text-violet-200">Demonstração</span>;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</div>
      <h3 className="text-title-3 font-bold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-[var(--gap-section)] flex items-center justify-between">
      <h2 className="font-sans text-xs font-bold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, onHero }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; onHero?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-xl p-1', onHero ? 'border border-white/20 bg-white/12' : 'bg-surface-2')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'press min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors',
            onHero
              ? value === o.value ? 'bg-white text-[#0d4f4a] shadow-sm' : 'text-white/85 hover:text-white'
              : value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
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
