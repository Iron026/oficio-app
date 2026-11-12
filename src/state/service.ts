import { buildDemoData } from '../domain/demo';
import { getProfession } from '../domain/professions';
import type { AppData, Appointment, Client, Profile, ProfileImage, SealAward, ServiceType, Settings, Transaction, UnlockedAchievement, XpEvent } from '../domain/types';
import { paymentSummary, type PaymentMark, type PaymentMethod } from '../domain/payments';
import { refundGroups, reviewLog } from '../domain/refundReview';
import { addDaysKey } from '../domain/agenda';
import { effectiveRule, isPristineOccurrence, nextVersion, occurrenceId, staleOccurrences, pendingOccurrences, ruleFromRepeat, sameRule, seriesDates, seriesGroups, seriesOf } from '../domain/recurrence';
import { MAX_SERVICE_TYPES, moveServiceType, nextServiceOrder, serviceNameKey } from '../domain/serviceTypes';
import { isValidProfileImage } from '../domain/profileImage';
import { DEFAULT_DEVICE_PREFS, DEVICE_PREFS_KEY, readDevicePrefs, type DevicePrefs } from '../domain/preferences';
import { awardsToSave, mergeAward } from '../gamification/seals';
import { tierForLevel, tierKey, type Tier } from '../gamification/tiers';
import { DEFAULT_SETTINGS } from '../domain/types';
import { readDashboard, type DashboardLayout } from '../domain/dashboard';
import { actionAward, evaluate, totalXp, type ActionType } from '../gamification/engine';
import { levelInfo } from '../gamification/levels';
import { CELEBRATION_KEY, isCelebrationDue, nextCelebration, readCelebration, type CelebrationRecord } from '../gamification/celebration';
import { todayKey } from '../lib/dates';
import { newId } from '../lib/id';
import { parseMoney } from '../lib/money';
import {
  hasErrors, validateAppointment, validateClient, validateProfile, validateServiceType, validateTransaction,
  type AppointmentInput, type ClientInput, type Errors, type ServiceTypeInput, type TransactionInput,
} from '../lib/validation';
import { inspectBackup, serializeBackup, type BackupIntegrity } from '../storage/backup';
import { backupCompatibility, backupCounts, backupLoss, type BackupCompatibility, type BackupCounts, type BackupLoss } from '../domain/backupPreview';
import { duplicateXpIds } from '../sync/merge';
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
  /** Ação reversível (beta.5): a interface oferece "Desfazer" com este bilhete. */
  undo?: UndoTicket;
}

/** Bilhete para desfazer a última ação reversível (válido por {@link UNDO_TTL_MS}). */
export interface UndoTicket { id: number; label: string }

/** Escolha explícita ao concluir (0.5): nada é pré-selecionado na interface. */
export type CompletePayment =
  | { mode: 'integral'; method?: PaymentMethod | null; date?: string }
  | { mode: 'parcial'; amount: number; method?: PaymentMethod | null; date?: string }
  | { mode: 'nenhum' };
export interface CompleteOptions { payment: CompletePayment; opId?: string }
/** beta.3: alcance de uma edição ou cancelamento numa série. */
export type EditScope = 'esta' | 'proximas' | 'serie';
export const UNDO_TTL_MS = 30_000;

type UndoCollection = 'appointments' | 'transactions' | 'clients';
type UndoRecord = Appointment | Transaction | Client;
/**
 * Estado antes e depois de uma ação, por registro afetado (null = não existia). Desfazer só
 * acontece se cada registro ainda estiver exatamente como a ação o deixou; então o estado
 * anterior é regravado pelo armazenamento (sincroniza como qualquer alteração, inclusive offline).
 */
interface UndoEntry {
  id: number;
  label: string;
  at: number;
  changes: { collection: UndoCollection; id: string; before: UndoRecord | null; after: UndoRecord | null }[];
}
const sameRecord = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const emptyFeedback = (): Feedback => ({ xpGained: 0, events: [], achievements: [], levelUp: null, seals: [], tierUp: null });

export const emptyData = (): AppData => ({
  profile: null, settings: { ...DEFAULT_SETTINGS }, clients: [], appointments: [], transactions: [], xpEvents: [], achievements: [], sealAwards: [], profileImages: [], serviceTypes: [],
});

type Listener = (data: AppData) => void;
type PrefsListener = (prefs: DevicePrefs) => void;

/**
 * Serviço de aplicação: concentra regras de negócio, persistência e gamificação.
 * A interface (React) apenas lê `data` e chama métodos.
 */
export type { BackupCounts } from '../domain/backupPreview';
export interface BackupPreview {
  exportedAt: string | null;
  appVersion: string | null;
  /** O arquivo foi exportado por uma versão mais nova do app (a interface avisa antes de restaurar). */
  newerApp: boolean;
  compatibility: BackupCompatibility;
  /** Soma de verificação conferida, ou arquivo antigo sem soma (aceito depois da validação estrutural). */
  integrity: BackupIntegrity;
  file: BackupCounts;
  current: BackupCounts;
  loss: BackupLoss;
}

/** Chave (só neste aparelho) da data do último backup exportado. */
export const LAST_EXPORT_KEY = 'export:lastBackup';

export class AppService {
  private listeners = new Set<Listener>();
  private prefsListeners = new Set<PrefsListener>();
  private queue: Promise<unknown> = Promise.resolve();
  private _prefs: DevicePrefs = DEFAULT_DEVICE_PREFS;
  private _celebration: CelebrationRecord | null = null;
  private _lastExport: string | null = null;
  private _undo: UndoEntry | null = null;
  private undoSeq = 0;

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
    // beta.3: dados de outro aparelho podem ter encerrado ou mudado uma série; ajusta as ocorrências
    // geradas depois desta sincronização (fila própria, sem esperar aqui).
    queueMicrotask(() => void this.extendSeries().catch(() => undefined));
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

  /**
   * Painel personalizável (beta.5): aplica uma mudança ao layout atual (fila do serviço, sem corrida entre toques
   * rápidos) e grava em `settings.dashboard`. Não mexe em dados nem em XP.
   */
  updateDashboard(change: (layout: DashboardLayout, at: string) => DashboardLayout): Promise<void> {
    return this.run(async () => {
      const dashboard = change(readDashboard(this._data.settings.dashboard), this.stamp());
      const settings = { ...this._data.settings, dashboard };
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
      // `...existing` primeiro: campos que esta versão não conhece (gravados por versões
      // mais novas) são preservados ao editar. Ver docs/COMPATIBILIDADE-0.5.md.
      const client: Client = {
        ...existing,
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

  /**
   * Exclui o cliente. Os serviços dele são mantidos, sem vínculo. Reversível (beta.7): desfazer
   * devolve o cliente com todos os campos (inclusive os gravados por versões mais novas) e o
   * vínculo dos serviços que eram dele. XP e selos não mudam ao excluir nem ao desfazer.
   */
  deleteClient(id: string): Promise<UndoTicket | null> {
    return this.run(async () => {
      const client = this._data.clients.find((c) => c.id === id);
      if (!client) return null;
      const before = this._data.appointments.filter((a) => a.clientId === id);
      const affected = before.map((a) => ({ ...a, clientId: null, updatedAt: this.stamp() }));
      await this.storage.appointments.putMany(affected);
      await this.storage.clients.remove(id);
      const byId = new Map(affected.map((a) => [a.id, a]));
      this.set({
        ...this._data,
        clients: this._data.clients.filter((c) => c.id !== id),
        appointments: this._data.appointments.map((a) => byId.get(a.id) ?? a),
      });
      return this.recordUndo('Cliente excluído', [
        { collection: 'clients', id, before: client, after: null },
        ...before.map((a, i) => ({ collection: 'appointments' as const, id: a.id, before: a, after: affected[i]! })),
      ]);
    });
  }

  // ------------------------------------------------------------ agenda

  /**
   * Agenda ou edita. beta.3: com `input.repeat` (ao criar) nasce uma série; numa ocorrência de série, `scope`
   * escolhe "só esta" (vira exceção), "esta e as próximas" ou "toda a série" (desde a primeira em aberto).
   */
  saveAppointment(input: AppointmentInput, id?: string, scope: EditScope = 'esta'): Promise<{ appointment: Appointment; feedback: Feedback }> {
    return this.run(async () => {
      const errors = validateAppointment(input);
      if (hasErrors(errors)) throw new ValidationError(errors);
      const existing = id ? this._data.appointments.find((a) => a.id === id) : undefined;
      if (id && !existing) throw new Error('Agendamento não encontrado');
      if (!existing && input.repeat?.freq) return this.createSeries(input);
      if (existing && seriesOf(existing) && scope !== 'esta') return this.editSeries(existing, input, scope);
      const stamp = this.stamp();
      const appointment: Appointment = {
        ...existing,
        id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? stamp, updatedAt: stamp,
        ...(existing?.isDemo ? { isDemo: true } : {}),
        title: input.title.trim(),
        clientId: input.clientId && this._data.clients.some((c) => c.id === input.clientId) ? input.clientId : null,
        date: input.date, time: input.time, price: parseMoney(input.price) ?? 0, notes: input.notes.trim(),
        status: existing?.status ?? 'agendado', completedAt: existing?.completedAt ?? null, transactionId: existing?.transactionId ?? null,
        // 0.5: serviço novo nasce com controle de pagamento; os antigos não são reinterpretados.
        ...(existing ? {} : { payments: true }),
        // Ocorrência de série editada sozinha vira exceção: fica fora das edições em lote e do modelo do gerador.
        ...(existing && seriesOf(existing) ? { series: { ...existing.series, detached: true } } : {}),
        // Duração só é gravada quando informada; nada é presumido. "Não informar" ('') num registro que
        // tinha duração grava null (ausência explícita, que sincroniza e passa pelas regras e pelo backup).
        // Sem o campo na entrada (chamadas antigas), a duração existente fica como está.
        ...(input.duration ? { duration: Number(input.duration) } : input.duration === '' && existing?.duration != null ? { duration: null } : {}),
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

  /**
   * Conclui o serviço (0.5). O recebimento é sempre uma escolha explícita da pessoa:
   *  - `integral`: registra como pagamento só o que falta (preço − líquido já recebido, inclusive
   *    antecipado). Se nada falta, não registra nada — nunca uma segunda receita para valor já recebido;
   *  - `parcial`: registra o valor informado;
   *  - `nenhum`: conclui sem registrar pagamento (fica "a receber").
   * Compatível com a chamada antiga `{ registerIncome }` (true = integral, false = nenhum).
   * O XP de conclusão continua uma vez por serviço; pagamentos não dão XP.
   */
  completeAppointment(id: string, options: CompleteOptions | { registerIncome: boolean }): Promise<Feedback> {
    return this.run(async () => {
      const o: CompleteOptions = 'registerIncome' in options ? { payment: options.registerIncome ? { mode: 'integral' } : { mode: 'nenhum' } } : options;
      const a = this._data.appointments.find((x) => x.id === id);
      if (!a) throw new Error('Agendamento não encontrado');
      if (a.status === 'concluido') return emptyFeedback();
      const stamp = this.stamp();
      const updated: Appointment = { ...a, status: 'concluido', completedAt: stamp, updatedAt: stamp, payments: true };
      const payment = o.payment.mode === 'nenhum' ? null : this.buildPayment(updated, o.payment.mode === 'integral' ? 'restante' : o.payment.amount, { method: o.payment.method, date: o.payment.date, opId: o.opId });
      if (payment) await this.storage.transactions.put(payment);
      await this.storage.appointments.put(updated);
      this.set({
        ...this._data,
        transactions: payment ? [...this._data.transactions, payment] : this._data.transactions,
        appointments: this._data.appointments.map((x) => (x.id === id ? updated : x)),
      });
      const terms = getProfession(this._data.profile?.professionId).terms;
      const undo = this.recordUndo(`${terms.service} ${terms.completedLabel}`, [
        { collection: 'appointments', id, before: a, after: updated },
        ...(payment ? [{ collection: 'transactions' as const, id: payment.id, before: null, after: payment }] : []),
      ]);
      // XP de conclusão: uma vez por serviço (chave por id). Desfazer não o retira, e concluir de novo não o repete.
      const fb = await this.gamify({ type: 'appointment_completed', id, label: `${terms.service} ${terms.completedLabel}`, isDemo: a.isDemo });
      return { ...fb, undo };
    });
  }

  /**
   * Monta o lançamento de um pagamento (sem gravar). `restante` = o que falta; 0 → null.
   * Id estável: o id da operação vindo da interface (repetir o envio não duplica). Quitação do
   * restante leva uma chave que permite reconhecer a mesma quitação feita em outro aparelho offline.
   */
  private buildPayment(a: Appointment, amount: number | 'restante', opts: { method?: PaymentMethod | null; date?: string; opId?: string }): Transaction | null {
    const s = paymentSummary(a, this._data.transactions);
    const value = amount === 'restante' ? Math.max(0, a.price - s.net) : amount;
    if (amount === 'restante' && value === 0) return null;
    if (!Number.isInteger(value) || value <= 0) throw new Error('Informe um valor maior que zero.');
    if (value > 100_000_000) throw new Error('Valor muito alto.');
    const date = opts.date ?? todayKey(this.now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida.');
    const stamp = this.stamp();
    const profession = getProfession(this._data.profile?.professionId);
    const mark: PaymentMark = { kind: 'pagamento', method: opts.method ?? null, key: amount === 'restante' ? `quitacao:${a.id}:${s.received}:${s.refunded}` : null };
    return {
      id: opts.opId ? `pg-${opts.opId}` : newId(), createdAt: stamp, updatedAt: stamp, ...(a.isDemo ? { isDemo: true } : {}),
      type: 'receita', amount: value, description: a.title, category: profession.incomeCategories[0]!, date, appointmentId: a.id,
      payment: mark as unknown as Record<string, unknown>,
    };
  }

  /**
   * Registra um pagamento do serviço (integral do restante, parcial ou antecipado — antes da data do
   * serviço). Nunca dá XP. Idempotente pelo id da operação: enviar de novo devolve o mesmo pagamento.
   */
  registerPayment(appointmentId: string, input: { amount: number | 'restante'; method?: PaymentMethod | null; date?: string; opId?: string }): Promise<{ transaction: Transaction | null; undo?: UndoTicket }> {
    return this.run(async () => {
      const a = this._data.appointments.find((x) => x.id === appointmentId);
      if (!a) throw new Error('Agendamento não encontrado');
      if (input.opId) {
        const existing = this._data.transactions.find((t) => t.id === `pg-${input.opId}`);
        if (existing) return { transaction: existing };
      }
      const tx = this.buildPayment(a, input.amount, input);
      if (!tx) return { transaction: null };
      const updated: Appointment = a.payments === true ? a : { ...a, payments: true, updatedAt: tx.createdAt };
      await this.storage.transactions.put(tx);
      if (updated !== a) await this.storage.appointments.put(updated);
      this.set({ ...this._data, transactions: [...this._data.transactions, tx], appointments: this._data.appointments.map((x) => (x.id === a.id ? updated : x)) });
      const undo = this.recordUndo('Pagamento registrado', [
        { collection: 'transactions', id: tx.id, before: null, after: tx },
        ...(updated !== a ? [{ collection: 'appointments' as const, id: a.id, before: a, after: updated }] : []),
      ]);
      return { transaction: tx, undo };
    });
  }

  /**
   * Estorna (devolve) um pagamento, total ou em parte, sem apagar nada: cria uma despesa vinculada ao
   * serviço com `payment.of` apontando para o pagamento. O pagamento original continua no histórico.
   * Não estorna mais do que resta do pagamento. Nunca dá XP. Idempotente pelo id da operação.
   */
  refundPayment(paymentId: string, input: { amount: number | 'total'; date?: string; opId?: string }): Promise<{ transaction: Transaction; undo?: UndoTicket }> {
    return this.run(async () => {
      if (input.opId) {
        const existing = this._data.transactions.find((t) => t.id === `es-${input.opId}`);
        if (existing) return { transaction: existing };
      }
      const p = this._data.transactions.find((t) => t.id === paymentId);
      if (!p || p.type !== 'receita' || !p.appointmentId) throw new Error('Pagamento não encontrado.');
      const already = this._data.transactions.filter((t) => t.type === 'despesa' && (t.payment as Record<string, unknown> | null | undefined)?.of === paymentId).reduce((n, t) => n + t.amount, 0);
      const refundable = Math.max(0, p.amount - already);
      const value = input.amount === 'total' ? refundable : input.amount;
      if (!Number.isInteger(value) || value <= 0) throw new Error('Informe um valor maior que zero.');
      if (value > refundable) throw new Error(`Só é possível estornar até ${(refundable / 100).toFixed(2).replace('.', ',')}.`);
      const date = input.date ?? todayKey(this.now());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida.');
      const stamp = this.stamp();
      // beta.3: estornos não levam chave de deduplicação — nenhuma versão os remove automaticamente.
      // Incoerências entre aparelhos (estornos acima do pago) vão para revisão (refundReview.ts).
      const mark: PaymentMark = { kind: 'estorno', of: paymentId, key: null };
      const tx: Transaction = {
        id: input.opId ? `es-${input.opId}` : newId(), createdAt: stamp, updatedAt: stamp, ...(p.isDemo ? { isDemo: true } : {}),
        type: 'despesa', amount: value, description: `Estorno: ${p.description || 'pagamento'}`, category: 'Estorno', date,
        appointmentId: p.appointmentId, payment: mark as unknown as Record<string, unknown>,
      };
      await this.storage.transactions.put(tx);
      this.set({ ...this._data, transactions: [...this._data.transactions, tx] });
      const undo = this.recordUndo('Estorno registrado', [{ collection: 'transactions', id: tx.id, before: null, after: tx }]);
      return { transaction: tx, undo };
    });
  }

  /**
   * Resolve um grupo de estornos incoerente (beta.3), sempre por decisão da pessoa:
   *  - `manter`: os estornos aconteceram de verdade; grava a confirmação (`payment.review`) em cada estorno
   *    do grupo, presa à assinatura do conjunto (um estorno novo reabre a revisão);
   *  - `remover`: exclui o estorno escolhido (registrado por engano, por exemplo, nos dois aparelhos) e
   *    anota no pagamento o que foi removido, quando e por quê (`reviews`, fora de `payment`).
   * Nunca dá XP. Reversível pelo "Desfazer".
   */
  resolveRefundIssue(signature: string, decision: { keep: true } | { remove: string }): Promise<UndoTicket> {
    return this.run(async () => {
      const issue = refundGroups(this._data.transactions).find((g) => g.signature === signature);
      if (!issue) throw new Error('Estes estornos mudaram desde a revisão. Confira de novo.');
      const stamp = this.stamp();
      const changes: { collection: 'transactions'; id: string; before: Transaction | null; after: Transaction | null }[] = [];
      let transactions = this._data.transactions;
      if ('keep' in decision) {
        for (const r of issue.refunds) {
          const after: Transaction = { ...r, updatedAt: stamp, payment: { ...(r.payment ?? {}), review: { ack: signature, at: stamp } } };
          await this.storage.transactions.put(after);
          changes.push({ collection: 'transactions', id: r.id, before: r, after });
          transactions = transactions.map((t) => (t.id === r.id ? after : t));
        }
      } else {
        const r = issue.refunds.find((x) => x.id === decision.remove);
        if (!r) throw new Error('Estorno não encontrado.');
        await this.storage.transactions.remove(r.id);
        changes.push({ collection: 'transactions', id: r.id, before: r, after: null });
        transactions = transactions.filter((t) => t.id !== r.id);
        if (issue.payment) {
          const p = issue.payment;
          const log = [...reviewLog(p), { at: stamp, decision: 'removido' as const, refund: { id: r.id, amount: r.amount, date: r.date, createdAt: r.createdAt } }];
          // Fora de `payment`: uma receita automática da 0.4 (payment nulo) continua sendo legado.
          const after: Transaction = { ...p, updatedAt: stamp, reviews: log as unknown as Record<string, unknown>[] };
          await this.storage.transactions.put(after);
          changes.push({ collection: 'transactions', id: p.id, before: p, after });
          transactions = transactions.map((t) => (t.id === p.id ? after : t));
        }
      }
      this.set({ ...this._data, transactions });
      return this.recordUndo('keep' in decision ? 'Estornos confirmados' : 'Estorno removido na revisão', changes);
    });
  }

  /**
   * Muda o status (reabrir/cancelar). Desde a 0.5, nunca apaga dinheiro: pagamentos, estornos e a
   * receita automática legada da 0.4 continuam em Finanças e no histórico do serviço. Reabrir mantém
   * o controle de pagamento; cancelar zera o que é devido (nada fica "a receber").
   */
  setAppointmentStatus(id: string, status: 'agendado' | 'cancelado'): Promise<UndoTicket> {
    return this.run(async () => {
      const a = this._data.appointments.find((x) => x.id === id);
      if (!a) throw new Error('Agendamento não encontrado');
      const updated: Appointment = { ...a, status, completedAt: null, updatedAt: this.stamp() };
      await this.storage.appointments.put(updated);
      this.set({ ...this._data, appointments: this._data.appointments.map((x) => (x.id === id ? updated : x)) });
      return this.recordUndo(status === 'agendado' ? 'Reaberto' : 'Cancelado', [{ collection: 'appointments', id, before: a, after: updated }]);
    });
  }

  /** Atalho da 0.4 ("Lançar receita"): registra o que falta como pagamento. Nunca duplica nem dá XP. */
  registerAppointmentIncome(id: string): Promise<{ transaction: Transaction | null; undo?: UndoTicket }> {
    const a = this._data.appointments.find((x) => x.id === id);
    if (a && a.status !== 'concluido') return Promise.reject(new Error('Só é possível lançar a receita de um serviço concluído.'));
    return this.registerPayment(id, { amount: 'restante' });
  }

  /**
   * Exclui o agendamento. Desde a 0.5, os valores recebidos nunca somem junto: pagamentos, estornos e
   * a receita automática legada continuam em Finanças (como "<serviço> excluído"); a interface avisa
   * antes. Reversível (beta.7), em qualquer situação; desfazer não dá XP de novo.
   */
  deleteAppointment(id: string): Promise<UndoTicket | null> {
    return this.run(async () => {
      const a = this._data.appointments.find((x) => x.id === id);
      if (!a) return null;
      await this.storage.appointments.remove(id);
      let appointments = this._data.appointments.filter((x) => x.id !== id);
      const changes: UndoEntry['changes'] = [{ collection: 'appointments', id, before: a, after: null }];
      // beta.3: a ocorrência excluída nunca volta. Se nenhuma outra da série "lembra" até onde ela já foi
      // gerada, grava esse limite na mais recente que sobrou (o gerador só cria depois dele).
      const s = seriesOf(a);
      if (s) {
        const rest = seriesGroups(appointments).get(s.id) ?? [];
        const rule = effectiveRule(rest);
        // O limite que a excluída conhecia (o dela ou a própria data, o que for maior) passa para quem fica:
        // excluir várias seguidas nunca "esquece" até onde a série já foi gerada.
        const keep = s.through > a.date ? s.through : a.date;
        if (rule && rule.through < keep) {
          const last = rest[rest.length - 1]!;
          const after: Appointment = { ...last, updatedAt: this.stamp(), series: { ...last.series, through: keep } };
          await this.storage.appointments.put(after);
          appointments = appointments.map((x) => (x.id === last.id ? after : x));
          changes.push({ collection: 'appointments', id: last.id, before: last, after });
        }
      }
      this.set({ ...this._data, appointments });
      const terms = getProfession(this._data.profile?.professionId).terms;
      return this.recordUndo(`${terms.service} ${terms.serviceArticle === 'a' ? 'excluída' : 'excluído'}`, changes);
    });
  }

  // ------------------------------------------------------------ recorrência (beta.3)

  /**
   * Materializa as ocorrências que faltam (até 90 dias, no máximo 120 por série). Idempotente e sem XP:
   * só a criação da série conta como agendamento. Chamado ao abrir o app e a Agenda.
   */
  extendSeries(): Promise<number> {
    return this.run(async () => (await this.materialize()).length);
  }

  private async materialize(): Promise<Appointment[]> {
    // Antes de gerar: ocorrências geradas e intocadas, sem pagamento, que a regra atual não prevê (série
    // encerrada ou mudada em outro aparelho enquanto este estava offline) saem. Nada tocado é removido.
    const stale = staleOccurrences(this._data.appointments, this.linkedIds());
    if (stale.length) {
      for (const a of stale) await this.storage.appointments.remove(a.id);
      const gone = new Set(stale.map((a) => a.id));
      this.set({ ...this._data, appointments: this._data.appointments.filter((a) => !gone.has(a.id)) });
    }
    const created = pendingOccurrences(this._data.appointments, todayKey(this.now()));
    if (!created.length) return [];
    for (const a of created) await this.storage.appointments.put(a);
    this.set({ ...this._data, appointments: [...this._data.appointments, ...created] });
    return created;
  }

  private linkedIds() {
    return new Set(this._data.transactions.map((t) => t.appointmentId).filter((x): x is string => !!x));
  }

  private async createSeries(input: AppointmentInput): Promise<{ appointment: Appointment; feedback: Feedback }> {
    const stamp = this.stamp();
    const base = ruleFromRepeat(input.repeat!, input.date, newId(), stamp)!;
    const first = seriesDates(base, null, addDaysKey(input.date, 400))[0];
    if (!first) throw new ValidationError<AppointmentInput>({ repeat: 'Esta repetição não tem nenhuma data. Revise o término.' });
    const appointment: Appointment = {
      id: occurrenceId(base.id, first), createdAt: stamp, updatedAt: stamp,
      title: input.title.trim(),
      clientId: input.clientId && this._data.clients.some((c) => c.id === input.clientId) ? input.clientId : null,
      date: first, time: input.time, price: parseMoney(input.price) ?? 0, notes: input.notes.trim(),
      status: 'agendado', completedAt: null, transactionId: null, payments: true,
      ...(input.duration ? { duration: Number(input.duration) } : {}),
      series: { ...base, through: first, auto: false, detached: false } as unknown as Record<string, unknown>,
    };
    await this.storage.appointments.put(appointment);
    this.set({ ...this._data, appointments: [...this._data.appointments, appointment] });
    await this.materialize();
    // Uma série = um agendamento para o XP (as ocorrências geradas não contam).
    const feedback = await this.gamify({ type: 'appointment_created', id: appointment.id, label: 'Novo agendamento', isDemo: appointment.isDemo });
    return { appointment, feedback };
  }

  /** Primeira ocorrência atingida por "esta e as próximas" (a própria) ou "toda a série" (a primeira em aberto). */
  private seriesStart(existing: Appointment, scope: Exclude<EditScope, 'esta'>, list: Appointment[]) {
    return scope === 'serie' ? (list.find((a) => a.status === 'agendado')?.date ?? existing.date) : existing.date;
  }

  private async editSeries(existing: Appointment, input: AppointmentInput, scope: Exclude<EditScope, 'esta'>): Promise<{ appointment: Appointment; feedback: Feedback }> {
    const s = seriesOf(existing)!;
    const list = seriesGroups(this._data.appointments).get(s.id) ?? [existing];
    const rule = effectiveRule(list)!;
    const from = this.seriesStart(existing, scope, list);
    const anchor = list.find((a) => a.date === from && a.status === 'agendado') ?? existing;
    const targets = list.filter((a) => a.id === anchor.id || (a.date >= from && a.status === 'agendado' && !seriesOf(a)!.detached));
    const paid = this.linkedIds();
    const stamp = this.stamp();
    const changes: UndoEntry['changes'] = [];
    let appointments = this._data.appointments;
    const write = async (before: Appointment, after: Appointment | null) => {
      if (after) await this.storage.appointments.put(after);
      else await this.storage.appointments.remove(before.id);
      changes.push({ collection: 'appointments', id: before.id, before, after });
      appointments = after ? appointments.map((x) => (x.id === before.id ? after : x)) : appointments.filter((x) => x.id !== before.id);
    };
    const fields = (a: Appointment): Appointment => ({
      ...a, updatedAt: stamp,
      title: input.title.trim(),
      clientId: input.clientId && this._data.clients.some((c) => c.id === input.clientId) ? input.clientId : null,
      time: input.time, notes: input.notes.trim(),
      // O valor combinado de quem já tem pagamento registrado não muda em lote.
      price: paid.has(a.id) ? a.price : parseMoney(input.price) ?? 0,
      ...(input.duration ? { duration: Number(input.duration) } : input.duration === '' && a.duration != null ? { duration: null } : {}),
    });
    const next = input.repeat?.freq ? ruleFromRepeat(input.repeat, from, newId(), nextVersion(rule.v, stamp)) : null;
    if (!next || sameRule(next, rule)) {
      for (const a of targets) await write(a, fields(a));
    } else {
      // Regra nova: uma série nova a partir de `from`. Ocorrências futuras intocadas e sem pagamento saem;
      // as que têm pagamento ficam como exceções da série antiga; a antiga termina na véspera.
      const first = seriesDates(next, null, addDaysKey(from, 400))[0];
      if (!first) throw new ValidationError<AppointmentInput>({ repeat: 'Esta repetição não tem nenhuma data. Revise o término.' });
      for (const a of targets) {
        if (a.id === anchor.id) continue;
        // Com pagamento: passa para a série nova como exceção, reservando a data (o gerador não cria outra
        // no mesmo dia); `through` = início da série nova, para não atrasar a geração dela.
        if (paid.has(a.id)) await write(a, { ...a, updatedAt: stamp, series: { ...a.series, id: next.id, v: '', through: first, detached: true } });
        else await write(a, null);
      }
      await write(anchor, { ...fields(anchor), date: first, series: { ...next, through: first, auto: seriesOf(anchor)!.auto === true, detached: false } as unknown as Record<string, unknown> });
      const old = (seriesGroups(appointments).get(s.id) ?? []).filter((a) => !seriesOf(a)!.detached || a.date < from);
      const last = old[old.length - 1];
      if (last) await write(last, { ...last, updatedAt: stamp, series: { ...last.series, until: addDaysKey(from, -1), v: nextVersion(rule.v, stamp) } });
    }
    this.set({ ...this._data, appointments });
    await this.materialize();
    const appointment = this._data.appointments.find((a) => a.id === existing.id) ?? anchor;
    const feedback = await this.gamify();
    return { appointment, feedback: { ...feedback, undo: this.recordUndo('Série alterada', changes) } };
  }

  /**
   * Cancela "esta e as próximas" ou "toda a série" (desde a primeira em aberto). A ocorrência escolhida fica
   * cancelada e encerra a regra (nada novo é gerado); as futuras intocadas e sem pagamento saem; as que têm
   * pagamento ou foram alteradas ficam canceladas, com o dinheiro preservado. Nada é recriado depois.
   */
  cancelSeries(id: string, scope: Exclude<EditScope, 'esta'>): Promise<UndoTicket> {
    return this.run(async () => {
      const existing = this._data.appointments.find((a) => a.id === id);
      const s = existing ? seriesOf(existing) : null;
      if (!existing || !s) throw new Error('Agendamento não encontrado');
      const list = seriesGroups(this._data.appointments).get(s.id) ?? [existing];
      const from = this.seriesStart(existing, scope, list);
      const rule = effectiveRule(list)!;
      const anchor = list.find((a) => a.date === from && a.status === 'agendado') ?? existing;
      const paid = this.linkedIds();
      const stamp = this.stamp();
      const changes: UndoEntry['changes'] = [];
      let appointments = this._data.appointments;
      for (const a of list) {
        if (a.date < from || a.status !== 'agendado') continue;
        let after: Appointment | null;
        if (a.id === anchor.id) after = { ...a, status: 'cancelado', completedAt: null, updatedAt: stamp, series: { ...a.series, until: addDaysKey(from, -1), v: nextVersion(rule.v, stamp) } };
        else if (isPristineOccurrence(a) && !paid.has(a.id)) after = null;
        else after = { ...a, status: 'cancelado', completedAt: null, updatedAt: stamp };
        if (after) await this.storage.appointments.put(after);
        else await this.storage.appointments.remove(a.id);
        changes.push({ collection: 'appointments', id: a.id, before: a, after });
        appointments = after ? appointments.map((x) => (x.id === a.id ? after! : x)) : appointments.filter((x) => x.id !== a.id);
      }
      this.set({ ...this._data, appointments });
      return this.recordUndo(scope === 'serie' ? 'Série cancelada' : 'Próximas canceladas', changes);
    });
  }

  // ------------------------------------------------------------ financeiro

  saveTransaction(input: TransactionInput, id?: string): Promise<{ transaction: Transaction; feedback: Feedback }> {
    return this.run(async () => {
      const errors = validateTransaction(input);
      if (hasErrors(errors)) throw new ValidationError(errors);
      const existing = id ? this._data.transactions.find((t) => t.id === id) : undefined;
      if (id && !existing) throw new Error('Lançamento não encontrado');
      if (existing) {
        // Um pagamento editado em Finanças não pode ficar menor do que o já estornado dele.
        const refunded = this._data.transactions.filter((x) => x.type === 'despesa' && (x.payment as Record<string, unknown> | null | undefined)?.of === existing.id).reduce((n, x) => n + x.amount, 0);
        if (refunded > 0 && (input.type !== existing.type || (parseMoney(input.amount) ?? 0) < refunded)) {
          throw new ValidationError<TransactionInput>({ amount: `Este pagamento tem ${(refunded / 100).toFixed(2).replace('.', ',')} estornado; o valor não pode ser menor.` });
        }
      }
      const stamp = this.stamp();
      const transaction: Transaction = {
        ...existing,
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

  // ------------------------------------------------------------ tipos de serviço
  // Atalhos da agenda. Não dão XP nem alteram valores já registrados.

  saveServiceType(input: ServiceTypeInput, id?: string): Promise<ServiceType> {
    return this.run(async () => {
      const errors = validateServiceType(input);
      const existing = id ? this._data.serviceTypes.find((t) => t.id === id) : undefined;
      if (id && !existing) throw new Error('Tipo de serviço não encontrado');
      const key = serviceNameKey(input.name);
      if (!errors.name && this._data.serviceTypes.some((t) => t.id !== id && serviceNameKey(t.name) === key)) errors.name = 'Já existe um serviço com esse nome.';
      if (hasErrors(errors)) throw new ValidationError(errors);
      if (!existing && this._data.serviceTypes.length >= MAX_SERVICE_TYPES) throw new Error(`Limite de ${MAX_SERVICE_TYPES} tipos de serviço.`);
      const stamp = this.stamp();
      const type: ServiceType = {
        ...existing,
        id: existing?.id ?? newId(),
        name: input.name.trim().replace(/\s+/g, ' '),
        price: input.price.trim() ? parseMoney(input.price)! : null,
        pinned: existing?.pinned ?? false,
        order: existing?.order ?? nextServiceOrder(this._data.serviceTypes),
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      await this.storage.serviceTypes.put(type);
      const serviceTypes = existing ? this._data.serviceTypes.map((t) => (t.id === type.id ? type : t)) : [...this._data.serviceTypes, type];
      this.set({ ...this._data, serviceTypes });
      return type;
    });
  }

  setServiceTypePinned(id: string, pinned: boolean): Promise<void> {
    return this.run(async () => {
      const t = this._data.serviceTypes.find((x) => x.id === id);
      if (!t || t.pinned === pinned) return;
      // Ao fixar/desafixar, vai para o fim do novo grupo.
      const group = this._data.serviceTypes.filter((x) => x.pinned === pinned);
      const updated = { ...t, pinned, order: nextServiceOrder(group), updatedAt: this.stamp() };
      await this.storage.serviceTypes.put(updated);
      this.set({ ...this._data, serviceTypes: this._data.serviceTypes.map((x) => (x.id === id ? updated : x)) });
    });
  }

  moveServiceType(id: string, dir: -1 | 1): Promise<void> {
    return this.run(async () => {
      const changes = moveServiceType(this._data.serviceTypes, id, dir);
      if (!changes.length) return;
      const stamp = this.stamp();
      const byId = new Map(changes.map((c) => [c.id, c.order]));
      const changed = this._data.serviceTypes.filter((t) => byId.has(t.id)).map((t) => ({ ...t, order: byId.get(t.id)!, updatedAt: stamp }));
      await this.storage.serviceTypes.putMany(changed);
      const map = new Map(changed.map((t) => [t.id, t]));
      this.set({ ...this._data, serviceTypes: this._data.serviceTypes.map((t) => map.get(t.id) ?? t) });
    });
  }

  /** Remove só o atalho: serviços já agendados com esse nome não mudam. */
  deleteServiceType(id: string): Promise<void> {
    return this.run(async () => {
      if (!this._data.serviceTypes.some((t) => t.id === id)) return;
      await this.storage.serviceTypes.remove(id);
      this.set({ ...this._data, serviceTypes: this._data.serviceTypes.filter((t) => t.id !== id) });
    });
  }

  /**
   * Exclui o lançamento. Se era a receita de um serviço concluído, o serviço continua concluído,
   * só fica sem lançamento financeiro (pode lançar de novo pelo próprio serviço). Reversível.
   */
  deleteTransaction(id: string): Promise<UndoTicket | null> {
    return this.run(async () => {
      const t = this._data.transactions.find((x) => x.id === id);
      if (!t) return null;
      // Rastreabilidade (0.5): um pagamento com estorno não some sozinho — o estorno ficaria órfão.
      if (this._data.transactions.some((x) => x.type === 'despesa' && (x.payment as Record<string, unknown> | null | undefined)?.of === id)) {
        throw new Error('Este pagamento tem estorno registrado. Exclua o estorno antes, se precisar corrigir.');
      }
      let appointments = this._data.appointments;
      const linked = appointments.find((a) => a.transactionId === id);
      let linkedAfter: Appointment | null = null;
      if (linked) {
        linkedAfter = { ...linked, transactionId: null, updatedAt: this.stamp() };
        await this.storage.appointments.put(linkedAfter);
        appointments = appointments.map((a) => (a.id === linked.id ? linkedAfter! : a));
      }
      await this.storage.transactions.remove(id);
      this.set({ ...this._data, appointments, transactions: this._data.transactions.filter((x) => x.id !== id) });
      return this.recordUndo('Lançamento excluído', [
        { collection: 'transactions', id, before: t, after: null },
        ...(linked ? [{ collection: 'appointments' as const, id: linked.id, before: linked, after: linkedAfter }] : []),
      ]);
    });
  }

  // ------------------------------------------------------------ desfazer

  private recordUndo(label: string, changes: UndoEntry['changes']): UndoTicket {
    const entry: UndoEntry = { id: ++this.undoSeq, label, at: this.now().getTime(), changes: structuredClone(changes) };
    this._undo = entry;
    return { id: entry.id, label };
  }

  /**
   * Desfaz a ação do bilhete, se ainda for a última ação reversível, estiver dentro do prazo e os
   * registros afetados não tiverem mudado depois (outra edição, sincronização ou restauração).
   * Caso contrário, nada é alterado e um erro explica o motivo.
   */
  undo(ticket: UndoTicket): Promise<void> {
    return this.run(async () => {
      const e = this._undo;
      if (!e || e.id !== ticket.id || this.now().getTime() - e.at > UNDO_TTL_MS) throw new Error('Não é mais possível desfazer esta ação.');
      for (const c of e.changes) {
        const cur = (this._data[c.collection] as UndoRecord[]).find((x) => x.id === c.id) ?? null;
        if (!sameRecord(cur, c.after)) {
          this._undo = null;
          throw new Error('Não foi possível desfazer: o registro foi alterado depois.');
        }
      }
      const stamp = this.stamp();
      let data = this._data;
      for (const c of e.changes) {
        const store = this.storage[c.collection] as unknown as { put(x: UndoRecord): Promise<void>; remove(id: string): Promise<void> };
        const list = data[c.collection] as UndoRecord[];
        if (c.before) {
          const restored = { ...c.before, updatedAt: stamp };
          await store.put(restored);
          data = { ...data, [c.collection]: list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? restored : x)) : [...list, restored] };
        } else {
          await store.remove(c.id);
          data = { ...data, [c.collection]: list.filter((x) => x.id !== c.id) };
        }
      }
      this._undo = null;
      this.set(data);
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
    const { data: parsed, integrity, exportedAt, appVersion } = inspectBackup(text);
    const compatibility = backupCompatibility(appVersion, __APP_VERSION__);
    return {
      exportedAt, appVersion, newerApp: compatibility === 'mais-nova', compatibility, integrity,
      file: backupCounts(parsed), current: backupCounts(this._data), loss: backupLoss(this._data, parsed, exportedAt),
    };
  }

  importBackup(text: string): Promise<void> {
    return this.run(async () => {
      // Valida tudo (soma, estrutura) antes de qualquer gravação: arquivo inválido não altera nada.
      const parsed = inspectBackup(text).data;
      this._undo = null; // restaurar substitui tudo: nada anterior pode ser desfeito
      // XP: no máximo um evento por chave (mesma regra da sincronização), nunca XP em dobro.
      const dupXp = new Set(duplicateXpIds(parsed.xpEvents as unknown as { id: string; key: string; createdAt: string }[]));
      if (dupXp.size) parsed.xpEvents = parsed.xpEvents.filter((e) => !dupXp.has(e.id));
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
      this._undo = null;
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
