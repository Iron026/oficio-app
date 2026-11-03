import { cx } from './cx';

// Tons discretos e estáveis por nome (texto ≥ 4,5:1 sobre o fundo nos dois temas).
const tones = [
  'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-100',
  'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100',
  'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-100',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100',
  'bg-slate-200 text-slate-800 dark:bg-slate-500/25 dark:text-slate-100',
];

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'md' | 'lg'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full font-display font-bold',
        size === 'lg' ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm',
        tones[hash(name) % tones.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
