/**
 * Painel personalizável (0.5.0-beta.5). Guardado em `settings.dashboard` (preferências da conta, sincronizadas).
 *
 * Formato: `{ v: 1, order: string[], hidden: string[], orderAt?: string, hiddenAt?: string, ...outros }`.
 * - Ids e campos desconhecidos (de versões futuras) são preservados ao gravar; na tela, ids desconhecidos são
 *   ignorados e cartões conhecidos que faltam entram na posição padrão.
 * - Valor antigo ou inválido (qualquer coisa que não seja esse objeto) = organização padrão.
 * - Avisos críticos (atrasados, estornos em revisão, conflitos de sincronização) não são cartões: aparecem sempre.
 */

export const DASHBOARD_CARDS = ['saldo', 'movimento', 'nivel', 'atalhos', 'semana', 'receber', 'meta-mes', 'proximos', 'missoes', 'dica'] as const;
export type DashboardCardId = (typeof DASHBOARD_CARDS)[number];

/** Opcionais novos começam ocultos: o Painel padrão continua exatamente o aprovado. */
export const DEFAULT_HIDDEN: readonly DashboardCardId[] = ['meta-mes', 'receber']; // em ordem alfabética, como `hidden` gravado

export interface DashboardLayout {
  v: 1;
  order: string[];
  hidden: string[];
  /** Instante (ISO) da última mudança de ordem / de visibilidade (desempate entre aparelhos). */
  orderAt?: string;
  hiddenAt?: string;
  [extra: string]: unknown;
}

export const DEFAULT_DASHBOARD: DashboardLayout = { v: 1, order: [...DASHBOARD_CARDS], hidden: [...DEFAULT_HIDDEN] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40))].slice(0, 60) : null;
const isKnown = (id: string): id is DashboardCardId => (DASHBOARD_CARDS as readonly string[]).includes(id);

/** Lê o valor gravado (qualquer coisa) como layout válido; nada inválido chega à tela. */
export function readDashboard(v: unknown): DashboardLayout {
  if (!isObj(v) || v.v !== 1) return { ...DEFAULT_DASHBOARD, order: [...DEFAULT_DASHBOARD.order], hidden: [...DEFAULT_DASHBOARD.hidden] };
  const order = strList(v.order) ?? [...DASHBOARD_CARDS];
  const hidden = strList(v.hidden) ?? [...DEFAULT_HIDDEN];
  const out: DashboardLayout = { ...v, v: 1, order, hidden };
  if (typeof v.orderAt !== 'string') delete out.orderAt;
  if (typeof v.hiddenAt !== 'string') delete out.hiddenAt;
  return out;
}

/**
 * Ordem efetiva dos cartões conhecidos: a gravada (sem os desconhecidos) e, para cada conhecido que falta (cartão
 * novo de uma versão futura deste app), a posição logo depois do seu antecessor na ordem padrão.
 */
export function effectiveOrder(layout: DashboardLayout): DashboardCardId[] {
  const out: DashboardCardId[] = layout.order.filter(isKnown);
  DASHBOARD_CARDS.forEach((id, i) => {
    if (out.includes(id)) return;
    const prev = DASHBOARD_CARDS.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
  });
  return out;
}

export interface DashboardEntry { id: DashboardCardId; visible: boolean }

/** Cartões na ordem efetiva, com visibilidade. Cartão desconhecido em `hidden` é ignorado. */
export function dashboardEntries(layout: DashboardLayout): DashboardEntry[] {
  const hidden = new Set(layout.hidden);
  // Cartão conhecido ausente da lista gravada: visibilidade padrão.
  const known = new Set(layout.order);
  return effectiveOrder(layout).map((id) => ({ id, visible: known.has(id) || !(DEFAULT_HIDDEN as readonly string[]).includes(id) ? !hidden.has(id) : false }));
}

/** Grava a ordem: os conhecidos na nova ordem e os desconhecidos (versões futuras) preservados no fim. */
function withOrder(layout: DashboardLayout, known: DashboardCardId[], at: string): DashboardLayout {
  const unknown = layout.order.filter((id) => !isKnown(id));
  return { ...layout, order: [...known, ...unknown], orderAt: at };
}

export function setCardVisible(layout: DashboardLayout, id: DashboardCardId, visible: boolean, at: string): DashboardLayout {
  const hidden = layout.hidden.filter((x) => x !== id);
  if (!visible) hidden.push(id);
  hidden.sort(); // conjunto: ordem alfabética, para dois aparelhos com o mesmo conjunto gravarem o mesmo valor
  // Garante que o cartão está na lista gravada (senão a visibilidade padrão continuaria valendo).
  const base = layout.order.includes(id) ? layout : withOrder(layout, effectiveOrder(layout), layout.orderAt ?? at);
  return { ...base, hidden, hiddenAt: at };
}

export function moveCard(layout: DashboardLayout, id: DashboardCardId, dir: -1 | 1, at: string): DashboardLayout {
  const order = effectiveOrder(layout);
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return layout;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return withOrder(layout, order, at);
}

/** Restaurar padrão: ordem e visibilidade originais; campos desconhecidos preservados. */
export function resetDashboard(layout: DashboardLayout, at: string): DashboardLayout {
  return { ...layout, v: 1, order: [...DASHBOARD_CARDS, ...layout.order.filter((id) => !isKnown(id))], hidden: [...DEFAULT_HIDDEN], orderAt: at, hiddenAt: at };
}

export const isDefaultDashboard = (layout: DashboardLayout) => {
  const e = dashboardEntries(layout);
  return e.map((x) => x.id).join() === DASHBOARD_CARDS.join() && e.every((x) => x.visible === !(DEFAULT_HIDDEN as readonly string[]).includes(x.id));
};

const sameList = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Mesclagem entre aparelhos (3 vias), sem perda silenciosa de mudanças independentes:
 * - visibilidade, cartão a cartão: vale a mudança de quem mexeu naquele cartão (ocultar num aparelho e mostrar
 *   outro cartão no segundo mantém as duas mudanças); os dois mexeram no mesmo cartão → vale a mais recente;
 * - ordem: mudou só de um lado → vale essa; dos dois lados → vale a mais recente (`orderAt`);
 * - demais campos: mudança de um lado vence; dos dois → nuvem (como o resto das preferências).
 * Determinística: todos os aparelhos chegam ao mesmo resultado.
 */
export function mergeDashboard(base: unknown, local: unknown, remote: unknown): unknown {
  if (local === undefined && remote === undefined) return undefined;
  if (!isObj(remote) || remote.v !== 1) return isObj(local) && local.v === 1 ? local : remote ?? local;
  if (!isObj(local) || local.v !== 1) return remote;
  const b = isObj(base) && base.v === 1 ? readDashboard(base) : null;
  const l = readDashboard(local);
  const r = readDashboard(remote);
  const newer = (la?: string, ra?: string) => (la ?? '') > (ra ?? '');

  // Demais campos (inclusive de versões futuras).
  const out: DashboardLayout = { ...l, ...r };
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (['order', 'hidden', 'orderAt', 'hiddenAt', 'v'].includes(k)) continue;
    const lv = JSON.stringify(l[k] ?? null), rv = JSON.stringify(r[k] ?? null), bv = JSON.stringify(b?.[k] ?? null);
    if (lv !== rv && b && rv === bv) out[k] = l[k];
  }

  // Ordem.
  if (sameList(l.order, r.order)) out.order = r.order;
  else if (b && sameList(r.order, b.order)) out.order = l.order;
  else if (b && sameList(l.order, b.order)) out.order = r.order;
  else out.order = newer(l.orderAt, r.orderAt) ? l.order : r.order;
  out.orderAt = [l.orderAt, r.orderAt].filter(Boolean).sort().at(-1);
  if (!out.orderAt) delete out.orderAt;

  // Visibilidade, cartão a cartão.
  const ids = new Set([...l.hidden, ...r.hidden, ...(b?.hidden ?? [])]);
  const lh = new Set(l.hidden), rh = new Set(r.hidden), bh = new Set(b?.hidden ?? []);
  const hidden: string[] = [];
  for (const id of ids) {
    const li = lh.has(id), ri = rh.has(id);
    let keep: boolean;
    if (li === ri) keep = li;
    else if (b && ri === bh.has(id)) keep = li;
    else if (b && li === bh.has(id)) keep = ri;
    else keep = newer(l.hiddenAt, r.hiddenAt) ? li : ri;
    if (keep) hidden.push(id);
  }
  out.hidden = hidden.sort();
  out.hiddenAt = [l.hiddenAt, r.hiddenAt].filter(Boolean).sort().at(-1);
  if (!out.hiddenAt) delete out.hiddenAt;
  return out;
}
