/**
 * 0.5.0-beta.5 — Painel personalizável: padrão igual ao aprovado, valores antigos/inválidos, campos e cartões de
 * versões futuras preservados, mover/ocultar/restaurar e mesclagem entre aparelhos sem perda silenciosa.
 */
import {
  DASHBOARD_CARDS, DEFAULT_DASHBOARD, dashboardEntries, effectiveOrder, isDefaultDashboard, mergeDashboard, moveCard,
  readDashboard, resetDashboard, setCardVisible, type DashboardLayout,
} from './dashboard';

const T1 = '2026-11-12T10:00:00.000Z';
const T2 = '2026-11-12T11:00:00.000Z';
const T3 = '2026-11-12T12:00:00.000Z';
const visibleIds = (l: DashboardLayout) => dashboardEntries(l).filter((e) => e.visible).map((e) => e.id);

describe('layout', () => {
  it('padrão = Painel aprovado (A receber e Meta do mês ocultos)', () => {
    expect(visibleIds(DEFAULT_DASHBOARD)).toEqual(['saldo', 'movimento', 'nivel', 'atalhos', 'semana', 'proximos', 'missoes', 'dica']);
    expect(isDefaultDashboard(DEFAULT_DASHBOARD)).toBe(true);
  });

  it.each([undefined, null, 'x', 3, [], { v: 2, order: [] }, { order: ['dica'] }])('valor antigo ou inválido (%j) = padrão', (v) => {
    expect(readDashboard(v)).toEqual(DEFAULT_DASHBOARD);
  });

  it('listas com lixo são filtradas; ids desconhecidos e campos extras são preservados', () => {
    const l = readDashboard({ v: 1, order: ['dica', 7, '', 'futuro', 'dica', 'saldo'], hidden: ['futuro', null], extra: { a: 1 } });
    expect(l.order).toEqual(['dica', 'futuro', 'saldo']);
    expect(l.hidden).toEqual(['futuro']);
    expect(l.extra).toEqual({ a: 1 });
    // Na tela: só conhecidos; os que faltam entram depois do antecessor da ordem padrão.
    const order = effectiveOrder(l);
    expect(order.slice(0, 2)).toEqual(['dica', 'saldo']);
    expect(order).toHaveLength(DASHBOARD_CARDS.length);
    expect(new Set(order).size).toBe(DASHBOARD_CARDS.length);
  });

  it('cartão conhecido ausente de um layout antigo usa a visibilidade padrão', () => {
    const l = readDashboard({ v: 1, order: ['saldo', 'nivel'], hidden: [] });
    const e = Object.fromEntries(dashboardEntries(l).map((x) => [x.id, x.visible]));
    expect(e.receber).toBe(false);
    expect(e.proximos).toBe(true);
  });

  it('subir/descer nos limites não muda nada; mover preserva ids desconhecidos no fim', () => {
    const l = readDashboard({ v: 1, order: [...DASHBOARD_CARDS, 'futuro'], hidden: [] });
    expect(moveCard(l, 'saldo', -1, T1)).toBe(l);
    expect(moveCard(l, 'dica', 1, T1)).toBe(l);
    const m = moveCard(l, 'proximos', -1, T1);
    expect(effectiveOrder(m).indexOf('proximos')).toBe(effectiveOrder(l).indexOf('proximos') - 1);
    expect(m.order.at(-1)).toBe('futuro');
    expect(m.orderAt).toBe(T1);
  });

  it('ocultar/mostrar e restaurar padrão (campos extras mantidos)', () => {
    let l: DashboardLayout = { ...DEFAULT_DASHBOARD, extra: 'x' };
    l = setCardVisible(l, 'nivel', false, T1);
    l = setCardVisible(l, 'receber', true, T1);
    expect(visibleIds(l)).not.toContain('nivel');
    expect(visibleIds(l)).toContain('receber');
    expect(l.hidden).toEqual([...l.hidden].sort());
    l = moveCard(l, 'dica', -1, T2);
    const r = resetDashboard(l, T3);
    expect(isDefaultDashboard(r)).toBe(true);
    expect(r.extra).toBe('x');
  });
});

describe('mesclagem entre aparelhos', () => {
  const base = { ...DEFAULT_DASHBOARD };

  it('um aparelho oculta, o outro reordena: as duas mudanças ficam', () => {
    const a = setCardVisible(base, 'missoes', false, T1);
    const b = moveCard(base, 'proximos', -1, T2);
    const m = readDashboard(mergeDashboard(base, a, b));
    expect(visibleIds(m)).not.toContain('missoes');
    expect(effectiveOrder(m)).toEqual(effectiveOrder(b));
  });

  it('cada aparelho oculta um cartão diferente: os dois ficam ocultos', () => {
    const a = setCardVisible(base, 'missoes', false, T1);
    const b = setCardVisible(base, 'dica', false, T2);
    expect(readDashboard(mergeDashboard(base, a, b)).hidden).toEqual(['dica', 'meta-mes', 'missoes', 'receber']);
  });

  it('os dois reordenam: vale a mudança mais recente, igual nos dois sentidos', () => {
    const a = moveCard(base, 'dica', -1, T2);
    const b = moveCard(base, 'saldo', 1, T1);
    const ab = mergeDashboard(base, a, b);
    const ba = mergeDashboard(base, b, a);
    expect((ab as DashboardLayout).order).toEqual(a.order);
    expect((ba as DashboardLayout).order).toEqual(a.order);
  });

  it('mesmo cartão alterado nos dois: vale o mais recente', () => {
    const a = setCardVisible(setCardVisible(base, 'nivel', false, T1), 'nivel', true, T3);
    const b = setCardVisible(base, 'nivel', false, T2);
    expect(visibleIds(readDashboard(mergeDashboard(null, a, b)))).toContain('nivel');
  });

  it('sem layout de um lado: fica o outro; campos de versões futuras não se perdem', () => {
    const a = { ...setCardVisible(base, 'dica', false, T1), futuro: { x: 1 } };
    expect(mergeDashboard(undefined, a, undefined)).toEqual(a);
    expect(mergeDashboard(undefined, undefined, a)).toEqual(a);
    const m = mergeDashboard(base, a, base) as DashboardLayout;
    expect(m.futuro).toEqual({ x: 1 });
  });

  it('valor inválido de um lado não apaga o válido', () => {
    const a = setCardVisible(base, 'dica', false, T1);
    expect(mergeDashboard(undefined, a, 'lixo')).toEqual(a);
    expect(mergeDashboard(undefined, 'lixo', a)).toEqual(a);
  });
});

describe('revisão independente (beta.5)', () => {
  it('layout de versão futura na nuvem (v 2) não é sobrescrito pelo local', () => {
    const futuro = { v: 2, cartoes: [{ id: 'x' }] };
    expect(mergeDashboard(undefined, setCardVisible(DEFAULT_DASHBOARD, 'dica', false, T1), futuro)).toEqual(futuro);
    expect(readDashboard(futuro)).toEqual(DEFAULT_DASHBOARD); // nesta versão, a tela usa o padrão
  });
});
