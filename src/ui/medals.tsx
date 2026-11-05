import { useId, type ReactNode } from 'react';
import type { SealId } from '../domain/types';
import type { AchievementDef } from '../gamification/achievements';

/**
 * Desenhos das conquistas e dos selos (identidade aprovada na beta.5): traço único, cantos e
 * pontas arredondados, grade de 24. Só aqui; o restante da iconografia da 0.4 (navegação, receita,
 * despesa, ações) continua com os ícones de sempre.
 */
const GLYPHS = {
  flag: <><path d="M6.5 21V4" /><path d="M6.5 4.5h10.5l-2.4 3.7 2.4 3.8H6.5" /></>,
  star: <path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.6l-5 2.6.9-5.6-4-3.9 5.6-.8z" />,
  trophy: <><path d="M8 4h8v4.8a4 4 0 0 1-8 0z" /><path d="M8 6H5.6a2.6 2.6 0 0 0 2.8 3.9" /><path d="M16 6h2.4a2.6 2.6 0 0 1-2.8 3.9" /><path d="M12 12.8V16" /><path d="M9 20h6l-.8-4H9.8z" /></>,
  people2: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><circle cx="16.8" cy="9" r="2.4" /><path d="M15.6 14.3a4.4 4.4 0 0 1 5.4 4.3" /></>,
  people3: <><circle cx="12" cy="7.5" r="2.9" /><path d="M6.8 19.5a5.2 5.2 0 0 1 10.4 0" /><circle cx="5.2" cy="10.2" r="2" /><circle cx="18.8" cy="10.2" r="2" /><path d="M2 18a3.4 3.4 0 0 1 4-3.3" /><path d="M22 18a3.4 3.4 0 0 0-4-3.3" /></>,
  heart: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /><path d="M9.4 11.6l1.8 1.8 3.4-3.5" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M14.4 9.4h-3.1a1.5 1.5 0 0 0 0 3h1.4a1.5 1.5 0 0 1 0 3H9.6" /><path d="M12 7.8v1.6M12 15.4V17" /></>,
  coins: <><ellipse cx="12" cy="6.5" rx="7" ry="2.5" /><path d="M5 6.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" /><path d="M5 11.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" /></>,
  up: <><path d="M4 17.5l5-5 3.5 3.5L19.5 9" /><path d="M14.5 9h5v5" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /><path d="M9 15l2 2 4-4" /></>,
  wrench: <path d="M14.6 4.8a4.2 4.2 0 0 0-5 5.3L4.3 15.4a1.9 1.9 0 0 0 0 2.7l1.6 1.6a1.9 1.9 0 0 0 2.7 0l5.3-5.3a4.2 4.2 0 0 0 5.3-5l-2.6 2.6-2.4-.5-.5-2.4z" />,
  pulse: <path d="M3 12.5h4l2-5 3.5 9 2.4-6.5H21" />,
} satisfies Record<string, ReactNode>;
type Glyph = keyof typeof GLYPHS;

/** Desenho de cada conquista (por id); conquistas futuras usam o desenho do tipo de ícone. */
const ACHIEVEMENT_GLYPH: Record<string, Glyph> = {
  primeira_conclusao: 'flag', dez_conclusoes: 'star', cinquenta_conclusoes: 'trophy',
  carteira_10: 'people2', carteira_30: 'people3', cliente_fiel: 'heart',
  mil_no_mes: 'coin', cinco_mil_no_mes: 'coins', mes_no_azul: 'up', meta_mensal: 'target', constancia: 'calendar',
};
const BY_ICON: Record<AchievementDef['icon'], Glyph> = { trophy: 'trophy', users: 'people2', star: 'star', wallet: 'coin', target: 'target', heart: 'heart', flag: 'flag', rocket: 'up' };
export const achievementGlyph = (a: Pick<AchievementDef, 'id' | 'icon'>): Glyph => ACHIEVEMENT_GLYPH[a.id] ?? BY_ICON[a.icon];

export const SEAL_GLYPH: Record<SealId, Glyph> = {
  constancia: 'calendar', fidelizacao: 'heart', metas: 'target', experiencia: 'wrench', carteira: 'people3', saude: 'pulse',
};

/**
 * Medalha redonda da conquista. Desbloqueada: dourada (cores de XP). Bloqueada: o mesmo desenho
 * apagado, contorno tracejado e cadeado pequeno. Decorativa: o nome e o estado vêm no texto ao lado.
 */
export function AchievementMedal({ achievement, unlocked, size = 48 }: { achievement: Pick<AchievementDef, 'id' | 'icon'>; unlocked: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" data-achievement={achievement.id} data-unlocked={unlocked} className="block shrink-0">
      <circle cx="24" cy="24" r="21.5" strokeWidth="1.5" strokeDasharray={unlocked ? undefined : '3 2.4'}
        className={unlocked ? 'fill-xp-100 stroke-xp-400 dark:fill-xp-500/15 dark:stroke-xp-600' : 'fill-surface-2 stroke-line'} />
      {unlocked && <circle cx="24" cy="24" r="17.5" fill="none" strokeWidth="1" className="stroke-xp-400/40 dark:stroke-xp-600/50" />}
      <g transform="translate(12 12)" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
        className={unlocked ? 'stroke-xp-700 text-xp-700 dark:stroke-xp-400 dark:text-xp-400' : 'stroke-muted text-muted opacity-75'}>
        {GLYPHS[achievementGlyph(achievement)]}
      </g>
      {!unlocked && (
        <g transform="translate(34 34)">
          <circle cx="5.5" cy="5.5" r="6.5" className="fill-surface" />
          <rect x="2.5" y="5" width="6" height="4.6" rx="1" className="fill-muted" />
          <path d="M3.8 5V3.8a1.7 1.7 0 0 1 3.4 0V5" fill="none" strokeWidth="1.2" className="stroke-muted" />
        </g>
      )}
    </svg>
  );
}

/** Hexágono de cantos arredondados (área 64). */
function hexPath(r: number, round: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return [32 + r * Math.cos(a), 32 + r * Math.sin(a)] as const; });
  const k = round / r;
  return pts.map((p, i) => {
    const prev = pts[(i + 5) % 6]!, next = pts[(i + 1) % 6]!;
    const a = [p[0] + (prev[0] - p[0]) * k, p[1] + (prev[1] - p[1]) * k];
    const b = [p[0] + (next[0] - p[0]) * k, p[1] + (next[1] - p[1]) * k];
    return `${i ? 'L' : 'M'}${a[0]!.toFixed(2)} ${a[1]!.toFixed(2)}Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${b[0]!.toFixed(2)} ${b[1]!.toFixed(2)}`;
  }).join('') + 'Z';
}
const OUTER = hexPath(28.5, 5);
const INNER = hexPath(23.5, 4);
const FRAME = hexPath(31.5, 6);

/**
 * Medalhão hexagonal do selo (verde-petróleo fixo). O estágio aparece de três formas ao mesmo
 * tempo, para continuar claro em 32 px: quatro pontos na base (acesos = estágio), aro interno a
 * partir do II e aro e pontos dourados no IV. Bloqueado: cinza, tracejado, sem pontos.
 * Com `label`, é lido pelo TalkBack (ex.: "Selo Experiência, estágio III de IV"); sem, é decorativo.
 */
export function SealMedal({ id, stage, size = 56, framed, label }: { id: SealId; stage: number; size?: number; framed?: boolean; label?: string }) {
  const u = useId().replace(/:/g, '');
  const locked = stage <= 0;
  const gold = stage >= 4;
  // Em tamanhos pequenos o desenho encolhe e os pontos crescem: a contagem continua legível.
  const small = size <= 40;
  const dotR = small ? 3.3 : 2.4;
  const dotY = small ? 49.6 : 50;
  const gap = small ? 8.6 : 7.4;
  const glyph = small ? 'translate(18.4 11.4) scale(1.13)' : 'translate(16 12) scale(1.333)';
  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64" className="block shrink-0" data-seal={id} data-stage={stage}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <defs>
        <linearGradient id={`sg${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1aa694" /><stop offset=".6" stopColor="#0f7b71" /><stop offset="1" stopColor="#0d4f4a" /></linearGradient>
        <linearGradient id={`sd${u}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset=".5" stopColor="#e0b23a" /><stop offset="1" stopColor="#9a6a10" /></linearGradient>
      </defs>
      {framed && <path d={FRAME} className="fill-surface" />}
      <path d={OUTER} fill={locked ? undefined : `url(#sg${u})`} className={locked ? 'fill-surface-2 stroke-line' : undefined}
        stroke={locked ? undefined : gold ? `url(#sd${u})` : '#0b5650'} strokeWidth={gold ? 3 : 1.8} strokeDasharray={locked ? '3.5 2.6' : undefined} />
      {stage >= 2 && <path d={INNER} fill="none" stroke={gold ? '#fde68a' : '#fff'} strokeOpacity={gold ? 0.7 : stage >= 3 ? 0.55 : 0.35} strokeWidth="1.2" />}
      <g transform={glyph} fill="none" strokeWidth={small ? 2 : 1.55} strokeLinecap="round" strokeLinejoin="round"
        className={locked ? 'stroke-muted text-muted opacity-70' : 'stroke-white text-white'}>
        {GLYPHS[SEAL_GLYPH[id]]}
      </g>
      {!locked && [0, 1, 2, 3].map((i) => (
        <circle key={i} cx={32 + (i - 1.5) * gap} cy={dotY} r={dotR} data-pip={i < stage ? 'on' : 'off'}
          fill={i < stage ? (gold ? '#fde68a' : '#fff') : 'rgb(255 255 255 / 0.25)'} />
      ))}
    </svg>
  );
}
