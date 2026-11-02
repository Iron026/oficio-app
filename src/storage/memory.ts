import { DEFAULT_SETTINGS, type AppData, type Profile, type Settings } from '../domain/types';
import type { EntityStore, StorageAdapter } from './types';

function memoryStore<T extends { id: string }>(): EntityStore<T> & { _map: Map<string, T> } {
  const map = new Map<string, T>();
  return {
    _map: map,
    list: async () => [...map.values()].map((v) => structuredClone(v)),
    get: async (id) => (map.has(id) ? structuredClone(map.get(id)) : undefined),
    put: async (item) => void map.set(item.id, structuredClone(item)),
    putMany: async (items) => items.forEach((i) => map.set(i.id, structuredClone(i))),
    remove: async (id) => void map.delete(id),
  };
}

/** Implementação em memória: usada em testes e como fallback se o IndexedDB estiver indisponível. */
export function createMemoryAdapter(): StorageAdapter {
  let profile: Profile | null = null;
  let settings: Settings = { ...DEFAULT_SETTINGS };
  const stores = {
    clients: memoryStore<AppData['clients'][number]>(),
    appointments: memoryStore<AppData['appointments'][number]>(),
    transactions: memoryStore<AppData['transactions'][number]>(),
    xpEvents: memoryStore<AppData['xpEvents'][number]>(),
    achievements: memoryStore<AppData['achievements'][number]>(),
  };
  const adapter: StorageAdapter = {
    kind: 'memory',
    ...stores,
    getProfile: async () => (profile ? structuredClone(profile) : null),
    saveProfile: async (p) => void (profile = structuredClone(p)),
    getSettings: async () => ({ ...settings }),
    saveSettings: async (s) => void (settings = { ...s }),
    async loadAll() {
      return {
        profile: await adapter.getProfile(), settings: await adapter.getSettings(),
        clients: await stores.clients.list(), appointments: await stores.appointments.list(),
        transactions: await stores.transactions.list(), xpEvents: await stores.xpEvents.list(),
        achievements: await stores.achievements.list(),
      };
    },
    async replaceAll(data) {
      await adapter.clearAll();
      profile = data.profile ? structuredClone(data.profile) : null;
      settings = { ...data.settings };
      await stores.clients.putMany(data.clients);
      await stores.appointments.putMany(data.appointments);
      await stores.transactions.putMany(data.transactions);
      await stores.xpEvents.putMany(data.xpEvents);
      await stores.achievements.putMany(data.achievements);
    },
    async clearAll() {
      profile = null;
      settings = { ...DEFAULT_SETTINGS };
      Object.values(stores).forEach((s) => s._map.clear());
    },
  };
  return adapter;
}
