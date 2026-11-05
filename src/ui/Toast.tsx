import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Info, Sparkles, Trophy, TriangleAlert } from 'lucide-react';
import { cx } from './cx';

export type ToastTone = 'success' | 'info' | 'error' | 'xp' | 'achievement';
export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  xp?: number;
  /** Ação do aviso (ex.: "Desfazer"). Avisos com ação ficam mais tempo na tela. */
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastInput { id: number }

const Ctx = createContext<(t: ToastInput) => void>(() => undefined);

/** Quantos avisos cabem ao mesmo tempo sem cobrir a tela. */
export const MAX_TOASTS = 2;

const icons: Record<ToastTone, ReactNode> = {
  success: <CircleCheck size={22} className="text-brand-600 dark:text-brand-300" />,
  info: <Info size={22} className="text-sky-500" />,
  error: <TriangleAlert size={22} className="text-red-500" />,
  xp: <Sparkles size={22} className="animate-pop text-xp-500" />,
  achievement: <Trophy size={22} className="animate-pop text-xp-500" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  // Um temporizador por aviso; todos são cancelados ao desmontar para não
  // haver setState depois que o provedor (ou o ambiente de teste) deixou de existir.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const schedule = useCallback((id: number, ms: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  /**
   * No máximo {@link MAX_TOASTS} avisos ao mesmo tempo (beta.5). Ao chegar um novo, sai o mais
   * antigo sem ação; um aviso com "Desfazer" só sai antes do tempo se todos tiverem ação.
   */
  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setItems((cur) => {
      const next = [...cur, { ...t, id }];
      while (next.length > MAX_TOASTS) {
        const i = next.findIndex((x) => !x.action);
        const [gone] = next.splice(i >= 0 && i < next.length - 1 ? i : 0, 1);
        clearTimeout(timers.current.get(gone!.id));
        timers.current.delete(gone!.id);
      }
      return next;
    });
    // Com ação (Desfazer): 8 s, tempo para alcançar o botão também com leitor de tela.
    schedule(id, t.action ? 8000 : t.tone === 'achievement' ? 5000 : 3200);
  }, [schedule]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      {/*
        Os avisos não capturam toques (beta.5): o que estiver por baixo continua tocável. Só o botão
        de ação (Desfazer) recebe toques; enquanto ele está em foco (teclado ou TalkBack) o tempo
        para e o aviso não some.
      */}
      <div aria-live="polite" role="status" data-toasts="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(5.5rem+var(--safe-bottom))]">
        {items.map((t) => (
          <div
            key={t.id}
            data-toast={t.action ? 'acao' : 'info'}
            className={cx(
              'pointer-events-none flex w-full max-w-md animate-fade-up items-center gap-3 rounded-2xl border bg-surface px-4 py-2.5 shadow-lg',
              t.tone === 'achievement' ? 'border-xp-400' : 'border-line',
            )}
          >
            {icons[t.tone ?? 'success']}
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{t.title}</p>
              {t.description && <p className="text-sm text-muted">{t.description}</p>}
            </div>
            {!!t.xp && <span className="shrink-0 rounded-full bg-xp-100 px-2.5 py-1 text-sm font-bold text-xp-700">+{t.xp} XP</span>}
            {t.action && (
              <button
                type="button"
                aria-label={`${t.action.label}: ${t.title}`}
                className="press-soft pointer-events-auto -my-1 min-h-11 min-w-11 shrink-0 rounded-xl px-3 text-sm font-bold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                onFocus={() => clearTimeout(timers.current.get(t.id))}
                onBlur={() => schedule(t.id, 4000)}
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
