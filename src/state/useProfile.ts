import { useMemo } from 'react';
import { featuredSealOf } from '../domain/preferences';
import { totalXp } from '../gamification/engine';
import { levelInfo } from '../gamification/levels';
import { featuredSeal, sealProgress } from '../gamification/seals';
import { nextTier, tierForLevel } from '../gamification/tiers';
import { useApp } from './AppContext';

/** Situação do perfil profissional: nível, categoria, selos e selo em destaque (só leitura). */
export function useProfile() {
  const { data } = useApp();
  return useMemo(() => {
    const lv = levelInfo(totalXp(data.xpEvents));
    const tier = tierForLevel(lv.level);
    const seals = sealProgress(data, data.sealAwards);
    const featured = featuredSeal(seals, featuredSealOf(data.settings));
    return { lv, tier, next: nextTier(lv.level, lv.totalXp), seals, featured };
  }, [data]);
}
