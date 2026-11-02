import type { ProfessionId } from '../types';

/** Vocabulário que adapta a interface à profissão. */
export interface Terminology {
  /** "Serviço", "Atendimento", "Encomenda"... */
  service: string;
  services: string;
  /** Artigo do substantivo: "o" ou "a". */
  serviceArticle: 'o' | 'a';
  client: string;
  clients: string;
  /** Verbo para concluir: "Concluir serviço", "Entregar encomenda". */
  completeVerb: string;
  /** Particípio: "concluído", "entregue". */
  completedLabel: string;
  completedLabelPlural: string;
}

export interface ServiceTemplate {
  name: string;
  /** Preço sugerido em centavos (apenas referência editável). */
  suggestedPrice: number;
}

/** Missão semanal definida pelo módulo da profissão. */
export interface MissionTemplate {
  id: string;
  title: string;
  description: string;
  metric: 'servicesCompleted' | 'newClients' | 'expensesLogged' | 'appointmentsScheduled' | 'revenue';
  target: number;
  xp: number;
}

export interface ProfessionModule {
  id: ProfessionId;
  name: string;
  /** Nome do ícone lucide (ver ui/ProfessionIcon). */
  icon: 'wrench' | 'scissors' | 'sparkles' | 'chef' | 'briefcase';
  tagline: string;
  examples: string;
  terms: Terminology;
  serviceTemplates: ServiceTemplate[];
  incomeCategories: string[];
  expenseCategories: string[];
  tips: string[];
  missions: MissionTemplate[];
}
