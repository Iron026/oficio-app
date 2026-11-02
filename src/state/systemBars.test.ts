import { systemBarsShouldBeDark } from './AppContext';

describe('cor dos ícones das barras do sistema (Android)', () => {
  it('tela inteira: segue o tema do app', () => {
    expect(systemBarsShouldBeDark(true, false, 48)).toBe(true);
    expect(systemBarsShouldBeDark(false, true, 48)).toBe(false);
  });

  it('WebView entre as barras: segue o tema do sistema (cor real atrás das barras)', () => {
    expect(systemBarsShouldBeDark(true, false, 0)).toBe(false);
    expect(systemBarsShouldBeDark(false, true, 0)).toBe(true);
  });
});
