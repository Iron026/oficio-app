import type { XpEvent } from '../domain/types';
import { TIERS } from '../gamification/tiers';
import { summarizeFeedback } from './feedbackSummary';

const ev = (category: XpEvent['category'], label: string): XpEvent => ({ id: label, key: label, category, xp: 10, label, createdAt: 'x' });

describe('beta.5: um único aviso com as novidades da ação', () => {
  it('conquista + nível viram um aviso só, sem repetir o XP', () => {
    const s = summarizeFeedback({ events: [ev('conclusao', 'Atendimento concluído'), ev('conquista', 'Conquista: Primeiro atendimento')], levelUp: 2, tierUp: null, seals: [] });
    expect(s).toEqual({ title: 'Você chegou ao nível 2!', description: 'Conquista: Primeiro atendimento' });
    expect(JSON.stringify(s)).not.toMatch(/XP/);
  });

  it('nova categoria tem prioridade e leva o nível na descrição', () => {
    const bronze = TIERS.find((t) => t.id === 'bronze')!;
    expect(summarizeFeedback({ events: [], levelUp: 3, tierUp: bronze, seals: [] })?.title).toBe('Nova categoria: Bronze');
  });

  it('só conquista, só selo, só missão; nada novo = nenhum aviso extra', () => {
    expect(summarizeFeedback({ events: [ev('conquista', 'Conquista: Cliente fiel')], levelUp: null, tierUp: null, seals: [] })).toEqual({ title: 'Conquista desbloqueada!', description: 'Conquista: Cliente fiel' });
    expect(summarizeFeedback({ events: [], levelUp: null, tierUp: null, seals: [{ name: 'Carteira', stage: 'II' }] })).toEqual({ title: 'Selo Carteira · estágio II' });
    expect(summarizeFeedback({ events: [ev('missao', 'Missão: 3 atendimentos')], levelUp: null, tierUp: null, seals: [] })).toEqual({ title: 'Missão: 3 atendimentos' });
    expect(summarizeFeedback({ events: [ev('cliente', 'Novo cliente')], levelUp: null, tierUp: null, seals: [] })).toBeNull();
  });

  it('muitas novidades: mostra 3 e aponta o resto para a Evolução', () => {
    const s = summarizeFeedback({ events: ['A', 'B', 'C', 'D'].map((n) => ev('conquista', `Conquista: ${n}`)), levelUp: 4, tierUp: null, seals: [{ name: 'Metas', stage: 'I' }] });
    expect(s?.description).toBe('Conquista: A · Conquista: B · Conquista: C · +2 novidades em Evolução');
  });
});
