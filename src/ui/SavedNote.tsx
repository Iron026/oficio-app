import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cx } from './cx';

/**
 * Confirmação dentro de telas de escolha (imagem de perfil, selo em destaque): a escolha é
 * aplicada na hora e a tela continua aberta. Em vez de um aviso flutuante a cada toque (que
 * cobriria as opções), mostra "Atualizado" junto da prévia por alguns segundos e o anuncia ao
 * TalkBack. Cada nova escolha reinicia o tempo.
 */
export function useSavedNote(ms = 2500) {
  const [stamp, setStamp] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setStamp((s) => s + 1);
    timer.current = setTimeout(() => setStamp(0), ms);
  }, [ms]);
  return { shown: stamp > 0, key: stamp, flash };
}

export function SavedNote({ shown, label = 'Atualizado', className }: { shown: boolean; label?: string; className?: string }) {
  return (
    <p role="status" aria-live="polite" data-saved-note={shown ? 'on' : 'off'} className={cx('flex h-6 items-center justify-center gap-1 text-sm font-semibold text-brand-700 transition-opacity duration-200 dark:text-brand-200', shown ? 'opacity-100' : 'opacity-0', className)}>
      {shown && <><Check size={16} strokeWidth={3} aria-hidden="true" />{label}</>}
    </p>
  );
}
