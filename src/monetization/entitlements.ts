import { FEATURES, type FeatureDef, type PlanId } from './catalog';

/** Direitos do usuário. Em 0.1 vem sempre de `freeEntitlements()`; no futuro, do provedor de cobrança. */
export interface Entitlements {
  plan: PlanId;
  purchases: string[]; // productIds
}

export function freeEntitlements(): Entitlements {
  return { plan: 'gratuito', purchases: [] };
}

export function canUse(feature: FeatureDef, ent: Entitlements): boolean {
  if (!feature.available) return false;
  switch (feature.unlock.kind) {
    case 'free': return true;
    case 'subscription': return ent.plan === feature.unlock.plan;
    case 'purchase': return ent.purchases.includes(feature.unlock.productId);
  }
}

export function hasFeature(id: string, ent: Entitlements): boolean {
  const f = FEATURES.find((x) => x.id === id);
  return f ? canUse(f, ent) : false;
}

/**
 * Contrato para o futuro provedor de cobrança (Google Play Billing).
 * Não há implementação real na versão 0.1.
 */
export interface BillingProvider {
  getEntitlements(): Promise<Entitlements>;
  purchase(productId: string): Promise<Entitlements>;
  restore(): Promise<Entitlements>;
}
