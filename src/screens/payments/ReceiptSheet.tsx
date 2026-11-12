import { useState } from 'react';
import { FileText, FolderDown, Share2 } from 'lucide-react';
import { receiptFileName, receiptFor } from '../../domain/receipt';
import { dateBR } from '../../domain/statement';
import { formatMoney } from '../../lib/money';
import { receiptPdf } from '../../lib/receiptPdf';
import { canShareFiles, saveFile, shareFile } from '../../platform/files';
import { useApp, useErrorHandler } from '../../state/AppContext';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { useHideValues } from '../../ui/privacy';
import { APP_VERSION } from '../settings/pages';

/**
 * Recibo em PDF de um pagamento registrado (beta.4). Mesma infraestrutura do extrato: compartilhar ou salvar no
 * Android, baixar no navegador. Só lê os dados (nada é lançado, nenhum XP).
 */
export function ReceiptSheet({ txId, onClose }: { txId: string | null; onClose: () => void }) {
  const { service, data } = useApp();
  const toast = useToast();
  const onError = useErrorHandler();
  const hidden = useHideValues();
  const [busy, setBusy] = useState(false);
  const r = txId ? receiptFor(data, txId) : null;
  const native = canShareFiles();
  const file = () => receiptPdf(receiptFor(service.data, txId!)!, new Date(), APP_VERSION);

  async function save() {
    setBusy(true);
    try {
      const res = await saveFile(receiptFileName(r!), file(), 'application/pdf');
      if (res.status === 'cancelado') return toast({ title: 'Recibo não salvo', description: 'A janela foi fechada sem salvar.', tone: 'info' });
      toast({ title: 'Recibo salvo', description: res.where });
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    try {
      await shareFile(receiptFileName(r!), file(), `Recibo ${r!.number}`);
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!txId} onClose={onClose} title="Recibo">
      {r ? (
        <div className="space-y-3" data-receipt={r.number}>
          <div className="flex items-start gap-3 rounded-2xl border border-line p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" aria-hidden="true"><FileText size={20} /></span>
            <dl className="min-w-0 flex-1 text-sm">
              <dt className="sr-only">Número</dt><dd className="font-semibold">{r.number}</dd>
              <dt className="sr-only">Valor recebido</dt><dd>{hidden ? 'R$ •••••' : formatMoney(r.amount)} em {dateBR(r.paymentDate)}{r.method ? ` · ${r.method}` : ''}</dd>
              <dt className="sr-only">Serviço</dt><dd className="text-muted [overflow-wrap:anywhere]">{r.service}{r.client ? ` · ${r.client}` : ''}</dd>
            </dl>
          </div>
          {r.partial && <p className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">Pagamento parcial: o recibo é só do valor recebido neste lançamento.</p>}
          {r.status !== 'valido' && <p className="rounded-xl bg-red-50 p-3 text-sm dark:bg-red-500/10">O recibo mostra que este pagamento foi estornado {r.status === 'estornado' ? 'integralmente' : 'em parte'}.</p>}
          {r.inReview && <p className="rounded-xl bg-red-50 p-3 text-sm dark:bg-red-500/10">Há estornos deste pagamento aguardando revisão; o recibo avisa que a situação pode mudar.</p>}
          {hidden && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">“Ocultar valores” vale só para a tela: o PDF traz os valores reais.</p>}
          <p className="text-xs text-muted">Recibo simples. Não é nota fiscal e não substitui documento fiscal.</p>
          <div className="grid gap-2">
            {native ? (
              <>
                <Button block size="lg" icon={<Share2 size={20} />} disabled={busy} onClick={() => void share()}>Compartilhar recibo</Button>
                <Button block size="lg" variant="secondary" icon={<FolderDown size={20} />} disabled={busy} onClick={() => void save()}>Salvar no aparelho</Button>
              </>
            ) : (
              <Button block size="lg" icon={<FolderDown size={20} />} disabled={busy} onClick={() => void save()}>Baixar PDF</Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Recibos são emitidos apenas para valores efetivamente recebidos.</p>
      )}
    </Sheet>
  );
}
