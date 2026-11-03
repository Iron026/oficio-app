import { DEFAULT_SETTINGS, type AppData, type Profile, type Settings } from '../domain/types';
import { ENTITY_STORES, type EntityStore, type EntityStoreName, type StorageAdapter } from './types';

const DB_VERSION = 3;
const META = 'meta';
/** v2: armazenamento chave-valor auxiliar (sincronização, cópias de segurança). */
const KV = 'kv';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transação cancelada'));
  });
}

export function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Migrações futuras: use `event.oldVersion` para evoluir o esquema.
      for (const store of ENTITY_STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      // v1 → v2: apenas cria o novo store; os dados existentes não são tocados.
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      // v2 → v3 (0.4): stores `sealAwards` e `profileImages`, criados pelo laço acima; nada é apagado.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco de dados bloqueado por outra aba.'));
  });
}

function entityStore<T extends { id: string }>(db: IDBDatabase, name: EntityStoreName): EntityStore<T> {
  return {
    async list() {
      const tx = db.transaction(name, 'readonly');
      return (await promisify(tx.objectStore(name).getAll())) as T[];
    },
    async get(id) {
      const tx = db.transaction(name, 'readonly');
      return (await promisify(tx.objectStore(name).get(id))) as T | undefined;
    },
    async put(item) {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).put(item);
      await txDone(tx);
    },
    async putMany(items) {
      if (!items.length) return;
      const tx = db.transaction(name, 'readwrite');
      const store = tx.objectStore(name);
      for (const item of items) store.put(item);
      await txDone(tx);
    },
    async remove(id) {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).delete(id);
      await txDone(tx);
    },
  };
}

export async function createIndexedDbAdapter(dbName = 'oficio'): Promise<StorageAdapter> {
  const db = await openDatabase(dbName);

  async function getMeta<T>(key: string): Promise<T | undefined> {
    const tx = db.transaction(META, 'readonly');
    return (await promisify(tx.objectStore(META).get(key))) as T | undefined;
  }
  async function setMeta(key: string, value: unknown): Promise<void> {
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put(value, key);
    await txDone(tx);
  }

  const adapter: StorageAdapter = {
    kind: 'indexeddb',
    async kvGet<T>(key: string) {
      const tx = db.transaction(KV, 'readonly');
      return (await promisify(tx.objectStore(KV).get(key))) as T | undefined;
    },
    async kvSet(key, value) {
      const tx = db.transaction(KV, 'readwrite');
      tx.objectStore(KV).put(value, key);
      await txDone(tx);
    },
    async kvDelete(key) {
      const tx = db.transaction(KV, 'readwrite');
      tx.objectStore(KV).delete(key);
      await txDone(tx);
    },
    async kvKeys(prefix = '') {
      const tx = db.transaction(KV, 'readonly');
      const keys = (await promisify(tx.objectStore(KV).getAllKeys())) as string[];
      return keys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
    },
    clients: entityStore(db, 'clients'),
    appointments: entityStore(db, 'appointments'),
    transactions: entityStore(db, 'transactions'),
    xpEvents: entityStore(db, 'xpEvents'),
    achievements: entityStore(db, 'achievements'),
    sealAwards: entityStore(db, 'sealAwards'),
    profileImages: entityStore(db, 'profileImages'),
    async getProfile() {
      return (await getMeta<Profile>('profile')) ?? null;
    },
    saveProfile: (p) => setMeta('profile', p),
    async getSettings() {
      return { ...DEFAULT_SETTINGS, ...((await getMeta<Settings>('settings')) ?? {}) };
    },
    saveSettings: (s) => setMeta('settings', s),
    async loadAll(): Promise<AppData> {
      const [profile, settings, clients, appointments, transactions, xpEvents, achievements, sealAwards, profileImages] = await Promise.all([
        adapter.getProfile(), adapter.getSettings(), adapter.clients.list(), adapter.appointments.list(),
        adapter.transactions.list(), adapter.xpEvents.list(), adapter.achievements.list(),
        adapter.sealAwards.list(), adapter.profileImages.list(),
      ]);
      return { profile, settings, clients, appointments, transactions, xpEvents, achievements, sealAwards, profileImages };
    },
    async replaceAll(data) {
      // Uma única transação: ou tudo é importado, ou nada muda.
      const tx = db.transaction([...ENTITY_STORES, META], 'readwrite');
      for (const name of ENTITY_STORES) {
        const store = tx.objectStore(name);
        store.clear();
        for (const item of data[name] ?? []) store.put(item);
      }
      const meta = tx.objectStore(META);
      meta.clear();
      if (data.profile) meta.put(data.profile, 'profile');
      meta.put(data.settings, 'settings');
      await txDone(tx);
    },
    async clearAll() {
      const tx = db.transaction([...ENTITY_STORES, META], 'readwrite');
      for (const name of [...ENTITY_STORES, META]) tx.objectStore(name).clear();
      await txDone(tx);
    },
  };
  return adapter;
}
