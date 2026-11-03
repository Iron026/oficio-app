import { getProfession } from '../domain/professions';
import type { AppData, Appointment, Client, Profile, XpEvent } from '../domain/types';
import { actionAward, evaluate, missionProgress, totalXp } from './engine';

const NOW = new Date(2026, 10, 4, 10); // quarta, 4/11/2026
const profile: Profile = { name: 'Ana', businessName: '', professionId: 'beleza', createdAt: NOW.toISOString(), weeklyGoalServices: 2, monthlyGoalRevenue: 100_000 };

const client = (id: string, isDemo = false): Client => ({ id, name: id, phone: '', email: '', address: '', notes: '', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...(isDemo ? { isDemo } : {}) });
const done = (id: string, clientId: string | null = null, isDemo = false): Appointment => ({
  id, title: 'Corte', clientId, date: '2026-11-03', time: '', price: 5000, status: 'concluido', notes: '', completedAt: NOW.toISOString(), transactionId: null,
  createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...(isDemo ? { isDemo } : {}),
});
const base = (): AppData => ({ profile, settings: { theme: 'system' }, clients: [], appointments: [], transactions: [], xpEvents: [], achievements: [], sealAwards: [], profileImages: [] });

describe('XP por ação', () => {
  it('não concede XP repetido para a mesma entidade', () => {
    const first = actionAward('client_created', 'c1', 'x', [], NOW)!;
    expect(first.xp).toBe(10);
    expect(actionAward('client_created', 'c1', 'x', [first], NOW)).toBeNull();
  });

  it('respeita limite diário por tipo de ação', () => {
    const ledger: XpEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const ev = actionAward('client_created', `c${i}`, 'x', ledger, NOW);
      if (ev) ledger.push(ev);
    }
    expect(ledger).toHaveLength(5);
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect(actionAward('client_created', 'c99', 'x', ledger, tomorrow)).not.toBeNull();
  });
});

describe('avaliação de missões, metas e conquistas', () => {
  it('desbloqueia conquista e meta semanal uma única vez', () => {
    const data = { ...base(), clients: [client('c1')], appointments: [done('a1', 'c1'), done('a2', 'c1')] };
    const r1 = evaluate(profile, getProfession('beleza'), data, NOW);
    expect(r1.achievements.map((a) => a.id)).toContain('primeira_conclusao');
    expect(r1.xpEvents.some((e) => e.key.startsWith('goal_week:'))).toBe(true);
    expect(r1.xpEvents.some((e) => e.key === 'mission:inicio_cliente')).toBe(true);

    const data2 = { ...data, xpEvents: r1.xpEvents, achievements: r1.achievements };
    const r2 = evaluate(profile, getProfession('beleza'), data2, NOW);
    expect(r2.xpEvents).toHaveLength(0);
    expect(r2.achievements).toHaveLength(0);
  });

  it('dados de demonstração não geram XP nem conquistas', () => {
    const data = { ...base(), clients: [client('d1', true)], appointments: [done('a1', 'd1', true), done('a2', 'd1', true), done('a3', 'd1', true)] };
    const r = evaluate(profile, getProfession('beleza'), data, NOW);
    expect(r.xpEvents).toHaveLength(0);
    expect(r.achievements).toHaveLength(0);
  });

  it('missões semanais são da profissão e medem o progresso real', () => {
    const data = { ...base(), appointments: [done('a1'), done('a2')] };
    const weekly = missionProgress(getProfession('beleza'), data, NOW).filter((m) => m.kind === 'semanal');
    const atend = weekly.find((m) => m.template.id === 'atendimentos_semana')!;
    expect(atend.template.title).toMatch(/atendimentos/i);
    expect(atend.current).toBe(2);
    expect(atend.done).toBe(false);
  });

  it('XP nunca diminui (sem penalidades)', () => {
    const ledger = [actionAward('client_created', 'c1', 'x', [], NOW)!];
    expect(totalXp(ledger)).toBe(10);
    expect(ledger.every((e) => e.xp > 0)).toBe(true);
  });
});
