/**
 * Configuração inicial por profissão (0.5.0-beta.5). Funções puras: o que sugerir e como transformar as escolhas
 * confirmadas em mudanças. Nada aqui grava; `AppService.applyInitialSetup` aplica só o que a pessoa escolheu.
 *
 * Regras: sugestões são editáveis e opcionais; tipos de serviço só são criados se confirmados, nunca por cima de um
 * tipo com o mesmo nome e com id determinístico (repetir a configuração, ou fazê-la em dois aparelhos, não duplica);
 * valores sugeridos são referência do Ofício, não preço de mercado; duração nunca é presumida; nada de clientes,
 * atendimentos, lançamentos ou XP.
 */
import { DEFAULT_DASHBOARD, isDefaultDashboard, readDashboard, type DashboardCardId, type DashboardLayout } from './dashboard';
import { getProfession } from './professions';
import { serviceNameKey } from './serviceTypes';
import type { AccentId, AppData, ProfessionId } from './types';

export type AgendaView = 'lista' | 'dia' | 'semana' | 'mes';
export const AGENDA_VIEWS: readonly AgendaView[] = ['lista', 'dia', 'semana', 'mes'];

interface ProfessionSetup {
  accent: AccentId;
  /** Área dos avatares da galeria (ids `personagem-<área>-f|m` e o ícone da área). */
  avatarArea: string;
  avatarIcon: string;
  agendaView: AgendaView;
  /** Cartões que sobem para logo depois do saldo, nesta ordem (todos ficam visíveis). */
  dashboardFirst: DashboardCardId[];
  dashboardNote: string;
}

const SETUP: Record<ProfessionId, ProfessionSetup> = {
  manutencao: { accent: 'oceano', avatarArea: 'obras', avatarIcon: 'simbolo-engenharia', agendaView: 'lista', dashboardFirst: ['receber', 'proximos'], dashboardNote: 'Mostra “A receber” logo abaixo do saldo, seguido dos próximos serviços.' },
  beleza: { accent: 'ameixa', avatarArea: 'beleza', avatarIcon: 'simbolo-beleza', agendaView: 'dia', dashboardFirst: ['proximos', 'receber'], dashboardNote: 'Coloca os próximos atendimentos logo abaixo do saldo e mostra “A receber”.' },
  limpeza: { accent: 'safira', avatarArea: 'limpeza', avatarIcon: 'simbolo-limpeza', agendaView: 'semana', dashboardFirst: ['proximos', 'receber'], dashboardNote: 'Coloca as próximas limpezas logo abaixo do saldo e mostra “A receber”.' },
  alimentacao: { accent: 'vinho', avatarArea: 'alimentacao', avatarIcon: 'simbolo-alimentacao', agendaView: 'semana', dashboardFirst: ['proximos', 'receber'], dashboardNote: 'Coloca as próximas encomendas logo abaixo do saldo e mostra “A receber”.' },
  outros: { accent: 'petroleo', avatarArea: 'geral', avatarIcon: 'simbolo-geral', agendaView: 'lista', dashboardFirst: ['receber'], dashboardNote: 'Mostra “A receber” logo abaixo do saldo.' },
};

/** Id estável do tipo de serviço criado a partir de uma sugestão (mesmo nome → mesmo id em qualquer aparelho). */
export function suggestedServiceId(professionId: ProfessionId, name: string): string {
  const slug = serviceNameKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'servico';
  return `sugestao-${professionId}-${slug}`;
}

/** Painel organizado para a profissão: padrão + cartões da profissão logo depois do saldo e visíveis. */
export function professionDashboard(professionId: ProfessionId, at: string): DashboardLayout {
  const first = SETUP[professionId].dashboardFirst;
  const rest = DEFAULT_DASHBOARD.order.filter((id) => id !== 'saldo' && id !== 'movimento' && !first.includes(id as DashboardCardId));
  return {
    ...DEFAULT_DASHBOARD,
    order: ['saldo', 'movimento', ...first, ...rest],
    hidden: DEFAULT_DASHBOARD.hidden.filter((id) => !first.includes(id as DashboardCardId)),
    orderAt: at,
    hiddenAt: at,
  };
}

export interface ServiceSuggestion {
  name: string;
  /** Valor de referência em centavos (catálogo do Ofício), editável. */
  price: number;
  /** Já existe um tipo com esse nome: não é oferecido de novo. */
  exists: boolean;
}

export interface SetupSuggestions {
  professionId: ProfessionId;
  professionName: string;
  accent: AccentId;
  avatarIds: string[];
  agendaView: AgendaView;
  dashboardNote: string;
  /** O Painel ainda está no padrão (só então a organização da profissão é oferecida). */
  dashboardIsDefault: boolean;
  services: ServiceSuggestion[];
}

export function setupSuggestions(data: Pick<AppData, 'profile' | 'settings' | 'serviceTypes'>): SetupSuggestions {
  const professionId = data.profile?.professionId ?? 'outros';
  const p = getProfession(professionId);
  const s = SETUP[professionId];
  const existing = new Set(data.serviceTypes.map((t) => serviceNameKey(t.name)));
  return {
    professionId,
    professionName: p.name,
    accent: s.accent,
    avatarIds: [`personagem-${s.avatarArea}-f`, `personagem-${s.avatarArea}-m`, s.avatarIcon],
    agendaView: s.agendaView,
    dashboardNote: s.dashboardNote,
    dashboardIsDefault: isDefaultDashboard(readDashboard(data.settings.dashboard)),
    services: p.serviceTemplates.map((t) => ({ name: t.name, price: t.suggestedPrice, exists: existing.has(serviceNameKey(t.name)) })),
  };
}

/** Escolhas confirmadas na tela. `null` = manter como está. */
export interface SetupChoice {
  accent: AccentId | null;
  avatarId: string | null;
  organizeDashboard: boolean;
  agendaView: AgendaView | null;
  services: { name: string; price: string; pinned: boolean; duration: string }[];
}

export const EMPTY_CHOICE: SetupChoice = { accent: null, avatarId: null, organizeDashboard: false, agendaView: null, services: [] };

/** Quantas mudanças a escolha faz (para o resumo antes de aplicar). */
export function choiceSummary(c: SetupChoice): string[] {
  const out: string[] = [];
  if (c.services.length) out.push(c.services.length === 1 ? '1 tipo de serviço' : `${c.services.length} tipos de serviço`);
  if (c.organizeDashboard) out.push('Painel organizado');
  if (c.agendaView) out.push(`Agenda abre em ${({ lista: 'Lista', dia: 'Dia', semana: 'Semana', mes: 'Mês' } as const)[c.agendaView]}`);
  if (c.accent) out.push('nova cor');
  if (c.avatarId) out.push('nova imagem de perfil');
  return out;
}
