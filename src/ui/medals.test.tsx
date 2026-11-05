import { render } from '@testing-library/react';
import { ACHIEVEMENTS } from '../gamification/achievements';
import { SEALS } from '../gamification/seals';
import { AchievementMedal, SEAL_GLYPH, SealMedal, achievementGlyph } from './medals';

describe('beta.5: medalhões de selos (hexágono novo)', () => {
  it.each([1, 2, 3, 4])('estágio %i acende exatamente esse número de pontos, em 56 e em 32 px', (stage) => {
    for (const size of [56, 32]) {
      const { container, unmount } = render(<SealMedal id="experiencia" stage={stage} size={size} />);
      expect(container.querySelectorAll('[data-pip="on"]')).toHaveLength(stage);
      expect(container.querySelectorAll('[data-pip]')).toHaveLength(4);
      unmount();
    }
  });

  it('em 32 px os pontos ficam maiores e mais afastados (contagem legível)', () => {
    const r = (size: number) => Number(render(<SealMedal id="metas" stage={2} size={size} />).container.querySelector('[data-pip]')!.getAttribute('r'));
    expect(r(32)).toBeGreaterThan(r(56));
    expect(r(32) * 2 * (32 / 64)).toBeGreaterThanOrEqual(3); // ponto de 3 px ou mais na tela
  });

  it('estágio IV tem aro e pontos dourados; II e III têm aro interno; bloqueado não tem pontos', () => {
    const iv = render(<SealMedal id="carteira" stage={4} />).container;
    expect(iv.querySelectorAll('[data-pip="on"][fill="#fde68a"]')).toHaveLength(4);
    const inner = (stage: number) => render(<SealMedal id="carteira" stage={stage} />).container.querySelectorAll('path[stroke-width="1.2"]').length;
    expect([inner(1), inner(2), inner(3), inner(4)]).toEqual([0, 1, 1, 1]); // aro interno a partir do II
    const locked = render(<SealMedal id="carteira" stage={0} />).container;
    expect(locked.querySelectorAll('[data-pip]')).toHaveLength(0);
  });

  it('TalkBack: com rótulo é imagem nomeada; sem rótulo é decorativo (o texto ao lado informa)', () => {
    const named = render(<SealMedal id="saude" stage={3} label="Selo Saúde financeira, estágio III de IV" />).container.querySelector('svg')!;
    expect(named.getAttribute('role')).toBe('img');
    expect(named.getAttribute('aria-label')).toBe('Selo Saúde financeira, estágio III de IV');
    const deco = render(<SealMedal id="saude" stage={3} />).container.querySelector('svg')!;
    expect(deco.getAttribute('aria-hidden')).toBe('true');
  });

  it('todos os selos têm desenho próprio e diferente', () => {
    const glyphs = SEALS.map((s) => SEAL_GLYPH[s.id]);
    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(SEALS.length);
  });
});

describe('beta.5: medalhas redondas das conquistas', () => {
  it('cada conquista tem desenho próprio e diferente', () => {
    const glyphs = ACHIEVEMENTS.map(achievementGlyph);
    expect(new Set(glyphs).size).toBe(ACHIEVEMENTS.length);
  });

  it('bloqueada mostra o mesmo desenho apagado com cadeado; desbloqueada sem cadeado', () => {
    const a = ACHIEVEMENTS[0]!;
    const on = render(<AchievementMedal achievement={a} unlocked />).container;
    const off = render(<AchievementMedal achievement={a} unlocked={false} />).container;
    expect(on.querySelector('g[transform="translate(34 34)"]')).toBeNull();
    expect(off.querySelector('g[transform="translate(34 34)"]')).not.toBeNull();
    expect(off.querySelector('g[transform="translate(12 12)"]')!.innerHTML).toBe(on.querySelector('g[transform="translate(12 12)"]')!.innerHTML);
    expect(on.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
