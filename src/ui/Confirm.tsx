import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface ConfirmOptions { title: string; message: string; confirmLabel?: string; danger?: boolean }
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => undefined);
  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
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
            <Button variant="secondary" block onClick={() => close(false)}>Cancelar</Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} block onClick={() => close(true)}>{opts?.confirmLabel ?? 'Confirmar'}</Button>
          </div>
        }
      >
        <p className="text-[15px] leading-relaxed text-muted">{opts?.message}</p>
      </Sheet>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
