import type { MetaData, MetaPushResult, PushItem, PushResult, RemoteMeta, RemoteRecord, RemoteStore } from './types';
import { recordKey } from './types';

export class OfflineError extends Error {
  code = 'unavailable';
  constructor() {
    super('Sem conexão com a internet');
  }
}

/**
 * Nuvem simulada em memória (testes). Reproduz as garantias do Firestore usadas
 * pelo app: gravação condicional à revisão, relógio do servidor, isolamento por
 * conta (cada chamada informa o uid autenticado) e indisponibilidade de rede.
 */
export class MemoryRemote implements RemoteStore {
  private users = new Map<string, { records: Map<string, RemoteRecord>; meta: RemoteMeta | null }>();
  private clock = 1_000;
  offline = false;
  /** Simula falha de servidor no próximo envio. */
  failNextPush = false;
  pushCalls = 0;

  private user(uid: string) {
    let u = this.users.get(uid);
    if (!u) this.users.set(uid, (u = { records: new Map(), meta: null }));
    return u;
  }

  private check() {
    if (this.offline) throw new OfflineError();
  }

  async pull(uid: string, sinceMs: number) {
    this.check();
    const u = this.user(uid);
    const records = [...u.records.values()].filter((r) => r.updatedAt > sinceMs).map((r) => structuredClone(r));
    return { records, meta: u.meta ? structuredClone(u.meta) : null };
  }

  async push(uid: string, items: PushItem[], deviceId: string): Promise<PushResult[]> {
    this.check();
    this.pushCalls++;
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error('Falha simulada do servidor');
    }
    const u = this.user(uid);
    return items.map((it) => {
      const key = recordKey(it.collection, it.id);
      const cur = u.records.get(key);
      const curRev = cur?.rev ?? 0;
      if (curRev !== it.expectedRev) return { ok: false as const, current: structuredClone(cur!) };
      const rec: RemoteRecord = { collection: it.collection, id: it.id, data: it.data ? structuredClone(it.data) : null, rev: curRev + 1, updatedAt: ++this.clock, deviceId };
      u.records.set(key, rec);
      return { ok: true as const, rev: rec.rev };
    });
  }

  async pushMeta(uid: string, data: MetaData, expectedRev: number, deviceId: string): Promise<MetaPushResult> {
    this.check();
    const u = this.user(uid);
    const curRev = u.meta?.rev ?? 0;
    if (curRev !== expectedRev) return { ok: false, current: structuredClone(u.meta!) };
    u.meta = { data: structuredClone(data), rev: curRev + 1, updatedAt: ++this.clock, deviceId };
    return { ok: true, rev: u.meta.rev };
  }

  async hasData(uid: string) {
    this.check();
    const u = this.users.get(uid);
    return !!u && (!!u.meta || [...u.records.values()].some((r) => r.data));
  }

  async deleteAll(uid: string) {
    this.check();
    this.users.delete(uid);
  }

  /** Inspeção direta (somente testes). */
  dump(uid: string) {
    return this.users.get(uid);
  }
}
