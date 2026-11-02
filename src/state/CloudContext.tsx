import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { CloudUser } from '../cloud/auth';
import type { SyncEngine } from '../sync/engine';
import type { SyncStatus } from '../sync/types';
import type { AccountController } from './account';

interface Ctx {
  sync: SyncEngine;
  account: AccountController | null; // null enquanto o Firebase carrega
}

const CloudCtx = createContext<Ctx | null>(null);

export function CloudProvider({ sync, account, children }: Ctx & { children: ReactNode }) {
  // Sincroniza ao recuperar a conexão e ao voltar para o app.
  useEffect(() => {
    const run = () => void sync.sync();
    const onVisible = () => document.visibilityState === 'visible' && run();
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);
  return <CloudCtx.Provider value={{ sync, account }}>{children}</CloudCtx.Provider>;
}

export function useCloud(): {
  sync: SyncEngine;
  account: AccountController | null;
  available: boolean;
  user: CloudUser | null;
  status: SyncStatus;
  linked: boolean;
  version: number;
} {
  const ctx = useContext(CloudCtx);
  if (!ctx) throw new Error('useCloud fora do CloudProvider');
  const { sync, account } = ctx;
  // Versão muda a cada alteração de estado da sincronização.
  const version = useSyncExternalStore(
    (cb) => sync.subscribe(cb),
    () => syncVersion(sync),
  );
  const user = useSyncExternalStore(
    (cb) => (account ? account.auth.onChange(() => cb()) : () => undefined),
    () => userSnapshot(account),
  );
  return {
    sync,
    account,
    available: !!account?.available,
    user,
    status: sync.getStatus(),
    linked: !!user && sync.linkedUid === user.uid,
    version,
  };
}

const versions = new WeakMap<SyncEngine, { n: number; last: string }>();
/** Identificador estável do estado atual (para o useSyncExternalStore). */
function syncVersion(sync: SyncEngine): number {
  const key = JSON.stringify([sync.getStatus(), sync.linkedUid, sync.lastSyncedAt, sync.pendingCount, sync.conflicts.length]);
  const v = versions.get(sync) ?? { n: 0, last: '' };
  if (v.last !== key) {
    v.n++;
    v.last = key;
    versions.set(sync, v);
  }
  return v.n;
}

const users = new WeakMap<AccountController, { key: string; user: CloudUser | null }>();
/** Retrato estável do usuário atual (mesma referência enquanto não mudar). */
function userSnapshot(account: AccountController | null): CloudUser | null {
  if (!account) return null;
  const u = account.auth.current();
  const key = JSON.stringify(u);
  const cached = users.get(account);
  if (cached && cached.key === key) return cached.user;
  users.set(account, { key, user: u });
  return u;
}
