import type { ReactNode } from 'react';
import { cx } from './cx';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const dot: Record<StatusTone, string> = {
  neutral: 'bg-muted',
  info: 'bg-sky-500',
  success: 'bg-brand-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};
const text: Record<StatusTone, string> = {
  neutral: 'text-muted',
  info: 'text-fg',
  success: 'text-brand-700 dark:text-brand-200',
  warning: 'text-amber-800 dark:text-amber-200',
  danger: 'text-red-700 dark:text-red-300',
};

/** Status como ponto colorido + texto (a cor nunca é a única informação). */
export function StatusBadge({ tone, children, icon }: { tone: StatusTone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold', text[tone])}>
      {icon ?? <span className={cx('h-2 w-2 shrink-0 rounded-full', dot[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}
