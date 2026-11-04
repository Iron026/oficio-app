import { render } from '@testing-library/react';
import { tierForLevel } from '../gamification/tiers';
import { CategoryMedal } from './CategoryMedal';

// Peças que cada comemoração anima (ui/celebrate.ts). Se faltar uma, a animação perde a etapa.
const PARTS: Record<string, string[]> = {
  1: ['.m-whole', '.m-leaf'],
  3: ['.m-outline', '.m-bevel', '.m-fill', '.m-sym', '.m-sheen'],
  5: ['.m-wedge', '.m-outline', '.m-inner', '.m-chev', '.m-laurel', '.m-sheen'],
  8: ['.m-rosette', '.m-ray', '.m-ribbons', '.m-crown', '.m-sheen'],
  12: ['.m-facet', '.m-core', '.m-engrave', '.m-star', '.m-halo', '.m-glint', '.m-sheen'],
  16: ['.m-ring', '.m-notch', '.m-gfacet', '.m-goutline', '.m-glines', '.m-shimmer', '.m-frag', '.m-sparkle', '.m-halo'],
};

describe('medalhões de categoria', () => {
  it.each(Object.entries(PARTS))('nível %s: tem todas as peças da comemoração', (level, parts) => {
    const tier = tierForLevel(Number(level));
    const { container } = render(<CategoryMedal tier={tier} />);
    const svg = container.querySelector('svg')!;
    expect(svg.dataset.tier).toBe(tier.id);
    expect(svg.getAttribute('aria-label')).toBe(`Medalha ${tier.name}`);
    for (const p of parts) expect(svg.querySelector(p), p).not.toBeNull();
  });

  it('graus do Diamante: estrelas, plaqueta e anel dourado progressivos', () => {
    const at = (level: number) => render(<CategoryMedal tier={tierForLevel(level)} />).container.querySelector('svg')!;
    expect(at(16).querySelectorAll('.m-rstar')).toHaveLength(0);
    expect(at(21).querySelectorAll('.m-rstar')).toHaveLength(1);
    expect(at(21).querySelector('.m-plate')?.textContent).toBe('II');
    expect(at(26).querySelector('.m-ring2')).not.toBeNull();
    expect(at(31).querySelectorAll('.m-rstar')).toHaveLength(3);
    expect(at(31).querySelectorAll('.m-frag').length).toBeGreaterThan(at(16).querySelectorAll('.m-frag').length);
  });

  it('nenhuma classe das peças coincide com utilitários do Tailwind (outline, ring...)', () => {
    const { container } = render(<><CategoryMedal tier={tierForLevel(3)} /><CategoryMedal tier={tierForLevel(16)} /></>);
    const classes = [...container.querySelectorAll('[class]')].map((e) => e.getAttribute('class')!);
    expect(classes.every((c) => c.startsWith('m-'))).toBe(true);
  });

  it('decorativo não é anunciado; ids únicos por instância', () => {
    const { container } = render(<><CategoryMedal tier={tierForLevel(8)} decorative /><CategoryMedal tier={tierForLevel(8)} /></>);
    const [a, b] = [...container.querySelectorAll('svg')];
    expect(a!.getAttribute('aria-hidden')).toBe('true');
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b!.getAttribute('role')).toBe('img');
  });
});
