/** Identificadores das profissões suportadas na versão 0.1. */
export type ProfessionId = 'manutencao' | 'beleza' | 'limpeza' | 'alimentacao' | 'outros';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Campos comuns a todas as entidades persistidas. */
export interface BaseEntity {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Dados de demonstração: sempre exibidos com selo e ignorados pela gamificação. */
  isDemo?: boolean;
}

export interface Profile {
  name: string;
  businessName: string;
  professionId: ProfessionId;
  createdAt: string;
  /** Meta semanal: quantidade de serviços concluídos. */
  weeklyGoalServices: number;
  /** Meta mensal: receita em centavos. */
  monthlyGoalRevenue: number;
}

export interface Settings {
  theme: ThemePreference;
}

export interface Client extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export type AppointmentStatus = 'agendado' | 'concluido' | 'cancelado';

export interface Appointment extends BaseEntity {
  title: string;
  clientId: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm ou ''
  /** Valor em centavos. */
  price: number;
  status: AppointmentStatus;
  notes: string;
  completedAt: string | null;
  /** Receita gerada automaticamente ao concluir (se houver). */
  transactionId: string | null;
}

export type TransactionType = 'receita' | 'despesa';

export interface Transaction extends BaseEntity {
  type: TransactionType;
  /** Valor em centavos, sempre positivo. */
  amount: number;
  description: string;
  category: string;
  date: string; // YYYY-MM-DD
  appointmentId: string | null;
}

/**
 * Registro imutável de XP. A chave `key` é única: a mesma ação nunca
 * concede XP duas vezes (ex.: "appointment_completed:<id>").
 */
export interface XpEvent {
  id: string;
  key: string;
  category: XpCategory;
  xp: number;
  label: string;
  createdAt: string;
}

export type XpCategory = 'cliente' | 'agendamento' | 'conclusao' | 'financeiro' | 'missao' | 'conquista' | 'meta';

export interface UnlockedAchievement {
  id: string; // id da conquista
  unlockedAt: string;
}

/** Fotografia completa dos dados do usuário (usada em exportação/importação). */
export interface AppData {
  profile: Profile | null;
  settings: Settings;
  clients: Client[];
  appointments: Appointment[];
  transactions: Transaction[];
  xpEvents: XpEvent[];
  achievements: UnlockedAchievement[];
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system' };
