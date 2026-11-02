import { buildDemoData } from '../domain/demo';
import { getProfession } from '../domain/professions';
import type { AppData, Appointment, Client, Profile, Settings, Transaction, UnlockedAchievement, XpEvent } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { actionAward, evaluate, totalXp, type ActionType } from '../gamification/engine';
import { levelInfo } from '../gamification/levels';
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
}

const emptyFeedback = (): Feedback => ({ xpGained: 0, events: [], achievements: [], levelUp: null });

export const emptyData = (): AppData => ({
  profile: null, settings: { ...DEFAULT_SETTINGS }, clients: [], appointments: [], transactions: [], xpEvents: [], achievements: [],
});

type Listener = (data: AppData) => void;

/**
 * Serviço de aplicação: concentra regras de negócio, persistência e gamificação.
 * A interface (React) apenas lê `data` e chama métodos.
 */
export class AppService {
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private storage: StorageAdapter,
    private _data: AppData,
    private now: () => Date = () => new Date(),
  ) {}

  static async load(storage: StorageAdapter, now?: () => Date): Promise<AppService> {
    return new AppService(storage, await storage.loadAll(), now);
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
    const after = levelInfo(totalXp(xpEvents)).level;
    return {
      xpGained: events.reduce((s, e) => s + e.xp, 0),
      events,
      achievements: result.achievements,
      levelUp: after > before ? after : null,
    };
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

  importBackup(text: string): Promise<void> {
    return this.run(async () => {
      const data = parseBackup(text);
      await this.storage.replaceAll(data);
      this.set(data);
    });
  }

  resetAll(): Promise<void> {
    return this.run(async () => {
      await this.storage.clearAll();
      this.set(emptyData());
    });
  }
}
