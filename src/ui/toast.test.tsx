import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { ToastProvider, useToast, type ToastInput } from './Toast';

function Trigger({ toasts }: { toasts: ToastInput[] }) {
  const toast = useToast();
  useEffect(() => toasts.forEach(toast), [toast, toasts]);
  return null;
}

const renderWith = (toasts: ToastInput[]) =>
  render(
    <ToastProvider>
      <Trigger toasts={toasts} />
    </ToastProvider>,
  );

describe('ToastProvider — temporizadores', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mantém as durações: 3,2 s (comum) e 5 s (conquista)', () => {
    renderWith([{ title: 'Salvo' }, { title: 'Conquista!', tone: 'achievement' }]);
    expect(screen.getByText('Salvo')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3199));
    expect(screen.getByText('Salvo')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument();
    expect(screen.getByText('Conquista!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1800));
    expect(screen.queryByText('Conquista!')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ao desmontar, cancela os temporizadores pendentes (nenhum setState depois)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderWith([{ title: 'A' }, { title: 'B', tone: 'achievement' }]);
    expect(vi.getTimerCount()).toBe(2);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.runAllTimers());
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('fechar com toque cancela o temporizador daquele aviso', () => {
    renderWith([{ title: 'Toque para fechar' }]);
    expect(vi.getTimerCount()).toBe(1);
    act(() => screen.getByText('Toque para fechar').click());
    expect(screen.queryByText('Toque para fechar')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
