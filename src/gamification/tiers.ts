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
  /** Nome exibido ("Prata", "Diamante III"). */
  name: string;
  /** Primeiro nível da faixa (= nível mínimo do título correspondente; no Diamante, do grau). */
  minLevel: number;
  title: string;
  symbol: TierSymbol;
  /** Grau do Diamante (R3, 0.4): II no nível 21, III no 26… Nas outras categorias é sempre 1. */
  rank: number;
}

/** R3: depois do nível 16, um novo grau de Diamante a cada 5 níveis. Só visual: XP e recompensas não mudam. */
export const DIAMOND_START = 16;
export const DIAMOND_STEP = 5;

export function toRoman(n: number): string {
  const table: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let v = Math.max(1, Math.floor(n));
  for (const [k, r] of table) while (v >= k) { out += r; v -= k; }
  return out;
}

function diamondRank(rank: number): Tier {
  const base = TIERS[TIERS.length - 1]!;
  return { ...base, rank, minLevel: DIAMOND_START + (rank - 1) * DIAMOND_STEP, name: rank > 1 ? `${base.name} ${toRoman(rank)}` : base.name };
}

/** Identifica categoria + grau (para detectar mudança de moldura). */
export const tierKey = (t: Tier) => `${t.id}:${t.rank}`;

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
  return { id, minLevel, title, rank: 1, ...META[id] };
});

export function tierForLevel(level: number): Tier {
  let tier = TIERS[0]!;
  for (const t of TIERS) if (level >= t.minLevel) tier = t;
  if (tier.id === 'diamante') return diamondRank(1 + Math.floor((level - DIAMOND_START) / DIAMOND_STEP));
  return tier;
}

/** Próxima categoria (ou próximo grau de Diamante) e quanto XP falta para ela. */
export function nextTier(level: number, totalXp: number): { tier: Tier; xpNeeded: number } {
  const current = tierForLevel(level);
  const next = current.id === 'diamante' ? diamondRank(current.rank + 1) : TIERS.find((t) => t.minLevel > level)!;
  return { tier: next, xpNeeded: Math.max(0, totalXpForLevel(next.minLevel) - Math.floor(totalXp)) };
}

/** Texto acessível: "Prata, 2 de 6 categorias" / "Diamante II, 6 de 6 categorias". */
export function tierLabel(t: Tier): string {
  return `${t.name}, ${ORDER.indexOf(t.id) + 1} de ${ORDER.length} categorias`;
}
