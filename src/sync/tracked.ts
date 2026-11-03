import type { AppData } from '../domain/types';
import type { EntityStore, EntityStoreName, StorageAdapter } from '../storage/types';
import type { SyncCollection } from './types';

/** Recebe avisos de alterações locais (implementado pelo SyncEngine). */
export interface ChangeTracker {
  touch(collection: SyncCollection, id: string, deleted: boolean): Promise<void>;
  touchMeta(): Promise<void>;
  beforeReplaceAll(data: AppData): Promise<void>;
  afterClearAll(): Promise<void>;
}

/**
 * Envoltório do armazenamento local: grava normalmente e registra cada
 * alteração como pendente de sincronização. O app continua 100% offline;
 * a fila de pendências é enviada quando houver conexão e conta conectada.
 */
export class TrackedStorage implements StorageAdapter {
  tracker: ChangeTracker | null = null;
  private suspended = 0;

  readonly clients: EntityStore<AppData['clients'][number]>;
  readonly appointments: EntityStore<AppData['appointments'][number]>;
  readonly transactions: EntityStore<AppData['transactions'][number]>;
  readonly xpEvents: EntityStore<AppData['xpEvents'][number]>;
  readonly achievements: EntityStore<AppData['achievements'][number]>;
  readonly sealAwards: EntityStore<AppData['sealAwards'][number]>;
  readonly profileImages: EntityStore<AppData['profileImages'][number]>;

  constructor(readonly inner: StorageAdapter) {
    this.clients = this.wrap('clients');
    this.appointments = this.wrap('appointments');
    this.transactions = this.wrap('transactions');
    this.xpEvents = this.wrap('xpEvents');
    this.achievements = this.wrap('achievements');
    this.sealAwards = this.wrap('sealAwards');
    this.profileImages = this.wrap('profileImages');
  }

  get kind() {
    return this.inner.kind;
  }

  private get active() {
    return this.suspended === 0 ? this.tracker : null;
  }

  /** Executa gravações vindas da própria sincronização, sem registrá-las de novo. */
  async untracked<T>(fn: () => Promise<T>): Promise<T> {
    this.suspended++;
    try {
      return await fn();
    } finally {
      this.suspended--;
    }
  }

  private wrap<T extends { id: string }>(name: EntityStoreName): EntityStore<T> {
    const store = this.inner[name] as unknown as EntityStore<T>;
    return {
      list: () => store.list(),
      get: (id) => store.get(id),
      put: async (item) => {
        await store.put(item);
        await this.active?.touch(name, item.id, false);
      },
      putMany: async (items) => {
        await store.putMany(items);
        const t = this.active;
        if (t) for (const i of items) await t.touch(name, i.id, false);
      },
      remove: async (id) => {
        await store.remove(id);
        await this.active?.touch(name, id, true);
      },
    };
  }

  getProfile() {
    return this.inner.getProfile();
  }
  async saveProfile(p: Parameters<StorageAdapter['saveProfile']>[0]) {
    await this.inner.saveProfile(p);
    await this.active?.touchMeta();
  }
  getSettings() {
    return this.inner.getSettings();
  }
  async saveSettings(s: Parameters<StorageAdapter['saveSettings']>[0]) {
    await this.inner.saveSettings(s);
    await this.active?.touchMeta();
  }
  loadAll() {
    return this.inner.loadAll();
  }
  async replaceAll(data: AppData) {
    await this.active?.beforeReplaceAll(data);
    await this.inner.replaceAll(data);
  }
  async clearAll() {
    await this.inner.clearAll();
    await this.active?.afterClearAll();
  }
  kvGet<T>(key: string) {
    return this.inner.kvGet<T>(key);
  }
  kvSet(key: string, value: unknown) {
    return this.inner.kvSet(key, value);
  }
  kvDelete(key: string) {
    return this.inner.kvDelete(key);
  }
  kvKeys(prefix?: string) {
    return this.inner.kvKeys(prefix);
  }
}
