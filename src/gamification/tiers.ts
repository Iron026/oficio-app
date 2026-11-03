import { LEVEL_TITLES, totalXpForLevel } from './levels';

/**
 * Categorias visuais do perfil (0.4). São DERIVADAS do nível: as faixas são
 * exatamente as dos títulos existentes (levels.ts). Não dão XP, não são gravadas
 * e não alteram a fórmula de níveis.
 */
export type TierId = 'inicial' | 'bronze' | 'prata' | 'ouro' | 'platina' | 'diamante';
/** Símbolo que identifica a categoria sem depender de cor. */
export type TierSymbol = 'circulo' | 1 | 2 | 3 | 4 | 'gema';

export interface Tier {
  id: TierId;
  name: string;
  /** Primeiro nível da faixa (= nível mínimo do título correspondente). */
  minLevel: number;
  title: string;
  symbol: TierSymbol;
}

const META: Record<TierId, { name: string; symbol: TierSymbol }> = {
  inicial: { name: 'Inicial', symbol: 'circulo' },
  bronze: { name: 'Bronze', symbol: 1 },
  prata: { name: 'Prata', symbol: 2 },
  ouro: { name: 'Ouro', symbol: 3 },
  platina: { name: 'Platina', symbol: 4 },
  diamante: { name: 'Diamante', symbol: 'gema' },
};
const ORDER: TierId[] = ['inicial', 'bronze', 'prata', 'ouro', 'platina', 'diamante'];

export const TIERS: Tier[] = LEVEL_TITLES.map(([minLevel, title], i) => {
  const id = ORDER[i];
  if (!id) throw new Error('Há mais títulos do que categorias.');
  return { id, minLevel, title, ...META[id] };
});

export function tierForLevel(level: number): Tier {
  let tier = TIERS[0]!;
  for (const t of TIERS) if (level >= t.minLevel) tier = t;
  return tier;
}

/** Próxima categoria e quanto XP falta para ela (null no Diamante). */
export function nextTier(level: number, totalXp: number): { tier: Tier; xpNeeded: number } | null {
  const next = TIERS.find((t) => t.minLevel > level);
  if (!next) return null;
  return { tier: next, xpNeeded: Math.max(0, totalXpForLevel(next.minLevel) - Math.floor(totalXp)) };
}

/** Texto acessível: "Prata, 2 de 6 categorias". */
export function tierLabel(t: Tier): string {
  return `${t.name}, ${ORDER.indexOf(t.id) + 1} de ${ORDER.length} categorias`;
}
