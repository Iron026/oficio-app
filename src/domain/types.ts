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
  /** Reservado para a 0.5: organização do Painel. Preservado por `updateSettings`. */
  dashboard?: unknown;
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
  // Reservados para a 0.5 (docs/COMPATIBILIDADE-0.5.md). Esta versão não os grava,
  // só os preserva ao editar e confere o tipo ao restaurar um backup.
  /** Duração em minutos (5 a 1440). */
  duration?: number | null;
  /** Regra da recorrência à qual esta ocorrência pertence. */
  series?: Record<string, unknown> | null;
  /** Controle de pagamento ativo (pagamentos parciais e antecipados). */
  payments?: boolean;
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
  /**
   * Reservado para a 0.5: presente (não nulo) numa receita vinculada = pagamento do serviço.
   * Pagamentos nunca são removidos automaticamente (ver src/domain/compat.ts).
   */
  payment?: Record<string, unknown> | null;
  /** beta.3: trilha das revisões de estornos feitas pela pessoa (ver domain/refundReview.ts). */
  reviews?: Record<string, unknown>[];
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
  /** 0.4 (rodada 3): tipos de serviço da pessoa (atalhos na agenda), editáveis e fixáveis. */
  serviceTypes: ServiceType[];
}

/** Tipo de serviço personalizado: atalho de nome e valor sugerido no agendamento. */
export interface ServiceType {
  id: string;
  name: string;
  /** Valor sugerido em centavos (null = sem valor sugerido). */
  price: number | null;
  /** Fixado: aparece primeiro na agenda. */
  pinned: boolean;
  /** Ordem manual (menor primeiro). */
  order: number;
  /** Reservado para a 0.5: duração sugerida em minutos (5 a 1440), editável no agendamento. */
  duration?: number | null;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system' };
