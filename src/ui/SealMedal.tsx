/**
 * Selos (beta.5): o medalhão hexagonal novo está em ./medals.tsx, junto com as medalhas das
 * conquistas. Este módulo continua exportando os mesmos nomes para as telas.
 */
export { SealMedal } from './medals';

/** Losangos de estágio (I a IV) ao lado do nome — redundantes com o algarismo romano. */
export function StagePips({ stage }: { stage: number }) {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= stage ? 'h-2 w-2 rotate-45 rounded-[2px] bg-brand-600 dark:bg-brand-300' : 'h-2 w-2 rotate-45 rounded-[2px] bg-line'} />
      ))}
    </span>
  );
}
