/** XP total necessário para alcançar o nível `level` (nível 1 = 0 XP). */
export function totalXpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

const TITLES: [number, string][] = [
  [1, 'Iniciante'],
  [3, 'Aprendiz'],
  [5, 'Profissional'],
  [8, 'Referência'],
  [12, 'Especialista'],
  [16, 'Mestre do Ofício'],
];

export function levelTitle(level: number): string {
  let title = TITLES[0]![1];
  for (const [min, t] of TITLES) if (level >= min) title = t;
  return title;
}

export interface LevelInfo {
  level: number;
  title: string;
  totalXp: number;
  xpIntoLevel: number;
  xpForNext: number; // XP necessário dentro do nível atual
  progress: number; // 0..1
}

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (totalXp >= totalXpForLevel(level + 1)) level++;
  const base = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  return {
    level,
    title: levelTitle(level),
    totalXp: xp,
    xpIntoLevel: xp - base,
    xpForNext: next - base,
    progress: (xp - base) / (next - base),
  };
}
