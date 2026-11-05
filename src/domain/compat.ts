/**
 * Compatibilidade com a 0.5 (desde a 0.4.0-beta.4). Ver docs/COMPATIBILIDADE-0.5.md.
 *
 * A 0.5 registra pagamentos como receitas vinculadas ao serviço (`appointmentId`) com o
 * marcador `payment`. Esta versão não cria pagamentos, mas precisa reconhecê-los para nunca
 * apagá-los nem lançar de novo um valor que já entrou no caixa.
 */

interface TxLike {
  id: string;
  type?: unknown;
  amount?: unknown;
  appointmentId?: unknown;
  payment?: unknown;
}

/** Receita registrada como pagamento pela 0.5 (nunca é removida automaticamente). */
export function isPaymentRecord(t: TxLike): boolean {
  return t.type === 'receita' && typeof t.appointmentId === 'string' && t.appointmentId !== '' && t.payment != null;
}

/**
 * Quanto ficou no caixa por este serviço: receitas vinculadas (com ou sem marcador) menos
 * estornos da 0.5 (despesas vinculadas com o marcador `payment`). Nunca negativo.
 */
export function paidForAppointment(appointmentId: string, transactions: readonly TxLike[]): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.appointmentId !== appointmentId || typeof t.amount !== 'number') continue;
    if (t.type === 'receita') sum += t.amount;
    else if (t.type === 'despesa' && t.payment != null) sum -= t.amount;
  }
  return Math.max(0, sum);
}

/** Pagamentos da 0.5 deste serviço (para avisos ao reabrir, cancelar ou excluir). */
export function paymentsOf(appointmentId: string, transactions: readonly TxLike[]): TxLike[] {
  return transactions.filter((t) => isPaymentRecord(t) && t.appointmentId === appointmentId);
}

/**
 * Receita automática que esta versão pode remover ao reabrir, cancelar ou excluir o serviço:
 * a que está em `appointment.transactionId`, desde que não seja um pagamento da 0.5.
 */
export function removableAutoIncome<T extends TxLike>(transactionId: string | null, transactions: readonly T[]): T | null {
  if (!transactionId) return null;
  const t = transactions.find((x) => x.id === transactionId);
  return t && !isPaymentRecord(t) ? t : null;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Compara versões semânticas ("0.4.0-beta.4" < "0.4.0" < "0.5.0-beta.1"). Inválidas: null. */
export function compareVersions(a: string, b: string): number | null {
  const pa = VERSION_RE.exec(a);
  const pb = VERSION_RE.exec(b);
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return Math.sign(d);
  }
  const ra = pa[4];
  const rb = pb[4];
  if (!ra || !rb) return ra === rb ? 0 : ra ? -1 : 1;
  const xa = ra.split('.');
  const xb = rb.split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const s = xa[i];
    const t = xb[i];
    if (s === undefined) return -1;
    if (t === undefined) return 1;
    const ns = /^\d+$/.test(s);
    const nt = /^\d+$/.test(t);
    if (ns && nt) {
      const d = Number(s) - Number(t);
      if (d) return Math.sign(d);
    } else if (ns !== nt) return ns ? -1 : 1;
    else if (s !== t) return s < t ? -1 : 1;
  }
  return 0;
}
