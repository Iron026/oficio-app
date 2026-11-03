import { SEAL_IDS } from '../gamification/seals';
import type { AccentId, AvatarChoice, SealId, Settings, ThemePreference } from './types';

/**
 * Preferências (0.4) — dois lugares, com regras diferentes:
 *
 * Conta (Settings, sincronizado pelo documento de perfil que já existe):
 *   cor de destaque, imagem do perfil escolhida e selo em destaque.
 *
 * Aparelho (DevicePrefs, StorageAdapter.kv "prefs:device:v1"; nunca vai para a
 * nuvem nem para o backup; trocar de conta não muda):
 *   tema, densidade, ocultar valores e reduzir animações.
 */
export type Density = 'confortavel' | 'compacta';
export type MotionPref = 'sistema' | 'reduzir';

export interface DevicePrefs {
  version: 1;
  theme: ThemePreference;
  density: Density;
  hideValues: boolean;
  motion: MotionPref;
}

export const DEVICE_PREFS_KEY = 'prefs:device:v1';
export const ACCENTS: readonly AccentId[] = ['petroleo', 'oceano', 'indigo', 'grafite'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const DEFAULT_DEVICE_PREFS: DevicePrefs = { version: 1, theme: 'system', density: 'confortavel', hideValues: false, motion: 'sistema' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Lê as preferências do aparelho. Na primeira abertura da 0.4 (nada salvo ainda),
 * o tema vem de `settings.theme` — a escolha feita até a beta.1 — para que a
 * aparência não mude na atualização.
 */
export function readDevicePrefs(stored: unknown, legacyTheme: ThemePreference | undefined): DevicePrefs {
  if (!isObj(stored)) return { ...DEFAULT_DEVICE_PREFS, theme: THEMES.includes(legacyTheme as ThemePreference) ? legacyTheme! : 'system' };
  return {
    version: 1,
    theme: THEMES.includes(stored.theme as ThemePreference) ? (stored.theme as ThemePreference) : 'system',
    density: stored.density === 'compacta' ? 'compacta' : 'confortavel',
    hideValues: stored.hideValues === true,
    motion: stored.motion === 'reduzir' ? 'reduzir' : 'sistema',
  };
}

/** Preferências da conta vindas da nuvem ou de backup: valores inválidos viram o padrão. */
export function accentOf(s: Settings): AccentId {
  return ACCENTS.includes(s.accent as AccentId) ? (s.accent as AccentId) : 'petroleo';
}

export function avatarOf(s: Settings): AvatarChoice {
  const a = s.avatar as unknown;
  if (isObj(a)) {
    if (a.kind === 'foto') return { kind: 'foto' };
    if (a.kind === 'interno' && typeof a.id === 'string' && a.id.length <= 64) return { kind: 'interno', id: a.id };
  }
  return { kind: 'iniciais' };
}

export function featuredSealOf(s: Settings): SealId | 'auto' {
  return SEAL_IDS.includes(s.featuredSeal as SealId) ? (s.featuredSeal as SealId) : 'auto';
}
