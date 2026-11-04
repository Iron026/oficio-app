import type { AppData, Appointment, Client, Profile, ProfileImage, SealAward, ServiceType, Settings, Transaction, UnlockedAchievement, XpEvent } from '../domain/types';

export interface EntityStore<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  /** Grava vários itens em uma única transação. */
  putMany(items: T[]): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * Contrato de persistência do app. A interface não sabe nada sobre IndexedDB:
 * no futuro, uma implementação com sincronização em nuvem pode substituí-la
 * sem alterar telas nem regras de negócio.
 */
export interface StorageAdapter {
  readonly kind: string;
  clients: EntityStore<Client>;
  appointments: EntityStore<Appointment>;
  transactions: EntityStore<Transaction>;
  xpEvents: EntityStore<XpEvent>;
  achievements: EntityStore<UnlockedAchievement>;
  sealAwards: EntityStore<SealAward>;
  profileImages: EntityStore<ProfileImage>;
  serviceTypes: EntityStore<ServiceType>;
  getProfile(): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  loadAll(): Promise<AppData>;
  /** Substitui todos os dados (importação de backup). */
  replaceAll(data: AppData): Promise<void>;
  clearAll(): Promise<void>;
  /**
   * Armazenamento chave-valor auxiliar (estado de sincronização, cópias de
   * segurança). Separado dos dados: NÃO é afetado por replaceAll/clearAll.
   */
  kvGet<T>(key: string): Promise<T | undefined>;
  kvSet(key: string, value: unknown): Promise<void>;
  kvDelete(key: string): Promise<void>;
  kvKeys(prefix?: string): Promise<string[]>;
}

export const ENTITY_STORES = ['clients', 'appointments', 'transactions', 'xpEvents', 'achievements', 'sealAwards', 'profileImages', 'serviceTypes'] as const;
export type EntityStoreName = (typeof ENTITY_STORES)[number];
