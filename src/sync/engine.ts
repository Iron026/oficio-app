import type { AppData } from '../domain/types';
import { newId } from '../lib/id';
import { serializeBackup } from '../storage/backup';
import type { AppService } from '../state/service';
import { duplicateXpIds, mergeMeta, mergeRecord } from './merge';
import type { ChangeTracker, TrackedStorage } from './tracked';
import {
  FINANCIAL_COLLECTIONS,
  parseRecordKey,
  recordKey,
  SYNC_COLLECTIONS,
  type Entity,
  type MetaData,
  type PushItem,
  type RecordSyncState,
  type RemoteMeta,
  type RemoteRecord,
  type RemoteStore,
  type SyncCollection,
  type SyncConflict,
  type SyncState,
  type SyncStatus,
} from './types';

const STATE_KEY = 'sync:state';
const BACKUP_PREFIX = 'backup:';
const MAX_BACKUPS = 5;
/** Margem de segurança na leitura incremental (gravações concorrentes). */
const OVERLAP_MS = 5 * 60 * 1000;
const CHUNK = 100;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const clone = <T,>(v: T): T => structuredClone(v);

export type LinkMode = 'mesclar' | 'usarNuvem';

export interface DataSummary {
  profileName: string | null;
  clients: number;
  appointments: number;
  transactions: number;
  xp: number;
}

export interface LinkAnalysis {
  local: DataSummary;
  remote: DataSummary;
  localHasData: boolean;
  remoteHasData: boolean;
  /** Estratégia sugerida: nada a perder → automática; ambos com dados → mesclar. */
  suggested: LinkMode;
  /** true quando não há escolha a fazer (um dos lados está vazio). */
  automatic: boolean;
}

export interface BackupEntry {
  key: string;
  reason: string;
  createdAt: string;
}

export function isOfflineError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return e?.code === 'unavailable' || /offline|network|conex|unavailable/i.test(e?.message ?? '');
}

function freshState(deviceId: string): SyncState {
  return { version: 1, deviceId, linkedUid: null, cursor: 0, lastSyncedAt: null, records: {}, meta: { baseRev: 0, base: null, dirty: false, seq: 0 }, conflicts: [] };
}

function summarize(data: Pick<AppData, 'profile' | 'clients' | 'appointments' | 'transactions' | 'xpEvents'>): DataSummary {
  return {
    profileName: data.profile?.name ?? null,
    clients: data.clients.length,
    appointments: data.appointments.length,
    transactions: data.transactions.length,
    xp: data.xpEvents.reduce((s, e) => s + e.xp, 0),
  };
}

function hasContent(data: Pick<AppData, 'profile' | 'clients' | 'appointments' | 'transactions' | 'xpEvents' | 'achievements'>): boolean {
  return !!data.profile || data.clients.length + data.appointments.length + data.transactions.length + data.xpEvents.length + data.achievements.length > 0;
}

/** Converte registros remotos (sem lápides) em coleções locais. */
function remoteToData(records: RemoteRecord[], meta: RemoteMeta | null, fallbackSettings: AppData['settings']): AppData {
  const data: AppData = { profile: meta?.data.profile ?? null, settings: meta?.data.settings ?? fallbackSettings, clients: [], appointments: [], transactions: [], xpEvents: [], achievements: [] };
  for (const r of records) if (r.data) (data[r.collection] as unknown as Entity[]).push(clone(r.data));
  return data;
}

/**
 * Sincronização offline-first entre o armazenamento local e a nuvem.
 *
 * - O aparelho é sempre a fonte de trabalho: tudo funciona sem internet.
 * - Cada alteração local vira uma pendência (`dirty`) com número de sequência.
 * - Envio condicional à revisão da nuvem: se outro aparelho alterou antes,
 *   o registro é mesclado (3 vias) e reenviado; conflitos financeiros ficam
 *   registrados para o usuário decidir.
 * - "Sincronizado" só é exibido após o servidor confirmar as gravações.
 */
export class SyncEngine implements ChangeTracker {
  private state: SyncState;
  private uid: string | null = null;
  private status: SyncStatus = { state: 'desativado' };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private rerun = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private service: AppService,
    private storage: TrackedStorage,
    private remoteStore: RemoteStore | null,
    state: SyncState,
    private opts: { now: () => Date; autoSync: boolean; isOnline: () => boolean },
  ) {
    this.state = state;
  }

  static async create(service: AppService, storage: TrackedStorage, remote: RemoteStore | null, opts: Partial<{ now: () => Date; autoSync: boolean; isOnline: () => boolean }> = {}) {
    const saved = await storage.kvGet<SyncState>(STATE_KEY);
    const state = saved?.version === 1 ? saved : freshState(newId());
    if (!saved) await storage.kvSet(STATE_KEY, state);
    const engine = new SyncEngine(service, storage, remote, state, {
      now: opts.now ?? (() => new Date()),
      autoSync: opts.autoSync ?? true,
      isOnline: opts.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false),
    });
    storage.tracker = engine;
    return engine;
  }

  // ------------------------------------------------------------- estado

  /** Conecta a nuvem (carregada sob demanda após a abertura do app). */
  setRemote(remote: RemoteStore | null) {
    this.remoteStore = remote;
  }
  get cloudAvailable() {
    return !!this.remoteStore;
  }
  private get remote(): RemoteStore {
    if (!this.remoteStore) throw new Error('Sincronização indisponível nesta versão.');
    return this.remoteStore;
  }

  get deviceId() {
    return this.state.deviceId;
  }
  get linkedUid() {
    return this.state.linkedUid;
  }
  get lastSyncedAt() {
    return this.state.lastSyncedAt;
  }
  get conflicts(): readonly SyncConflict[] {
    return this.state.conflicts;
  }
  get pendingCount(): number {
    return Object.values(this.state.records).filter((r) => r.dirty).length + (this.state.meta.dirty ? 1 : 0);
  }
  getStatus(): SyncStatus {
    return this.status;
  }
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private setStatus(s: SyncStatus) {
    this.status = s;
    this.listeners.forEach((l) => l());
  }
  private async save() {
    await this.storage.kvSet(STATE_KEY, this.state);
    this.listeners.forEach((l) => l());
  }

  /** Informa o usuário autenticado (ou null). Sincroniza se esta conta já está associada. */
  async setUser(uid: string | null) {
    this.uid = uid;
    if (!uid || uid !== this.state.linkedUid) {
      this.setStatus({ state: 'desativado' });
      return;
    }
    await this.sync();
  }

  /** true quando há conta autenticada ainda não associada aos dados deste aparelho. */
  needsLink(): boolean {
    return !!this.uid && this.uid !== this.state.linkedUid;
  }

  // ------------------------------------------------------------- rastreamento

  async touch(collection: SyncCollection, id: string, deleted: boolean) {
    if (!this.state.linkedUid) return;
    const key = recordKey(collection, id);
    const r = (this.state.records[key] ??= { baseRev: 0, base: null, dirty: false, seq: 0 });
    r.dirty = true;
    r.deleted = deleted;
    r.seq++;
    await this.save();
    this.schedule();
  }

  async touchMeta() {
    if (!this.state.linkedUid) return;
    this.state.meta.dirty = true;
    this.state.meta.seq++;
    await this.save();
    this.schedule();
  }

  /** Importação de backup com conta associada: tudo vira pendência; o que sumiu vira exclusão. */
  async beforeReplaceAll(data: AppData) {
    if (!this.state.linkedUid) return;
    const present = new Set<string>();
    for (const c of SYNC_COLLECTIONS) for (const e of data[c]) present.add(recordKey(c, e.id));
    for (const key of new Set([...present, ...Object.keys(this.state.records)])) {
      const r = (this.state.records[key] ??= { baseRev: 0, base: null, dirty: false, seq: 0 });
      r.dirty = true;
      r.deleted = !present.has(key);
      r.seq++;
    }
    this.state.meta.dirty = true;
    this.state.meta.seq++;
    await this.save();
    this.schedule();
  }

  /** "Apagar todos os dados" deste aparelho: desassocia a conta, sem tocar na nuvem. */
  async afterClearAll() {
    this.state = freshState(this.state.deviceId);
    await this.save();
    this.setStatus({ state: 'desativado' });
  }

  private schedule() {
    if (!this.opts.autoSync || !this.uid || this.uid !== this.state.linkedUid) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync().catch(() => undefined), 1500);
  }

  // ------------------------------------------------------------- cópias de segurança

  async saveBackup(reason: string): Promise<string> {
    const createdAt = this.opts.now().toISOString();
    const key = `${BACKUP_PREFIX}${createdAt}`;
    await this.storage.kvSet(key, { reason, createdAt, json: serializeBackup(this.service.data, this.opts.now()) });
    const keys = (await this.storage.kvKeys(BACKUP_PREFIX)).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) await this.storage.kvDelete(old);
    return key;
  }

  async listBackups(): Promise<BackupEntry[]> {
    const keys = (await this.storage.kvKeys(BACKUP_PREFIX)).sort().reverse();
    const out: BackupEntry[] = [];
    for (const key of keys) {
      const b = await this.storage.kvGet<{ reason: string; createdAt: string }>(key);
      if (b) out.push({ key, reason: b.reason, createdAt: b.createdAt });
    }
    return out;
  }

  async getBackupJson(key: string): Promise<string | null> {
    return (await this.storage.kvGet<{ json: string }>(key))?.json ?? null;
  }

  // ------------------------------------------------------------- associação da conta

  /** Compara os dados deste aparelho com os da conta. Não altera nada. */
  async analyze(uid: string): Promise<LinkAnalysis> {
    const pulled = await this.remote.pull(uid, 0);
    const remoteData = remoteToData(pulled.records, pulled.meta, this.service.data.settings);
    const localHasData = hasContent(this.service.data);
    const remoteHasData = hasContent(remoteData);
    return {
      local: summarize(this.service.data),
      remote: summarize(remoteData),
      localHasData,
      remoteHasData,
      suggested: localHasData ? 'mesclar' : 'usarNuvem',
      automatic: !localHasData || !remoteHasData,
    };
  }

  /**
   * Associa os dados deste aparelho à conta.
   * - Faz cópia de segurança local antes de qualquer mudança.
   * - "mesclar": une tudo pelos identificadores (sem duplicar; idempotente).
   * - "usarNuvem": substitui os dados deste aparelho pelos da conta (a cópia fica guardada).
   * Se a nuvem estiver indisponível, nada é alterado.
   */
  async link(uid: string, mode: LinkMode): Promise<void> {
    await this.saveBackup(mode === 'usarNuvem' ? 'Antes de usar os dados da nuvem' : 'Antes de conectar a conta');
    const pulled = await this.remote.pull(uid, 0); // falha aqui = nada mudou
    await this.service.exclusive(async () => {
      const next = freshState(this.state.deviceId);
      next.linkedUid = uid;
      if (mode === 'usarNuvem') {
        const data = remoteToData(pulled.records, pulled.meta, this.service.data.settings);
        for (const r of pulled.records) next.records[recordKey(r.collection, r.id)] = { baseRev: r.rev, base: r.data, dirty: false, seq: 0 };
        next.meta = { baseRev: pulled.meta?.rev ?? 0, base: pulled.meta?.data ?? null, dirty: !pulled.meta && !!data.profile, seq: 0 };
        next.cursor = Math.max(0, ...pulled.records.map((r) => r.updatedAt));
        this.state = next;
        await this.storage.untracked(() => this.service.applySyncedData(data));
      } else {
        const d = this.service.data;
        for (const c of SYNC_COLLECTIONS)
          for (const e of d[c] as unknown as Entity[]) if (!e.isDemo) next.records[recordKey(c, e.id)] = { baseRev: 0, base: null, dirty: true, seq: 1 };
        next.meta = { baseRev: 0, base: null, dirty: !!d.profile, seq: 1 };
        this.state = next;
        await this.applyRemote(pulled.records, pulled.meta);
      }
      await this.save();
    });
    this.uid = uid;
    await this.sync();
  }

  /** Desconecta a conta deste aparelho. Os dados locais permanecem; a nuvem não é alterada. */
  async unlink() {
    this.state = freshState(this.state.deviceId);
    this.uid = null;
    await this.save();
    this.setStatus({ state: 'desativado' });
  }

  /** Exclui todos os dados da conta na nuvem e desassocia este aparelho. */
  async deleteCloudData(uid: string) {
    await this.remote.deleteAll(uid);
    await this.unlink();
  }

  // ------------------------------------------------------------- sincronização

  sync(): Promise<void> {
    if (!this.remoteStore || !this.uid || this.uid !== this.state.linkedUid) return Promise.resolve();
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.syncOnce();
      } while (this.rerun);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async syncOnce() {
    const uid = this.uid!;
    this.setStatus({ state: 'sincronizando' });
    try {
      if (!this.opts.isOnline()) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const pulled = await this.remote.pull(uid, Math.max(0, this.state.cursor - OVERLAP_MS));
      await this.service.exclusive(async () => {
        await this.applyRemote(pulled.records, pulled.meta);
        await this.save();
      });
      for (let round = 0; round < 4 && this.pendingCount > 0; round++) await this.pushPending(uid);
      if (this.pendingCount === 0) {
        this.state.lastSyncedAt = this.opts.now().toISOString();
        await this.save();
        this.setStatus({ state: 'sincronizado', at: this.state.lastSyncedAt });
      } else {
        this.setStatus({ state: 'pendente' });
      }
    } catch (err) {
      // Nenhum dado local é alterado em caso de falha: as pendências continuam guardadas.
      this.setStatus(isOfflineError(err) ? { state: 'offline' } : { state: 'erro', message: err instanceof Error ? err.message : 'Falha na sincronização' });
    }
  }

  private localEntity(collection: SyncCollection, id: string): Entity | null {
    const found = (this.service.data[collection] as unknown as Entity[]).find((e) => e.id === id);
    return found ? clone(found) : null;
  }

  private async pushPending(uid: string) {
    const items: PushItem[] = [];
    const seqs = new Map<string, number>();
    for (const [key, r] of Object.entries(this.state.records)) {
      if (!r.dirty) continue;
      const k = parseRecordKey(key);
      if (!k) continue;
      const data = r.deleted ? null : this.localEntity(k.collection, k.id);
      // Dados de demonstração (fictícios) nunca vão para a nuvem.
      if (data?.isDemo) {
        if (r.baseRev === 0) delete this.state.records[key];
        else r.dirty = false;
        continue;
      }
      items.push({ collection: k.collection, id: k.id, data, expectedRev: r.baseRev });
      seqs.set(key, r.seq);
    }
    const rejected: RemoteRecord[] = [];
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const results = await this.remote.push(uid, chunk, this.state.deviceId);
      await this.service.exclusive(async () => {
        results.forEach((res, j) => {
          const it = chunk[j]!;
          const key = recordKey(it.collection, it.id);
          const r = this.state.records[key]!;
          if (res.ok) {
            r.baseRev = res.rev;
            r.base = it.data;
            // Só limpa a pendência se não houve nova edição durante o envio.
            if (r.seq === seqs.get(key)) {
              r.dirty = false;
              r.deleted = undefined;
            }
          } else {
            rejected.push(res.current);
          }
        });
        await this.save();
      });
    }
    if (this.state.meta.dirty) {
      const seq = this.state.meta.seq;
      const d = this.service.data;
      const meta: MetaData = { profile: d.profile, settings: d.settings };
      const res = await this.remote.pushMeta(uid, meta, this.state.meta.baseRev, this.state.deviceId);
      await this.service.exclusive(async () => {
        if (res.ok) {
          this.state.meta.baseRev = res.rev;
          this.state.meta.base = meta;
          if (this.state.meta.seq === seq) this.state.meta.dirty = false;
        } else {
          await this.applyRemote([], res.current);
        }
        await this.save();
      });
    }
    if (rejected.length) {
      await this.service.exclusive(async () => {
        await this.applyRemote(rejected, null);
        await this.save();
      });
    }
  }

  /** Incorpora alterações da nuvem aos dados locais. Chamado dentro de `exclusive`. */
  private async applyRemote(records: RemoteRecord[], meta: RemoteMeta | null) {
    const current = this.service.data;
    const maps = Object.fromEntries(SYNC_COLLECTIONS.map((c) => [c, new Map((current[c] as unknown as Entity[]).map((e) => [e.id, clone(e)]))])) as Record<SyncCollection, Map<string, Entity>>;
    let profile = current.profile;
    let settings = current.settings;
    let changed = false;
    const now = this.opts.now().toISOString();

    const addConflict = (c: Omit<SyncConflict, 'detectedAt'>) => {
      this.state.conflicts = [...this.state.conflicts.filter((x) => x.key !== c.key), { ...c, detectedAt: now }];
    };

    for (const r of [...records].sort((a, b) => a.updatedAt - b.updatedAt)) {
      this.state.cursor = Math.max(this.state.cursor, r.updatedAt);
      const key = recordKey(r.collection, r.id);
      const m: RecordSyncState | undefined = this.state.records[key];
      if (m && r.rev <= m.baseRev) continue; // já incorporado
      const map = maps[r.collection];
      const local = map.get(r.id) ?? null;
      const financial = FINANCIAL_COLLECTIONS.includes(r.collection);

      if (!m || !m.dirty) {
        if (r.data) map.set(r.id, clone(r.data));
        else map.delete(r.id);
        this.state.records[key] = { baseRev: r.rev, base: r.data, dirty: false, seq: m?.seq ?? 0 };
        changed = true;
        continue;
      }
      if (m.deleted || !local) {
        // Excluído aqui. Se a nuvem tem uma versão mais nova, restaura (nada se perde).
        if (r.data) {
          map.set(r.id, clone(r.data));
          this.state.records[key] = { baseRev: r.rev, base: r.data, dirty: false, seq: m.seq };
          if (financial) addConflict({ key, collection: r.collection, id: r.id, kind: 'excluido_aqui', fields: [], local: null, remote: r.data });
          changed = true;
        } else {
          this.state.records[key] = { baseRev: r.rev, base: null, dirty: false, seq: m.seq };
        }
        continue;
      }
      if (!r.data) {
        // Excluído na nuvem, alterado aqui: mantém a versão local (será reenviada).
        this.state.records[key] = { ...m, baseRev: r.rev, base: null };
        if (financial) addConflict({ key, collection: r.collection, id: r.id, kind: 'excluido_na_nuvem', fields: [], local, remote: null });
        continue;
      }
      const out = mergeRecord(r.collection, m.base, local, r.data);
      if (!same(out.value, local)) changed = true;
      map.set(r.id, out.value);
      this.state.records[key] = { baseRev: r.rev, base: r.data, dirty: !same(out.value, r.data), seq: m.seq };
      if (out.needsUser) addConflict({ key, collection: r.collection, id: r.id, kind: 'campos', fields: out.conflictFields, local, remote: r.data });
    }

    if (meta && meta.rev > this.state.meta.baseRev) {
      const localMeta: MetaData = { profile, settings };
      const merged = this.state.meta.dirty && this.state.meta.base !== undefined ? mergeMeta(this.state.meta.base, localMeta, meta.data) : meta.data;
      if (!same(merged, localMeta)) changed = true;
      profile = merged.profile;
      settings = merged.settings;
      this.state.meta = { ...this.state.meta, baseRev: meta.rev, base: meta.data, dirty: this.state.meta.dirty && !same(merged, meta.data) };
    }

    // XP: no máximo um evento por chave em todos os aparelhos.
    const xp = maps.xpEvents;
    for (const id of duplicateXpIds([...xp.values()] as unknown as { id: string; key: string; createdAt: string }[])) {
      xp.delete(id);
      const key = recordKey('xpEvents', id);
      const r = (this.state.records[key] ??= { baseRev: 0, base: null, dirty: false, seq: 0 });
      if (r.baseRev > 0) {
        r.dirty = true;
        r.deleted = true;
        r.seq++;
      } else delete this.state.records[key];
      changed = true;
    }

    if (changed) {
      const next = { ...current, profile, settings } as AppData;
      for (const c of SYNC_COLLECTIONS) (next as unknown as Record<string, Entity[]>)[c] = [...maps[c].values()];
      await this.storage.untracked(() => this.service.applySyncedData(next));
    }
  }

  // ------------------------------------------------------------- conflitos

  /** Resolve uma divergência financeira escolhendo a versão deste aparelho ou da nuvem. */
  async resolveConflict(key: string, choice: 'local' | 'remote') {
    const c = this.state.conflicts.find((x) => x.key === key);
    if (!c) return;
    await this.service.exclusive(async () => {
      const value = choice === 'local' ? c.local : c.remote;
      const map = new Map((this.service.data[c.collection] as unknown as Entity[]).map((e) => [e.id, e]));
      if (value) map.set(c.id, clone(value));
      else map.delete(c.id);
      const next = { ...this.service.data, [c.collection]: [...map.values()] } as AppData;
      await this.storage.untracked(() => this.service.applySyncedData(next));
      const r = (this.state.records[key] ??= { baseRev: 0, base: null, dirty: false, seq: 0 });
      r.dirty = true;
      r.deleted = !value;
      r.seq++;
      this.state.conflicts = this.state.conflicts.filter((x) => x.key !== key);
      await this.save();
    });
    await this.sync();
  }
}
