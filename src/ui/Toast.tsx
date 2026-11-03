import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Info, Sparkles, Trophy, TriangleAlert } from 'lucide-react';
import { cx } from './cx';

export type ToastTone = 'success' | 'info' | 'error' | 'xp' | 'achievement';
export interface ToastInput { title: string; description?: string; tone?: ToastTone; xp?: number }
interface ToastItem extends ToastInput { id: number }

const Ctx = createContext<(t: ToastInput) => void>(() => undefined);

const icons: Record<ToastTone, ReactNode> = {
  success: <CircleCheck size={22} className="animate-pop text-brand-500" />,
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
    timers.current.set(id, setTimeout(() => dismiss(id), t.tone === 'achievement' ? 5000 : 3200));
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
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,var(--safe-top))]">
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
              <p className="text-[15px] font-semibold">{t.title}</p>
              {t.description && <p className="text-[13px] text-muted">{t.description}</p>}
            </div>
            {!!t.xp && <span className="shrink-0 rounded-full bg-xp-100 px-2.5 py-1 text-sm font-bold text-xp-700">+{t.xp} XP</span>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
