import { Briefcase, ChefHat, Flag, Heart, Rocket, Scissors, Sparkles, Star, Target, Trophy, Users, Wallet, Wrench, type LucideProps } from 'lucide-react';
import type { ProfessionModule } from '../domain/professions';
import type { AchievementDef } from '../gamification/achievements';

const professionIcons = { wrench: Wrench, scissors: Scissors, sparkles: Sparkles, chef: ChefHat, briefcase: Briefcase };
const achievementIcons = { trophy: Trophy, users: Users, star: Star, wallet: Wallet, target: Target, heart: Heart, flag: Flag, rocket: Rocket };

export function ProfessionIcon({ icon, ...props }: { icon: ProfessionModule['icon'] } & LucideProps) {
  const C = professionIcons[icon];
  return <C aria-hidden="true" {...props} />;
}

export function AchievementIcon({ icon, ...props }: { icon: AchievementDef['icon'] } & LucideProps) {
  const C = achievementIcons[icon];
  return <C aria-hidden="true" {...props} />;
}
