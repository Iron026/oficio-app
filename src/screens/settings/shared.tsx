import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pushBackHandler } from '../../platform/backStack';
import { navigate } from '../../state/router';
import { cx } from '../../ui/cx';
import { SETTINGS_PAGES, type SettingsPageId } from './pages';

/** Posição de rolagem de cada página da Central, para voltar ao mesmo ponto. */
const scrollMemory = new Map<string, number>();

/** Abre uma página interna guardando a rolagem da página atual. */
export function openSettings(from: string, to: SettingsPageId) {
  scrollMemory.set(from, window.scrollY);
  navigate('ajustes', to);
}

/** Volta à rolagem guardada da página (chamar no carregamento dela). */
export function useRestoreScroll(page: string) {
  useEffect(() => {
    const y = scrollMemory.get(page);
    if (y === undefined) return;
    scrollMemory.delete(page);
    // Depois do retorno ao topo feito pela troca de rota.
    const id = requestAnimationFrame(() => window.scrollTo({ top: y }));
    return () => cancelAnimationFrame(id);
  }, [page]);
}

/** Moldura de uma página interna: "‹ Ajustes", Voltar do Android e rolagem preservada. */
export function SettingsSubpage({ id, children }: { id: SettingsPageId; children: ReactNode }) {
  const page = SETTINGS_PAGES[id];
  const goUp = () => navigate('ajustes', page.parent ?? undefined);
  useRestoreScroll(id);
  // Voltar do Android: painéis abertos por cima fecham antes (entram depois na pilha).
  useEffect(() => pushBackHandler(goUp), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pt-1">
      <a
        href={page.parent ? `#/ajustes/${page.parent}` : '#/ajustes'}
        className="press-soft -ml-2 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-brand-700 dark:text-brand-300"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        {page.parentLabel}
      </a>
      <div className="space-y-[var(--gap-section)]">{children}</div>
    </div>
  );
}

/** Bloco com título curto dentro de uma página interna. */
export function Group({ title, children, hint }: { title?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section>
      {title && <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>}
      {children}
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
    </section>
  );
}

/** Linha de opção (abre um painel, outra página ou executa uma ação). */
export function OptionRow({ label, detail, icon, onClick, danger, value, chevron = true }: {
  label: string;
  detail?: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  value?: string;
  chevron?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className="press-soft flex min-h-14 w-full items-center gap-3 border-b border-line p-3.5 text-left transition-colors last:border-0 hover:bg-surface-2">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2', danger ? 'text-red-600 dark:text-red-400' : 'text-brand-600 dark:text-brand-300')} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-medium [overflow-wrap:anywhere]', danger && 'text-red-700 dark:text-red-400')}>{label}</span>
        {detail && <span className="line-clamp-2 block text-sm text-muted [overflow-wrap:anywhere]">{detail}</span>}
      </span>
      {value && <span className="max-w-[40%] shrink-0 text-right text-sm text-muted [overflow-wrap:anywhere]">{value}</span>}
      {chevron && <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />}
    </button>
  );
}

/** Linha do índice: ícone, título, explicação e resumo do estado atual. */
export function CategoryRow({ icon, title, subtitle, summary, onClick }: { icon: ReactNode; title: string; subtitle: string; summary?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press-soft flex min-h-16 w-full items-center gap-3 border-b border-line px-3.5 py-3 text-left transition-colors last:border-0 hover:bg-surface-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        <span className="block text-sm text-muted">{subtitle}</span>
        {summary && <span className="mt-0.5 block text-sm font-medium text-brand-700 [overflow-wrap:anywhere] dark:text-brand-300">{summary}</span>}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}
