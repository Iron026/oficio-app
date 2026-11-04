import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Tier } from '../gamification/tiers';
import { useApp, usePrefs } from '../state/AppContext';
import { CategoryMedal } from './CategoryMedal';
import { celebrate } from './celebrate';
import { CelebrationCtx } from './celebrationContext';

/**
 * Camada de comemoração da categoria. Aparece por cima da tela, some sozinha (ou com um
 * toque) e não interrompe nada. O anúncio para o TalkBack é feito pelo aviso (toast) da
 * conquista; o desenho aqui é decorativo. Ao aparecer, grava a categoria como comemorada.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const { service } = useApp();
  const prefs = usePrefs();
  const [shown, setShown] = useState<{ tier: Tier; level?: number; n: number } | null>(null);
  const seq = useRef(0);

  const show = useCallback((tier: Tier, level?: number) => {
    seq.current += 1;
    setShown({ tier, level, n: seq.current });
    void service.recordCelebration();
  }, [service]);

  const reduce = prefs.motion === 'reduzir' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  return (
    <CelebrationCtx.Provider value={show}>
      {children}
      {shown && <Layer key={shown.n} tier={shown.tier} level={shown.level} reduce={reduce} onDone={() => setShown(null)} />}
    </CelebrationCtx.Provider>
  );
}

function Layer({ tier, level, reduce, onDone }: { tier: Tier; level?: number; reduce: boolean; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const svg = box.current?.querySelector('svg');
    const ms = svg ? celebrate(svg, { reduce }) : 0;
    const hold = reduce ? 1600 : ms + 1300;
    const t1 = setTimeout(() => setLeaving(true), hold);
    const t2 = setTimeout(onDone, hold + 220);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce, onDone]);
  const grade = tier.id === 'diamante' && tier.rank > 1;
  return createPortal(
    <div
      aria-hidden="true"
      data-celebration=""
      onClick={() => { setLeaving(true); setTimeout(onDone, 200); }}
      className={`fixed inset-0 z-[60] grid place-items-center bg-[rgb(6_24_22/0.8)] transition-opacity duration-200 ${leaving ? 'opacity-0' : 'animate-fade'}`}
    >
      <div ref={box} className="grid justify-items-center gap-2 px-6 text-center text-white">
        <CategoryMedal tier={tier} size={168} decorative />
        <p className="font-display text-title-2 font-extrabold">{grade ? `Novo grau: ${tier.name}` : `Nova categoria: ${tier.name}`}</p>
        {level !== undefined && <p className="text-sm text-white/85">Nível {level} · {tier.title}</p>}
        <p className="text-xs text-white/70">Toque para fechar</p>
      </div>
    </div>,
    document.body,
  );
}
