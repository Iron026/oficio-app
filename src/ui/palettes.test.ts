import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ACCENTS } from '../domain/preferences';
import { DEFAULT_PALETTE, PALETTES, getPalette } from './palettes';

/*
 * Paletas globais (rodada 5). Confere que:
 *  1. styles/palettes.css e ui/palettes.ts têm exatamente os mesmos valores;
 *  2. as paletas só mudam a marca (brand-* e --hero-*), nunca receita, despesa, XP ou alertas;
 *  3. cada combinação de cor usada pelos componentes reais (botões, campos, navegação, abas,
 *     seleção, links, avatares, selos, cartões tonalizados, mensagens de erro, desabilitados)
 *     atinge o contraste WCAG nas 8 paletas, nos temas claro e escuro;
 *  4. nenhum componente usa uma classe brand-* que não esteja coberta por estes testes.
 */
const ROOT = resolve(__dirname, '..');
const paletteCss = readFileSync(resolve(ROOT, 'styles/palettes.css'), 'utf8');
const indexCss = readFileSync(resolve(ROOT, 'index.css'), 'utf8');
const twTheme = readFileSync(resolve(ROOT, '../node_modules/tailwindcss/theme.css'), 'utf8');

// ---------- cor ----------
type RGB = [number, number, number];
const hexToRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const rgbToHex = (c: RGB) => '#' + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');
/** Cor com transparência (ex.: bg-brand-500/15) composta sobre o fundo. */
const over = (fg: string, alpha: number, bg: string) => {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex([0, 1, 2].map((i) => a[i]! * alpha + b[i]! * (1 - alpha)) as RGB);
};
const lum = (hex: string) => {
  const c = hexToRgb(hex).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** oklch() do Tailwind → sRGB hex (recortado), para conferir as cores de erro reais. */
function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const enc = lin.map((x) => Math.min(1, Math.max(0, x))).map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  return rgbToHex(enc.map((x) => x * 255) as RGB);
}
const tw = (name: string) => {
  const m = twTheme.match(new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!m) throw new Error(`cor do Tailwind ausente: ${name}`);
  return oklchToHex(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
};

// ---------- tokens ----------
function cssBlock(css: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.[\]"=]/g, (c) => `\\${c}`);
  const m = css.match(new RegExp(`(?:^|\\n|,\\s*)${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`));
  if (!m) throw new Error(`bloco ausente: ${selector}`);
  const out: Record<string, string> = {};
  for (const t of (m[1] ?? '').matchAll(/--([\w-]+):\s*([^;]+);/g)) out[t[1]!] = t[2]!.trim();
  return out;
}
const semantic = (sel: string) => {
  const re = new RegExp(`(^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  const out: Record<string, string> = {};
  for (const m of indexCss.matchAll(re)) {
    if (!m[2]?.includes('--bg')) continue;
    for (const t of m[2].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[t[1]!] = t[2]!;
  }
  return out;
};
const light = semantic(':root');
const dark = semantic('.dark');
const SURF = { surface: light.surface!, bg: light.bg!, surface2: light['surface-2']! };
const DSURF = { surface: dark.surface!, bg: dark.bg!, surface2: dark['surface-2']! };
const WHITE = '#ffffff';
const BLACK = '#000000';
/** rgb(255 255 255 / a) → alfa, lido do index.css. */
const alphaOf = (v: string | undefined) => {
  const m = v?.match(/\/\s*([\d.]+)\)/);
  if (!m) throw new Error(`alfa ausente: ${v}`);
  return Number(m[1]);
};
const rawSemantic = (sel: string) => {
  const re = new RegExp(`(^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  const out: Record<string, string> = {};
  for (const m of indexCss.matchAll(re)) {
    if (!m[2]?.includes('--bg')) continue;
    for (const t of m[2].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[t[1]!] = t[2]!.trim();
  }
  return out;
};
const rawRoot = rawSemantic(':root');
const rawDark = rawSemantic('.dark');
const SOFT_L = alphaOf(rawRoot['on-hero-soft']);
const SOFT_D = alphaOf(rawDark['on-hero-soft'] ?? rawRoot['on-hero-soft']);
const FILL = alphaOf(rawRoot['on-hero-fill']);
/** Fundo real do texto no cabeçalho: cor inicial do gradiente + um pouco do brilho (margem). */
const glowRgb = (id: string) => {
  const m = cssBlock(paletteCss, id === 'petroleo' ? ':root' : `:root[data-accent="${id}"]`)['hero-glow']!.match(/rgb\((\d+) (\d+) (\d+)/)!;
  return rgbToHex([Number(m[1]), Number(m[2]), Number(m[3])]);
};
const heroText = (p: (typeof PALETTES)[number], darkTheme: boolean) =>
  over(glowRgb(p.id), darkTheme ? 0.18 * 0.15 : 0.35 * 0.15, darkTheme ? p.heroDark[0] : p.hero[0]);

describe('Paletas — arquivos e escopo', () => {
  it('são 8, com o Petróleo como padrão, e a lista do domínio é a mesma', () => {
    expect(PALETTES.map((p) => p.id)).toEqual([...ACCENTS]);
    expect(PALETTES).toHaveLength(8);
    expect(DEFAULT_PALETTE).toBe('petroleo');
    expect(getPalette('inexistente').id).toBe('petroleo');
    expect(getPalette(undefined).id).toBe('petroleo');
  });

  it.each(PALETTES.map((p) => [p.id, p] as const))('%s: palettes.css igual a palettes.ts (claro e escuro)', (id, p) => {
    const lightSel = id === 'petroleo' ? ':root' : `:root[data-accent="${id}"]`;
    const darkSel = id === 'petroleo' ? ':root.dark' : `:root.dark[data-accent="${id}"]`;
    const b = cssBlock(paletteCss, lightSel);
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    expect(steps.map((s) => b[`color-brand-${s}`])).toEqual([...p.scale]);
    expect([b['hero-1'], b['hero-2']]).toEqual([...p.hero]);
    const d = cssBlock(paletteCss, darkSel);
    expect([d['hero-1'], d['hero-2']]).toEqual([...p.heroDark]);
  });

  it('o Petróleo é idêntico aos valores padrão do tema (sem mudança para quem não escolher)', () => {
    const theme = cssBlock(indexCss, '@theme');
    const p = getPalette('petroleo');
    expect([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => theme[`color-brand-${s}`])).toEqual([...p.scale]);
  });

  it('as paletas só mudam a marca: nunca receita, despesa, XP, alertas nem superfícies', () => {
    for (const m of paletteCss.matchAll(/\{([^}]*)\}/g)) {
      const keys = [...(m[1] ?? '').matchAll(/--([\w-]+):/g)].map((k) => k[1]!);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) expect(k).toMatch(/^(color-brand-\d+|hero-1|hero-2|hero-glow)$/);
    }
  });

  it('receita e despesa continuam distintas de toda cor de marca', () => {
    for (const p of PALETTES) {
      for (const c of p.scale) {
        expect(c).not.toBe(light.income);
        expect(c).not.toBe(light.expense);
      }
    }
  });
});

// ---------- componentes reais ----------
interface Combo {
  /** Onde aparece (componente/estado). */
  where: string;
  /** Classes cobertas por esta combinação (para o inventário). */
  covers: string[];
  pair: (s: readonly string[], p: (typeof PALETTES)[number]) => [string, string];
  min: number;
}
const b = (s: readonly string[], step: number) => s[[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].indexOf(step)]!;

const LIGHT: Combo[] = [
  // Botão principal, FAB "Novo", selo "Atual" (Evolução), marcador da galeria, número de estágio concluído
  { where: 'Botão principal: texto branco', covers: ['bg-brand-600'], pair: (s) => [WHITE, b(s, 600)], min: 4.5 },
  { where: 'Botão principal pressionado (hover)', covers: ['hover:bg-brand-700'], pair: (s) => [WHITE, b(s, 700)], min: 4.5 },
  { where: 'Botão principal pressionado (active)', covers: ['active:bg-brand-800'], pair: (s) => [WHITE, b(s, 800)], min: 4.5 },
  // Botão tonal, chips de seleção, ícones em blocos tonais
  { where: 'Botão tonal: texto', covers: ['bg-brand-50', 'text-brand-800'], pair: (s) => [b(s, 800), b(s, 50)], min: 4.5 },
  { where: 'Botão tonal pressionado', covers: ['hover:bg-brand-100'], pair: (s) => [b(s, 800), b(s, 100)], min: 4.5 },
  { where: 'Avatar/iniciais: texto sobre 100', covers: ['bg-brand-100'], pair: (s) => [b(s, 800), b(s, 100)], min: 4.5 },
  { where: 'Chip/opção selecionada: texto', covers: ['text-brand-700'], pair: (s) => [b(s, 700), b(s, 50)], min: 4.5 },
  { where: 'Ícone em bloco tonal (50)', covers: ['text-brand-600'], pair: (s) => [b(s, 600), b(s, 50)], min: 3 },
  // Links, ações de texto, navegação ativa, selo "sucesso"
  { where: 'Link/ação: 600 sobre cartão', covers: ['text-brand-600'], pair: (s) => [b(s, 600), SURF.surface], min: 4.5 },
  { where: 'Link/ação: 600 sobre fundo', covers: ['text-brand-600'], pair: (s) => [b(s, 600), SURF.bg], min: 4.5 },
  { where: 'Ícone 600 sobre superfície 2 (Ajustes; não texto)', covers: ['text-brand-600'], pair: (s) => [b(s, 600), SURF.surface2], min: 3 },
  { where: 'Navegação ativa: rótulo 700 sobre barra', covers: ['text-brand-700'], pair: (s) => [b(s, 700), SURF.surface], min: 4.5 },
  { where: 'Navegação ativa: ícone 700 sobre indicador 50', covers: ['text-brand-700'], pair: (s) => [b(s, 700), b(s, 50)], min: 4.5 },
  { where: 'Texto 700 sobre fundo e superfície 2', covers: ['text-brand-700'], pair: (s) => [b(s, 700), SURF.surface2], min: 4.5 },
  { where: 'Dica do painel: 700 sobre 50/60 no cartão', covers: ['!bg-brand-50/60'], pair: (s) => [b(s, 700), over(b(s, 50), 0.6, SURF.surface)], min: 4.5 },
  // Não texto (WCAG 1.4.11): bordas de seleção, foco, caixa de seleção, barras
  { where: 'Borda de seleção / foco do campo (500) sobre cartão', covers: ['border-brand-500', 'focus:border-brand-500', 'outline-brand-500'], pair: (s) => [b(s, 500), SURF.surface], min: 3 },
  { where: 'Anel de foco (500) sobre fundo', covers: ['outline-brand-500'], pair: (s) => [b(s, 500), SURF.bg], min: 3 },
  { where: 'Caixa de seleção e interruptor ligado (600)', covers: ['accent-brand-600', 'border-brand-600'], pair: (s) => [b(s, 600), SURF.surface], min: 3 },
  { where: 'Barra/indicador 500 sobre trilho superfície 2', covers: ['bg-brand-500'], pair: (s) => [b(s, 500), SURF.surface2], min: 3 },
  { where: 'Ícone de destaque 500 (estrela da Evolução)', covers: ['text-brand-500'], pair: (s) => [b(s, 500), SURF.surface], min: 3 },
  // Cabeçalho
  { where: 'Cabeçalho: título branco (início do gradiente, com brilho)', covers: [], pair: (_s, p) => [WHITE, heroText(p, false)], min: 4.5 },
  { where: 'Cabeçalho: título branco (fim do gradiente)', covers: [], pair: (_s, p) => [WHITE, p.hero[1]], min: 4.5 },
  { where: 'Cabeçalho: texto secundário (on-hero-soft)', covers: [], pair: (_s, p) => [over(WHITE, SOFT_L, heroText(p, false)), heroText(p, false)], min: 4.5 },
  { where: 'Cabeçalho: busca e abas (texto/dica sobre on-hero-fill)', covers: [], pair: (_s, p) => { const f = over(BLACK, FILL, heroText(p, false)); return [over(WHITE, SOFT_L, f), f]; }, min: 4.5 },
  { where: 'Abas sobre o cabeçalho: texto da aba ativa (hero-2 sobre branco)', covers: [], pair: (_s, p) => [p.hero[1], WHITE], min: 4.5 },
  { where: 'Logotipo: marca 600 sobre cartão', covers: [], pair: (s) => [b(s, 600), SURF.surface], min: 3 },
];

const DARK: Combo[] = [
  { where: 'Botão principal: texto branco (mesmo 600)', covers: [], pair: (s) => [WHITE, b(s, 600)], min: 4.5 },
  { where: 'Botão tonal: 100 sobre 500/15', covers: ['dark:bg-brand-500/15', 'dark:text-brand-100'], pair: (s) => [b(s, 100), over(b(s, 500), 0.15, DSURF.surface)], min: 4.5 },
  { where: 'Botão tonal pressionado: 100 sobre 500/25', covers: ['dark:hover:bg-brand-500/25', 'dark:bg-brand-500/25'], pair: (s) => [b(s, 100), over(b(s, 500), 0.25, DSURF.surface)], min: 4.5 },
  { where: 'Avatar/iniciais: 50 sobre 500/25', covers: ['dark:text-brand-50'], pair: (s) => [b(s, 50), over(b(s, 500), 0.25, DSURF.surface)], min: 4.5 },
  { where: 'Avatar pequeno / pílula: 100 sobre 500/20', covers: ['dark:bg-brand-500/20'], pair: (s) => [b(s, 100), over(b(s, 500), 0.2, DSURF.surface)], min: 4.5 },
  { where: 'Chip selecionado: 200 sobre 500/15', covers: ['dark:text-brand-200'], pair: (s) => [b(s, 200), over(b(s, 500), 0.15, DSURF.surface)], min: 4.5 },
  { where: 'Navegação ativa: 200 sobre barra', covers: ['dark:text-brand-200'], pair: (s) => [b(s, 200), DSURF.surface], min: 4.5 },
  { where: 'Link/ação: 300 sobre cartão', covers: ['dark:text-brand-300'], pair: (s) => [b(s, 300), DSURF.surface], min: 4.5 },
  { where: 'Link/ação: 300 sobre fundo', covers: ['dark:text-brand-300'], pair: (s) => [b(s, 300), DSURF.bg], min: 4.5 },
  { where: 'Ícone 300 sobre superfície 2', covers: ['dark:text-brand-300'], pair: (s) => [b(s, 300), DSURF.surface2], min: 4.5 },
  { where: 'Ícone 300 em bloco tonal 500/15', covers: ['dark:text-brand-300'], pair: (s) => [b(s, 300), over(b(s, 500), 0.15, DSURF.surface)], min: 4.5 },
  { where: 'Dica do painel: 300 sobre 500/10', covers: ['dark:!bg-brand-500/10'], pair: (s) => [b(s, 300), over(b(s, 500), 0.1, DSURF.surface)], min: 4.5 },
  { where: 'Selo "Atual": texto escuro sobre 300', covers: ['dark:bg-brand-300'], pair: (s) => ['#062421', b(s, 300)], min: 4.5 },
  { where: 'Borda de seleção / foco (500) sobre cartão escuro', covers: [], pair: (s) => [b(s, 500), DSURF.surface], min: 3 },
  { where: 'Anel de foco (500) sobre fundo escuro', covers: [], pair: (s) => [b(s, 500), DSURF.bg], min: 3 },
  { where: 'Barra/indicador 400 sobre trilho escuro (linha e superfície 2)', covers: ['dark:bg-brand-400'], pair: (s) => [b(s, 400), DSURF.surface2], min: 3 },
  { where: 'Cabeçalho escuro: título branco', covers: [], pair: (_s, p) => [WHITE, heroText(p, true)], min: 4.5 },
  { where: 'Cabeçalho escuro: texto secundário (on-hero-soft)', covers: [], pair: (_s, p) => [over(WHITE, SOFT_D, heroText(p, true)), heroText(p, true)], min: 4.5 },
  { where: 'Cabeçalho escuro: busca e abas sobre on-hero-fill', covers: [], pair: (_s, p) => { const f = over(BLACK, FILL, heroText(p, true)); return [over(WHITE, SOFT_D, f), f]; }, min: 4.5 },
];

const cases = (combos: Combo[]) => PALETTES.flatMap((p) => combos.map((c) => [p.id, c.where, c, p] as const));

describe('Paletas — componentes reais, tema claro', () => {
  it.each(cases(LIGHT))('%s · %s', (_id, _w, c, p) => {
    const [fg, bg] = c.pair(p.scale, p);
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(c.min);
  });
});

describe('Paletas — componentes reais, tema escuro', () => {
  it.each(cases(DARK))('%s · %s', (_id, _w, c, p) => {
    const [fg, bg] = c.pair(p.scale, p);
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(c.min);
  });
});

describe('Paletas — estados desabilitados', () => {
  // WCAG isenta controles desabilitados de contraste mínimo; exigimos que o botão desabilitado
  // continue reconhecível (fundo visível sobre o cartão) e não fique pior que no Petróleo aprovado.
  const disabled = (s: readonly string[], surf: string) => {
    const bgc = over(b(s, 600), 0.5, surf);
    const fg = over(WHITE, 0.5, surf);
    return { label: ratio(fg, bgc), shape: ratio(bgc, surf) };
  };
  const ref = disabled(getPalette('petroleo').scale, SURF.surface);
  it.each(PALETTES.map((p) => [p.id, p] as const))('%s: botão principal desabilitado (opacidade 50%%)', (_id, p) => {
    for (const surf of [SURF.surface, DSURF.surface]) {
      const d = disabled(p.scale, surf);
      expect(d.shape).toBeGreaterThanOrEqual(1.3);
      if (surf === SURF.surface) expect(d.label).toBeGreaterThanOrEqual(ref.label * 0.9);
    }
  });
});

describe('Campos, mensagens de erro e ações destrutivas (cores fixas, iguais em todas as paletas)', () => {
  const pairs: [string, string, string, number][] = [
    ['claro: mensagem de erro do campo (red-700) sobre fundo', tw('red-700'), SURF.bg, 4.5],
    ['claro: mensagem de erro do campo (red-700) sobre cartão', tw('red-700'), SURF.surface, 4.5],
    ['claro: ação destrutiva (red-600) sobre cartão/folha', tw('red-600'), SURF.surface, 4.5],
    ['claro: ação destrutiva (red-700) sobre cartão', tw('red-700'), SURF.surface, 4.5],
    ['claro: ação destrutiva (red-700) sobre superfície 2', tw('red-700'), SURF.surface2, 4.5],
    ['claro: ícone destrutivo (red-600) sobre superfície 2', tw('red-600'), SURF.surface2, 3],
    ['claro: borda do campo inválido (red-500) sobre cartão', tw('red-500'), SURF.surface, 3],
    ['claro: botão Excluir (branco sobre red-600)', WHITE, tw('red-600'), 4.5],
    ['escuro: mensagem de erro (red-400) sobre fundo', tw('red-400'), DSURF.bg, 4.5],
    ['escuro: mensagem de erro (red-400) sobre cartão', tw('red-400'), DSURF.surface, 4.5],
    ['escuro: ação destrutiva (red-300) sobre cartão', tw('red-300'), DSURF.surface, 4.5],
    ['escuro: ícone destrutivo (red-400) sobre superfície 2', tw('red-400'), DSURF.surface2, 4.5],
    ['escuro: borda do campo inválido (red-500) sobre cartão', tw('red-500'), DSURF.surface, 3],
    ['claro: rótulo do campo (texto) sobre cartão', light.fg!, SURF.surface, 4.5],
    ['claro: dica do campo (secundário) sobre fundo', light.muted!, SURF.bg, 4.5],
    ['escuro: dica do campo (secundário) sobre fundo', dark.muted!, DSURF.bg, 4.5],
  ];
  it.each(pairs)('%s', (_n, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('Paletas — inventário: toda classe brand-* usada nos componentes está coberta', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(full);
    }
  };
  walk(ROOT);
  const used = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(?<![\w-])((?:[a-z]+:)*!?(?:bg|text|border|outline|accent)-brand-\d+(?:\/\d+)?)(?![\w/-])/g)) used.add(m[1]!);
  }
  // Classes sem contraste relevante (sombras decorativas e gradientes do cartão de evolução).
  const decorative = new Set<string>();
  const covered = new Set([...LIGHT, ...DARK].flatMap((c) => c.covers));
  it('encontra as classes da marca nos componentes', () => {
    expect(used.size).toBeGreaterThan(15);
  });
  it.each([...used].sort().map((u) => [u]))('%s', (u) => {
    expect(covered.has(u) || decorative.has(u)).toBe(true);
  });
});
