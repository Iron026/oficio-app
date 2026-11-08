import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, LayoutDashboard, Settings, TrendingUp, Users, Wallet, TriangleAlert, FlaskConical } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { navigate, type Route } from '../state/router';
import { IconButton } from '../ui/Button';
import { SearchButton } from './Search';
import { SyncIndicator } from './Account';
import { cx } from '../ui/cx';
import { LOGO } from '../ui/brand';

/**
 * Logo do Ofício — opção A, "Arco refinado" (beta.5). Geometria em ui/brand.ts. Fora do cabeçalho,
 * o fundo usa a escala da marca da paleta escolhida; no cabeçalho, um véu branco translúcido.
 */
export function Logo({ size = 32, onHero }: { size?: number; onHero?: boolean }) {
  const g = `logo-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Ofício">
      {!onHero && (
        <defs>
          <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-brand-500)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-brand-700)' }} />
          </linearGradient>
        </defs>
      )}
      <path d={LOGO.squircle} fill={onHero ? 'rgb(255 255 255 / 0.16)' : `url(#${g})`} />
      <path d={LOGO.arch} fill="none" stroke="#fff" strokeWidth={LOGO.archWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={LOGO.dot.cx} cy={LOGO.dot.cy} r={LOGO.dot.r} fill={LOGO.gold} />
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

/** Área do cabeçalho em gradiente onde cada tela coloca o próprio conteúdo. */
const HeroCtx = createContext<{ node: HTMLElement | null; setOverlap: (v: boolean) => void } | null>(null);

/**
 * Conteúdo da tela dentro do cabeçalho de identidade (saudação, abas, busca, mês…).
 * `overlap`: o primeiro cartão da tela sobe sobre a borda do cabeçalho.
 */
export function HeroSlot({ children, overlap }: { children: ReactNode; overlap?: boolean }) {
  const ctx = useContext(HeroCtx);
  useEffect(() => {
    ctx?.setOverlap(!!overlap);
    return () => ctx?.setOverlap(false);
  }, [ctx, overlap]);
  if (!ctx?.node) return null;
  return createPortal(children, ctx.node);
}

export function Shell({ route, pageKey = route, title, children, action }: { route: Route; pageKey?: string; title: string; children: ReactNode; action?: ReactNode }) {
  const { service, persistent } = useApp();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [overlap, setOverlap] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const activeIndex = TABS.findIndex((t) => t.route === route);

  // Troca de tela: o foco vai para o título (TalkBack anuncia a nova tela) e a página volta ao topo.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [pageKey]);

  return (
    <HeroCtx.Provider value={{ node: slot, setOverlap }}>
      <div className="mx-auto min-h-dvh max-w-lg">
        <header className="sticky top-0 z-30 bg-[var(--hero-1)] pt-[var(--safe-top)] text-white">
          <div className="flex h-14 items-center gap-3 px-4">
            <Logo size={28} onHero />
            <h1 ref={titleRef} tabIndex={-1} className="min-w-0 flex-1 truncate font-display text-lg font-extrabold leading-tight outline-none">{title}</h1>
            {action}
            <SearchButton />
            <SyncIndicator onHero />
            <IconButton label="Ajustes" onClick={() => navigate('ajustes')} aria-current={route === 'ajustes' ? 'page' : undefined} className={cx('text-white hover:bg-white/15 hover:text-white', route === 'ajustes' && 'bg-white/15')}>
              <Settings size={22} />
            </IconButton>
          </div>
        </header>
        <div
          ref={setSlot}
          className={cx(
            'hero px-4 empty:pb-3',
            overlap ? 'pb-14' : 'pb-4',
          )}
        />
        {!persistent && (
          <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Este navegador bloqueou o armazenamento local. Os dados serão perdidos ao fechar a página.
          </div>
        )}
        <main key={pageKey} className={cx('relative animate-screen px-4 pb-[calc(9.5rem+var(--safe-bottom))]', overlap ? '-mt-10' : 'pt-4')}>
          {service.hasDemoData() && (
            <button
              type="button"
              onClick={() => navigate('ajustes', 'dados')}
              className="press-soft mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-violet-400 bg-surface p-3 text-left text-sm text-violet-800 shadow-sm dark:border-violet-400/60 dark:text-violet-200"
            >
              <FlaskConical size={16} className="shrink-0" aria-hidden="true" />
              <span>Dados de demonstração ativos. Toque para removê-los em Ajustes.</span>
            </button>
          )}
          {children}
        </main>
        <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[var(--safe-bottom)]">
          <ul className="relative mx-auto grid max-w-lg grid-cols-5">
            {activeIndex >= 0 && (
              <li
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-[0.5rem] h-8 w-1/5 transition-transform duration-[280ms] ease-[var(--ease-emphasized)]"
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
              >
                <span className="mx-auto block h-8 w-14 rounded-full bg-brand-50 dark:bg-brand-500/15" />
              </li>
            )}
            {TABS.map(({ route: r, label, icon: Icon }) => {
              const active = r === route;
              return (
                <li key={r} className="relative">
                  <a
                    href={`#/${r}`}
                    aria-current={active ? 'page' : undefined}
                    className={cx('flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-150', active ? 'text-brand-700 dark:text-brand-200' : 'text-muted')}
                  >
                    <span className="flex h-8 w-14 items-center justify-center">
                      <Icon size={21} aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                    </span>
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </HeroCtx.Provider>
  );
}

/** Botão flutuante de ação principal. */
export function Fab({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      className="press fixed bottom-[calc(5rem+var(--safe-bottom))] right-[max(1rem,calc(50%-15rem))] z-20 flex h-14 items-center gap-2 rounded-2xl bg-brand-600 pl-4 pr-5 font-semibold text-white shadow-lg shadow-brand-900/25 hover:bg-brand-700"
    >
      {icon}
      {label}
    </button>,
    document.body,
  );
}
