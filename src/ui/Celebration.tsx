import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Tier } from '../gamification/tiers';
import { useApp, usePrefs } from '../state/AppContext';
import { CategoryMedal } from './CategoryMedal';
import { celebrate, celebrationTiming } from './celebrate';
import { pushBackHandler } from '../platform/backStack';
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

/**
 * Etapas (beta.5): o fundo escurece, o medalhão se monta com a sequência própria da categoria,
 * o título e o nível entram um depois do outro e há uma pausa para contemplar o medalhão pronto.
 * Não bloqueia a navegação: a camada não captura toques. Qualquer toque na tela a fecha e chega
 * normalmente ao que está embaixo (um toque em "Finanças" fecha e já abre Finanças). Voltar e Esc
 * também fecham.
 */
function Layer({ tier, level, reduce, onDone }: { tier: Tier; level?: number; reduce: boolean; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const timing = celebrationTiming(tier, reduce);
  const close = useCallback(() => { setLeaving(true); setTimeout(onDone, 260); }, [onDone]);
  useEffect(() => {
    const svg = box.current?.querySelector('svg');
    if (svg) celebrate(svg, { reduce });
    const t1 = setTimeout(() => setLeaving(true), timing.total);
    const t2 = setTimeout(onDone, timing.total + 320);
    const removeBack = pushBackHandler(close);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onTap = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onTap, { capture: true, passive: true });
    return () => {
      clearTimeout(t1); clearTimeout(t2); removeBack();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onTap, { capture: true });
    };
  }, [reduce, onDone, close, timing.total]);
  const grade = tier.id === 'diamante' && tier.rank > 1;
  // Textos: entram em sequência perto do fim da montagem (sem movimento com "Reduzir animações").
  const step = (i: number) => (reduce ? undefined : { animationDelay: `${timing.textAt + i * 260}ms`, animationDuration: '520ms' });
  return createPortal(
    <div
      aria-hidden="true"
      data-celebration=""
      data-build={timing.build}
      data-hold={timing.hold}
      className={`pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-[rgb(6_24_22/0.82)] transition-opacity duration-300 ${leaving ? 'opacity-0' : 'animate-fade'}`}
    >
      <div ref={box} className="grid justify-items-center gap-2 px-6 text-center text-white">
        <div className="relative grid place-items-center">
          {/* Halo estático e discreto atrás do medalhão (só gradiente, sem filtro). */}
          <span aria-hidden="true" className={`absolute h-[230px] w-[230px] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.16),transparent)] ${reduce ? '' : 'animate-fade'}`} style={reduce ? undefined : { animationDelay: `${Math.round(timing.build * 0.5)}ms`, animationDuration: '900ms' }} />
          <CategoryMedal tier={tier} size={168} decorative className="relative" />
        </div>
        <p className={`font-display text-title-2 font-extrabold ${reduce ? '' : 'animate-fade-up'}`} style={step(0)}>{grade ? `Novo grau: ${tier.name}` : `Nova categoria: ${tier.name}`}</p>
        {level !== undefined && <p className={`text-sm text-white/85 ${reduce ? '' : 'animate-fade-up'}`} style={step(1)}>Nível {level} · {tier.title}</p>}
        <p className={`text-xs text-white/70 ${reduce ? '' : 'animate-fade-up'}`} style={step(2)}>Toque para fechar</p>
      </div>
    </div>,
    document.body,
  );
}
