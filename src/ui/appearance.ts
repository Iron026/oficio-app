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
  /** Cor da barra do sistema (início do cabeçalho) já calculada. */
  bar?: string;
}

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
    const bar = v.bar ?? readAppearanceCache()?.bar;
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(bar ? { ...v, bar } : v));
  } catch {
    /* sem armazenamento local: só não há pré-aplicação */
  }
}

/** Cor da barra do sistema = início do cabeçalho da paleta (lida do CSS já aplicado). */
export function syncThemeColorMeta(): void {
  const hero = getComputedStyle(document.documentElement).getPropertyValue('--hero-1').trim();
  if (!/^#[0-9a-f]{6}$/i.test(hero)) return;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hero);
  const cur = readAppearanceCache();
  if (cur?.accent && cur.theme && cur.bar !== hero) writeAppearanceCache({ accent: cur.accent, theme: cur.theme, bar: hero });
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
