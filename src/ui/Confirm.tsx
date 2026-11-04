import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { TextField } from './Field';
import { Sheet } from './Sheet';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Detalhes extras (ex.: resumo do que será substituído). */
  details?: ReactNode;
  /**
   * Proteção contra toque acidental em ações sem volta: o botão de confirmar só é liberado
   * depois de digitar esta palavra (sem diferenciar maiúsculas).
   */
  requireText?: string;
}
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(async () => false);

const normalize = (s: string) => s.trim().toLocaleUpperCase('pt-BR');

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<(v: boolean) => void>(() => undefined);
  const confirm = useCallback<ConfirmFn>((o) => {
    setTyped('');
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const locked = !!opts?.requireText && normalize(typed) !== normalize(opts.requireText);
  const close = (v: boolean) => {
    if (v && locked) return;
    resolver.current(v);
    setOpts(null);
    setTyped('');
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Sheet
        open={!!opts}
        title={opts?.title ?? ''}
        onClose={() => close(false)}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" block onClick={() => close(false)}>{opts?.cancelLabel ?? 'Cancelar'}</Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} block disabled={locked} onClick={() => close(true)}>{opts?.confirmLabel ?? 'Confirmar'}</Button>
          </div>
        }
      >
        <p className="text-base leading-relaxed text-muted">{opts?.message}</p>
        {opts?.details && <div className="mt-3">{opts.details}</div>}
        {opts?.requireText && (
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); close(true); }}>
            <TextField
              label={`Para confirmar, digite ${opts.requireText}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </form>
        )}
      </Sheet>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
