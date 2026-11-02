import { createIndexedDbAdapter } from './indexeddb';
import { createMemoryAdapter } from './memory';
import type { StorageAdapter } from './types';

export type { StorageAdapter } from './types';

/**
 * Ponto único de criação do armazenamento. Para adicionar sincronização em
 * nuvem no futuro, crie outro adapter que implemente `StorageAdapter`
 * e escolha-o aqui.
 */
export async function createStorage(): Promise<{ storage: StorageAdapter; persistent: boolean }> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponível');
    const storage = await createIndexedDbAdapter();
    // Pede ao navegador para não apagar os dados automaticamente (quando suportado).
    void navigator.storage?.persist?.().catch(() => undefined);
    return { storage, persistent: true };
  } catch (err) {
    console.warn('Usando armazenamento temporário em memória:', err);
    return { storage: createMemoryAdapter(), persistent: false };
  }
}
