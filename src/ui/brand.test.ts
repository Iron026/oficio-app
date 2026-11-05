import { readFileSync } from 'node:fs';
import { LOGO } from './brand';

describe('logomarca opção A: uma só geometria no app, no favicon e no ícone do Android', () => {
  const favicon = readFileSync('public/icon.svg', 'utf8');
  const script = readFileSync('scripts/icone-app.mjs', 'utf8');
  it.each([['favicon', favicon], ['gerador de ícones', script]])('%s usa os mesmos traços de ui/brand.ts', (_, text) => {
    expect(text).toContain(LOGO.squircle);
    expect(text).toContain(LOGO.arch);
    expect(text).toMatch(new RegExp(`cx[=:"\\s]+32[\\s\\S]*cy[=:"\\s]+${LOGO.dot.cy}[\\s\\S]*r[=:"\\s]+${LOGO.dot.r}`));
    expect(text).toContain(LOGO.gold);
  });
  it('a logo antiga não aparece mais', () => {
    expect(favicon).not.toContain('M18 42 32 18l14 24');
    expect(readFileSync('src/screens/Shell.tsx', 'utf8')).not.toContain('M18 42 32 18l14 24');
  });
});
