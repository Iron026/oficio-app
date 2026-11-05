import { Briefcase, ChefHat, Scissors, Sparkles, Wrench, type LucideProps } from 'lucide-react';
import type { ProfessionModule } from '../domain/professions';

const professionIcons = { wrench: Wrench, scissors: Scissors, sparkles: Sparkles, chef: ChefHat, briefcase: Briefcase };

export function ProfessionIcon({ icon, ...props }: { icon: ProfessionModule['icon'] } & LucideProps) {
  const C = professionIcons[icon];
  return <C aria-hidden="true" {...props} />;
}

// Conquistas (beta.5): medalhas próprias em ./medals.tsx.
