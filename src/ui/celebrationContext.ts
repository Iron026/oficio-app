import { createContext, useContext } from 'react';
import type { Tier } from '../gamification/tiers';

/** Mostra a comemoração de uma categoria recém-conquistada (ver ui/Celebration.tsx). */
export const CelebrationCtx = createContext<(tier: Tier, level?: number) => void>(() => undefined);
export const useCelebration = () => useContext(CelebrationCtx);
