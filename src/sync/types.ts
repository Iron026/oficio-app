import type { Profile, Settings } from '../domain/types';

/** Coleções sincronizadas, uma entrada por registro. */
export const SYNC_COLLECTIONS = ['clients', 'appointments', 'transactions', 'xpEvents', 'achievements', 'sealAwards', 'profileImages', 'serviceTypes'] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

/** Coleções sincronizadas desde a 0.3 (aceitas pelas regras publicadas). */
export const BASE_SYNC_COLLECTIONS: readonly SyncCollection[] = ['clients', 'appointments', 'transactions', 'xpEvents', 'achievements'];
/**
 * Coleções da 0.4 (selos permanentes, foto de perfil e tipos de serviço). Só sincronizam
 * quando as regras novas estiverem publicadas: até lá ficam apenas no aparelho e no backup.
 */
export const V04_SYNC_COLLECTIONS: readonly SyncCollection[] = ['sealAwards', 'profileImages', 'serviceTypes'];

/** Registros com valores financeiros: conflitos nunca são resolvidos em silêncio. */
export const FINANCIAL_COLLECTIONS: readonly SyncCollection[] = ['appointments', 'transactions'];

export type Entity = { id: string } & Record<string, unknown>;

export const recordKey = (collection: SyncCollection, id: string) => `${collection}__${id}`;

export function parseRecordKey(key: string): { collection: SyncCollection; id: string } | null {
  const i = key.indexOf('__');
  if (i < 0) return null;
  const collection = key.slice(0, i) as SyncCollection;
  if (!SYNC_COLLECTIONS.includes(collection)) return null;
  return { collection, id: key.slice(i + 2) };
}

/** Documento remoto de um registro (na nuvem). `data: null` = excluído (lápide). */
export interface RemoteRecord {
  collection: SyncCollection;
  id: string;
  data: Entity | null;
  rev: number;
  updatedAt: number; // ms, relógio do servidor
  deviceId: string;
}

/** Perfil e preferências (um documento por conta). */
export interface MetaData {
  profile: Profile | null;
  settings: Settings;
}

export interface RemoteMeta {
  data: MetaData;
  rev: number;
  updatedAt: number;
  deviceId: string;
}

export type PushItem = { collection: SyncCollection; id: string; data: Entity | null; expectedRev: number };
export type PushResult = { ok: true; rev: number } | { ok: false; current: RemoteRecord };
export type MetaPushResult = { ok: true; rev: number } | { ok: false; current: RemoteMeta };

/**
 * Contrato do armazenamento remoto. A implementação real usa o Cloud Firestore
 * (`src/cloud/firestoreRemote.ts`); os testes usam `MemoryRemote`.
 * Toda gravação é condicional à revisão esperada (controle de concorrência
 * otimista): nada é sobrescrito sem que o conflito seja avaliado.
 */
export interface RemoteStore {
  pull(uid: string, sinceMs: number): Promise<{ records: RemoteRecord[]; meta: RemoteMeta | null }>;
  push(uid: string, items: PushItem[], deviceId: string): Promise<PushResult[]>;
  pushMeta(uid: string, data: MetaData, expectedRev: number, deviceId: string): Promise<MetaPushResult>;
  hasData(uid: string): Promise<boolean>;
  deleteAll(uid: string): Promise<void>;
}

/** Estado local de sincronização de um registro. */
export interface RecordSyncState {
  baseRev: number; // última revisão da nuvem incorporada
  base: Entity | null; // conteúdo dessa revisão (para mesclagem em 3 vias)
  dirty: boolean; // há alteração local não enviada
  deleted?: boolean; // excluído localmente (enviar lápide)
  deletedHere?: boolean; // a exclusão confirmada na nuvem foi feita neste aparelho (não só recebida de outro)
  seq: number; // incrementa a cada alteração local (evita perder edições durante o envio)
}

export type ConflictKind = 'campos' | 'excluido_aqui' | 'excluido_na_nuvem';

/** Divergência em registro financeiro: o usuário decide. */
export interface SyncConflict {
  key: string;
  collection: SyncCollection;
  id: string;
  kind: ConflictKind;
  fields: string[];
  local: Entity | null;
  remote: Entity | null;
  detectedAt: string;
}

export interface SyncState {
  version: 1;
  deviceId: string;
  linkedUid: string | null;
  /** E-mail da conta associada (para avisar o usuário em troca de conta). */
  linkedEmail?: string | null;
  /** Última conta desassociada deste aparelho (os dados locais vieram dela). */
  previousAccount?: { uid: string; email: string | null } | null;
  cursor: number;
  lastSyncedAt: string | null; // somente após confirmação do servidor
  records: Record<string, RecordSyncState>;
  meta: { baseRev: number; base: MetaData | null; dirty: boolean; seq: number };
  conflicts: SyncConflict[];
}

export type SyncStatus =
  | { state: 'desativado' }
  | { state: 'sincronizado'; at: string }
  | { state: 'sincronizando' }
  | { state: 'pendente' } // alterações aguardando envio
  | { state: 'offline' }
  | { state: 'erro'; message: string };
