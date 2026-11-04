import type { ServiceType } from './types';

/** Limites dos tipos de serviço personalizados. */
export const MAX_SERVICE_TYPES = 100;
export const MAX_SERVICE_NAME = 60;
export const MAX_SERVICE_PRICE = 100_000_000; // R$ 1.000.000,00 (mesmo limite dos valores)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Registro válido (backup, nuvem): campos e limites conferidos; nada a mais é aceito. */
export function isValidServiceType(v: unknown): v is ServiceType {
  if (!isObj(v)) return false;
  const keys = Object.keys(v);
  const allowed = ['id', 'name', 'price', 'pinned', 'order', 'createdAt', 'updatedAt'];
  return keys.every((k) => allowed.includes(k))
    && typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 128
    && typeof v.name === 'string' && v.name.trim().length > 0 && v.name.length <= MAX_SERVICE_NAME
    && (v.price === null || (Number.isInteger(v.price) && (v.price as number) > 0 && (v.price as number) <= MAX_SERVICE_PRICE))
    && typeof v.pinned === 'boolean'
    && Number.isInteger(v.order) && (v.order as number) >= 0 && (v.order as number) <= 100_000
    && typeof v.createdAt === 'string' && typeof v.updatedAt === 'string';
}

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/** Nome comparável: sem acentos, maiúsculas nem espaços extras ("Hora  de Trabalho" = "hora de trabalho"). */
export const serviceNameKey = (name: string) => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');

/** Ordem de exibição: fixados primeiro; depois a ordem manual; empate pelo nome. */
export function sortServiceTypes(types: readonly ServiceType[]): ServiceType[] {
  return [...types].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Próximo número de ordem (fim da lista). */
export const nextServiceOrder = (types: readonly ServiceType[]) => types.reduce((m, t) => Math.max(m, t.order + 1), 0);

export interface ServiceChoice {
  name: string;
  price: number | null;
  /** Tipo da pessoa (editável) ou sugestão da profissão. */
  source: 'proprio' | 'sugestao';
  pinned: boolean;
}

/**
 * Atalhos do agendamento: os tipos da pessoa (fixados primeiro) e, depois, as sugestões
 * da profissão que ainda não têm um tipo com o mesmo nome.
 */
export function serviceChoices(types: readonly ServiceType[], templates: readonly { name: string; suggestedPrice: number }[]): ServiceChoice[] {
  const own = sortServiceTypes(types).map((t) => ({ name: t.name, price: t.price, source: 'proprio' as const, pinned: t.pinned }));
  const used = new Set(own.map((o) => serviceNameKey(o.name)));
  const suggestions = templates.filter((t) => !used.has(serviceNameKey(t.name))).map((t) => ({ name: t.name, price: t.suggestedPrice, source: 'sugestao' as const, pinned: false }));
  return [...own, ...suggestions];
}

/**
 * Nova ordem ao mover um tipo para cima/baixo dentro do seu grupo (fixados ou não).
 * Retorna só os registros cuja ordem mudou.
 */
export function moveServiceType(types: readonly ServiceType[], id: string, dir: -1 | 1): { id: string; order: number }[] {
  const sorted = sortServiceTypes(types);
  const i = sorted.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length || sorted[j]!.pinned !== sorted[i]!.pinned) return [];
  const reordered = [...sorted];
  [reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!];
  return reordered.map((t, k) => ({ id: t.id, order: k })).filter((c) => types.find((t) => t.id === c.id)!.order !== c.order);
}
