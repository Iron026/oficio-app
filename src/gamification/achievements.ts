import { monthTotals } from '../domain/finance';
import { isCompleted } from '../domain/insights';
import type { AppData, Profile } from '../domain/types';
import type { Terminology } from '../domain/professions';

type Data = Pick<AppData, 'clients' | 'appointments' | 'transactions' | 'xpEvents'>;

export interface AchievementDef {
  id: string;
  title: (t: Terminology) => string;
  description: (t: Terminology) => string;
  icon: 'trophy' | 'users' | 'star' | 'wallet' | 'target' | 'heart' | 'flag' | 'rocket';
  xp: number;
  /** Condição avaliada sobre dados reais (sem dados de demonstração). */
  check: (data: Data, profile: Profile) => boolean;
}

const completedCount = (d: Data) => d.appointments.filter(isCompleted).length;

function months(d: Data): string[] {
  return [...new Set(d.transactions.map((t) => t.date.slice(0, 7)))];
}

const maxMonthIncome = (d: Data) => Math.max(0, ...months(d).map((m) => monthTotals(d.transactions, m).income));

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'primeira_conclusao', icon: 'flag', xp: 50,
    title: (t) => `Primeir${t.serviceArticle} ${t.service.toLowerCase()}`,
    description: (t) => `Registre ${t.serviceArticle === 'a' ? 'a primeira' : 'o primeiro'} ${t.service.toLowerCase()} como ${t.completedLabel}.`,
    check: (d) => completedCount(d) >= 1,
  },
  {
    id: 'dez_conclusoes', icon: 'star', xp: 100,
    title: (t) => `10 ${t.services.toLowerCase()}`,
    description: (t) => `Alcance 10 ${t.services.toLowerCase()} ${t.completedLabelPlural}.`,
    check: (d) => completedCount(d) >= 10,
  },
  {
    id: 'cinquenta_conclusoes', icon: 'trophy', xp: 250,
    title: (t) => `50 ${t.services.toLowerCase()}`,
    description: (t) => `Alcance 50 ${t.services.toLowerCase()} ${t.completedLabelPlural}.`,
    check: (d) => completedCount(d) >= 50,
  },
  {
    id: 'carteira_10', icon: 'users', xp: 80,
    title: () => 'Carteira em crescimento',
    description: (t) => `Tenha 10 ${t.clients.toLowerCase()} cadastrados.`,
    check: (d) => d.clients.length >= 10,
  },
  {
    id: 'carteira_30', icon: 'users', xp: 200,
    title: () => 'Clientela sólida',
    description: (t) => `Tenha 30 ${t.clients.toLowerCase()} cadastrados.`,
    check: (d) => d.clients.length >= 30,
  },
  {
    id: 'cliente_fiel', icon: 'heart', xp: 80,
    title: () => 'Cliente fiel',
    description: (t) => `Um mesmo cliente com 3 ${t.services.toLowerCase()} ${t.completedLabelPlural}.`,
    check: (d) => {
      const counts = new Map<string, number>();
      for (const a of d.appointments) if (isCompleted(a) && a.clientId) counts.set(a.clientId, (counts.get(a.clientId) ?? 0) + 1);
      return [...counts.values()].some((n) => n >= 3);
    },
  },
  {
    id: 'mil_no_mes', icon: 'wallet', xp: 100,
    title: () => 'R$ 1 mil no mês',
    description: () => 'Fature R$ 1.000 ou mais em um único mês.',
    check: (d) => maxMonthIncome(d) >= 100_000,
  },
  {
    id: 'cinco_mil_no_mes', icon: 'rocket', xp: 300,
    title: () => 'R$ 5 mil no mês',
    description: () => 'Fature R$ 5.000 ou mais em um único mês.',
    check: (d) => maxMonthIncome(d) >= 500_000,
  },
  {
    id: 'mes_no_azul', icon: 'wallet', xp: 80,
    title: () => 'Mês no azul',
    description: () => 'Feche um mês com receitas e despesas registradas e saldo positivo.',
    check: (d) =>
      months(d).some((m) => {
        const t = monthTotals(d.transactions, m);
        return t.income > 0 && t.expense > 0 && t.balance > 0;
      }),
  },
  {
    id: 'meta_mensal', icon: 'target', xp: 100,
    title: () => 'Meta mensal batida',
    description: () => 'Alcance sua meta de faturamento mensal.',
    check: (d) => d.xpEvents.some((e) => e.key.startsWith('goal_month:')),
  },
  {
    id: 'constancia', icon: 'target', xp: 150,
    title: () => 'Constância',
    description: () => 'Alcance a meta semanal em 4 semanas diferentes.',
    check: (d) => d.xpEvents.filter((e) => e.key.startsWith('goal_week:')).length >= 4,
  },
];

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

