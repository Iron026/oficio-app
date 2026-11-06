import { readFileSync } from 'node:fs';

/**
 * Cabeçalho (beta.7): continua a barra fixa (--hero-1 sólido) sem emenda e termina sem faixa.
 * A beta.5/6 deslocava o fundo 3,5rem para cima e ele se repetia: o fim do cabeçalho mostrava de
 * novo o começo do degradê (faixa clara com borda dura). Estes testes travam as duas causas.
 */
describe('degradê do cabeçalho', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const start = css.indexOf('@utility hero {');
  const hero = css.slice(start, css.indexOf('\n}', start));
  const shell = readFileSync('src/screens/Shell.tsx', 'utf8');

  it('começa exatamente em --hero-1, a cor da barra fixa (sem emenda)', () => {
    expect(hero).toMatch(/linear-gradient\(180deg,\s*var\(--hero-1\) 0%/);
    expect(shell).toMatch(/sticky top-0[^"]*bg-\[var\(--hero-1\)\]/);
  });
  it('o fundo não se repete nem é deslocado (a causa da faixa no fim do cabeçalho)', () => {
    expect(hero).toMatch(/background-repeat: no-repeat;/);
    expect(hero).toMatch(/background-position: 0 0;/);
    expect(hero).toMatch(/background-size: 100% 100%;/);
    expect(shell).not.toMatch(/background-position/);
  });
  it('transição contida e suave: oklab, paradas intermediárias, termina na metade do caminho para --hero-2', () => {
    expect((hero.match(/color-mix\(in oklab/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(hero).toMatch(/color-mix\(in oklab, var\(--hero-1\) 50%, var\(--hero-2\)\) 100%\)/);
  });
  it('brilho no canto de baixo que se dissolve até transparente; base arredondada; alternativa sem color-mix', () => {
    expect(hero).toMatch(/radial-gradient\(120% 100% at 100% 100%/);
    expect(hero).toMatch(/transparent 65%\)/);
    expect(hero).toMatch(/border-bottom-left-radius: 1\.75rem;/);
    expect(hero).toMatch(/background: linear-gradient\(180deg, var\(--hero-1\), var\(--hero-2\)\);/);
  });
});
