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

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setItems((cur) => [...cur.slice(-2), { ...t, id }]);
    // Com ação (Desfazer): 8 s, tempo para alcançar o botão também com leitor de tela.
    timers.current.set(id, setTimeout(() => dismiss(id), t.action ? 8000 : t.tone === 'achievement' ? 5000 : 3200));
  }, [dismiss]);

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
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(5.5rem+var(--safe-bottom))]">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex w-full max-w-md animate-fade-up items-center gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-lg',
              t.tone === 'achievement' ? 'border-xp-400' : 'border-line',
            )}
            onClick={() => dismiss(t.id)}
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
                className="press-soft -my-1 min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                onClick={(e) => {
                  e.stopPropagation();
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
