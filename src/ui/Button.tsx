import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'xp';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-surface-2 text-fg hover:brightness-95 dark:hover:brightness-125',
  ghost: 'bg-transparent text-fg hover:bg-surface-2',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  xp: 'bg-xp-400 text-xp-950 hover:bg-xp-500',
};
const sizes: Record<Size, string> = {
  // Altura mínima (não fixa): textos longos quebram sem transbordar o botão.
  sm: 'min-h-9 py-1.5 px-3 text-sm gap-1.5 rounded-lg',
  md: 'min-h-11 py-2 px-4 text-base gap-2 rounded-xl',
  lg: 'min-h-13 py-2.5 px-5 text-base gap-2 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({ variant = 'primary', size = 'md', icon, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center text-center leading-tight font-semibold [&>svg]:shrink-0 transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-95', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
