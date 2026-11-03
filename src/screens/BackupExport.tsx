import { useState } from 'react';
import { FolderDown, Share2 } from 'lucide-react';
import { canShareFiles, saveTextFile, shareTextFile } from '../platform/files';
import { useApp, useErrorHandler } from '../state/AppContext';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

export const backupFileName = (now = new Date()) => `oficio-backup-${now.toISOString().slice(0, 10)}.json`;

/**
 * Exportação de backup (única para Ajustes > Dados e Conta e sincronização).
 * - Navegador: download direto.
 * - Android: escolha entre Compartilhar ou Salvar no aparelho (janela "Salvar como").
 */
export function useBackupExport() {
  const { service } = useApp();
  const toast = useToast();
  const onError = useErrorHandler();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await saveTextFile(backupFileName(), service.exportBackup());
      if (res.status === 'cancelado') {
        toast({ title: 'Exportação cancelada', description: 'Nenhum arquivo foi salvo.', tone: 'info' });
        return; // mantém as opções abertas para tentar de novo
      }
      toast({ title: 'Backup salvo', description: `${res.where}. Guarde uma cópia em local seguro.` });
      setOpen(false);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      await shareTextFile(backupFileName(), service.exportBackup(), 'Backup do Ofício');
      setOpen(false);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (canShareFiles()) setOpen(true);
    else void save();
  }

  const sheet = (
    <Sheet open={open} onClose={() => setOpen(false)} title="Exportar backup">
      <p className="mb-4 text-[14px] text-muted">O arquivo contém todos os seus dados. Guarde-o em local seguro e não o envie a pessoas desconhecidas.</p>
      <div className="space-y-2">
        <Button block size="lg" icon={<Share2 size={20} />} disabled={busy} onClick={share}>Compartilhar (Drive, e-mail…)</Button>
        <Button block size="lg" variant="secondary" icon={<FolderDown size={20} />} disabled={busy} onClick={save}>Salvar no aparelho</Button>
      </div>
      <p className="mt-3 text-[13px] text-muted">“Salvar no aparelho” abre a janela do Android para você escolher a pasta (Documentos, Downloads ou Drive).</p>
    </Sheet>
  );

  return { start, busy, sheet };
}
