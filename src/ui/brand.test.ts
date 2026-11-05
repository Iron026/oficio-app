import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

  describe('tela de abertura do Android (beta.5)', () => {
    const RES = 'android/app/src/main/res';
    const vector = readFileSync(`${RES}/drawable/splash_logo.xml`, 'utf8');
    const styles = readFileSync(`${RES}/values/styles.xml`, 'utf8');
    const colors = readFileSync(`${RES}/values/colors.xml`, 'utf8');
    const cap = readFileSync('capacitor.config.ts', 'utf8');

    it('Android 12+: o símbolo da logo A sobre o petróleo do ícone e da splash do Capacitor', () => {
      // Mesmos três pontos do arco de ui/brand.ts ("M19.5 42 32 20l12.5 22"), em coordenadas absolutas.
      expect(LOGO.arch).toBe('M19.5 42 32 20l12.5 22');
      expect(vector).toContain('M19.5,42 L32,20 L44.5,42');
      expect(vector).toContain(`M${LOGO.dot.cx - LOGO.dot.r},${LOGO.dot.cy} a${LOGO.dot.r},${LOGO.dot.r}`);
      expect(vector.toLowerCase()).toContain(LOGO.gold);
      expect(vector).toContain(`android:strokeWidth="${LOGO.archWidth}"`);
      expect(styles).toMatch(/windowSplashScreenAnimatedIcon">@drawable\/splash_logo/);
      expect(styles).toMatch(/windowSplashScreenBackground">@color\/splash_background/);
      const color = colors.match(/name="splash_background">#([0-9A-F]{6})/i)![1]!.toLowerCase();
      expect(cap.toLowerCase()).toContain(`backgroundcolor: '#${color}'`);
    });

    it('Android 11 e anteriores: todas as imagens de abertura são geradas pelo script da logo A', () => {
      const dirs = readdirSync(RES).filter((d) => d.startsWith('drawable') && existsSync(`${RES}/${d}/splash.png`));
      expect(dirs.length).toBe(26);
      expect(script).toContain("readdirSync(RES).filter((d) => d.startsWith('drawable')");
      expect(script).toContain("const SPLASH_BG = '#0f7b71'");
    });
  });
});
