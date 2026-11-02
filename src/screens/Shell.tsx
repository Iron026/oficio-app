import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, LayoutDashboard, Settings, TrendingUp, Users, Wallet, TriangleAlert, FlaskConical } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { navigate, type Route } from '../state/router';
import { IconButton } from '../ui/Button';
import { cx } from '../ui/cx';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Ofício">
      <rect width="64" height="64" rx="16" className="fill-brand-600" />
      <path d="M18 42 32 18l14 24" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="44" r="4" className="fill-xp-400" />
    </svg>
  );
}

const TABS: { route: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { route: 'painel', label: 'Painel', icon: LayoutDashboard },
  { route: 'agenda', label: 'Agenda', icon: CalendarDays },
  { route: 'clientes', label: 'Clientes', icon: Users },
  { route: 'financas', label: 'Finanças', icon: Wallet },
  { route: 'evolucao', label: 'Evolução', icon: TrendingUp },
];

export function Shell({ route, title, children, action }: { route: Route; title: string; children: ReactNode; action?: ReactNode }) {
  const { data, service, persistent } = useApp();
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4">
          <Logo size={28} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
            {data.profile?.businessName && route === 'painel' && <p className="truncate text-xs text-muted">{data.profile.businessName}</p>}
          </div>
          {action}
          <IconButton label="Ajustes" onClick={() => navigate('ajustes')} className={cx(route === 'ajustes' && 'bg-surface-2 text-fg')}>
            <Settings size={22} />
          </IconButton>
        </div>
      </header>
      {!persistent && (
        <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Este navegador bloqueou o armazenamento local. Os dados serão perdidos ao fechar a página.
        </div>
      )}
      {service.hasDemoData() && (
        <button
          type="button"
          onClick={() => navigate('ajustes')}
          className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl bg-violet-50 p-3 text-left text-[13px] text-violet-800 dark:bg-violet-500/15 dark:text-violet-200"
        >
          <FlaskConical size={16} className="shrink-0" aria-hidden="true" />
          <span>Dados de demonstração ativos. Toque para removê-los em Ajustes.</span>
        </button>
      )}
      <main key={route} className="animate-fade-up px-4 pb-[calc(6rem+var(--safe-bottom))] pt-4">{children}</main>
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[var(--safe-bottom)] backdrop-blur-md">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ route: r, label, icon: Icon }) => {
            const active = r === route;
            return (
              <li key={r}>
                <a
                  href={`#/${r}`}
                  aria-current={active ? 'page' : undefined}
                  className={cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', active ? 'text-brand-600 dark:text-brand-300' : 'text-muted')}
                >
                  <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-brand-50 dark:bg-brand-500/15')}>
                    <Icon size={20} aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Botão flutuante de ação principal. */
export function Fab({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(5rem+var(--safe-bottom))] right-[max(1rem,calc(50%-15rem))] z-20 flex h-14 items-center gap-2 rounded-2xl bg-brand-600 pl-4 pr-5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-transform hover:bg-brand-700 active:scale-95"
    >
      {icon}
      {label}
    </button>,
    document.body,
  );
}
