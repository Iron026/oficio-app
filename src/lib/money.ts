const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata centavos como moeda brasileira. */
export function formatMoney(cents: number): string {
  return brl.format(cents / 100);
}

/** Versão curta para indicadores: R$ 1,2 mil. */
export function formatMoneyShort(cents: number): string {
  const value = cents / 100;
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return formatMoney(cents);
}

/**
 * Converte texto digitado pelo usuário em centavos.
 * Aceita "150", "150,5", "1.234,56", "R$ 99,90" e "99.90".
 * Retorna null se inválido.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/R\$|\s/g, '').trim();
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Converte centavos em texto editável ("1234,50"). */
export function centsToInput(cents: number): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}
