import { render, screen } from '@testing-library/react';
import { Avatar, initials } from './Avatar';
import { StatusBadge } from './Badge';
import { Money } from './Money';

const text = (el: HTMLElement) => el.textContent?.replace(/\u00a0/g, ' ');

describe('Money — cor e sinal', () => {
  it('receita: "+" e cor de receita', () => {
    const { container } = render(<Money cents={12_540_00} kind="income" />);
    const el = container.firstElementChild as HTMLElement;
    expect(text(el)).toBe('+mais R$ 12.540,00');
    expect(el).toHaveClass('text-income');
  });

  it('despesa: "−" e cor de despesa, valor sempre positivo no texto', () => {
    const { container } = render(<Money cents={3_335_00} kind="expense" />);
    const el = container.firstElementChild as HTMLElement;
    expect(text(el)).toBe('−menos R$ 3.335,00');
    expect(el).toHaveClass('text-expense');
  });

  it('saldo negativo: "−" e cor de despesa; positivo: "+" e cor de receita', () => {
    const neg = render(<Money cents={-45_000} kind="balance" />).container.firstElementChild as HTMLElement;
    expect(text(neg)).toBe('−menos R$ 450,00');
    expect(neg).toHaveClass('text-expense');
    const pos = render(<Money cents={920_500} kind="balance" />).container.firstElementChild as HTMLElement;
    expect(text(pos)).toBe('+mais R$ 9.205,00');
    expect(pos).toHaveClass('text-income');
  });

  it('zero não tem sinal nem cor', () => {
    for (const kind of ['income', 'expense', 'balance'] as const) {
      const el = render(<Money cents={0} kind={kind} />).container.firstElementChild as HTMLElement;
      expect(text(el)).toBe('R$ 0,00');
      expect(el).not.toHaveClass('text-income');
      expect(el).not.toHaveClass('text-expense');
    }
  });

  it('o sinal visual é oculto do leitor de tela, que ouve "mais"/"menos"', () => {
    render(<Money cents={100} kind="expense" />);
    expect(screen.getByText('−')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/menos/)).toHaveClass('sr-only');
  });
});

describe('StatusBadge', () => {
  it('mostra texto além da cor', () => {
    render(<StatusBadge tone="warning">Pendente</StatusBadge>);
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it('usa as iniciais do nome e cor estável', () => {
    expect(initials('Maria Aparecida dos Santos')).toBe('MA');
    const a = render(<Avatar name="Carla Mendes" />).container.firstElementChild!.className;
    const b = render(<Avatar name="Carla Mendes" />).container.firstElementChild!.className;
    expect(a).toBe(b);
  });
});
