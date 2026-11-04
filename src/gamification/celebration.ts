import { TIERS, tierKey, type Tier } from './tiers';

/**
 * Comemoração de categoria (0.4): cada categoria/grau é comemorado UMA vez por aparelho.
 * O app guarda (só no aparelho, StorageAdapter.kv) a última categoria comemorada.
 * - Ação local que sobe a categoria → comemora e grava.
 * - Categoria subiu por sincronização (feita em outro aparelho) → comemora uma vez na
 *   próxima visita à Evolução.
 * - Sem registro ainda (primeira abertura da versão nova, recuperação da nuvem, backup
 *   importado) → grava a categoria atual em silêncio: nada de comemorar o que já existia.
 * Não altera XP, níveis nem recompensas.
 */
export const CELEBRATION_KEY = 'celebration:v1';

export interface CelebrationRecord {
  /** tierKey ("ouro:1", "diamante:3") da última categoria comemorada neste aparelho. */
  tier: string;
}

const ORDER = TIERS.map((t) => t.id) as string[];

/** Posição comparável de uma chave "categoria:grau" (-1 se inválida). */
export function tierRankValue(key: string | undefined | null): number {
  if (!key) return -1;
  const [id, rank] = key.split(':');
  const i = ORDER.indexOf(id ?? '');
  const r = Number(rank);
  if (i < 0 || !Number.isInteger(r) || r < 1) return -1;
  return i * 10_000 + r;
}

export function readCelebration(v: unknown): CelebrationRecord | null {
  if (typeof v !== 'object' || v === null) return null;
  const tier = (v as { tier?: unknown }).tier;
  return typeof tier === 'string' && tierRankValue(tier) >= 0 ? { tier } : null;
}

/** A categoria atual ainda não foi comemorada neste aparelho? */
export function isCelebrationDue(current: Tier, stored: CelebrationRecord | null): boolean {
  if (!stored) return false; // sem registro: grava em silêncio (ver acima)
  return tierRankValue(tierKey(current)) > tierRankValue(stored.tier);
}

/** Valor a gravar: nunca volta para trás (excluir registros não "descomemora"). */
export function nextCelebration(current: Tier, stored: CelebrationRecord | null): CelebrationRecord {
  const key = tierKey(current);
  return stored && tierRankValue(stored.tier) >= tierRankValue(key) ? stored : { tier: key };
}
