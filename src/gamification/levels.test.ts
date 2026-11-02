import { levelInfo, totalXpForLevel } from './levels';

describe('níveis', () => {
  it('curva de XP crescente', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(3)).toBe(300);
    expect(totalXpForLevel(4)).toBe(600);
  });

  it('calcula nível e progresso', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, title: 'Iniciante', progress: 0 });
    expect(levelInfo(150)).toMatchObject({ level: 2, xpIntoLevel: 50, xpForNext: 200, progress: 0.25 });
    expect(levelInfo(300).level).toBe(3);
    expect(levelInfo(300).title).toBe('Aprendiz');
  });
});
