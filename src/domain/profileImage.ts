import type { ProfileImage, SealAward } from './types';
import { SEAL_IDS } from '../gamification/seals';

/**
 * Limites da foto de perfil (0.4). Valem no app, no backup e nas regras do Firestore
 * (firestore.rules usa os mesmos números).
 *
 * - Um único registro por conta (id "atual").
 * - Lado de 128 a 512 px (o app gera 320 px).
 * - Até 64 KiB de arquivo, o que dá até 87 384 caracteres em base64 (sobrecarga de 4/3).
 *   Com os demais campos, o documento fica abaixo de 90 KB, longe do limite de 1 MiB
 *   do Firestore.
 */
export const PROFILE_IMAGE_ID = 'atual' as const;
export const PROFILE_IMAGE_MAX_BYTES = 64 * 1024;
export const PROFILE_IMAGE_MAX_BASE64 = 4 * Math.ceil(PROFILE_IMAGE_MAX_BYTES / 3); // 87 384
export const PROFILE_IMAGE_MIMES = ['image/webp', 'image/jpeg'] as const;
export const PROFILE_IMAGE_MIN_SIDE = 128;
export const PROFILE_IMAGE_MAX_SIDE = 512;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Valida uma foto vinda de backup ou da nuvem. Dados inválidos são descartados, nunca exibidos. */
export function isValidProfileImage(v: unknown): v is ProfileImage {
  if (!isObj(v)) return false;
  const side = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= PROFILE_IMAGE_MIN_SIDE && n <= PROFILE_IMAGE_MAX_SIDE;
  return (
    v.id === PROFILE_IMAGE_ID &&
    typeof v.mime === 'string' && (PROFILE_IMAGE_MIMES as readonly string[]).includes(v.mime) &&
    typeof v.data === 'string' && v.data.length > 0 && v.data.length <= PROFILE_IMAGE_MAX_BASE64 && v.data.length % 4 === 0 && BASE64.test(v.data) &&
    typeof v.bytes === 'number' && v.bytes > 0 && v.bytes <= PROFILE_IMAGE_MAX_BYTES &&
    side(v.width) && side(v.height) &&
    typeof v.hash === 'string' && v.hash.length > 0 && v.hash.length <= 128 &&
    typeof v.createdAt === 'string' && typeof v.updatedAt === 'string'
  );
}

export function isValidSealAward(v: unknown): v is SealAward {
  if (!isObj(v)) return false;
  return (
    typeof v.id === 'string' && (SEAL_IDS as readonly string[]).includes(v.id) &&
    typeof v.stage === 'number' && Number.isInteger(v.stage) && v.stage >= 1 && v.stage <= 4 &&
    Array.isArray(v.reachedAt) && v.reachedAt.length <= 4 && v.reachedAt.every((d) => d === null || typeof d === 'string') &&
    typeof v.createdAt === 'string' && typeof v.updatedAt === 'string'
  );
}

/** URL para exibir a foto (data URL; não depende de rede). */
export function profileImageUrl(img: ProfileImage): string {
  return `data:${img.mime};base64,${img.data}`;
}
