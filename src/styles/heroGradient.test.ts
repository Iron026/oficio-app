import { readFileSync } from 'node:fs';

/** beta.5: degradê do cabeçalho suave e sem emenda com a barra fixa (que é --hero-1 sólido). */
describe('degradê do cabeçalho', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const hero = css.slice(css.indexOf('@utility hero {'), css.indexOf('}', css.indexOf('@utility hero {')) + 200);
  it('começa exatamente em --hero-1 e termina em --hero-2, de cima para baixo', () => {
    expect(hero).toMatch(/linear-gradient\(180deg,\s*var\(--hero-1\) 0%/);
    expect(hero).toMatch(/var\(--hero-2\) 100%\)/);
  });
  it('transição em oklab com paradas intermediárias (sem faixas visíveis)', () => {
    expect((hero.match(/color-mix\(in oklab/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it('o brilho fica longe da emenda do topo e se dissolve até transparente; tem alternativa sem color-mix', () => {
    expect(hero).toMatch(/radial-gradient\(120% 140% at 96% 88%/);
    expect(hero).toMatch(/transparent 70%\)/);
    expect(hero).toMatch(/background: linear-gradient\(180deg, var\(--hero-1\), var\(--hero-2\)\);/);
  });
});
