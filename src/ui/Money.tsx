import { formatMoney, formatMoneyShort } from '../lib/money';
import { cx } from './cx';

export type MoneyKind = 'income' | 'expense' | 'balance' | 'neutral';

/**
 * Valor em dinheiro com cor e sinal (apenas apresentação; os valores vêm prontos do domínio).
 * - receita: verde, "+"; despesa: terracota, "−";
 * - saldo: "+" verde quando positivo, "−" terracota quando negativo, sem sinal quando zero.
 * O sinal é texto visível, então a diferença não depende só da cor.
 */
export function Money({ cents, kind = 'neutral', short, signed = kind !== 'neutral', className }: {
  cents: number; kind?: MoneyKind; short?: boolean; signed?: boolean; className?: string;
}) {
  const abs = Math.abs(cents);
  // Zero não tem sinal nem cor: não é ganho nem perda.
  const negative = abs > 0 && (kind === 'expense' || (kind === 'balance' && cents < 0));
  const positive = abs > 0 && (kind === 'income' || (kind === 'balance' && cents > 0));
  const text = short ? formatMoneyShort(abs) : formatMoney(abs);
  const sign = !signed ? '' : negative ? '−' : positive ? '+' : '';
  return (
    <span className={cx('num whitespace-nowrap', positive && signed && 'text-income', negative && 'text-expense', className)}>
      {sign && <span aria-hidden="true">{sign}</span>}
      {sign && <span className="sr-only">{negative ? 'menos ' : 'mais '}</span>}
      {text}
    </span>
  );
}
