import { useState } from 'react';
import { FileSpreadsheet, FileText, FolderDown, Share2 } from 'lucide-react';
import { buildStatement, statementCsv, statementFileName } from '../domain/statement';
import { statementPdf } from '../lib/statementPdf';
import { canShareFiles, saveFile, shareFile } from '../platform/files';
import { useApp, useErrorHandler } from '../state/AppContext';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { useHideValues } from '../ui/privacy';
import { APP_VERSION } from './settings/pages';

type Format = 'pdf' | 'csv';
const FORMATS: { id: Format; label: string; detail: string; icon: typeof FileText; mime: string }[] = [
  { id: 'pdf', label: 'PDF', detail: 'Para ler, imprimir ou enviar', icon: FileText, mime: 'application/pdf' },
  { id: 'csv', label: 'Planilha (CSV)', detail: 'Abre no Excel e no Google Planilhas', icon: FileSpreadsheet, mime: 'text/csv' },
];

/** Exportação do extrato do mês (PDF ou CSV). Só lê os dados. */
export function StatementSheet({ open, onClose, monthKey: mKey, monthTitle, count }: { open: boolean; onClose: () => void; monthKey: string; monthTitle: string; count: number }) {
  const { service } = useApp();
  const toast = useToast();
  const onError = useErrorHandler();
  const hidden = useHideValues();
  const [format, setFormat] = useState<Format>('pdf');
  const [busy, setBusy] = useState(false);
  const native = canShareFiles();

  const file = () => {
    const st = buildStatement(service.data, mKey, new Date());
    return format === 'pdf' ? statementPdf(st, APP_VERSION) : statementCsv(st);
  };
  const meta = FORMATS.find((f) => f.id === format)!;

  async function save() {
    setBusy(true);
    try {
      const res = await saveFile(statementFileName(mKey, format), file(), meta.mime);
      if (res.status === 'cancelado') {
        toast({ title: 'Exportação cancelada', description: 'Nenhum arquivo foi salvo.', tone: 'info' });
        return;
      }
      toast({ title: 'Extrato salvo', description: res.where });
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
      await shareFile(statementFileName(mKey, format), file(), `Extrato de ${monthTitle.toLowerCase()}`);
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Exportar extrato">
      <p className="mb-3 text-sm text-muted">
        {monthTitle}: {count === 0 ? 'nenhum lançamento' : count === 1 ? '1 lançamento' : `${count} lançamentos`}, com totais de receitas, despesas e saldo.
      </p>
      <div role="radiogroup" aria-label="Formato do extrato" className="grid gap-2">
        {FORMATS.map((f) => {
          const active = format === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFormat(f.id)}
              className={cx('press-soft flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 bg-surface p-3 text-left', active ? 'border-brand-500' : 'border-line')}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" aria-hidden="true"><f.icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{f.label}</span>
                <span className="block text-sm text-muted">{f.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      {hidden && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">“Ocultar valores” vale só para a tela: o arquivo traz os valores reais.</p>}
      <div className="mt-4 grid gap-2">
        {native ? (
          <>
            <Button block size="lg" icon={<Share2 size={20} />} disabled={busy} onClick={() => void share()}>Compartilhar</Button>
            <Button block size="lg" variant="secondary" icon={<FolderDown size={20} />} disabled={busy} onClick={() => void save()}>Salvar no aparelho</Button>
          </>
        ) : (
          <Button block size="lg" icon={<FolderDown size={20} />} disabled={busy} onClick={() => void save()}>Baixar {meta.id === 'pdf' ? 'PDF' : 'CSV'}</Button>
        )}
      </div>
    </Sheet>
  );
}
