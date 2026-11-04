import { buildDemoData } from '../domain/demo';
import { getProfession } from '../domain/professions';
import type { AppData, Appointment, Client, Profile, ProfileImage, SealAward, Settings, Transaction, UnlockedAchievement, XpEvent } from '../domain/types';
import { isValidProfileImage } from '../domain/profileImage';
import { DEFAULT_DEVICE_PREFS, DEVICE_PREFS_KEY, readDevicePrefs, type DevicePrefs } from '../domain/preferences';
import { awardsToSave, mergeAward } from '../gamification/seals';
import { tierForLevel, tierKey, type Tier } from '../gamification/tiers';
import { DEFAULT_SETTINGS } from '../domain/types';
import { actionAward, evaluate, totalXp, type ActionType } from '../gamification/engine';
import { levelInfo } from '../gamification/levels';
import { CELEBRATION_KEY, isCelebrationDue, nextCelebration, readCelebration, type CelebrationRecord } from '../gamification/celebration';
import { todayKey } from '../lib/dates';
import { newId } from '../lib/id';
import { parseMoney } from '../lib/money';
import {
  hasErrors, validateAppointment, validateClient, validateProfile, validateTransaction,
  type AppointmentInput, type ClientInput, type Errors, type TransactionInput,
} from '../lib/validation';
import { parseBackup, serializeBackup } from '../storage/backup';
import type { StorageAdapter } from '../storage/types';

export class ValidationError<T = unknown> extends Error {
  constructor(public errors: Errors<T>) {
    super('Dados inválidos');
  }
}

/** Resultado de gamificação de uma operação, usado para feedback visual. */
export interface Feedback {
  xpGained: number;
  events: XpEvent[];
  achievements: UnlockedAchievement[];
  levelUp: number | null;
  /** Selos que subiram de estágio nesta operação (não dão XP). */
  seals: SealAward[];
  /** Nova categoria visual (ou novo grau de Diamante) alcançada nesta operação. */
  tierUp: Tier | null;
}

const emptyFeedback = (): Feedback => ({ xpGained: 0, events: [], achievements: [], levelUp: null, seals: [], tierUp: null });

export const emptyData = (): AppData => ({
  profile: null, settings: { ...DEFAULT_SETTINGS }, clients: [], appointments: [], transactions: [], xpEvents: [], achievements: [], sealAwards: [], profileImages: [],
});

type Listener = (data: AppData) => void;
type PrefsListener = (prefs: DevicePrefs) => void;

/**
 * Serviço de aplicação: concentra regras de negócio, persistência e gamificação.
 * A interface (React) apenas lê `data` e chama métodos.
 */
export interface BackupCounts { clients: number; appointments: number; transactions: number }
export interface BackupPreview { exportedAt: string | null; file: BackupCounts; current: BackupCounts }

/** Chave (só neste aparelho) da data do último backup exportado. */
export const LAST_EXPORT_KEY = 'export:lastBackup';

export class AppService {
  private listeners = new Set<Listener>();
  private prefsListeners = new Set<PrefsListener>();
  private queue: Promise<unknown> = Promise.resolve();
  private _prefs: DevicePrefs = DEFAULT_DEVICE_PREFS;
  private _celebration: CelebrationRecord | null = null;
  private _lastExport: string | null = null;

  constructor(
    private storage: StorageAdapter,
    private _data: AppData,
    private now: () => Date = () => new Date(),
  ) {}

  static async load(storage: StorageAdapter, now?: () => Date): Promise<AppService> {
    const data = await storage.loadAll();
    const service = new AppService(storage, data, now);
    // Preferências do aparelho; na primeira abertura da 0.4 o tema vem da escolha anterior.
    const stored = await storage.kvGet<unknown>(DEVICE_PREFS_KEY);
    service._prefs = readDevicePrefs(stored, data.settings.theme);
    if (stored === undefined) await storage.kvSet(DEVICE_PREFS_KEY, service._prefs);
    // Comemorações: na primeira abertura da versão nova, o que já foi conquistado não é comemorado de novo.
    service._celebration = readCelebration(await storage.kvGet<unknown>(CELEBRATION_KEY));
    if (!service._celebration && data.profile) await service.recordCelebration(true);
    const last = await storage.kvGet<unknown>(LAST_EXPORT_KEY);
    service._lastExport = typeof last === 'string' && !Number.isNaN(Date.parse(last)) ? last : null;
    return service;
  }

  /** Categoria atual (derivada do nível; não é gravada). */
  get currentTier(): Tier {
    return tierForLevel(levelInfo(totalXp(this._data.xpEvents)).level);
  }

  /**
   * Categoria que ainda precisa ser comemorada neste aparelho (subiu por sincronização,
   * por exemplo). Sem registro ainda, grava a atual em silêncio e devolve null.
   */
  celebrationDue(): Tier | null {
    if (!this._data.profile) return null;
    if (!this._celebration) {
      void this.recordCelebration(true);
      return null;
    }
    const tier = this.currentTier;
    return isCelebrationDue(tier, this._celebration) ? tier : null;
  }

  /** Marca a categoria atual como comemorada (nunca volta para trás; `reset` regrava a atual). */
  async recordCelebration(reset = false): Promise<void> {
    const next = reset ? nextCelebration(this.currentTier, null) : nextCelebration(this.currentTier, this._celebration);
    this._celebration = next;
    await this.storage.kvSet(CELEBRATION_KEY, next);
  }

  /** Data do último backup exportado deste aparelho (só neste aparelho; não sincroniza). */
  get lastBackupExportAt(): string | null {
    return this._lastExport;
  }

  /** Registra que um backup completo foi salvo ou compartilhado agora. Não altera os dados. */
  noteBackupExported(): Promise<void> {
    return this.run(async () => {
      const at = this.now().toISOString();
      await this.storage.kvSet(LAST_EXPORT_KEY, at);
      this._lastExport = at;
    });
  }

  /** Preferências deste aparelho (tema, densidade, ocultar valores, animações). */
  get devicePrefs(): DevicePrefs {
    return this._prefs;
  }

  subscribePrefs(fn: PrefsListener): () => void {
    this.prefsListeners.add(fn);
    return () => this.prefsListeners.delete(fn);
  }

  /** Grava só neste aparelho (nunca sincroniza nem entra no backup). */
  updateDevicePrefs(patch: Partial<Omit<DevicePrefs, 'version'>>): Promise<void> {
    return this.run(async () => {
      const next = readDevicePrefs({ ...this._prefs, ...patch }, undefined);
      await this.storage.kvSet(DEVICE_PREFS_KEY, next);
      this._prefs = next;
      this.prefsListeners.forEach((l) => l(next));
    });
  }

  get data(): AppData {
    return this._data;
  }

  get storageKind(): string {
    return this.storage.kind;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(data: AppData) {
    this._data = data;
    this.listeners.forEach((l) => l(data));
  }

  /** Executa `fn` com acesso exclusivo aos dados (usado pela sincronização). */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.run(fn);
  }

  /**
   * Substitui os dados pelos resultantes da sincronização, numa única
   * transação. Deve ser chamado dentro de `exclusive`.
   */
  async applySyncedData(data: AppData): Promise<void> {
    await this.storage.replaceAll(data);
    this.set(data);
  }

  /** Serializa as operações para evitar condições de corrida. */
  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private stamp() {
    return this.now().toISOString();
  }

  // ------------------------------------------------------------ gamificação

  private async gamify(action?: { type: ActionType; id: string; label: string; isDemo?: boolean }): Promise<Feedback> {
    const d = this._data;
    if (!d.profile) return emptyFeedback();
    const now = this.now();
    const before = levelInfo(totalXp(d.xpEvents)).level;
    const events: XpEvent[] = [];
    if (action && !action.isDemo) {
      const ev = actionAward(action.type, action.id, action.label, d.xpEvents, now);
      if (ev) events.push(ev);
    }
    const result = evaluate(d.profile, getProfession(d.profile.professionId), { ...d, xpEvents: [...d.xpEvents, ...events] }, now);
    events.push(...result.xpEvents);
    if (events.length) await this.storage.xpEvents.putMany(events);
    if (result.achievements.length) await this.storage.achievements.putMany(result.achievements);
    const xpEvents = [...d.xpEvents, ...events];
    this.set({ ...d, xpEvents, achievements: [...d.achievements, ...result.achievements] });
    const seals = await this.awardSeals();
    const after = levelInfo(totalXp(xpEvents)).level;
    return {
      xpGained: events.reduce((s, e) => s + e.xp, 0),
      events,
      achievements: result.achievements,
      levelUp: after > before ? after : null,
      seals,
      tierUp: tierKey(tierForLevel(after)) !== tierKey(tierForLevel(before)) ? tierForLevel(after) : null,
    };
  }

  /**
   * Grava o maior estágio já merecido de cada selo (sem XP, sem tocar no histórico).
   * Nunca reduz um estágio guardado. Devolve os selos que subiram de estágio.
   */
  private async awardSeals(): Promise<SealAward[]> {
    const d = this._data;
    if (!d.profile) return [];
    const changed = awardsToSave(d, d.sealAwards, this.now());
    if (!changed.length) return [];
    await this.storage.sealAwards.putMany(changed);
    const byId = new Map(d.sealAwards.map((a) => [a.id, a]));
    const raised = changed.filter((c) => c.stage > (byId.get(c.id)?.stage ?? 0));
    for (const c of changed) byId.set(c.id, c);
    this.set({ ...this._data, sealAwards: [...byId.values()] });
    return raised;
  }

  /**
   * Reconhece selos já merecidos pelos registros atuais (primeira abertura da 0.4,
   * depois de sincronizar ou importar). Idempotente; não cria XP.
   */
  reconcileSeals(): Promise<SealAward[]> {
    return this.run(() => this.awardSeals());
  }

  // ------------------------------------------------------------ perfil

  completeOnboarding(input: Pick<Profile, 'name' | 'businessName' | 'professionId'>): Promise<Profile> {
    return this.run(async () => {
      const errors = validateProfile(input);
      if (hasErrors(errors)) throw new ValidationError(errors);
      const profile: Profile = {
        name: input.name.trim(), businessName: input.businessName.trim(), professionId: input.professionId,
        createdAt: this.stamp(), weeklyGoalServices: 5, monthlyGoalRevenue: 300_000,
      };
      await this.storage.saveProfile(profile);
      this.set({ ...this._data, profile });
      await this.recordCelebration(true);
      return profile;
    });
  }

  updateProfile(patch: Partial<Profile>): Promise<Feedback> {
    return this.run(async () => {
      const current = this._data.profile;
      if (!current) throw new Error('Perfil não encontrado');
      const profile = { ...current, ...patch };
      const errors = validateProfile(profile);
      if (hasErrors(errors)) throw new ValidationError(errors);
      profile.name = profile.name.trim();
      profile.businessName = profile.businessName.trim();
      profile.weeklyGoalServices = Math.min(200, Math.max(1, Math.round(profile.weeklyGoalServices)));
      profile.monthlyGoalRevenue = Math.min(100_000_000, Math.max(100, Math.round(profile.monthlyGoalRevenue)));
      await this.storage.saveProfile(profile);
      this.set({ ...this._data, profile });
      return this.gamify();
    });
  }

  /** Define a foto de perfil (já otimizada pela interface) e a seleciona como imagem do perfil. */
  setProfileImage(img: ProfileImage): Promise<void> {
    return this.run(async () => {
      if (!isValidProfileImage(img)) throw new Error('Foto inválida ou grande demais.');
      await this.storage.profileImages.put(img);
      const settings: Settings = { ...this._data.settings, avatar: { kind: 'foto' } };
      await this.storage.saveSettings(settings);
      this.set({ ...this._data, profileImages: [img], settings });
    });
  }

  /** Remove a foto (do aparelho e, com conta conectada, da nuvem) e volta para as iniciais. */
  removeProfileImage(): Promise<void> {
    return this.run(async () => {
      for (const img of this._data.profileImages) await this.storage.profileImages.remove(img.id);
      const settings: Settings = { ...this._data.settings, avatar: { kind: 'iniciais' } };
      await this.storage.saveSettings(settings);
      this.set({ ...this._data, profileImages: [], settings });
    });
  }

  updateSettings(patch: Partial<Settings>): Promise<void> {
    return this.run(async () => {
      const settings = { ...this._data.settings, ...patch };
      await this.storage.saveSettings(settings);
      this.set({ ...this._data, settings });
    });
  }

  // ------------------------------------------------------------ clientes

  saveClient(input: ClientInput, id?: string): Promise<{ client: Client; feedback: Feedback }> {
    return this.run(async () => {
      const errors = validateClient(input);
      if (hasErrors(errors)) throw new ValidationError(errors);
      const existing = id ? this._data.clients.find((c) => c.id === id) : undefined;
      if (id && !existing) throw new Error('Cliente não encontrado');
      const stamp = this.stamp();
      const client: Client = {
        id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? stamp, updatedAt: stamp,
        ...(existing?.isDemo ? { isDemo: true } : {}),
        name: input.name.trim(), phone: input.phone.trim(), email: input.email.trim(), address: input.address.trim(), notes: input.notes.trim(),
      };
      await this.storage.clients.put(client);
      const clients = existing ? this._data.clients.map((c) => (c.id === client.id ? client : c)) : [...this._data.clients, client];
      this.set({ ...this._data, clients });
      const feedback = existing ? await this.gamify() : await this.gamify({ type: 'client_created', id: client.id, label: 'Novo cliente cadastrado', isDemo: client.isDemo });
      return { client, feedback };
    });
  }

  /** Exclui o cliente. Os serviços dele são mantidos, sem vínculo. */
  deleteClient(id: string): Promise<void> {
    return this.run(async () => {
      const affected = this._data.appointments.filter((a) => a.clientId === id).map((a) => ({ ...a, clientId: null, updatedAt: this.stamp() }));
      await this.storage.appointments.putMany(affected);
      await this.storage.clients.remove(id);
      const byId = new Map(affected.map((a) => [a.id, a]));
      this.set({
        ...this._data,
        clients: this._data.clients.filter((c) => c.id !== id),
        appointments: this._data.appointments.map((a) => byId.get(a.id) ?? a),
      });
    });
  }

  // ------------------------------------------------------------ agenda

  saveAppointment(input: AppointmentInput, id?: string): Promise<{ appointment: Appointment; feedback: Feedback }> {
    return this.run(async () => {
      const errors = validateAppointment(input);
      if (hasErrors(errors)) throw new ValidationError(errors);
      const existing = id ? this._data.appointments.find((a) => a.id === id) : undefined;
      if (id && !existing) throw new Error('Agendamento não encontrado');
      const stamp = this.stamp();
      const appointment: Appointment = {
        id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? stamp, updatedAt: stamp,
        ...(existing?.isDemo ? { isDemo: true } : {}),
        title: input.title.trim(),
        clientId: input.clientId && this._data.clients.some((c) => c.id === input.clientId) ? input.clientId : null,
        date: input.date, time: input.time, price: parseMoney(input.price) ?? 0, notes: input.notes.trim(),
        status: existing?.status ?? 'agendado', completedAt: existing?.completedAt ?? null, transactionId: existing?.transactionId ?? null,
      };
      await this.storage.appointments.put(appointment);
      const appointments = existing
        ? this._data.appointments.map((a) => (a.id === appointment.id ? appointment : a))
        : [...this._data.appointments, appointment];
      this.set({ ...this._data, appointments });
      const feedback = existing ? await this.gamify() : await this.gamify({ type: 'appointment_created', id: appointment.id, label: 'Novo agendamento', isDemo: appointment.isDemo });
      return { appointment, feedback };
    });
  }

  /** Conclui o serviço e, opcionalmente, lança a receita correspondente. */
  completeAppointment(id: string, options: { registerIncome: boolean }): Promise<Feedback> {
    return this.run(async () => {
      const a = this._data.appointments.find((x) => x.id === id);
      if (!a) throw new Error('Agendamento não encontrado');
      if (a.status === 'concluido') return emptyFeedback();
      const stamp = this.stamp();
      let transactions = this._data.transactions;
      let transactionId = a.transactionId;
      if (options.registerIncome && a.price > 0 && !transactionId) {
        const profession = getProfession(this._data.profile?.professionId);
        const tx: Transaction = {
          id: newId(), createdAt: stamp, updatedAt: stamp, ...(a.isDemo ? { isDemo: true } : {}),
          type: 'receita', amount: a.price, description: a.title, category: profession.incomeCategories[0]!,
          date: a.date > todayKey(this.now()) ? todayKey(this.now()) : a.date, appointmentId: a.id,
        };
        await this.storage.transactions.put(tx);
        transactions = [...transactions, tx];
        transactionId = tx.id;
      }
      const updated: Appointment = { ...a, status: 'concluido', completedAt: stamp, updatedAt: stamp, transactionId };
      await this.storage.appointments.put(updated);
      this.set({ ...this._data, transactions, appointments: this._data.appointments.map((x) => (x.id === id ? updated : x)) });
      const terms = getProfession(this._data.profile?.professionId).terms;
      return this.gamify({ type: 'appointment_completed', id, label: `${terms.service} ${terms.completedLabel}`, isDemo: a.isDemo });
    });
  }

  /** Muda o status (reabrir/cancelar). Remove a receita automática vinculada, se houver. */
  setAppointmentStatus(id: string, status: 'agendado' | 'cancelado'): Promise<void> {
    return this.run(async () => {
      const a = this._data.appointments.find((x) => x.id === id);
      if (!a) throw new Error('Agendamento não encontrado');
      let transactions = this._data.transactions;
      if (a.transactionId) {
        await this.storage.transactions.remove(a.transactionId);
        transactions = transactions.filter((t) => t.id !== a.transactionId);
      }
      const updated: Appointment = { ...a, status, completedAt: null, transactionId: null, updatedAt: this.stamp() };
      await this.storage.appointments.put(updated);
      this.set({ ...this._data, transactions, appointments: this._data.appointments.map((x) => (x.id === id ? updated : x)) });
    });
  }

  /** Exclui o agendamento e a receita gerada automaticamente por ele. */
  deleteAppointment(id: string): Promise<void> {
    return this.run(async () => {
      const a = this._data.appointments.find((x) => x.id === id);
      if (!a) return;
      if (a.transactionId) await this.storage.transactions.remove(a.transactionId);
      await this.storage.appointments.remove(id);
      this.set({
        ...this._data,
        appointments: this._data.appointments.filter((x) => x.id !== id),
        transactions: this._data.transactions.filter((t) => t.id !== a.transactionId),
      });
    });
  }

  // ------------------------------------------------------------ financeiro

  saveTransaction(input: TransactionInput, id?: string): Promise<{ transaction: Transaction; feedback: Feedback }> {
    return this.run(async () => {
      const errors = validateTransaction(input);
      if (hasErrors(errors)) throw new ValidationError(errors);
      const existing = id ? this._data.transactions.find((t) => t.id === id) : undefined;
      if (id && !existing) throw new Error('Lançamento não encontrado');
      const stamp = this.stamp();
      const transaction: Transaction = {
        id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? stamp, updatedAt: stamp,
        ...(existing?.isDemo ? { isDemo: true } : {}),
        type: input.type as Transaction['type'], amount: parseMoney(input.amount)!, description: input.description.trim(),
        category: input.category.trim(), date: input.date, appointmentId: existing?.appointmentId ?? null,
      };
      await this.storage.transactions.put(transaction);
      const transactions = existing
        ? this._data.transactions.map((t) => (t.id === transaction.id ? transaction : t))
        : [...this._data.transactions, transaction];
      this.set({ ...this._data, transactions });
      const label = transaction.type === 'receita' ? 'Receita registrada' : 'Despesa registrada';
      const feedback = existing ? await this.gamify() : await this.gamify({ type: 'transaction_created', id: transaction.id, label, isDemo: transaction.isDemo });
      return { transaction, feedback };
    });
  }

  deleteTransaction(id: string): Promise<void> {
    return this.run(async () => {
      const t = this._data.transactions.find((x) => x.id === id);
      if (!t) return;
      let appointments = this._data.appointments;
      const linked = appointments.find((a) => a.transactionId === id);
      if (linked) {
        const updated = { ...linked, transactionId: null, updatedAt: this.stamp() };
        await this.storage.appointments.put(updated);
        appointments = appointments.map((a) => (a.id === linked.id ? updated : a));
      }
      await this.storage.transactions.remove(id);
      this.set({ ...this._data, appointments, transactions: this._data.transactions.filter((x) => x.id !== id) });
    });
  }

  // ------------------------------------------------------------ dados

  hasDemoData(): boolean {
    const d = this._data;
    return d.clients.some((c) => c.isDemo) || d.appointments.some((a) => a.isDemo) || d.transactions.some((t) => t.isDemo);
  }

  loadDemoData(): Promise<void> {
    return this.run(async () => {
      if (!this._data.profile || this.hasDemoData()) return;
      const demo = buildDemoData(this._data.profile.professionId, this.now());
      await this.storage.clients.putMany(demo.clients);
      await this.storage.appointments.putMany(demo.appointments);
      await this.storage.transactions.putMany(demo.transactions);
      this.set({
        ...this._data,
        clients: [...this._data.clients, ...demo.clients],
        appointments: [...this._data.appointments, ...demo.appointments],
        transactions: [...this._data.transactions, ...demo.transactions],
      });
    });
  }

  clearDemoData(): Promise<void> {
    return this.run(async () => {
      const d = this._data;
      for (const c of d.clients.filter((x) => x.isDemo)) await this.storage.clients.remove(c.id);
      for (const a of d.appointments.filter((x) => x.isDemo)) await this.storage.appointments.remove(a.id);
      for (const t of d.transactions.filter((x) => x.isDemo)) await this.storage.transactions.remove(t.id);
      this.set({
        ...d,
        clients: d.clients.filter((x) => !x.isDemo),
        appointments: d.appointments.filter((x) => !x.isDemo),
        transactions: d.transactions.filter((x) => !x.isDemo),
      });
    });
  }

  exportBackup(): string {
    return serializeBackup(this._data, this.now());
  }

  /** Lê um arquivo de backup sem alterar nada: resumo do arquivo e dos dados atuais (para a confirmação). */
  previewBackup(text: string): BackupPreview {
    const parsed = parseBackup(text);
    let exportedAt: string | null = null;
    try {
      const raw = JSON.parse(text) as { exportedAt?: unknown };
      if (typeof raw.exportedAt === 'string' && !Number.isNaN(Date.parse(raw.exportedAt))) exportedAt = raw.exportedAt;
    } catch {
      /* parseBackup já validou o JSON */
    }
    const count = (d: AppData) => ({ clients: d.clients.length, appointments: d.appointments.length, transactions: d.transactions.length });
    return { exportedAt, file: count(parsed), current: count(this._data) };
  }

  importBackup(text: string): Promise<void> {
    return this.run(async () => {
      const parsed = parseBackup(text);
      // Selos são permanentes: um backup mais antigo nunca reduz o estágio já alcançado.
      const byId = new Map(parsed.sealAwards.map((a) => [a.id, a]));
      for (const cur of this._data.sealAwards) {
        const imp = byId.get(cur.id);
        byId.set(cur.id, imp ? mergeAward(cur, imp) : cur);
      }
      const data = { ...parsed, sealAwards: [...byId.values()] };
      await this.storage.replaceAll(data);
      this.set(data);
      await this.awardSeals();
      // Categoria vinda do backup não é comemorada como conquista nova.
      await this.recordCelebration(true);
    });
  }

  resetAll(): Promise<void> {
    return this.run(async () => {
      await this.storage.clearAll();
      // "Apagar todos os dados" também volta as preferências do aparelho ao padrão.
      await this.storage.kvDelete(DEVICE_PREFS_KEY);
      await this.storage.kvDelete(CELEBRATION_KEY);
      await this.storage.kvDelete(LAST_EXPORT_KEY);
      this._celebration = null;
      this._lastExport = null;
      this._prefs = { ...DEFAULT_DEVICE_PREFS };
      this.prefsListeners.forEach((l) => l(this._prefs));
      this.set(emptyData());
    });
  }
}
