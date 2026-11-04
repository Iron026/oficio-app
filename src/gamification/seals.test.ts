import type { AppData, Appointment, Client, SealAward, Transaction, XpEvent } from '../domain/types';
import { levelInfo, levelTitle, LEVEL_TITLES, totalXpForLevel } from './levels';
import { awardsToSave, featuredSeal, mergeAward, sealProgress, SEALS } from './seals';
import { nextTier, TIERS, tierForLevel } from './tiers';

const iso = (d: string) => `${d}T10:00:00.000Z`;
const client = (i: number, demo = false): Client => ({ id: `c${i}`, name: `Cliente ${i}`, phone: '', email: '', address: '', notes: '', createdAt: iso(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`), updatedAt: iso('2026-01-01'), isDemo: demo });
const done = (i: number, clientId: string | null, day: string, demo = false): Appointment => ({ id: `a${i}`, title: 'Serviço', clientId, date: day, time: '', price: 1000, status: 'concluido', notes: '', completedAt: iso(day), transactionId: null, createdAt: iso(day), updatedAt: iso(day), isDemo: demo });
const ev = (key: string, day: string): XpEvent => ({ id: key, key, category: 'meta', xp: 50, label: key, createdAt: iso(day) } as XpEvent);
const tx = (i: number, type: 'receita' | 'despesa', amount: number, date: string): Transaction => ({ id: `t${i}`, type, amount, description: '', category: 'x', date, appointmentId: null, createdAt: iso(date), updatedAt: iso(date) });
const data = (p: Partial<AppData> = {}): Pick<AppData, 'clients' | 'appointments' | 'transactions' | 'xpEvents'> => ({ clients: [], appointments: [], transactions: [], xpEvents: [], ...p });
const prog = (d: ReturnType<typeof data>, awards: SealAward[] = []) => Object.fromEntries(sealProgress(d, awards).map((p) => [p.def.id, p]));

describe('Categorias (derivadas do nível)', () => {
  it('as faixas são exatamente as dos títulos existentes', () => {
    expect(TIERS.map((t) => [t.minLevel, t.title])).toEqual(LEVEL_TITLES.map(([l, t]) => [l, t]));
    expect(TIERS.map((t) => t.id)).toEqual(['inicial', 'bronze', 'prata', 'ouro', 'platina', 'diamante']);
  });

  it.each([
    [1, 'inicial'], [2, 'inicial'], [3, 'bronze'], [4, 'bronze'], [5, 'prata'], [7, 'prata'],
    [8, 'ouro'], [11, 'ouro'], [12, 'platina'], [15, 'platina'], [16, 'diamante'], [40, 'diamante'],
  ])('nível %i → %s', (level, id) => {
    expect(tierForLevel(level).id).toBe(id);
    expect(tierForLevel(level).title).toBe(levelTitle(level));
  });

  it('próxima categoria usa a fórmula real de XP', () => {
    expect(nextTier(6, 1600)).toEqual({ tier: TIERS[3], xpNeeded: totalXpForLevel(8) - 1600 });
    expect(nextTier(16, totalXpForLevel(16))).toEqual({ tier: expect.objectContaining({ id: 'diamante', name: 'Diamante II', minLevel: 21, rank: 2 }), xpNeeded: totalXpForLevel(21) - totalXpForLevel(16) });
    expect(levelInfo(totalXpForLevel(8)).level).toBe(8);
  });
});

describe('R3: graus do Diamante (só visual)', () => {
  it.each([
    [15, 'Platina', 1], [16, 'Diamante', 1], [20, 'Diamante', 1], [21, 'Diamante II', 2], [25, 'Diamante II', 2],
    [26, 'Diamante III', 3], [31, 'Diamante IV', 4], [36, 'Diamante V', 5], [41, 'Diamante VI', 6], [66, 'Diamante XI', 11],
  ])('nível %i → %s', (level, name, rank) => {
    const t = tierForLevel(level);
    expect([t.name, t.rank]).toEqual([name, rank]);
    expect(t.title).toBe(levelTitle(level)); // título do nível não muda
  });

  it('não altera a fórmula de XP nem os níveis', () => {
    expect([16, 21, 26].map(totalXpForLevel)).toEqual([12000, 21000, 32500]);
    expect(levelInfo(21000).level).toBe(21);
  });

  it('o próximo grau é sempre 5 níveis depois', () => {
    expect(nextTier(23, totalXpForLevel(23)).tier.name).toBe('Diamante III');
    expect(nextTier(23, totalXpForLevel(23)).tier.minLevel).toBe(26);
  });
});

describe('Selos: cálculo pelos registros', () => {
  it('limites aprovados', () => {
    expect(Object.fromEntries(SEALS.map((s) => [s.id, s.thresholds]))).toEqual({
      constancia: [1, 4, 12, 26], fidelizacao: [1, 5, 15, 40], metas: [1, 3, 6, 12],
      experiencia: [25, 100, 250, 500], carteira: [20, 50, 100, 200], saude: [1, 3, 6, 12],
    });
  });

  it('estágios e datas: experiência, carteira, constância, metas', () => {
    const appts = Array.from({ length: 30 }, (_, i) => done(i, null, `2026-02-${String((i % 27) + 1).padStart(2, '0')}`));
    const clients = Array.from({ length: 21 }, (_, i) => client(i));
    const xpEvents = [ev('goal_week:2026-W01', '2026-01-04'), ev('goal_week:2026-W02', '2026-01-11'), ev('goal_month:2026-01', '2026-01-31'), ev('goal_week:2026-W03', '2026-01-18'), ev('goal_week:2026-W04', '2026-01-25')];
    const p = prog(data({ appointments: appts, clients, xpEvents }));
    expect(p.experiencia).toMatchObject({ value: 30, stage: 1, next: 100 });
    expect(p.carteira).toMatchObject({ value: 21, stage: 1, next: 50 });
    expect(p.constancia).toMatchObject({ value: 4, stage: 2, next: 12 });
    expect(p.constancia!.reachedAt).toEqual([iso('2026-01-04'), iso('2026-01-25'), null, null]);
    expect(p.metas).toMatchObject({ value: 1, stage: 1 });
  });

  it('fidelização: data do 3º atendimento de cada cliente', () => {
    const appts = [done(1, 'c1', '2026-03-01'), done(2, 'c1', '2026-03-05'), done(3, 'c1', '2026-03-09'), done(4, 'c2', '2026-03-02'), done(5, 'c2', '2026-03-03')];
    const p = prog(data({ appointments: appts }));
    expect(p.fidelizacao).toMatchObject({ value: 1, stage: 1 });
    expect(p.fidelizacao!.reachedAt[0]).toBe(iso('2026-03-09'));
  });

  it('saúde financeira: meses com receita, despesa e saldo positivo', () => {
    const t = [tx(1, 'receita', 1000, '2026-01-10'), tx(2, 'despesa', 100, '2026-01-20'), tx(3, 'receita', 100, '2026-02-10'), tx(4, 'despesa', 500, '2026-02-11'), tx(5, 'receita', 900, '2026-03-01')];
    expect(prog(data({ transactions: t })).saude).toMatchObject({ value: 1, stage: 1 });
  });

  it('dados de demonstração não contam', () => {
    const appts = Array.from({ length: 30 }, (_, i) => done(i, null, '2026-02-01', true));
    const clients = Array.from({ length: 25 }, (_, i) => client(i, true));
    const p = prog(data({ appointments: appts, clients }));
    expect(p.experiencia!.stage).toBe(0);
    expect(p.carteira!.stage).toBe(0);
  });
});

describe('Selos permanentes: nunca regridem', () => {
  const award = (stage: 1 | 2 | 3 | 4, dates: (string | null)[], updatedAt = iso('2026-05-01')): SealAward => ({ id: 'experiencia', stage, reachedAt: dates, createdAt: iso('2026-01-01'), updatedAt });

  it('mesclagem: maior estágio e data mais antiga, comutativa, associativa e idempotente', () => {
    const a = award(2, [iso('2026-02-01'), iso('2026-04-01'), null, null]);
    const b = award(3, [iso('2026-02-03'), iso('2026-03-01'), iso('2026-06-01'), null]);
    const c = award(1, [iso('2026-01-15'), null, null, null]);
    const ab = mergeAward(a, b);
    expect(ab.stage).toBe(3);
    expect(ab.reachedAt).toEqual([iso('2026-02-01'), iso('2026-03-01'), iso('2026-06-01'), null]);
    expect(mergeAward(b, a)).toEqual(ab);
    expect(mergeAward(mergeAward(a, b), c)).toEqual(mergeAward(a, mergeAward(b, c)));
    expect(mergeAward(ab, ab)).toEqual(ab);
  });

  it('excluir registros não reduz o estágio guardado', () => {
    const stored = [award(3, [iso('2026-01-01'), iso('2026-02-01'), iso('2026-03-01'), null])];
    const p = prog(data({ appointments: [done(1, null, '2026-01-01')] }), stored); // só 1 atendimento agora
    expect(p.experiencia).toMatchObject({ computedStage: 0, stage: 3, next: 500 });
    expect(awardsToSave(data(), stored, new Date())).toEqual([]);
  });

  it('reconhece selos já merecidos e é idempotente', () => {
    const appts = Array.from({ length: 26 }, (_, i) => done(i, null, '2026-02-01'));
    const first = awardsToSave(data({ appointments: appts }), [], new Date('2026-11-04T10:00:00Z'));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: 'experiencia', stage: 1 });
    expect(awardsToSave(data({ appointments: appts }), first, new Date('2026-11-05T10:00:00Z'))).toEqual([]);
  });
});

describe('selo em destaque', () => {
  const stored: SealAward[] = [
    { id: 'metas', stage: 2, reachedAt: [iso('2026-01-01'), iso('2026-03-01'), null, null], createdAt: iso('2026-01-01'), updatedAt: iso('2026-03-01') },
    { id: 'carteira', stage: 2, reachedAt: [iso('2026-01-01'), iso('2026-06-01'), null, null], createdAt: iso('2026-01-01'), updatedAt: iso('2026-06-01') },
    { id: 'saude', stage: 1, reachedAt: [iso('2026-09-01'), null, null, null], createdAt: iso('2026-09-01'), updatedAt: iso('2026-09-01') },
  ];
  const p = sealProgress(data(), stored);
  it('automático: maior estágio; no empate, o mais recente', () => {
    expect(featuredSeal(p, 'auto')?.def.id).toBe('carteira');
  });
  it('escolhido: vale se conquistado; bloqueado volta ao automático', () => {
    expect(featuredSeal(p, 'saude')?.def.id).toBe('saude');
    expect(featuredSeal(p, 'experiencia')?.def.id).toBe('carteira');
    expect(featuredSeal(sealProgress(data(), []), 'auto')).toBeNull();
  });
});
