import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Garante que os pares de cor do design system tenham contraste WCAG AA (≥ 4,5:1 para texto)
// nos temas claro e escuro. Lê os valores direto de src/index.css.
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const re = new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(re)) {
    const body = m[2] ?? '';
    if (!body.includes('--bg')) continue; // só o bloco de tokens semânticos
    for (const t of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[t[1] ?? ''] = t[2] ?? '';
  }
  return out;
}
const themeMap: Record<string, string> = {};
for (const t of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)) themeMap[t[1] ?? ''] = t[2] ?? '';

/** Lê um token; falha o teste se ele não existir. */
const get = (map: Record<string, string>, key: string): string => {
  const v = map[key];
  if (!v) throw new Error(`token ausente: ${key}`);
  return v;
};

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: string, b: string) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const lightMap = block(':root');
const darkMap = block('.dark');
const L = (k: string) => get(lightMap, k);
const D = (k: string) => get(darkMap, k);
const T = (k: string) => get(themeMap, k);

describe('Design system — contraste dos tokens', () => {
  it('lê os tokens dos dois temas', () => {
    for (const k of ['bg', 'surface', 'surface-2', 'fg', 'muted', 'income', 'expense']) {
      expect(L(k)).toMatch(/^#/);
      expect(D(k)).toMatch(/^#/);
    }
    for (const k of ['brand-300', 'brand-600', 'brand-700', 'xp-100', 'xp-400', 'xp-600', 'xp-700', 'xp-950']) expect(T(k)).toMatch(/^#/);
  });

  const pairs: [string, () => [string, string]][] = [
    ['claro: texto / fundo', () => [L('fg'), L('bg')]],
    ['claro: texto secundário / fundo', () => [L('muted'), L('bg')]],
    ['claro: texto secundário / cartão', () => [L('muted'), L('surface')]],
    ['claro: texto secundário / superfície 2', () => [L('muted'), L('surface-2')]],
    ['claro: receita / cartão', () => [L('income'), L('surface')]],
    ['claro: receita / fundo', () => [L('income'), L('bg')]],
    ['claro: despesa / cartão', () => [L('expense'), L('surface')]],
    ['claro: receita / superfície 2', () => [L('income'), L('surface-2')]],
    ['claro: despesa / superfície 2', () => [L('expense'), L('surface-2')]],
    ['claro: XP / superfície 2', () => [T('xp-600'), L('surface-2')]],
    ['claro: marca forte / superfície 2', () => [T('brand-700'), L('surface-2')]],
    ['claro: despesa / fundo', () => [L('expense'), L('bg')]],
    ['claro: marca / cartão', () => [T('brand-600'), L('surface')]],
    ['claro: marca / fundo', () => [T('brand-600'), L('bg')]],
    ['claro: texto branco / botão principal', () => ['#ffffff', T('brand-600')]],
    ['claro: XP / cartão', () => [T('xp-600'), L('surface')]],
    ['claro: XP / fundo', () => [T('xp-600'), L('bg')]],
    ['claro: XP / selo âmbar claro', () => [T('xp-700'), T('xp-100')]],
    ['texto sobre âmbar (nível, conquista)', () => [T('xp-950'), T('xp-400')]],
    ['escuro: texto / fundo', () => [D('fg'), D('bg')]],
    ['escuro: texto secundário / cartão', () => [D('muted'), D('surface')]],
    ['escuro: texto secundário / superfície 2', () => [D('muted'), D('surface-2')]],
    ['escuro: receita / cartão', () => [D('income'), D('surface')]],
    ['escuro: despesa / cartão', () => [D('expense'), D('surface')]],
    ['escuro: marca / cartão', () => [T('brand-300'), D('surface')]],
    ['escuro: XP / cartão', () => [T('xp-400'), D('surface')]],
    ['escuro: receita / superfície 2', () => [D('income'), D('surface-2')]],
    ['escuro: despesa / superfície 2', () => [D('expense'), D('surface-2')]],
    ['escuro: XP / superfície 2', () => [T('xp-400'), D('surface-2')]],
  ];
  it.each(pairs)('%s ≥ 4,5:1', (_name, pair) => {
    const [a, b] = pair();
    expect(ratio(a, b)).toBeGreaterThanOrEqual(4.5);
  });

  it('receita e despesa não se confundem com a marca e o XP (cores distintas)', () => {
    const all = [L('income'), L('expense'), T('brand-600'), T('xp-600')];
    expect(new Set(all).size).toBe(all.length);
  });
});
