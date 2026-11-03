import type { SealAward } from '../domain/types';
import { mergeAward } from '../gamification/seals';
import type { MetaData } from './types';
import { FINANCIAL_COLLECTIONS, type Entity, type SyncCollection } from './types';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface MergeOutcome {
  value: Entity;
  /** Campos alterados nos dois lados com valores diferentes. */
  conflictFields: string[];
}

/**
 * Mesclagem em 3 vias, campo a campo:
 * - campo alterado só de um lado → vence essa alteração;
 * - alterado nos dois lados com o mesmo valor → sem conflito;
 * - alterado nos dois lados com valores diferentes → conflito, resolvido
 *   conforme a política da coleção.
 * Sem base (primeira associação), toda diferença é tratada como conflito.
 */
export function merge3(base: Entity | null, local: Entity, remote: Entity, prefer: 'local' | 'remote'): MergeOutcome {
  const fields = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const value: Entity = { ...local };
  const conflictFields: string[] = [];
  for (const f of fields) {
    if (f === 'updatedAt') continue;
    const l = local[f];
    const r = remote[f];
    if (same(l, r)) continue;
    const b = base?.[f];
    if (base && same(l, b)) value[f] = r;
    else if (base && same(r, b)) value[f] = l;
    else {
      conflictFields.push(f);
      value[f] = prefer === 'local' ? l : r;
    }
  }
  const lu = typeof local.updatedAt === 'string' ? local.updatedAt : '';
  const ru = typeof remote.updatedAt === 'string' ? remote.updatedAt : '';
  if (lu || ru) value.updatedAt = lu > ru ? lu : ru;
  return { value, conflictFields };
}

/**
 * Políticas por coleção:
 * - financeiros (serviços, lançamentos): conflito mantém o valor local e é
 *   registrado para o usuário decidir (nunca "última gravação vence");
 * - clientes: conflito resolvido pela alteração mais recente (não financeiro);
 * - conquistas: mantém a data de desbloqueio mais antiga;
 * - eventos de XP: imutáveis;
 * - selos (0.4): "só cresce" — maior estágio e, por estágio, a data mais antiga;
 * - foto de perfil (0.4): o registro inteiro mais recente vence (nunca mistura
 *   campos de duas imagens).
 */
export function mergeRecord(collection: SyncCollection, base: Entity | null, local: Entity, remote: Entity): MergeOutcome & { needsUser: boolean } {
  if (collection === 'achievements') {
    const lu = String(local.unlockedAt ?? '');
    const ru = String(remote.unlockedAt ?? '');
    return { value: lu && (!ru || lu < ru) ? local : remote, conflictFields: [], needsUser: false };
  }
  if (collection === 'xpEvents') return { value: remote, conflictFields: [], needsUser: false };
  if (collection === 'sealAwards') {
    return { value: mergeAward(local as unknown as SealAward, remote as unknown as SealAward) as unknown as Entity, conflictFields: [], needsUser: false };
  }
  if (collection === 'profileImages') {
    const lu = String(local.updatedAt ?? '');
    const ru = String(remote.updatedAt ?? '');
    // Empate: o conteúdo (hash) decide, para que todos os aparelhos escolham a mesma imagem.
    const pickLocal = lu > ru || (lu === ru && String(local.hash ?? '') > String(remote.hash ?? ''));
    return { value: pickLocal ? local : remote, conflictFields: [], needsUser: false };
  }
  if (FINANCIAL_COLLECTIONS.includes(collection)) {
    const r = merge3(base, local, remote, 'local');
    if (collection === 'appointments') resolveCompletionFields(r, local, remote);
    return { ...r, needsUser: r.conflictFields.length > 0 };
  }
  const newerLocal = String(local.updatedAt ?? '') >= String(remote.updatedAt ?? '');
  return { ...merge3(base, local, remote, newerLocal ? 'local' : 'remote'), needsUser: false };
}

/**
 * Serviço concluído em dois aparelhos: data de conclusão e receita vinculada
 * são resolvidas de forma determinística (iguais em todos os aparelhos), sem
 * pedir decisão ao usuário. A receita duplicada é removida depois por
 * `duplicateAutoIncomeIds`, que mantém a mais antiga.
 */
function resolveCompletionFields(r: MergeOutcome, local: Entity, remote: Entity) {
  const pick = (a: unknown, b: unknown) => (a && b ? (String(a) < String(b) ? a : b) : (a ?? b ?? null));
  for (const f of ['completedAt', 'transactionId'] as const) {
    if (!r.conflictFields.includes(f)) continue;
    r.value[f] = pick(local[f], remote[f]);
    r.conflictFields = r.conflictFields.filter((x) => x !== f);
  }
}

/**
 * Receitas automáticas duplicadas: o mesmo serviço concluído offline em dois
 * aparelhos gera duas receitas com o mesmo `appointmentId`. Mantém a mais
 * antiga (desempate pelo id) — todos os aparelhos chegam ao mesmo resultado.
 */
export function duplicateAutoIncomeIds(transactions: { id: string; type?: unknown; appointmentId?: unknown; createdAt?: unknown }[]): { remove: string[]; keepByAppointment: Map<string, string> } {
  const groups = new Map<string, { id: string; createdAt: string }[]>();
  for (const t of transactions) {
    if (t.type !== 'receita' || typeof t.appointmentId !== 'string' || !t.appointmentId) continue;
    const g = groups.get(t.appointmentId) ?? [];
    g.push({ id: t.id, createdAt: String(t.createdAt ?? '') });
    groups.set(t.appointmentId, g);
  }
  const remove: string[] = [];
  const keepByAppointment = new Map<string, string>();
  for (const [apptId, g] of groups) {
    g.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
    keepByAppointment.set(apptId, g[0]!.id);
    remove.push(...g.slice(1).map((x) => x.id));
  }
  return { remove, keepByAppointment };
}

/** Perfil/preferências: mesclagem por campo; em conflito, prevalece a nuvem (perfil canônico da conta). */
export function mergeMeta(base: MetaData | null, local: MetaData, remote: MetaData): MetaData {
  const profile =
    local.profile && remote.profile
      ? (merge3((base?.profile ?? null) as Entity | null, local.profile as unknown as Entity, remote.profile as unknown as Entity, 'remote').value as unknown as MetaData['profile'])
      : (remote.profile ?? local.profile);
  const settings = merge3(base?.settings as unknown as Entity | null, local.settings as unknown as Entity, remote.settings as unknown as Entity, 'remote').value as unknown as MetaData['settings'];
  return { profile, settings };
}

/**
 * Eventos de XP têm chave única por ação. Se dois aparelhos concederam a mesma
 * chave offline, mantém-se o evento mais antigo (desempate pelo id): todos os
 * aparelhos chegam ao mesmo resultado, sem XP em dobro.
 */
export function duplicateXpIds(events: { id: string; key: string; createdAt: string }[]): string[] {
  const keep = new Map<string, { id: string; createdAt: string }>();
  for (const e of events) {
    const k = keep.get(e.key);
    if (!k || e.createdAt < k.createdAt || (e.createdAt === k.createdAt && e.id < k.id)) keep.set(e.key, e);
  }
  const kept = new Set([...keep.values()].map((e) => e.id));
  return events.filter((e) => !kept.has(e.id)).map((e) => e.id);
}
