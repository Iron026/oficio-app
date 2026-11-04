import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPEARANCE_CACHE_KEY, applyAccentWithTransition, readAppearanceCache, writeAppearanceCache } from './appearance';

/** Script do <head> do index.html, executado como o navegador faria antes do app. */
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const headScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';

function runHead(matchDark = false) {
  window.matchMedia = ((q: string) => ({ matches: matchDark && q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  new Function(headScript)();
}

beforeEach(() => {
  localStorage.clear();
  const r = document.documentElement;
  r.removeAttribute('data-accent');
  r.classList.remove('dark', 'palette-switching');
  document.head.innerHTML = '<meta name="theme-color" content="#0f7b71" />';
});

describe('Aparência na primeira pintura (sem piscar a paleta padrão)', () => {
  it('o script do index.html existe e roda antes do módulo do app', () => {
    expect(headScript).toContain(APPEARANCE_CACHE_KEY);
    expect(html.indexOf(headScript)).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });

  it('aplica paleta, tema escuro e cor da barra salvos', () => {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: 'vinho', theme: 'dark', bars: { 'vinho:light': '#a02c51', 'vinho:dark': '#7e2342' } }));
    runHead();
    const r = document.documentElement;
    expect(r.dataset.accent).toBe('vinho');
    expect(r.classList.contains('dark')).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#7e2342');
  });

  it('tema "sistema" segue o aparelho', () => {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: 'safira', theme: 'system' }));
    runHead(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    document.documentElement.classList.remove('dark');
    runHead(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('sem cópia, cópia corrompida ou valores estranhos: fica no padrão sem erro', () => {
    expect(() => runHead()).not.toThrow();
    expect(document.documentElement.dataset.accent).toBeUndefined();
    localStorage.setItem(APPEARANCE_CACHE_KEY, '{quebrado');
    expect(() => runHead()).not.toThrow();
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: '"><script>', theme: 'dark', bars: { '"><script>:dark': 'red;x' } }));
    runHead();
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0f7b71');
  });

  it('a cor da barra fica ligada à paleta e ao tema em que foi medida', () => {
    writeAppearanceCache({ accent: 'oliva', theme: 'system', bars: { 'oliva:light': '#666a25', 'oliva:dark': '#4f521f' } });
    // Medida do claro não é usada no escuro.
    document.documentElement.classList.add('dark');
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: 'oliva', theme: 'dark', bars: { 'oliva:light': '#666a25' } }));
    runHead();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0f7b71');
    // Trocar de paleta descarta as cores medidas da paleta anterior.
    writeAppearanceCache({ accent: 'oliva', theme: 'light', bars: { 'oliva:light': '#666a25', 'oliva:dark': '#4f521f' } });
    writeAppearanceCache({ accent: 'grafite', theme: 'light' });
    expect(readAppearanceCache()).toEqual({ accent: 'grafite', theme: 'light' });
    writeAppearanceCache({ accent: 'grafite', theme: 'dark', bars: { 'grafite:light': '#45555c' } });
    writeAppearanceCache({ accent: 'grafite', theme: 'system' });
    expect(readAppearanceCache()).toEqual({ accent: 'grafite', theme: 'system', bars: { 'grafite:light': '#45555c' } });
  });
});

describe('Troca de paleta', () => {
  it('com "Reduzir animações" troca na hora, sem transição', () => {
    const vt = vi.fn((cb: () => void) => cb());
    (document as unknown as { startViewTransition: typeof vt }).startViewTransition = vt;
    applyAccentWithTransition('ameixa', true);
    expect(document.documentElement.dataset.accent).toBe('ameixa');
    expect(vt).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('palette-switching')).toBe(false);
  });

  it('com animações usa um único esmaecimento (View Transitions)', () => {
    const vt = vi.fn((cb: () => void) => cb());
    (document as unknown as { startViewTransition: typeof vt }).startViewTransition = vt;
    applyAccentWithTransition('indigo', false);
    expect(vt).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.accent).toBe('indigo');
  });

  it('sem View Transitions: transição de cor só durante a troca (240 ms)', () => {
    vi.useFakeTimers();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    applyAccentWithTransition('oceano', false);
    expect(document.documentElement.classList.contains('palette-switching')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(document.documentElement.classList.contains('palette-switching')).toBe(false);
    vi.useRealTimers();
  });

  it('a transição de 240 ms e a versão sem movimento estão no CSS', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toMatch(/::view-transition-old\(root\)[^{]*\{[^}]*240ms/);
    expect(css).toMatch(/\.palette-switching[^{]*\{[^}]*240ms/);
    expect(css).toMatch(/data-motion="reduce"\]::view-transition-old\(root\)[^{]*\{\s*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*view-transition/);
  });
});
