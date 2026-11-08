import { monthTotals } from '../domain/finance';
import { completedInRange, weekServicesCompleted } from '../domain/insights';
import type { MissionTemplate, ProfessionModule } from '../domain/professions';
import type { AppData, Profile, UnlockedAchievement, XpCategory, XpEvent } from '../domain/types';
import { inRange, monthKey, toDateKey, weekKey, weekRange } from '../lib/dates';
import { newId } from '../lib/id';
import { ACHIEVEMENTS } from './achievements';

/**
 * Regras de XP por ação. Cada entidade concede XP uma única vez (chave única)
 * e há um limite diário por tipo de ação, para que criar e apagar registros
 * não gere XP indefinidamente.
 */
export const ACTION_RULES = {
  client_created: { xp: 10, category: 'cliente', dailyLimit: 5 },
  appointment_created: { xp: 5, category: 'agendamento', dailyLimit: 6 },
  appointment_completed: { xp: 20, category: 'conclusao', dailyLimit: 12 },
  transaction_created: { xp: 5, category: 'financeiro', dailyLimit: 6 },
} as const satisfies Record<string, { xp: number; category: XpCategory; dailyLimit: number }>;

export type ActionType = keyof typeof ACTION_RULES;

export const GOAL_XP = { weekly: 50, monthly: 120 } as const;

/** Dados reais: entidades de demonstração nunca geram XP. */
export function realData<T extends Pick<AppData, 'clients' | 'appointments' | 'transactions'>>(data: T): T {
  return {
    ...data,
    clients: data.clients.filter((c) => !c.isDemo),
    appointments: data.appointments.filter((a) => !a.isDemo),
    transactions: data.transactions.filter((t) => !t.isDemo),
  };
}

export function totalXp(ledger: XpEvent[]): number {
  return ledger.reduce((sum, e) => sum + e.xp, 0);
}

function makeEvent(key: string, category: XpCategory, xp: number, label: string, now: Date): XpEvent {
  return { id: newId(), key, category, xp, label, createdAt: now.toISOString() };
}

/** Retorna o evento de XP de uma ação, ou null se já concedido / limite diário atingido. */
export function actionAward(action: ActionType, entityId: string, label: string, ledger: XpEvent[], now: Date): XpEvent | null {
  const rule = ACTION_RULES[action];
  const key = `${action}:${entityId}`;
  if (ledger.some((e) => e.key === key)) return null;
  const today = toDateKey(now);
  const todayCount = ledger.filter((e) => e.key.startsWith(`${action}:`) && toDateKey(new Date(e.createdAt)) === today).length;
  if (todayCount >= rule.dailyLimit) return null;
  return makeEvent(key, rule.category, rule.xp, label, now);
}

// ---------------------------------------------------------------- Missões

export interface MissionProgress {
  key: string;
  template: MissionTemplate;
  current: number;
  done: boolean;
  /** Missões iniciais (uma vez) ou semanais. */
  kind: 'inicial' | 'semanal';
}

type Data = Pick<AppData, 'clients' | 'appointments' | 'transactions' | 'xpEvents'>;

/** beta.3: ocorrência criada pelo gerador da recorrência — não é um agendamento feito pela pessoa (sem XP). */
const isGenerated = (a: { series?: unknown }) => !!a.series && typeof a.series === 'object' && (a.series as Record<string, unknown>).auto === true;

function metricValue(metric: MissionTemplate['metric'], data: Data, now: Date): number {
  const { start, end } = weekRange(now);
  const createdThisWeek = (iso: string) => inRange(toDateKey(new Date(iso)), start, end);
  switch (metric) {
    case 'servicesCompleted':
      return completedInRange(data.appointments, start, end).length;
    case 'newClients':
      return data.clients.filter((c) => createdThisWeek(c.createdAt)).length;
    case 'expensesLogged':
      return data.transactions.filter((t) => t.type === 'despesa' && createdThisWeek(t.createdAt)).length;
    case 'appointmentsScheduled':
      return data.appointments.filter((a) => a.status !== 'cancelado' && !isGenerated(a) && createdThisWeek(a.createdAt)).length;
    case 'revenue':
      return data.transactions.filter((t) => t.type === 'receita' && inRange(t.date, start, end)).reduce((s, t) => s + t.amount, 0);
  }
}

/** Missões de "primeiros passos": guiam o uso inicial, valem uma única vez. */
export function starterMissions(p: ProfessionModule): MissionTemplate[] {
  const s = p.terms.service.toLowerCase();
  const art = p.terms.serviceArticle === 'a' ? 'a primeira' : 'o primeiro';
  return [
    { id: 'inicio_cliente', title: 'Cadastre seu primeiro cliente', description: 'Nome e telefone já bastam.', metric: 'newClients', target: 1, xp: 20 },
    { id: 'inicio_agenda', title: `Agende ${art} ${s}`, description: 'Organize sua agenda no app.', metric: 'appointmentsScheduled', target: 1, xp: 20 },
    { id: 'inicio_despesa', title: 'Registre uma despesa', description: 'Saber o que sai é o primeiro passo para lucrar mais.', metric: 'expensesLogged', target: 1, xp: 20 },
  ];
}

function starterValue(metric: MissionTemplate['metric'], data: Data): number {
  switch (metric) {
    case 'newClients': return data.clients.length;
    case 'appointmentsScheduled': return data.appointments.filter((a) => !isGenerated(a)).length;
    case 'expensesLogged': return data.transactions.filter((t) => t.type === 'despesa').length;
    case 'servicesCompleted': return data.appointments.filter((a) => a.status === 'concluido').length;
    case 'revenue': return data.transactions.filter((t) => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  }
}

export function missionProgress(profession: ProfessionModule, rawData: Data, now: Date): MissionProgress[] {
  const data = realData(rawData);
  const ledgerKeys = new Set(rawData.xpEvents.map((e) => e.key));
  const starters = starterMissions(profession).map((template): MissionProgress => {
    const key = `mission:${template.id}`;
    const current = Math.min(template.target, starterValue(template.metric, data));
    return { key, template, current, done: ledgerKeys.has(key) || current >= template.target, kind: 'inicial' };
  });
  const wk = weekKey(now);
  const weekly = profession.missions.map((template): MissionProgress => {
    const key = `mission:${template.id}:${wk}`;
    const current = Math.min(template.target, metricValue(template.metric, data, now));
    return { key, template, current, done: ledgerKeys.has(key) || current >= template.target, kind: 'semanal' };
  });
  return [...starters, ...weekly];
}

// ---------------------------------------------------------------- Metas

export interface GoalProgress { current: number; target: number; progress: number; done: boolean }

export function weeklyGoal(profile: Profile, rawData: Data, now: Date): GoalProgress {
  const current = weekServicesCompleted(realData(rawData).appointments, now);
  const target = Math.max(1, profile.weeklyGoalServices);
  return { current, target, progress: Math.min(1, current / target), done: current >= target };
}

export function monthlyGoal(profile: Profile, rawData: Data, now: Date): GoalProgress {
  const current = monthTotals(realData(rawData).transactions, monthKey(now)).income;
  const target = Math.max(100, profile.monthlyGoalRevenue);
  return { current, target, progress: Math.min(1, current / target), done: current >= target };
}

// ---------------------------------------------------------------- Avaliação

export interface EvaluationResult {
  xpEvents: XpEvent[];
  achievements: UnlockedAchievement[];
}

/**
 * Avalia missões, metas e conquistas a partir dos dados reais e retorna
 * apenas o que é NOVO (ainda não registrado no histórico de XP).
 * Função pura: não grava nada; quem chama decide persistir.
 */
export function evaluate(profile: Profile, profession: ProfessionModule, rawData: Data & Pick<AppData, 'achievements'>, now: Date): EvaluationResult {
  const ledger = [...rawData.xpEvents];
  const has = (key: string) => ledger.some((e) => e.key === key);
  const newEvents: XpEvent[] = [];
  const push = (e: XpEvent) => {
    newEvents.push(e);
    ledger.push(e);
  };

  for (const m of missionProgress(profession, rawData, now)) {
    if (m.current >= m.template.target && !has(m.key)) {
      push(makeEvent(m.key, 'missao', m.template.xp, `Missão: ${m.template.title}`, now));
    }
  }

  const wKey = `goal_week:${weekKey(now)}`;
  if (weeklyGoal(profile, rawData, now).done && !has(wKey)) push(makeEvent(wKey, 'meta', GOAL_XP.weekly, 'Meta semanal alcançada', now));
  const mKey = `goal_month:${monthKey(now)}`;
  if (monthlyGoal(profile, rawData, now).done && !has(mKey)) push(makeEvent(mKey, 'meta', GOAL_XP.monthly, 'Meta mensal alcançada', now));

  const unlocked = new Set(rawData.achievements.map((a) => a.id));
  const newAchievements: UnlockedAchievement[] = [];
  const real = { ...realData(rawData), xpEvents: ledger };
  for (const def of ACHIEVEMENTS) {
    if (unlocked.has(def.id)) continue;
    if (def.check(real, profile)) {
      newAchievements.push({ id: def.id, unlockedAt: now.toISOString() });
      const key = `achievement:${def.id}`;
      if (!has(key)) push(makeEvent(key, 'conquista', def.xp, `Conquista: ${def.title(profession.terms)}`, now));
    }
  }

  return { xpEvents: newEvents, achievements: newAchievements };
}

