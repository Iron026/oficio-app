/**
 * Comemorações exclusivas de cada categoria (rodada 4 aprovada). Web Animations API:
 * transform e opacity; o desenho de contornos usa stroke-dashoffset em poucos traços.
 * Roda uma vez por chamada e devolve a duração (ms). Com `reduce`, só um esmaecer curto.
 */
const E = { out: 'cubic-bezier(.2,0,0,1)', back: 'cubic-bezier(.34,1.5,.64,1)', soft: 'cubic-bezier(.4,0,.2,1)' };

type Kf = Keyframe[];
const all = (svg: Element, s: string) => [...svg.querySelectorAll<SVGElement>(s)];
const one = (svg: Element, s: string) => svg.querySelector<SVGElement>(s);
const num = (el: Element, attr: string) => Number(el.getAttribute(attr) ?? 0);

function run(el: Element | null, kf: Kf, delay: number, duration: number, easing = E.out) {
  el?.animate(kf, { delay, duration, easing, fill: 'both' });
}
/** Origem da transformação no centro do medalhão (coordenadas do viewBox). */
function center(el: SVGElement | null, cx: number, cy: number) {
  if (!el) return;
  el.style.transformBox = 'view-box';
  el.style.transformOrigin = `${cx}px ${cy}px`;
}
function self(el: SVGElement | null, ox = '50%', oy = '50%') {
  if (!el) return;
  el.style.transformBox = 'fill-box';
  el.style.transformOrigin = `${ox} ${oy}`;
}
const draw = (el: Element | null, delay: number, duration: number) => run(el, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], delay, duration, E.soft);
function sheen(svg: Element, delay: number, duration: number) {
  all(svg, '.m-sheen').forEach((s) => run(s, [{ opacity: 1, transform: 'skewX(-18deg) translateX(0px)' }, { opacity: 1, transform: 'skewX(-18deg) translateX(190px)' }], delay, duration, E.soft));
}

const TIERS: Record<string, (svg: SVGSVGElement) => number> = {
  inicial(svg) {
    const w = one(svg, '.m-whole'); center(w, 60, 60);
    run(w, [{ opacity: 0, transform: 'translateY(8px) scale(.92)' }, { opacity: 1, transform: 'none' }], 0, 560);
    all(svg, '.m-leaf').forEach((l, i) => { self(l, i ? '0%' : '100%', '100%'); run(l, [{ transform: 'scale(.2)' }, { transform: 'none' }], 240 + i * 80, 380, E.back); });
    return 700;
  },
  bronze(svg) {
    draw(one(svg, '.m-outline'), 0, 560);
    draw(one(svg, '.m-bevel'), 220, 480);
    run(one(svg, '.m-fill'), [{ opacity: 0 }, { opacity: 1 }], 420, 300);
    const s = one(svg, '.m-sym'); self(s);
    run(s, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'none' }], 600, 380, E.back);
    sheen(svg, 760, 500);
    return 1260;
  },
  prata(svg) {
    all(svg, '.m-wedge').forEach((w, i) => {
      const a = ((-60 + 60 * i) * Math.PI) / 180;
      run(w, [{ opacity: 0, transform: `translate(${Math.cos(a) * 16}px, ${Math.sin(a) * 16}px)` }, { opacity: 1, transform: 'none' }], i * 70, 380);
    });
    draw(one(svg, '.m-outline'), 420, 420);
    draw(one(svg, '.m-inner'), 560, 380);
    all(svg, '.m-chev').forEach((c, i) => run(c, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 760 + i * 120, 320, E.back));
    const l = one(svg, '.m-laurel'); self(l, '50%', '100%');
    run(l, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], 940, 320);
    sheen(svg, 1020, 560);
    return 1580;
  },
  ouro(svg) {
    const r = one(svg, '.m-rosette'); center(r, 60, 54);
    run(r, [{ opacity: 0, transform: 'scale(.3) rotate(-24deg)' }, { opacity: 1, transform: 'scale(1.07) rotate(3deg)', offset: 0.7 }, { opacity: 1, transform: 'none' }], 0, 620);
    const rays = all(svg, '.m-ray');
    rays.forEach((ray, i) => { center(ray, 60, 54); run(ray, [{ opacity: 0, transform: 'scale(.75)' }, { opacity: 1, transform: 'scale(1)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.22)' }], 330 + i * 22, 520, E.soft); });
    const rb = one(svg, '.m-ribbons'); self(rb, '50%', '0%');
    run(rb, [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 1, transform: 'none' }], 460, 340, E.back);
    const c = one(svg, '.m-crown'); self(c, '50%', '100%');
    run(c, [{ opacity: 0, transform: 'translateY(-14px) scale(.8)' }, { opacity: 1, transform: 'none' }], 640, 380, E.back);
    // segunda onda de raios quando a coroa assenta (os raios voltam a ficar invisíveis)
    rays.forEach((ray, i) => { if (i % 2 === 0) run(ray, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 0.8, transform: 'scale(1.05)', offset: 0.4 }, { opacity: 0, transform: 'scale(1.18)' }], 980 + i * 18, 420, E.soft); });
    sheen(svg, 1080, 620);
    return 1700;
  },
  platina(svg) {
    all(svg, '.m-facet').forEach((f) => {
      const i = num(f, 'data-i');
      const a = ((-90 + 45 * i + 45) * Math.PI) / 180;
      run(f, [{ opacity: 0, transform: `translate(${Math.cos(a) * 20}px, ${Math.sin(a) * 20}px) rotate(${i % 2 ? 14 : -14}deg)` }, { opacity: 1, transform: 'none' }], i * 60, 460);
    });
    const core = one(svg, '.m-core'); center(core, 60, 58);
    run(core, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], 560, 360, E.back);
    run(one(svg, '.m-engrave'), [{ opacity: 0 }, { opacity: 1 }], 760, 300);
    const st = one(svg, '.m-star'); center(st, 60, 58);
    run(st, [{ opacity: 0, transform: 'rotate(-60deg) scale(.4)' }, { opacity: 1, transform: 'none' }], 760, 480, E.back);
    const h = one(svg, '.m-halo'); center(h, 60, 58);
    run(h, [{ opacity: 0, transform: 'scale(.88)' }, { opacity: 0.95, transform: 'scale(1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1.16)' }], 1050, 700, E.soft);
    all(svg, '.m-glint').forEach((g, i) => { self(g); run(g, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.2)', offset: 0.5 }, { opacity: 0, transform: 'scale(.6)' }], 1150 + i * 180, 420); });
    sheen(svg, 1180, 600);
    return 1780;
  },
  diamante(svg) {
    const rank = Number(svg.dataset.rank ?? 1);
    const ring = one(svg, '.m-ring'); center(ring, 60, 58);
    run(ring, [{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'none' }], 0, 420);
    all(svg, '.m-notch').forEach((n, i) => run(n, [{ opacity: 0.15 }, { opacity: 1 }], 200 + i * 32, 220));
    all(svg, '.m-gfacet').forEach((f, i) => run(f, [
      { opacity: 0, transform: `translate(${num(f, 'data-fx')}px, ${num(f, 'data-fy')}px) rotate(${num(f, 'data-fr')}deg)` },
      { opacity: 1, transform: 'none' }], 320 + i * 75, 520));
    run(one(svg, '.m-goutline'), [{ opacity: 0 }, { opacity: 1 }], 960, 260);
    run(one(svg, '.m-glines'), [{ opacity: 0 }, { opacity: 1 }], 1040, 260);
    run(one(svg, '.m-shimmer'), [{ opacity: 1, transform: 'skewX(-20deg) translateX(0px)' }, { opacity: 1, transform: 'skewX(-20deg) translateX(150px)' }], 1120, 520, E.soft);
    all(svg, '.m-frag').forEach((f, i) => {
      center(f, 60, 57);
      const t = `translate(${num(f, 'data-tx')}px, ${num(f, 'data-ty')}px)`;
      run(f, [{ opacity: 0, transform: 'translate(0px, 0px) scale(.6)' }, { opacity: 1, transform: `${t} scale(1.1)`, offset: 0.55 }, { opacity: 0, transform: `${t} scale(.3)` }], 1260 + i * 24, 640, E.soft);
    });
    const sp = one(svg, '.m-sparkle'); self(sp);
    run(sp, [{ opacity: 0, transform: 'scale(0) rotate(-45deg)' }, { opacity: 1, transform: 'none' }], 1450, 380, E.back);
    all(svg, '.m-halo').forEach((h, i) => { center(h, 60, 58); run(h, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 0.9, transform: 'scale(1)', offset: 0.25 }, { opacity: 0, transform: `scale(${1.22 + i * 0.08})` }], 1500 + 170 * (rank - 1) + i * 170, 760, E.soft); });
    if (rank >= 2) {
      all(svg, '.m-rstar').forEach((s, i) => { self(s); run(s, [{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1.35)', offset: 0.6 }, { opacity: 1, transform: 'none' }], 1650 + i * 150, 380, E.back); });
      const p = one(svg, '.m-plate'); self(p, '50%', '100%');
      run(p, [{ opacity: 0, transform: 'translateY(10px) scale(.8)' }, { opacity: 1, transform: 'none' }], 1850, 380, E.back);
    }
    if (rank >= 3) draw(one(svg, '.m-ring2'), 1700, 700);
    if (rank >= 4) run(one(svg, '.m-plate'), [{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], 2300, 420);
    return [2430, 2600, 2770][rank - 1] ?? 2940;
  },
};

export function celebrate(svg: SVGSVGElement, opts: { reduce: boolean }): number {
  svg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  if (opts.reduce || typeof svg.animate !== 'function') {
    svg.animate?.([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160 });
    return 160;
  }
  const fn = TIERS[svg.dataset.tier ?? ''];
  return fn ? fn(svg) : 0;
}

/** Duração prevista (para testes e para o tempo de exibição da camada). */
export const CELEBRATION_MS: Record<string, number> = { inicial: 700, bronze: 1260, prata: 1580, ouro: 1700, platina: 1780, diamante: 2430 };
