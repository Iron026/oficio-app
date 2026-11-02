import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { cx } from './cx';
import { pushBackHandler } from '../platform/backStack';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Painel inferior (bottom sheet) acessível, usado para formulários. */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    // Em telas de toque, focar um campo abriria o teclado e cobriria metade do
    // painel: o foco vai para o próprio painel (o leitor de tela anuncia o título)
    // e o teclado só abre quando a pessoa toca no campo.
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const first = touch ? null : panel?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && panel) {
        const items = [...panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
        if (!items.length) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const removeBack = pushBackHandler(() => onCloseRef.current());
    return () => {
      removeBack();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  // Portal: evita que animações/transform dos pais prendam o painel atrás da navegação.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-var(--safe-top)-0.75rem)] w-full max-w-lg animate-sheet flex-col rounded-t-3xl bg-surface shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-2">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <IconButton label="Fechar" onClick={onClose} data-close>
            <X size={20} />
          </IconButton>
        </div>
        <div className={cx('flex-1 overscroll-contain overflow-y-auto px-5 pt-2', footer ? 'pb-4' : 'pb-[calc(1rem+var(--safe-bottom))]')}>{children}</div>
        {footer && <div className="border-t border-line px-5 pb-[max(1rem,var(--safe-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
