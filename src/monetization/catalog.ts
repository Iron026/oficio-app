/**
 * Catálogo de planos e funcionalidades.
 *
 * IMPORTANTE: a versão 0.1 NÃO possui cobrança. Todos os itens marcados como
 * `available: false` aparecem como "Em breve" e não podem ser comprados.
 * A integração com o Google Play Billing (via Capacitor) entrará em um
 * `BillingProvider` futuro, sem alterar as telas que consultam `entitlements`.
 */

export type PlanId = 'gratuito' | 'premium';

/** Formas de liberar uma funcionalidade. */
export type Unlock =
  | { kind: 'free' }
  | { kind: 'subscription'; plan: 'premium' }
  | { kind: 'purchase'; productId: string };

export type FeatureCategory = 'gestao' | 'visual' | 'ia' | 'dados';

export interface FeatureDef {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  unlock: Unlock;
  /** false = ainda não desenvolvida. */
  available: boolean;
}

export const FEATURES: FeatureDef[] = [
  { id: 'clientes', name: 'Clientes ilimitados', description: 'Cadastre quantos clientes quiser.', category: 'gestao', unlock: { kind: 'free' }, available: true },
  { id: 'agenda', name: 'Agenda de serviços', description: 'Agende, conclua e acompanhe seus serviços.', category: 'gestao', unlock: { kind: 'free' }, available: true },
  { id: 'financeiro', name: 'Receitas e despesas', description: 'Controle de caixa com saldo mensal.', category: 'gestao', unlock: { kind: 'free' }, available: true },
  { id: 'evolucao', name: 'Evolução profissional', description: 'Níveis, missões, metas e conquistas.', category: 'gestao', unlock: { kind: 'free' }, available: true },
  { id: 'backup_local', name: 'Backup em arquivo', description: 'Exporte e importe seus dados.', category: 'dados', unlock: { kind: 'free' }, available: true },
  { id: 'sync_nuvem', name: 'Backup e sincronização na nuvem', description: 'Use em vários aparelhos sem perder dados.', category: 'dados', unlock: { kind: 'subscription', plan: 'premium' }, available: false },
  { id: 'relatorios', name: 'Relatórios avançados em PDF', description: 'Relatórios para enviar ao contador ou ao cliente.', category: 'gestao', unlock: { kind: 'subscription', plan: 'premium' }, available: false },
  { id: 'orcamentos', name: 'Orçamentos e recibos', description: 'Gere orçamentos e recibos com sua marca.', category: 'gestao', unlock: { kind: 'purchase', productId: 'orcamentos_recibos' }, available: false },
  { id: 'temas', name: 'Temas e cores personalizadas', description: 'Personalize a aparência do app.', category: 'visual', unlock: { kind: 'purchase', productId: 'pacote_temas' }, available: false },
  { id: 'ia_precos', name: 'Assistente de preços com IA', description: 'Sugestões de preço com base nos seus custos.', category: 'ia', unlock: { kind: 'subscription', plan: 'premium' }, available: false },
  { id: 'ia_mensagens', name: 'Mensagens para clientes com IA', description: 'Textos de confirmação e divulgação prontos.', category: 'ia', unlock: { kind: 'subscription', plan: 'premium' }, available: false },
];

export const PLANS: { id: PlanId; name: string; summary: string }[] = [
  { id: 'gratuito', name: 'Gratuito', summary: 'Tudo o que você precisa para organizar o seu negócio.' },
  { id: 'premium', name: 'Premium', summary: 'Recursos avançados, nuvem e IA. Em breve.' },
];

export const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  gestao: 'Gestão', visual: 'Personalização', ia: 'Inteligência artificial', dados: 'Dados',
};
