import { useState } from 'react';
import { transactionLabel } from '../../domain/finance';
import type { Transaction, TransactionType } from '../../domain/types';
import { todayKey } from '../../lib/dates';
import { centsToInput } from '../../lib/money';
import { hasErrors, validateTransaction, type Errors, type TransactionInput } from '../../lib/validation';
import { useApp, useErrorHandler, useFeedback, useUndoAction } from '../../state/AppContext';
import { Button } from '../../ui/Button';
import { useConfirm } from '../../ui/Confirm';
import { TextField } from '../../ui/Field';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { Segmented } from '../../ui/Misc';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { FileText } from 'lucide-react';
import { receiptFor } from '../../domain/receipt';
import { ReceiptSheet } from '../payments/ReceiptSheet';

interface Props { open: boolean; onClose: () => void; transaction?: Transaction; defaultType?: TransactionType }

export function TransactionFormSheet({ open, onClose, transaction, defaultType = 'receita' }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={transaction ? 'Editar lançamento' : defaultType === 'receita' ? 'Nova receita' : 'Nova despesa'}>
      {open && <TransactionForm transaction={transaction} defaultType={defaultType} onDone={onClose} />}
    </Sheet>
  );
}

function TransactionForm({ transaction, defaultType, onDone }: { transaction?: Transaction; defaultType: TransactionType; onDone: () => void }) {
  const { service, profession, data } = useApp();
  const [receipt, setReceipt] = useState<string | null>(null);
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const confirm = useConfirm();
  const toast = useToast();
  const undoAction = useUndoAction();
  const [v, setV] = useState<TransactionInput>(
    transaction
      ? { type: transaction.type, amount: centsToInput(transaction.amount), description: transaction.description, category: transaction.category, date: transaction.date }
      : { type: defaultType, amount: '', description: '', category: '', date: todayKey() },
  );
  const [errors, setErrors] = useState<Errors<TransactionInput>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof TransactionInput) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const categories = v.type === 'receita' ? profession.incomeCategories : profession.expenseCategories;
  const categoryOptions = v.category && !categories.includes(v.category) ? [v.category, ...categories] : categories;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateTransaction(v);
    setErrors(errs);
    if (hasErrors(errs)) return;
    setSaving(true);
    try {
      const res = await service.saveTransaction(v, transaction?.id);
      feedback(transaction ? 'Lançamento atualizado' : v.type === 'receita' ? 'Receita registrada' : 'Despesa registrada', res.feedback);
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!transaction) return;
    // 0.5: pagamento ou estorno de um serviço — diz o efeito e aponta o caminho que preserva o histórico.
    const linked = transaction.appointmentId ? data.appointments.find((x) => x.id === transaction.appointmentId) : undefined;
    const t = profession.terms;
    const effect = !linked ? '' : transaction.type === 'despesa'
      ? ` É um estorno de “${linked.title}”: o valor volta a contar como recebido.`
      : ` ${t.service} “${linked.title}” continua ${linked.status === 'concluido' ? t.completedLabel : linked.status === 'cancelado' ? 'cancelado' : 'agendado'}, e este valor volta a ficar a receber. Para registrar uma devolução sem apagar o histórico, use “Estornar” no próprio ${t.service.toLowerCase()}.`;
    const ok = await confirm({
      title: 'Excluir lançamento?',
      message: `"${transactionLabel(transaction)}" será removido de Finanças.${effect}`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      const undo = await service.deleteTransaction(transaction.id);
      toast({ title: 'Lançamento excluído', tone: 'info', action: undoAction(undo) });
      onDone();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <>
    <form onSubmit={submit} noValidate className="space-y-4">
      <Segmented
        label="Tipo de lançamento"
        value={v.type as TransactionType}
        onChange={(type) => setV((cur) => ({ ...cur, type, category: '' }))}
        options={[{ value: 'receita', label: 'Receita' }, { value: 'despesa', label: 'Despesa' }]}
      />
      <TextField label="Valor" prefix="R$" inputMode="decimal" placeholder="0,00" value={v.amount} onChange={set('amount')} error={errors.amount} />
      <ChoiceChips
        label="Categoria"
        options={categoryOptions}
        value={v.category}
        onChange={(category) => setV((cur) => ({ ...cur, category }))}
        error={errors.category}
      />
      <TextField label="Descrição" optional value={v.description} onChange={set('description')} error={errors.description} maxLength={80} placeholder={v.category ? `Se vazio, aparece como “${v.category}”` : v.type === 'receita' ? 'Ex.: Pagamento do serviço' : 'Ex.: Compra de material'} />
      <TextField label="Data" type="date" value={v.date} onChange={set('date')} error={errors.date} />
      <Button type="submit" block size="lg" disabled={saving}>{transaction ? 'Salvar alterações' : 'Registrar'}</Button>
      {transaction && receiptFor(data, transaction.id) && (
        <Button type="button" variant="secondary" block icon={<FileText size={18} />} onClick={() => setReceipt(transaction.id)}>Emitir recibo</Button>
      )}
      {transaction && <Button variant="ghost" block className="text-red-600 dark:text-red-400" onClick={remove}>Excluir lançamento</Button>}
    </form>
    {/* Fora do <form>: eventos atravessam portais e o recibo não pode enviar o formulário. */}
    <ReceiptSheet txId={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
