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

  it('beta.5: o aviso não captura toques (só o botão de ação); tocar nele não o fecha', () => {
    renderWith([{ title: 'Salvo' }, { title: 'Concluído', action: { label: 'Desfazer', onClick: () => undefined } }]);
    const info = document.querySelector('[data-toast="info"]')!;
    const acao = document.querySelector('[data-toast="acao"]')!;
    expect(info.className).toMatch(/pointer-events-none/);
    expect(acao.className).toMatch(/pointer-events-none/);
    const btn = screen.getByRole('button', { name: 'Desfazer: Concluído' });
    expect(btn.className).toMatch(/pointer-events-auto/);
    expect(btn.className).toMatch(/min-h-11/); // área de toque de 44 px
    act(() => (info as HTMLElement).click());
    expect(screen.getByText('Salvo')).toBeInTheDocument();
  });

  it('beta.5: no máximo 2 avisos; o "Desfazer" fica e sai primeiro o mais antigo sem ação', () => {
    renderWith([
      { title: 'Concluído', action: { label: 'Desfazer', onClick: () => undefined } },
      { title: 'Conquista', tone: 'achievement' },
      { title: 'Nível 2', tone: 'achievement' },
    ]);
    expect(document.querySelectorAll('[data-toast]')).toHaveLength(2);
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    expect(screen.queryByText('Conquista')).not.toBeInTheDocument();
    expect(screen.getByText('Nível 2')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(2); // o temporizador do aviso que saiu foi cancelado
  });

  it('beta.7: um novo aviso com Desfazer substitui o anterior (só a última ação pode ser desfeita); os sem ação ficam', () => {
    renderWith([
      { title: 'Cliente excluído', action: { label: 'Desfazer', onClick: () => undefined } },
      { title: 'Salvo' },
      { title: 'Atendimento excluído', action: { label: 'Desfazer', onClick: () => undefined } },
    ]);
    expect(screen.queryByText('Cliente excluído')).not.toBeInTheDocument();
    expect(screen.getByText('Salvo')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^desfazer/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Desfazer: Atendimento excluído' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(2);
    act(() => vi.advanceTimersByTime(7999));
    expect(screen.getByText('Atendimento excluído')).toBeInTheDocument(); // 8 s com ação
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Atendimento excluído')).not.toBeInTheDocument();
  });

  it('beta.5: com o "Desfazer" em foco (teclado ou TalkBack) o aviso não some; ao sair do foco, mais 4 s', () => {
    const onClick = vi.fn();
    renderWith([{ title: 'Concluído', action: { label: 'Desfazer', onClick } }]);
    const btn = screen.getByRole('button', { name: /^desfazer/i });
    act(() => btn.focus());
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    act(() => btn.blur());
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Concluído')).not.toBeInTheDocument();
  });

  it('beta.5: tocar em Desfazer executa a ação e fecha o aviso', () => {
    const onClick = vi.fn();
    renderWith([{ title: 'Concluído', action: { label: 'Desfazer', onClick } }]);
    act(() => screen.getByRole('button', { name: /^desfazer/i }).click());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Concluído')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('beta.5: ao trocar de tela, o aviso com Desfazer sai (não fica sobre controles de outra tela); os outros ficam', () => {
    renderWith([{ title: 'Concluído', action: { label: 'Desfazer', onClick: () => undefined } }, { title: 'Conquista', tone: 'achievement' }]);
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(screen.queryByText('Concluído')).not.toBeInTheDocument();
    expect(screen.getByText('Conquista')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
  });
});
