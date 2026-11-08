import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import type { RefundIssue } from '../../domain/refundReview';
import type { Transaction } from '../../domain/types';
import { formatDateShort } from '../../lib/dates';
import { useApp, useErrorHandler, useUndoAction } from '../../state/AppContext';
import { Button } from '../../ui/Button';
import { useConfirm } from '../../ui/Confirm';
import { Money } from '../../ui/Money';
import { useHideValues } from '../../ui/privacy';
import { formatMoney } from '../../lib/money';
import { useToast } from '../../ui/Toast';

const registeredAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `registrado em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Revisão de estornos incoerentes entre aparelhos (beta.3). Explica o que foi detectado, sem afirmar o que
 * aconteceu de verdade, e só muda dados quando a pessoa decide (com confirmação e "Desfazer").
 */
export function RefundReviewCard({ issue }: { issue: RefundIssue<Transaction> }) {
  const { service } = useApp();
  const confirm = useConfirm();
  const onError = useErrorHandler();
  const toast = useToast();
  const undoAction = useUndoAction();
  const hidden = useHideValues();
  const m = (c: number) => (hidden ? 'R$ •••••' : formatMoney(c));
  const text = issue.kind === 'acima-do-pago'
    ? `Os estornos deste pagamento somam ${m(issue.refunded)}, ${m(issue.excess)} acima do valor pago (${m(issue.paid)}). Isso acontece quando dois aparelhos registram estornos sem internet. O app não tem como saber qual aconteceu de verdade.`
    : `O pagamento estornado foi excluído em outro aparelho, mas ${issue.refunds.length === 1 ? 'este estorno continua registrado' : 'estes estornos continuam registrados'} (${m(issue.refunded)}). O app não tem como saber o que aconteceu de verdade.`;

  async function remove(r: Transaction) {
    const ok = await confirm({
      title: 'Remover este estorno?',
      message: `O estorno de ${m(r.amount)} (${formatDateShort(r.date)}) sai de Finanças e do histórico do serviço. ${issue.payment ? 'O pagamento guarda o registro desta revisão.' : ''} Use se ele foi lançado por engano.`.replace(/\s+/g, ' ').trim(),
      confirmLabel: 'Remover estorno',
      danger: true,
    });
    if (!ok) return;
    try {
      const undo = await service.resolveRefundIssue(issue.signature, { remove: r.id });
      toast({ title: 'Estorno removido', description: 'Revisão concluída.', tone: 'success', action: undoAction(undo) });
    } catch (e) { onError(e); }
  }

  async function keep() {
    const ok = await confirm({
      title: 'Manter todos os estornos?',
      message: `Confirme se ${issue.refunds.length === 1 ? 'o estorno aconteceu' : 'todos os estornos aconteceram'} de verdade. Nada é removido e os valores continuam em Finanças.`,
      confirmLabel: 'Manter',
    });
    if (!ok) return;
    try {
      const undo = await service.resolveRefundIssue(issue.signature, { keep: true });
      toast({ title: 'Estornos confirmados', tone: 'success', action: undoAction(undo) });
    } catch (e) { onError(e); }
  }

  return (
    <section className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:border-red-500/40 dark:bg-red-500/10" aria-label="Revisar estornos" data-refund-review={issue.kind}>
      <p className="flex items-start gap-2 font-semibold text-red-800 dark:text-red-200">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        {issue.kind === 'acima-do-pago' ? 'Estornos acima do valor pago' : 'Estorno de um pagamento excluído'}
      </p>
      <p className="text-fg">{text}</p>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {issue.refunds.map((r) => (
          <li key={r.id} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold"><Money cents={r.amount} kind="expense" /> · {formatDateShort(r.date)}</span>
              <span className="block text-xs text-muted">{registeredAt(r.createdAt)}</span>
            </span>
            <Button variant="ghost" size="sm" className="min-h-11 text-red-700 dark:text-red-300" icon={<Trash2 size={14} />} onClick={() => void remove(r)} aria-label={`Remover o estorno de ${m(r.amount)} de ${formatDateShort(r.date)}`}>Remover</Button>
          </li>
        ))}
      </ul>
      <Button block variant="secondary" icon={<Check size={18} />} onClick={() => void keep()}>
        {issue.refunds.length === 1 ? 'O estorno aconteceu: manter' : 'Todos aconteceram: manter'}
      </Button>
    </section>
  );
}
