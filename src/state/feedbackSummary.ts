import type { Tier } from '../gamification/tiers';
import type { XpEvent } from '../domain/types';

/** O que a gamificação de uma ação trouxe, além do XP (que já aparece no aviso principal). */
export interface FeedbackExtras {
  events: XpEvent[];
  levelUp: number | null;
  tierUp: Tier | null;
  seals: { name: string; stage: string }[];
}

/**
 * Um único aviso com as novidades da ação (beta.5): categoria, nível, conquistas, selos e missões
 * juntos, em vez de um aviso para cada. O XP não se repete aqui: o aviso principal já mostra o total.
 * Ordem de destaque: categoria > nível > conquista > selo > missão/meta. Null quando não há novidade.
 */
export function summarizeFeedback(f: FeedbackExtras): { title: string; description?: string } | null {
  const items: string[] = [];
  let title: string | null = null;
  if (f.tierUp && f.levelUp) {
    title = f.tierUp.id === 'diamante' && f.tierUp.rank > 1 ? `Novo grau: ${f.tierUp.name}` : `Nova categoria: ${f.tierUp.name}`;
    items.push(`Nível ${f.levelUp} · ${f.tierUp.title}`);
  } else if (f.levelUp) {
    title = `Você chegou ao nível ${f.levelUp}!`;
  }
  const achievements = f.events.filter((e) => e.category === 'conquista').map((e) => e.label.replace('Conquista: ', ''));
  const missions = f.events.filter((e) => e.category === 'missao' || e.category === 'meta').map((e) => e.label);
  if (achievements.length) {
    if (!title) title = achievements.length === 1 ? 'Conquista desbloqueada!' : `${achievements.length} conquistas desbloqueadas!`;
    items.push(...achievements.map((a) => `Conquista: ${a}`));
  }
  const seals = f.seals.map((s) => `Selo ${s.name} · estágio ${s.stage}`);
  if (seals.length) {
    if (!title) {
      title = seals[0]!;
      items.push(...seals.slice(1));
    } else items.push(...seals);
  }
  if (missions.length) {
    if (!title) {
      title = missions.length === 1 ? missions[0]! : `${missions.length} missões e metas concluídas`;
      if (missions.length > 1) items.push(...missions);
    } else items.push(...missions);
  }
  if (!title) return null;
  const shown = items.slice(0, 3);
  const more = items.length - shown.length;
  const description = [...shown, ...(more > 0 ? [`+${more} ${more === 1 ? 'novidade' : 'novidades'} em Evolução`] : [])].join(' · ');
  return description ? { title, description } : { title };
}
