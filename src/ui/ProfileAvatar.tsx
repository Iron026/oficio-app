import { useEffect, useId, useRef, useState } from 'react';
import { avatarOf } from '../domain/preferences';
import { profileImageUrl } from '../domain/profileImage';
import type { AppData, SealId } from '../domain/types';
import { ROMAN, getSeal } from '../gamification/seals';
import { tierKey, type Tier, type TierId } from '../gamification/tiers';
import { initials } from './Avatar';
import { getInternalAvatar } from './avatarCatalog';
import { cx } from './cx';
import { SealMedal } from './SealMedal';
import { CategoryMedal } from './CategoryMedal';

/** Cores das molduras (metal); o símbolo e o nome identificam a categoria sem depender da cor. */
export const TIER_COLORS: Record<TierId, { c1: string; c2: string; c3: string; chipBg: string; chipFg: string }> = {
  inicial: { c1: '#8fe3d6', c2: '#15998a', c3: '#0d4f4a', chipBg: '#dff4f0', chipFg: '#0b3b37' },
  bronze: { c1: '#f6c7a3', c2: '#b8693a', c3: '#6f3717', chipBg: '#f8e1d1', chipFg: '#4a2410' },
  prata: { c1: '#f4f7f9', c2: '#aeb9c1', c3: '#6c7a83', chipBg: '#e9eef1', chipFg: '#2b363d' },
  ouro: { c1: '#fdeaa7', c2: '#d9a62e', c3: '#8a5b0b', chipBg: '#fbefc4', chipFg: '#4a3006' },
  platina: { c1: '#eef8fa', c2: '#9cc3cc', c3: '#4f7783', chipBg: '#e2f0f3', chipFg: '#1e3a42' },
  diamante: { c1: '#e9fbff', c2: '#84d3f2', c3: '#7466e8', chipBg: '#e4edff', chipFg: '#23246b' },
};

/** Símbolo textual da categoria (usado no selo de categoria). */
export function tierGlyph(t: Tier): string {
  if (t.symbol === 'circulo') return '○';
  if (t.symbol === 'gema') return '◈';
  return '◆'.repeat(t.symbol);
}

export function TierChip({ tier, onHero, className }: { tier: Tier; onHero?: boolean; className?: string }) {
  const c = TIER_COLORS[tier.id];
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-0.5 pl-2 pr-2.5 font-display text-xs font-bold', !onHero && 'dark:!bg-[color-mix(in_srgb,var(--c2)_26%,#131f23)] dark:!text-[var(--c1)]', className)}
      style={{ '--c1': c.c1, '--c2': c.c2, background: onHero ? `color-mix(in srgb, ${c.c2} 30%, rgb(255 255 255 / .08))` : c.chipBg, color: onHero ? '#fff' : c.chipFg, borderColor: `color-mix(in srgb, ${c.c2} 60%, transparent)` } as React.CSSProperties}
    >
      <CategoryMedal tier={tier} size={18} decorative className="-my-1 -ml-1 shrink-0" />
      {tier.name}
    </span>
  );
}

function Frame({ tier, gap }: { tier: Tier; gap: string }) {
  const id = useId().replace(/:/g, '');
  const { c1, c2, c3 } = TIER_COLORS[tier.id];
  const ring = (w: number) => <circle cx="50" cy="50" r="46.5" fill="none" stroke={`url(#${id})`} strokeWidth={w} />;
  const finish = {
    inicial: <circle cx="50" cy="50" r="47" fill="none" stroke={`url(#${id})`} strokeWidth="5" />,
    bronze: <>{ring(6)}<circle cx="50" cy="50" r="43.2" fill="none" stroke={c3} strokeOpacity=".35" strokeWidth=".8" /></>,
    prata: <>{ring(6)}<circle cx="50" cy="50" r="49.2" fill="none" stroke={c2} strokeWidth="1" /><circle cx="50" cy="50" r="43.2" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth=".9" /></>,
    ouro: <>{ring(6.5)}<circle cx="50" cy="50" r="49.3" fill="none" stroke={c2} strokeWidth="1.2" strokeDasharray="1.6 2.2" /><circle cx="50" cy="50" r="43" fill="none" stroke={c3} strokeOpacity=".5" strokeWidth=".9" /></>,
    platina: (
      <>
        {ring(6.5)}
        <circle cx="50" cy="50" r="49.4" fill="none" stroke={c3} strokeWidth="1" />
        <circle cx="50" cy="50" r="43" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1" />
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return <line key={i} x1={50 + 44.4 * Math.cos(a)} y1={50 + 44.4 * Math.sin(a)} x2={50 + 48.6 * Math.cos(a)} y2={50 + 48.6 * Math.sin(a)} stroke="#fff" strokeOpacity=".55" strokeWidth=".7" />;
        })}
      </>
    ),
    diamante: (
      <>
        {ring(7)}
        {Array.from({ length: 12 }, (_, i) => {
          const a1 = (i / 12) * Math.PI * 2;
          const a2 = ((i + 0.5) / 12) * Math.PI * 2;
          return <path key={i} d={`M${50 + 43 * Math.cos(a1)} ${50 + 43 * Math.sin(a1)} L${50 + 50 * Math.cos(a2)} ${50 + 50 * Math.sin(a2)}`} stroke="#fff" strokeOpacity=".55" strokeWidth=".8" />;
        })}
        <circle cx="50" cy="50" r="49.6" fill="none" stroke={c3} strokeWidth="1" />
      </>
    ),
  }[tier.id];
  const diamond = (x: number, k: number) => <path key={k} d={`M${x} 1.2l3.2 4.3-3.2 4.3-3.2-4.3z`} fill={c1} stroke={c3} strokeWidth=".9" />;
  let ornament: React.ReactNode;
  if (tier.symbol === 'circulo') ornament = <circle cx="50" cy="4" r="3.6" fill={c2} stroke={gap} strokeWidth="1.4" />;
  else if (tier.symbol === 'gema') ornament = (
    <g>
      {/* Graus do Diamante (R3): um losango pequeno de cada lado por grau acima do I (até 3). */}
      {Array.from({ length: Math.min(3, tier.rank - 1) }, (_, i) => (
        <g key={i}>
          <path d={`M${37 - i * 6.5} 6.6l2.6 3-2.6 3-2.6-3z`} fill={c1} stroke={c3} strokeWidth=".8" />
          <path d={`M${63 + i * 6.5} 6.6l2.6 3-2.6 3-2.6-3z`} fill={c1} stroke={c3} strokeWidth=".8" />
        </g>
      ))}
      <path d="M44 3h12l3.5 3.6L50 15.5 40.5 6.6z" fill={`url(#${id}g)`} stroke={c3} strokeWidth=".9" />
      <path d="M40.5 6.6h19M47 3l3 3.6L53 3M50 6.6v8.9" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth=".7" />
    </g>
  );
  else {
    const n = tier.symbol;
    const start = 50 - ((n - 1) * 7.2) / 2;
    ornament = <g>{Array.from({ length: n }, (_, i) => diamond(start + i * 7.2, i))}</g>;
  }
  return (
    <svg className="frame absolute inset-0 h-full w-full" viewBox="-2 -2 104 104" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} /><stop offset=".45" stopColor={c2} /><stop offset=".75" stopColor={c3} /><stop offset="1" stopColor={c2} />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor={c2} /><stop offset="1" stopColor={c3} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="43" fill="none" stroke={gap} strokeWidth="2.2" />
      {finish}
      <g className="orn">{ornament}</g>
    </svg>
  );
}

/** Imagem do perfil (foto, avatar do Ofício ou iniciais) — sem moldura. */
export function ProfileImageView({ data }: { data: Pick<AppData, 'settings' | 'profileImages' | 'profile'> }) {
  const choice = avatarOf(data.settings);
  const photo = data.profileImages[0];
  if (choice.kind === 'foto' && photo) return <img src={profileImageUrl(photo)} alt="" className="h-full w-full object-cover" decoding="async" />;
  const internal = choice.kind === 'interno' ? getInternalAvatar(choice.id) : undefined;
  if (internal) return <img src={internal.src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />;
  return (
    <span className="flex h-full w-full items-center justify-center bg-brand-100 font-display font-extrabold text-brand-800 [font-size:clamp(0.75rem,36cqw,3rem)] dark:bg-brand-500/25 dark:text-brand-50">
      {initials(data.profile?.name ?? '') || '?'}
    </span>
  );
}

function describe(data: Pick<AppData, 'settings' | 'profileImages'>): string {
  const choice = avatarOf(data.settings);
  if (choice.kind === 'foto' && data.profileImages[0]) return 'foto';
  // Id desconhecido (ex.: de uma versão mais nova): a imagem cai para as iniciais, e o nome também.
  const internal = choice.kind === 'interno' ? getInternalAvatar(choice.id) : undefined;
  if (internal) return `avatar ${internal.name.toLowerCase()}`;
  return 'iniciais';
}

/**
 * Avatar do perfil com a moldura da categoria e, opcionalmente, o selo em destaque.
 * A moldura muda com uma animação curta quando a categoria muda (uma vez).
 */
export function ProfileAvatar({ data, tier, size, seal, onHero, className }: {
  data: Pick<AppData, 'settings' | 'profileImages' | 'profile'>;
  tier: Tier;
  size: number;
  seal?: { id: SealId; stage: number } | null;
  onHero?: boolean;
  className?: string;
}) {
  const key = tierKey(tier);
  const prev = useRef(key);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (prev.current !== key) {
      prev.current = key;
      setChanged(true);
      const t = setTimeout(() => setChanged(false), 900);
      return () => clearTimeout(t);
    }
  }, [key]);
  const def = seal ? getSeal(seal.id) : undefined;
  const label = `Imagem de perfil de ${data.profile?.name ?? 'você'} (${describe(data)}), moldura ${tier.name}${def && seal ? `, selo ${def.name} estágio ${ROMAN[seal.stage]} de IV` : ''}`;
  const gap = onHero ? 'var(--hero-1)' : 'var(--surface)';
  return (
    <span role="img" aria-label={label} className={cx('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      {changed && <span aria-hidden="true" className="absolute -inset-[6%] animate-halo rounded-full border-[3px]" style={{ borderColor: TIER_COLORS[tier.id].c2 }} />}
      <span className="absolute overflow-hidden rounded-full bg-surface-2 [container-type:inline-size]" style={{ inset: size * 0.115 }}>
        <ProfileImageView data={data} />
      </span>
      <span className={cx('absolute inset-0', changed && 'animate-frame')}>
        <Frame tier={tier} gap={gap} />
      </span>
      {def && seal && seal.stage > 0 && (
        <span className="absolute -bottom-[2%] -right-[2%] drop-shadow-[0_2px_3px_rgb(0_0_0/0.3)]" style={{ width: size * 0.36, height: size * 0.36 }}>
          <SealMedal id={seal.id} stage={seal.stage} size={size * 0.36} framed />
        </span>
      )}
    </span>
  );
}
