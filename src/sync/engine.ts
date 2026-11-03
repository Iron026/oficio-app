import type { AppData } from '../domain/types';
import { isValidProfileImage, isValidSealAward } from '../domain/profileImage';
import { newId } from '../lib/id';
import { serializeBackup } from '../storage/backup';
import type { AppService } from '../state/service';
import { duplicateAutoIncomeIds, duplicateXpIds, mergeMeta, mergeRecord } from './merge';
import type { ChangeTracker, TrackedStorage } from './tracked';
import {
  BASE_SYNC_COLLECTIONS,
  V04_SYNC_COLLECTIONS,
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
  /** Os dados deste aparelho vieram de OUTRA conta (desconectada antes). */
  previousAccountEmail: string | null;
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
/**
 * Coleções sincronizadas por padrão. As da 0.4 (selos e foto) só entram com
 * VITE_SYNC_SEALS_PHOTO=1, depois que as regras novas forem publicadas no Firebase.
 */
export function defaultSyncCollections(env: Record<string, string | boolean | undefined> = import.meta.env): readonly SyncCollection[] {
  return env.VITE_SYNC_SEALS_PHOTO === '1' ? [...BASE_SYNC_COLLECTIONS, ...V04_SYNC_COLLECTIONS] : BASE_SYNC_COLLECTIONS;
}

/** Defesa extra (as regras do Firestore já validam): selo ou foto malformados vindos da nuvem são ignorados. */
function validRemote(r: RemoteRecord): boolean {
  if (r.data === null) return true;
  if (r.collection === 'sealAwards') return isValidSealAward(r.data);
  if (r.collection === 'profileImages') return isValidProfileImage(r.data);
  return true;
}

function remoteToData(records: RemoteRecord[], meta: RemoteMeta | null, fallbackSettings: AppData['settings']): AppData {
  const data: AppData = { profile: meta?.data.profile ?? null, settings: meta?.data.settings ?? fallbackSettings, clients: [], appointments: [], transactions: [], xpEvents: [], achievements: [], sealAwards: [], profileImages: [] };
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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 30_000;
  private disposed = false;

  private constructor(
    private service: AppService,
    private storage: TrackedStorage,
    private remoteStore: RemoteStore | null,
    state: SyncState,
    private opts: { now: () => Date; autoSync: boolean; isOnline: () => boolean; collections: readonly SyncCollection[] },
  ) {
    this.state = state;
  }

  /** A coleção participa da sincronização nesta versão/configuração? */
  private syncs(c: SyncCollection): boolean {
    return this.opts.collections.includes(c);
  }

  /** Descarta registros remotos de coleções desativadas (ficam só no aparelho). */
  private onlyEnabled<T extends { records: RemoteRecord[] }>(pulled: T): T {
    return { ...pulled, records: pulled.records.filter((r) => this.syncs(r.collection) && validRemote(r)) };
  }

  static async create(service: AppService, storage: TrackedStorage, remote: RemoteStore | null, opts: Partial<{ now: () => Date; autoSync: boolean; isOnline: () => boolean; collections: readonly SyncCollection[] }> = {}) {
    const saved = await storage.kvGet<SyncState>(STATE_KEY);
    const state = saved?.version === 1 ? saved : freshState(newId());
    if (!saved) await storage.kvSet(STATE_KEY, state);
    const engine = new SyncEngine(service, storage, remote, state, {
      now: opts.now ?? (() => new Date()),
      autoSync: opts.autoSync ?? true,
      isOnline: opts.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false),
      collections: opts.collections ?? defaultSyncCollections(),
    });
    storage.tracker = engine;
    return engine;
  }

  // ------------------------------------------------------------- estado

  /** Conecta a nuvem (carregada sob demanda após a abertura do app). */
  /**
   * Encerra o motor: cancela a sincronização agendada e as novas tentativas e impede novos
   * agendamentos. Usado quando o app é desmontado (ex.: fim de um teste); pendências continuam salvas.
   */
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = this.retryTimer = null;
    this.listeners.clear();
  }

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
  get linkedEmail() {
    return this.state.linkedEmail ?? null;
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
    if (!this.state.linkedUid || !this.syncs(collection)) return;
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
    // Cópia de segurança automática dos dados atuais antes de importar um backup.
    await this.saveBackup('Antes de importar backup');
    if (!this.state.linkedUid) return;
    const present = new Set<string>();
    for (const c of SYNC_COLLECTIONS) if (this.syncs(c)) for (const e of data[c] ?? []) present.add(recordKey(c, e.id));
    for (const key of new Set([...present, ...Object.keys(this.state.records)])) {
      // Selos são permanentes: um backup sem eles nunca gera exclusão na nuvem.
      if (!present.has(key) && key.startsWith('sealAwards__')) continue;
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
    // "Apagar todos os dados" também apaga as cópias de segurança locais.
    for (const k of await this.storage.kvKeys(BACKUP_PREFIX)) await this.storage.kvDelete(k);
    this.state = freshState(this.state.deviceId);
    await this.save();
    this.setStatus({ state: 'desativado' });
  }

  private schedule() {
    if (this.disposed || !this.opts.autoSync || !this.uid || this.uid !== this.state.linkedUid) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync().catch(() => undefined), 1500);
  }

  // ------------------------------------------------------------- cópias de segurança

  async saveBackup(reason: string): Promise<string> {
    const createdAt = this.opts.now().toISOString();
    // Sufixo único: duas cópias no mesmo milissegundo não se sobrescrevem.
    const key = `${BACKUP_PREFIX}${createdAt}-${newId().slice(0, 8)}`;
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
    const pulled = this.onlyEnabled(await this.remote.pull(uid, 0));
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
      previousAccountEmail:
        localHasData && this.state.previousAccount && this.state.previousAccount.uid !== uid ? (this.state.previousAccount.email ?? 'outra conta') : null,
    };
  }

  /**
   * Associa os dados deste aparelho à conta.
   * - Faz cópia de segurança local antes de qualquer mudança.
   * - "mesclar": une tudo pelos identificadores (sem duplicar; idempotente).
   * - "usarNuvem": substitui os dados deste aparelho pelos da conta (a cópia fica guardada).
   * Se a nuvem estiver indisponível, nada é alterado.
   */
  async link(uid: string, mode: LinkMode, email: string | null = null): Promise<void> {
    await this.saveBackup(mode === 'usarNuvem' ? 'Antes de usar os dados da nuvem' : 'Antes de conectar a conta');
    const pulled = this.onlyEnabled(await this.remote.pull(uid, 0)); // falha aqui = nada mudou
    await this.service.exclusive(async () => {
      const next = freshState(this.state.deviceId);
      next.linkedUid = uid;
      next.linkedEmail = email;
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
          if (this.syncs(c)) for (const e of d[c] as unknown as Entity[]) if (!e.isDemo) next.records[recordKey(c, e.id)] = { baseRev: 0, base: null, dirty: true, seq: 1 };
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
    const previous = this.state.linkedUid ? { uid: this.state.linkedUid, email: this.state.linkedEmail ?? null } : (this.state.previousAccount ?? null);
    this.state = { ...freshState(this.state.deviceId), previousAccount: previous };
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
      const pulled = this.onlyEnabled(await this.remote.pull(uid, Math.max(0, this.state.cursor - OVERLAP_MS)));
      // Perfil da conta sumiu da nuvem depois de já ter sido sincronizado: os dados
      // da conta foram excluídos em outro aparelho. Não recria nada; desassocia.
      if (!pulled.meta && this.state.meta.baseRev > 0) {
        await this.unlink();
        this.setStatus({
          state: 'erro',
          message: 'Os dados desta conta foram excluídos da nuvem em outro aparelho. Este aparelho foi desassociado; seus dados continuam aqui.',
        });
        return;
      }
      await this.service.exclusive(async () => {
        await this.applyRemote(pulled.records, pulled.meta);
        await this.save();
      });
      // Registros novos vindos de outro aparelho podem completar um estágio de selo.
      if (pulled.records.length) await this.service.reconcileSeals();
      for (let round = 0; round < 4 && this.pendingCount > 0; round++) await this.pushPending(uid);
      if (this.pendingCount === 0) {
        this.state.lastSyncedAt = this.opts.now().toISOString();
        await this.save();
        this.setStatus({ state: 'sincronizado', at: this.state.lastSyncedAt });
        this.retryDelay = 30_000;
      } else {
        this.setStatus({ state: 'pendente' });
        this.scheduleRetry();
      }
    } catch (err) {
      // Nenhum dado local é alterado em caso de falha: as pendências continuam guardadas.
      this.setStatus(isOfflineError(err) ? { state: 'offline' } : { state: 'erro', message: err instanceof Error ? err.message : 'Falha na sincronização' });
      this.scheduleRetry();
    }
  }

  /** Nova tentativa automática com espera crescente (30 s → 5 min). */
  private scheduleRetry() {
    if (this.disposed || !this.opts.autoSync) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.sync().catch(() => undefined), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 5 * 60_000);
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

    // Receita automática: no máximo uma por serviço (conclusão offline em dois aparelhos).
    const markDeleted = (collection: SyncCollection, id: string) => {
      const key = recordKey(collection, id);
      const r = (this.state.records[key] ??= { baseRev: 0, base: null, dirty: false, seq: 0 });
      if (r.baseRev > 0) {
        r.dirty = true;
        r.deleted = true;
        r.seq++;
      } else delete this.state.records[key];
    };
    const income = duplicateAutoIncomeIds([...maps.transactions.values()] as unknown as Parameters<typeof duplicateAutoIncomeIds>[0]);
    for (const id of income.remove) {
      maps.transactions.delete(id);
      markDeleted('transactions', id);
      changed = true;
    }
    for (const [apptId, keepId] of income.keepByAppointment) {
      const ap = maps.appointments.get(apptId);
      if (!ap || ap.status !== 'concluido' || ap.transactionId === keepId) continue;
      if (ap.transactionId && maps.transactions.has(String(ap.transactionId))) continue; // aponta para receita existente válida
      ap.transactionId = keepId;
      const key = recordKey('appointments', apptId);
      const r = (this.state.records[key] ??= { baseRev: 0, base: null, dirty: false, seq: 0 });
      r.dirty = true;
      r.deleted = false;
      r.seq++;
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
