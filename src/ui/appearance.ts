import type { AccentId, ThemePreference } from '../domain/types';

/**
 * Aparência na primeira pintura (sem piscar com a paleta padrão).
 *
 * A fonte da verdade continua sendo a conta (settings.accent) e o aparelho (DevicePrefs.theme),
 * gravados pelo StorageAdapter. Aqui fica só uma CÓPIA de exibição em localStorage, lida por um
 * script mínimo no index.html antes do app carregar (o IndexedDB é assíncrono e chegaria tarde).
 * Se o localStorage não existir ou falhar, o app só volta ao comportamento anterior.
 */
export const APPEARANCE_CACHE_KEY = 'oficio:aparencia';

export interface AppearanceCache {
  accent: AccentId;
  theme: ThemePreference;
  /**
   * Cor da barra do sistema (início do cabeçalho) medida no CSS aplicado, por paleta e tema:
   * "petroleo:dark" → "#0f5c55". Cada cor fica ligada ao estado em que foi medida, então uma
   * medição antiga nunca é usada no outro tema nem em outra paleta.
   */
  bars?: Record<string, string>;
}

export const barKey = (accent: string, dark: boolean) => `${accent}:${dark ? 'dark' : 'light'}`;

export function readAppearanceCache(): Partial<AppearanceCache> | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY) ?? 'null');
    return v && typeof v === 'object' ? (v as Partial<AppearanceCache>) : null;
  } catch {
    return null;
  }
}

export function writeAppearanceCache(v: AppearanceCache): void {
  try {
    // Mantém só as cores medidas da paleta atual (no máximo claro e escuro).
    const old = v.bars ?? readAppearanceCache()?.bars ?? {};
    const bars = Object.fromEntries(Object.entries(old).filter(([k, c]) => k.startsWith(`${v.accent}:`) && /^#[0-9a-f]{6}$/i.test(c)));
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: v.accent, theme: v.theme, ...(Object.keys(bars).length ? { bars } : {}) }));
  } catch {
    /* sem armazenamento local: só não há pré-aplicação */
  }
}

/** Cor da barra do sistema = início do cabeçalho da paleta (lida do CSS já aplicado). */
export function syncThemeColorMeta(): void {
  const root = document.documentElement;
  const hero = getComputedStyle(root).getPropertyValue('--hero-1').trim();
  if (!/^#[0-9a-f]{6}$/i.test(hero)) return;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hero);
  const cur = readAppearanceCache();
  const accent = root.dataset.accent;
  if (!cur?.accent || !cur.theme || accent !== cur.accent) return;
  const key = barKey(accent, root.classList.contains('dark'));
  if (cur.bars?.[key] !== hero) writeAppearanceCache({ accent: cur.accent, theme: cur.theme, bars: { ...cur.bars, [key]: hero } });
}

type VT = { startViewTransition?: (cb: () => void) => unknown };

/**
 * Troca de paleta com transição: um único esmaecimento de 240 ms (View Transitions, feito
 * pela GPU) em vez de animar cada elemento. Sem suporte, transição de cor de 240 ms só
 * durante a troca. Com "Reduzir animações", troca instantânea.
 */
export function applyAccentWithTransition(accent: AccentId, reduce: boolean): void {
  const root = document.documentElement;
  const set = () => {
    root.dataset.accent = accent;
    syncThemeColorMeta();
  };
  if (reduce || root.dataset.accent === accent) return set();
  const doc = document as Document & VT;
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(set);
    return;
  }
  root.classList.add('palette-switching');
  set();
  window.setTimeout(() => root.classList.remove('palette-switching'), 260);
}
