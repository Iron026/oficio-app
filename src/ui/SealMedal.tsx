import { Briefcase, CalendarCheck, HeartHandshake, Lock, Target, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { SealId } from '../domain/types';

/** Ícone próprio de cada selo. */
export const SEAL_ICONS: Record<SealId, LucideIcon> = {
  constancia: CalendarCheck,
  fidelizacao: HeartHandshake,
  metas: Target,
  experiencia: Briefcase,
  carteira: Users,
  saude: TrendingUp,
};

/**
 * Medalhão hexagonal do selo (verde-petróleo da marca, fixo). O estágio aparece no
 * acabamento: I aro simples · II aro duplo · III marcas · IV filete dourado.
 * Bloqueado: cinza, contorno tracejado e cadeado.
 */
export function SealMedal({ id, stage, size = 56, framed }: { id: SealId; stage: number; size?: number; framed?: boolean }) {
  const Icon = SEAL_ICONS[id];
  const locked = stage <= 0;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="block">
      <defs>
        <linearGradient id={`seal-g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2cb9a6" /><stop offset=".55" stopColor="#0f7b71" /><stop offset="1" stopColor="#0d4f4a" />
        </linearGradient>
        <linearGradient id="seal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" /><stop offset=".5" stopColor="#e0b23a" /><stop offset="1" stopColor="#9a6a10" />
        </linearGradient>
      </defs>
      {framed && <path d="M32 2 58 17v30L32 62 6 47V17z" fill="var(--surface)" />}
      <path d="M32 6 54.5 19v26L32 58 9.5 45V19z" className={locked ? 'fill-surface-2' : undefined} fill={locked ? undefined : `url(#seal-g-${id})`} />
      {locked && <path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="none" className="stroke-line" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />}
      {!locked && <path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="none" stroke={stage >= 4 ? 'url(#seal-gold)' : '#0f625b'} strokeWidth={stage >= 4 ? 3.2 : 2.4} strokeLinejoin="round" />}
      {stage >= 2 && <path d="M32 11.5 49.5 21.5v21L32 52.5 14.5 42.5v-21z" fill="none" stroke="rgb(255 255 255 / .55)" strokeWidth="1.4" strokeLinejoin="round" />}
      {stage >= 3 && (
        <g fill={stage >= 4 ? '#fde68a' : 'rgb(255 255 255 / .85)'}>
          <circle cx="32" cy="12.5" r="1.7" /><circle cx="49" cy="22" r="1.7" /><circle cx="15" cy="22" r="1.7" />
        </g>
      )}
      <foreignObject x="20" y="20" width="24" height="24">
        <Icon size={24} strokeWidth={2.2} className={locked ? 'text-muted' : 'text-white'} aria-hidden="true" />
      </foreignObject>
      {locked && (
        <g transform="translate(40 40)">
          <circle cx="9" cy="9" r="9" className="fill-surface" />
          <foreignObject x="3" y="3" width="12" height="12"><Lock size={12} className="text-muted" aria-hidden="true" /></foreignObject>
        </g>
      )}
    </svg>
  );
}

/** Losangos de estágio (I a IV) — redundantes com o algarismo romano, para leitura rápida. */
export function StagePips({ stage }: { stage: number }) {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= stage ? 'h-2 w-2 rotate-45 rounded-[2px] bg-brand-600 dark:bg-brand-300' : 'h-2 w-2 rotate-45 rounded-[2px] bg-line'} />
      ))}
    </span>
  );
}
