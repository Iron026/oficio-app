import { useId, type ReactNode } from 'react';
import type { Tier, TierId } from '../gamification/tiers';
import { toRoman } from '../gamification/tiers';

/**
 * Medalhões das categorias (0.4, rodada 4 aprovada). Cada categoria tem forma, acabamento e
 * símbolo próprios; as partes têm classes (contorno, facetas, raios, fragmentos…) usadas pela
 * comemoração exclusiva de cada uma (ui/celebrate.ts). Em repouso, o medalhão é estático.
 * Só as categorias usam este desenho: os ícones gerais do app continuam os da 0.4.
 */
type XY = [number, number];
const P = (cx: number, cy: number, r: number, deg: number): XY => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const pts = (ps: XY[]) => ps.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const star = (cx: number, cy: number, ro: number, ri: number, n: number, rot = -90) =>
  pts(Array.from({ length: 2 * n }, (_, i) => P(cx, cy, i % 2 === 0 ? ro : ri, rot + (180 * i) / n)));

function Lg({ id, stops }: { id: string; stops: [number, string][] }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
    </linearGradient>
  );
}

/** Faixa de reflexo: fica fora do medalhão em repouso; a comemoração a passa uma vez. */
function Sheen({ u, clip }: { u: string; clip: ReactNode }) {
  return (
    <>
      <defs>
        <clipPath id={`c${u}`}>{clip}</clipPath>
        <linearGradient id={`s${u}`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#c${u})`}><rect className="m-sheen" x="-60" y="-10" width="34" height="140" fill={`url(#s${u})`} transform="skewX(-18)" opacity="0" /></g>
    </>
  );
}

function Inicial({ u }: { u: string }) {
  return (
    <>
      <defs><Lg id={`i${u}`} stops={[[0, '#3cc7b3'], [0.55, '#0f7b71'], [1, '#0b4a45']]} /></defs>
      <g className="m-whole">
        <circle cx="60" cy="60" r="52" fill={`url(#i${u})`} />
        <circle cx="60" cy="60" r="52" fill="none" stroke="#a7ece1" strokeWidth="2.5" />
        <circle cx="60" cy="60" r="43" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" />
        <path d="M60 84V56" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <path className="m-leaf" d="M60 62c-2-14-12-22-24-21 1 13 11 22 24 21z" fill="#fff" />
        <path className="m-leaf" d="M60 56c2-15 13-24 27-23-1 15-12 24-27 23z" fill="#d8f5ef" />
        <path d="M44 86h32" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
      </g>
    </>
  );
}

const SHIELD = 'M60 8 102 22v34c0 28-18 46-42 56C36 102 18 84 18 56V22z';
function Bronze({ u }: { u: string }) {
  return (
    <>
      <defs>
        <Lg id={`b${u}`} stops={[[0, '#f7cfac'], [0.45, '#c07443'], [0.8, '#7a3d1b'], [1, '#a55a2c']]} />
        <Lg id={`b2${u}`} stops={[[0, '#8a4720'], [1, '#5c2a10']]} />
      </defs>
      <path className="m-fill" d={SHIELD} fill={`url(#b${u})`} />
      <path className="m-outline" d={SHIELD} fill="none" stroke="#5c2a10" strokeWidth="2.4" pathLength={1} strokeDasharray="1" />
      <path className="m-bevel" d="M60 17 94 28v28c0 22-14 37-34 45C40 93 26 78 26 56V28z" fill="none" stroke="#fde3cc" strokeOpacity=".55" strokeWidth="1.6" pathLength={1} strokeDasharray="1" />
      <g className="m-sym">
        <polygon points={star(60, 52, 17, 7, 5)} fill={`url(#b2${u})`} />
        <polygon points={star(60, 51, 15, 6, 5)} fill="#f2b98d" opacity=".55" />
        <path d="M40 76l20 10 20-10" fill="none" stroke="#5c2a10" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Sheen u={u} clip={<path d={SHIELD} />} />
    </>
  );
}

function Prata({ u }: { u: string }) {
  const hex = Array.from({ length: 6 }, (_, i) => P(60, 58, 52, -90 + 60 * i));
  const inner = Array.from({ length: 6 }, (_, i) => P(60, 58, 42, -90 + 60 * i));
  return (
    <>
      <defs>
        <Lg id={`p${u}`} stops={[[0, '#ffffff'], [0.4, '#c7d1d8'], [0.75, '#8795a0'], [1, '#b9c4cc']]} />
        <Lg id={`p2${u}`} stops={[[0, '#6b7a86'], [1, '#3f4b55']]} />
      </defs>
      <g>{hex.map((p, i) => <polygon key={i} className="m-wedge" points={pts([[60, 58], p, hex[(i + 1) % 6]!])} fill={`url(#p${u})`} stroke="#c7d1d8" strokeWidth=".4" />)}</g>
      <polygon className="m-outline" points={pts(hex)} fill="none" stroke="#56646f" strokeWidth="2.2" pathLength={1} strokeDasharray="1" />
      <polygon className="m-inner" points={pts(inner)} fill="none" stroke="#fff" strokeWidth="1.6" strokeOpacity=".9" pathLength={1} strokeDasharray="1" />
      <path className="m-chev" d="M42 64l18-12 18 12" fill="none" stroke={`url(#p2${u})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path className="m-chev" d="M42 50l18-12 18 12" fill="none" stroke={`url(#p2${u})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <g className="m-laurel" fill="#6b7a86">
        <path d="M34 84c6-2 10 0 12 4-6 2-10 0-12-4z" /><path d="M40 92c6-1 10 2 11 6-6 1-10-2-11-6z" />
        <path d="M86 84c-6-2-10 0-12 4 6 2 10 0 12-4z" /><path d="M80 92c-6-1-10 2-11 6 6 1 10-2 11-6z" />
      </g>
      <Sheen u={u} clip={<polygon points={pts(hex)} />} />
    </>
  );
}

function Ouro({ u }: { u: string }) {
  return (
    <>
      <defs>
        <Lg id={`o${u}`} stops={[[0, '#fff1b8'], [0.45, '#e5b53a'], [0.8, '#9a6a10'], [1, '#d29c26']]} />
        <Lg id={`o2${u}`} stops={[[0, '#b5821a'], [1, '#7a5208']]} />
      </defs>
      <g>
        {Array.from({ length: 12 }, (_, i) => {
          const a = -90 + 30 * i;
          const [x1, y1] = P(60, 54, 54, a);
          const [x2, y2] = P(60, 54, 66, a);
          return <line key={i} className="m-ray" x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fcd34d" strokeWidth="2.6" strokeLinecap="round" opacity="0" />;
        })}
      </g>
      <g className="m-ribbons"><path d="M42 84 30 114l14-6 8 12 8-30zM78 84l12 30-14-6-8 12-8-30z" fill="#0f7b71" stroke="#0b4a45" strokeWidth="1.5" /></g>
      <g className="m-rosette">
        <polygon points={star(60, 54, 50, 43, 16)} fill={`url(#o${u})`} stroke="#7a5208" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="60" cy="54" r="34" fill={`url(#o2${u})`} />
        <circle cx="60" cy="54" r="34" fill="none" stroke="#fde68a" strokeWidth="1.6" />
      </g>
      <g className="m-crown">
        <path d="M42 64 46 42l9 9 5-13 5 13 9-9 4 22z" fill="#fde68a" stroke="#fff7d6" strokeWidth="1" strokeLinejoin="round" />
        <rect x="42" y="66" width="36" height="5" rx="2" fill="#fde68a" />
        <circle cx="46" cy="42" r="2.4" fill="#fff7d6" /><circle cx="60" cy="37" r="2.4" fill="#fff7d6" /><circle cx="74" cy="42" r="2.4" fill="#fff7d6" />
      </g>
      <Sheen u={u} clip={<circle cx="60" cy="54" r="50" />} />
    </>
  );
}

function Platina({ u }: { u: string }) {
  const o = Array.from({ length: 8 }, (_, i) => P(60, 58, 52, -90 + 22.5 + 45 * i));
  const n = Array.from({ length: 8 }, (_, i) => P(60, 58, 38, -90 + 22.5 + 45 * i));
  const quad = (i: number) => pts([o[i]!, o[(i + 1) % 8]!, n[(i + 1) % 8]!, n[i]!]);
  return (
    <>
      <defs>
        <Lg id={`l${u}`} stops={[[0, '#f8fdff'], [0.45, '#bcd7de'], [0.8, '#6f97a3'], [1, '#a9c9d2']]} />
        <Lg id={`l2${u}`} stops={[[0, '#e8f6fa'], [1, '#7fa6b1']]} />
      </defs>
      <circle className="m-halo" cx="60" cy="58" r="56" fill="none" stroke="#d6ecf2" strokeWidth="2" opacity="0" />
      <g>
        {o.map((_, i) => (
          <g key={i} className="m-facet" data-i={i}>
            <polygon points={quad(i)} fill={`url(#l${u})`} stroke="#3f6671" strokeWidth=".8" />
            <polygon points={quad(i)} fill={i % 2 ? '#ffffff' : '#4f7783'} opacity={i % 2 ? 0.35 : 0.25} />
          </g>
        ))}
      </g>
      <polygon className="m-core" points={pts(n)} fill={`url(#l2${u})`} stroke="#fff" strokeWidth="1.4" />
      <circle className="m-engrave" cx="60" cy="58" r="27" fill="none" stroke="#4f7783" strokeOpacity=".45" strokeWidth="1" />
      <g className="m-star"><polygon points={star(60, 58, 22, 9, 8)} fill="#355d68" /><polygon points={star(60, 58, 12, 5, 8, -67.5)} fill="#e8f6fa" /></g>
      <path className="m-glint" d="M28 30l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill="#fff" opacity="0" />
      <path className="m-glint" d="M92 84l1.4 3.8 3.8 1.4-3.8 1.4-1.4 3.8-1.4-3.8-3.8-1.4 3.8-1.4z" fill="#fff" opacity="0" />
      <Sheen u={u} clip={<polygon points={pts(o)} />} />
    </>
  );
}

const GEM: Record<string, { p: XY[]; fill: string; from: [number, number, number] }> = {
  table: { p: [[46, 30], [74, 30], [68, 46], [52, 46]], fill: '#e9fbff', from: [0, -26, -20] },
  cl: { p: [[34, 46], [46, 30], [52, 46]], fill: '#b9ecfa', from: [-28, -14, -35] },
  cr: { p: [[74, 30], [86, 46], [68, 46]], fill: '#8fd4f5', from: [28, -14, 35] },
  p1: { p: [[34, 46], [52, 46], [60, 88]], fill: '#7fb6f4', from: [-24, 22, 25] },
  p2: { p: [[52, 46], [68, 46], [60, 88]], fill: '#6c7cf0', from: [0, 30, 0] },
  p3: { p: [[68, 46], [86, 46], [60, 88]], fill: '#5446c9', from: [24, 22, -25] },
};
const GEM_OUTLINE: XY[] = [[34, 46], [46, 30], [74, 30], [86, 46], [60, 88]];

function Diamante({ u, rank }: { u: string; rank: number }) {
  const ring = rank === 1 ? '#c7d1d8' : rank === 2 ? '#e9eef1' : '#fde68a';
  const fragN = 8 + 2 * Math.min(rank - 1, 3);
  const nStars = Math.min(rank - 1, 4);
  return (
    <>
      <defs>
        <Lg id={`dr${u}`} stops={[[0, '#1d8f84'], [1, '#0b3b37']]} />
        <Lg id={`dg${u}`} stops={[[0, '#fff7d6'], [1, '#d9a62e']]} />
        <clipPath id={`g${u}`}><polygon points={pts(GEM_OUTLINE)} /></clipPath>
        <linearGradient id={`sh${u}`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <circle className="m-halo" cx="60" cy="58" r="54" fill="none" stroke="#8fe0f5" strokeWidth="2.5" opacity="0" />
      <circle className="m-halo" cx="60" cy="58" r="54" fill="none" stroke="#c4b5fd" strokeWidth="1.5" opacity="0" />
      <g className="m-ring">
        <circle cx="60" cy="58" r="52" fill={`url(#dr${u})`} />
        <circle cx="60" cy="58" r="52" fill="none" stroke={ring} strokeWidth="2.4" />
        <circle cx="60" cy="58" r="44" fill="none" stroke="#8fe0f5" strokeOpacity=".35" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, i) => { const [x, y] = P(60, 58, 50, -90 + 30 * i); return <circle key={i} className="m-notch" cx={x} cy={y} r="1.8" fill={ring} />; })}
      </g>
      {rank >= 3 && <circle className="m-ring2" cx="60" cy="58" r="56.5" fill="none" stroke="#fde68a" strokeWidth="1.2" strokeOpacity=".8" pathLength={1} strokeDasharray="1" />}
      <g transform="translate(0 6)">
        {Object.entries(GEM).map(([k, g]) => (
          <polygon key={k} className="m-gfacet" data-fx={g.from[0]} data-fy={g.from[1]} data-fr={g.from[2]} points={pts(g.p)} fill={g.fill} />
        ))}
        <polygon className="m-goutline" points={pts(GEM_OUTLINE)} fill="none" stroke="#2c2a8a" strokeWidth="1.8" strokeLinejoin="round" />
        <path className="m-glines" d="M34 46h52M46 30l6 16 8-16 8 16 6-16M52 46l8 42 8-42" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1.3" strokeLinejoin="round" />
        <g clipPath={`url(#g${u})`}><rect className="m-shimmer" x="-40" y="20" width="22" height="80" fill={`url(#sh${u})`} transform="skewX(-20)" opacity="0" /></g>
      </g>
      <path className="m-sparkle" d="M86 28l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff" />
      <g>
        {Array.from({ length: fragN }, (_, i) => {
          const a = ((360 * i) / fragN + 10) * (Math.PI / 180);
          const d = 34 + 6 * (i % 3);
          return <path key={i} className="m-frag" data-tx={(Math.cos(a) * d).toFixed(1)} data-ty={(Math.sin(a) * d).toFixed(1)} d="M60 54l2.2 3.2-2.2 3.2-2.2-3.2z" fill={rank >= 3 && i % 2 ? '#fde68a' : '#dff7ff'} opacity="0" />;
        })}
      </g>
      {Array.from({ length: nStars }, (_, i) => {
        const [x, y] = P(60, 58, 50, 200 + (140 / (nStars + 1)) * (i + 1));
        return <g key={i} className="m-rstar"><polygon points={star(x, y, 6.5, 2.8, 4)} fill={`url(#dg${u})`} stroke="#9a6a10" strokeWidth=".6" /></g>;
      })}
      {rank >= 2 && (
        <g className="m-plate">
          <rect x="44" y="98" width="32" height="16" rx="5" fill={`url(#dr${u})`} stroke={ring} strokeWidth="1.4" />
          <text x="60" y="110.5" textAnchor="middle" fontFamily="Manrope Variable, Manrope, system-ui, sans-serif" fontWeight="800" fontSize="11" fill="#fff">{toRoman(rank)}</text>
        </g>
      )}
    </>
  );
}

const BODY: Record<TierId, (p: { u: string; rank: number }) => ReactNode> = {
  inicial: Inicial, bronze: Bronze, prata: Prata, ouro: Ouro, platina: Platina, diamante: Diamante,
};

/** Medalhão da categoria. `decorative` quando o nome já está em texto ao lado. */
export function CategoryMedal({ tier, size = 48, decorative, className }: { tier: Pick<Tier, 'id' | 'name' | 'rank'>; size?: number; decorative?: boolean; className?: string }) {
  const u = useId().replace(/:/g, '');
  const Body = BODY[tier.id];
  return (
    <svg
      className={className}
      data-tier={tier.id}
      data-rank={tier.rank}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      overflow="visible"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `Medalha ${tier.name}` })}
    >
      <Body u={u} rank={tier.rank} />
    </svg>
  );
}
