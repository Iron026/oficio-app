/**
 * Recibos (0.5.0-beta.4). Só lê os dados: emitir um recibo não cria lançamento, receita nem XP.
 *
 * - Só existe recibo de **dinheiro recebido**: uma receita registrada (pagamento de serviço, receita automática da
 *   0.4 ou receita avulsa). Pendências, estornos e despesas não geram recibo.
 * - Pagamento parcial: o recibo é do valor recebido naquele lançamento; o valor combinado aparece só como contexto.
 * - Estornos do pagamento aparecem como "situação atual" (estornado em parte/integralmente), sem apagar nada.
 * - Número `REC-aaaammdd-XXXX`: data do pagamento + 4 caracteres derivados do id do lançamento (estável entre
 *   emissões e aparelhos; sem contador global, que conflitaria offline).
 */
import { methodLabel, paymentSummary } from './payments';
import { isRefund, mark, refundOf } from './paymentMarks';
import { refundIssues } from './refundReview';
import type { AppData, Transaction } from './types';

type Data = Pick<AppData, 'profile' | 'clients' | 'appointments' | 'transactions'>;

export type ReceiptStatus = 'valido' | 'estornado-em-parte' | 'estornado';

export interface Receipt {
  number: string;
  issuer: { name: string; business: string };
  client: string | null;
  service: string;
  serviceDate: string | null;
  paymentDate: string;
  amount: number;
  method: string | null;
  kind: 'pagamento' | 'legado' | 'avulso';
  /** Pagamento de serviço que não cobre o valor combinado sozinho. */
  partial: { contracted: number; receivedTotal: number } | null;
  refunds: { amount: number; date: string }[];
  refunded: number;
  net: number;
  status: ReceiptStatus;
  /** Há estornos deste pagamento aguardando revisão (conflito entre aparelhos). */
  inReview: boolean;
}

/** FNV-1a de 32 bits → 4 caracteres [0-9A-Z]. Estável e sem dependências. */
function code4(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(4, '0').slice(-4);
}

export const receiptNumber = (tx: Pick<Transaction, 'id' | 'date'>) => `REC-${tx.date.replace(/-/g, '')}-${code4(tx.id)}`;
export const receiptFileName = (r: Pick<Receipt, 'number'>) => `recibo-${r.number}.pdf`;

/** Recibo de um lançamento, ou null quando não é dinheiro recebido. */
export function receiptFor(data: Data, txId: string): Receipt | null {
  const tx = data.transactions.find((t) => t.id === txId);
  if (!tx || tx.type !== 'receita' || isRefund(tx) || tx.amount <= 0) return null;
  const ap = tx.appointmentId ? data.appointments.find((a) => a.id === tx.appointmentId) : undefined;
  const client = ap?.clientId ? data.clients.find((c) => c.id === ap.clientId)?.name ?? null : null;
  const refundsList = data.transactions.filter((t) => refundOf(t) === tx.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const refunded = refundsList.reduce((n, t) => n + t.amount, 0);
  const kind: Receipt['kind'] = !tx.appointmentId ? 'avulso' : mark(tx) ? 'pagamento' : 'legado';
  let partial: Receipt['partial'] = null;
  if (ap && ap.price > 0 && tx.amount < ap.price) {
    partial = { contracted: ap.price, receivedTotal: paymentSummary(ap, data.transactions).received };
  }
  return {
    number: receiptNumber(tx),
    issuer: { name: data.profile?.name ?? '', business: data.profile?.businessName ?? '' },
    client,
    service: (ap?.title || tx.description || tx.category).trim(),
    serviceDate: ap?.date ?? null,
    paymentDate: tx.date,
    amount: tx.amount,
    method: methodLabel(mark(tx)?.method),
    kind,
    partial,
    refunds: refundsList.map((t) => ({ amount: t.amount, date: t.date })),
    refunded,
    net: tx.amount - refunded,
    status: refunded <= 0 ? 'valido' : refunded >= tx.amount ? 'estornado' : 'estornado-em-parte',
    inReview: refundIssues(data.transactions).some((i) => i.paymentId === tx.id),
  };
}

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 1–999 por extenso. */
function upTo999(n: number): string {
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const c = Math.floor(n / 100);
  const rest = n % 100;
  if (c) parts.push(HUNDREDS[c]!);
  if (rest) parts.push(rest < 20 ? UNITS[rest]! : TENS[Math.floor(rest / 10)]! + (rest % 10 ? ` e ${UNITS[rest % 10]}` : ''));
  return parts.join(' e ');
}

/** Inteiro (0 a 999.999.999.999) por extenso, em português. */
export function integerInWords(n: number): string {
  if (n === 0) return 'zero';
  const names: [string, string][] = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const parts: { g: number; text: string }[] = [];
  for (let i = 0, v = n; v > 0; i++, v = Math.floor(v / 1000)) {
    const g = v % 1000;
    if (!g) continue;
    const [one, many] = names[i]!;
    const text = i === 1 && g === 1 ? 'mil' : `${upTo999(g)}${one ? ` ${g === 1 ? one : many}` : ''}`;
    parts.unshift({ g, text });
  }
  // "e" antes do último grupo quando ele é menor que 100 ou centena exata: "mil e duzentos", "dois mil e cinco".
  const last = parts[parts.length - 1]!;
  if (parts.length > 1 && (last.g < 100 || last.g % 100 === 0)) last.text = `e ${last.text}`;
  return parts.map((p) => p.text).join(' ');
}

/** Valor em centavos por extenso: "mil e duzentos reais e cinquenta centavos". */
export function amountInWords(cents: number): string {
  const reais = Math.floor(cents / 100);
  const cent = cents % 100;
  const big = reais >= 1_000_000 && reais % 1_000_000 === 0; // "um milhão de reais"
  const r = reais ? `${integerInWords(reais)}${big ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}` : '';
  const c = cent ? `${integerInWords(cent)} ${cent === 1 ? 'centavo' : 'centavos'}` : '';
  return r && c ? `${r} e ${c}` : r || c || 'zero real';
}
