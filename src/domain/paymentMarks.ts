/** Marcadores de pagamento e estorno em `transaction.payment` (0.5). Sem dependências de outros módulos. */
type Tx = { type: string; appointmentId?: string | null; payment?: unknown };

export const mark = (t: { payment?: unknown }) => (t.payment && typeof t.payment === 'object' ? (t.payment as Record<string, unknown>) : null);
export const isRefund = (t: Tx) => t.type === 'despesa' && mark(t) != null && mark(t)!.kind === 'estorno';
/** Receita vinculada a um serviço: pagamento da 0.5 ou receita automática da 0.4. */
export const isLinkedIncome = (t: Tx) => t.type === 'receita' && typeof t.appointmentId === 'string' && t.appointmentId !== '';
export const isPayment = (t: Tx) => isLinkedIncome(t) && mark(t) != null;
export const refundOf = (t: Tx): string | null => (isRefund(t) && typeof mark(t)!.of === 'string' ? (mark(t)!.of as string) : null);
