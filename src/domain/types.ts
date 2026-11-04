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

/** Cores de destaque (0.4). Mudam só a marca; receita, despesa e XP não mudam. */
export type AccentId = 'petroleo' | 'oceano' | 'safira' | 'indigo' | 'ameixa' | 'vinho' | 'grafite' | 'oliva';

/** Imagem do perfil escolhida (a foto em si fica em `profileImages`). */
export type AvatarChoice = { kind: 'iniciais' } | { kind: 'interno'; id: string } | { kind: 'foto' };

export type SealId = 'constancia' | 'fidelizacao' | 'metas' | 'experiencia' | 'carteira' | 'saude';

/** Preferências da conta (sincronizadas). Campos novos são opcionais: versões antigas os preservam. */
export interface Settings {
  /**
   * Legado: até a 0.4.0-beta.1 o tema valia para a conta. A partir da 0.4 o tema é
   * por aparelho (DevicePrefs); este campo só é lido uma vez, na migração, e
   * continua existindo para versões anteriores.
   */
  theme: ThemePreference;
  accent?: AccentId;
  avatar?: AvatarChoice;
  /** Selo exibido no perfil; 'auto' = o de maior estágio (padrão). */
  featuredSeal?: SealId | 'auto';
}

/**
 * Maior estágio já alcançado em um selo (0.4). Só cresce: a mesclagem fica com o
 * maior estágio e, por estágio, a data mais antiga. Não concede XP.
 */
export interface SealAward {
  id: SealId;
  stage: 1 | 2 | 3 | 4;
  /** Data (ISO) em que cada estágio foi alcançado; índice 0 = estágio I. */
  reachedAt: (string | null)[];
  createdAt: string;
  updatedAt: string;
}

/** Foto de perfil (0.4): um único registro por conta, id "atual". */
export interface ProfileImage {
  id: 'atual';
  mime: 'image/webp' | 'image/jpeg';
  /** Imagem codificada em base64 (sem prefixo data:). */
  data: string;
  /** Tamanho do arquivo decodificado, em bytes. */
  bytes: number;
  width: number;
  height: number;
  /** Impressão digital do conteúdo (evita reprocessar a mesma imagem). */
  hash: string;
  createdAt: string;
  updatedAt: string;
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
  /** 0.4: maior estágio já alcançado de cada selo. */
  sealAwards: SealAward[];
  /** 0.4: foto de perfil (no máximo um registro, id "atual"). */
  profileImages: ProfileImage[];
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system' };
