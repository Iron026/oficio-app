import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import {
  recordKey,
  SYNC_COLLECTIONS,
  type Entity,
  type MetaData,
  type MetaPushResult,
  type PushItem,
  type PushResult,
  type RemoteMeta,
  type RemoteRecord,
  type RemoteStore,
  type SyncCollection,
} from '../sync/types';

export const SCHEMA_VERSION = 1;

/** O Firestore não aceita `undefined`: remove campos indefinidos. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;

const millis = (t: unknown): number => (t instanceof Timestamp ? t.toMillis() : 0);

function toRecord(d: DocumentData): RemoteRecord | null {
  if (!SYNC_COLLECTIONS.includes(d.collection as SyncCollection)) return null;
  return {
    collection: d.collection as SyncCollection,
    id: String(d.id),
    data: (d.data ?? null) as Entity | null,
    rev: Number(d.rev ?? 0),
    updatedAt: millis(d.updatedAt),
    deviceId: String(d.deviceId ?? ''),
  };
}

function toMeta(d: DocumentData | undefined): RemoteMeta | null {
  if (!d || !d.data) return null;
  return { data: d.data as MetaData, rev: Number(d.rev ?? 0), updatedAt: millis(d.updatedAt), deviceId: String(d.deviceId ?? '') };
}

/**
 * Estrutura no Cloud Firestore (somente o dono acessa — ver firestore.rules):
 *   users/{uid}                         perfil e preferências (MetaData)
 *   users/{uid}/records/{coleção__id}   um documento por registro (ou lápide)
 *   users/{uid}/entitlements/{doc}      direitos Premium (somente leitura; gravados no futuro pelo servidor)
 * Toda gravação usa transação condicionada à revisão (`rev`): nada é
 * sobrescrito sem avaliação de conflito.
 */
export class FirestoreRemote implements RemoteStore {
  constructor(private db: Firestore) {}

  private userDoc(uid: string) {
    return doc(this.db, 'users', uid);
  }
  private records(uid: string) {
    return collection(this.db, 'users', uid, 'records');
  }

  async pull(uid: string, sinceMs: number) {
    const q = query(this.records(uid), where('updatedAt', '>', Timestamp.fromMillis(sinceMs)), orderBy('updatedAt'));
    const [snap, metaSnap] = await Promise.all([getDocs(q), getDoc(this.userDoc(uid))]);
    const records = snap.docs.map((d) => toRecord(d.data())).filter((r): r is RemoteRecord => !!r);
    return { records, meta: toMeta(metaSnap.data()) };
  }

  async push(uid: string, items: PushItem[], deviceId: string): Promise<PushResult[]> {
    return runTransaction(this.db, async (tx) => {
      const refs = items.map((it) => doc(this.records(uid), recordKey(it.collection, it.id)));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      return items.map((it, i): PushResult => {
        const cur = snaps[i]!.data();
        const curRev = Number(cur?.rev ?? 0);
        // Documento inexistente (ex.: dados da conta excluídos em outro aparelho): recria.
        if (cur && curRev !== it.expectedRev) return { ok: false, current: toRecord(cur)! };
        tx.set(refs[i]!, {
          collection: it.collection,
          id: it.id,
          data: it.data ? clean(it.data) : null,
          deleted: !it.data,
          rev: curRev + 1,
          updatedAt: serverTimestamp(),
          deviceId,
        });
        return { ok: true, rev: curRev + 1 };
      });
    });
  }

  async pushMeta(uid: string, data: MetaData, expectedRev: number, deviceId: string): Promise<MetaPushResult> {
    const ref = this.userDoc(uid);
    return runTransaction(this.db, async (tx) => {
      const cur = (await tx.get(ref)).data();
      const curRev = Number(cur?.rev ?? 0);
      if (cur && curRev !== expectedRev) return { ok: false, current: toMeta(cur)! };
      tx.set(ref, { schemaVersion: SCHEMA_VERSION, data: clean(data), rev: curRev + 1, updatedAt: serverTimestamp(), deviceId });
      return { ok: true, rev: curRev + 1 };
    });
  }

  async hasData(uid: string) {
    const [meta, rec] = await Promise.all([getDoc(this.userDoc(uid)), getDocs(query(this.records(uid), where('deleted', '==', false), limit(1)))]);
    return meta.exists() || !rec.empty;
  }

  /** Exclui todos os registros e o perfil da conta. */
  async deleteAll(uid: string) {
    const snap = await getDocs(this.records(uid));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(this.db);
      for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
      await batch.commit();
    }
    const batch = writeBatch(this.db);
    batch.delete(this.userDoc(uid));
    await batch.commit();
  }
}
