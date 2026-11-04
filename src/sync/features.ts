/**
 * Selos e foto de perfil na nuvem (0.4): só com `VITE_SYNC_SEALS_PHOTO=1` no build,
 * depois que as regras novas do Firestore forem publicadas. Sem isso, ficam só no
 * aparelho e no backup — e a interface diz exatamente isso.
 */
export function sealsPhotoSyncEnabled(env: Record<string, string | boolean | undefined> = import.meta.env): boolean {
  return env.VITE_SYNC_SEALS_PHOTO === '1';
}
