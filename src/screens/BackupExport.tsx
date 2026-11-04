import { useState } from 'react';
import { FolderDown, Share2 } from 'lucide-react';
import { canShareFiles, saveTextFile, shareTextFile } from '../platform/files';
import { useApp, useErrorHandler } from '../state/AppContext';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

export const backupFileName = (now = new Date()) => `oficio-backup-${now.toISOString().slice(0, 10)}.json`;

/** Arquivo a exportar: os dados atuais (padrão) ou uma cópia de segurança automática guardada no aparelho. */
export interface ExportSource {
  title: string;
  fileName: string;
  json: () => Promise<string> | string;
  /** Só o backup dos dados atuais conta como "último backup exportado". */
  current: boolean;
}

/**
 * Exportação de backup (única para Ajustes > Dados e Conta e sincronização).
 * - Navegador: download direto.
 * - Android: escolha entre Compartilhar ou Salvar no aparelho (janela "Salvar como").
 */
export function useBackupExport() {
  const { service } = useApp();
  const toast = useToast();
  const onError = useErrorHandler();
  const [source, setSource] = useState<ExportSource | null>(null);
  const [busy, setBusy] = useState(false);
  const currentSource = (): ExportSource => ({ title: 'Exportar backup', fileName: backupFileName(), json: () => service.exportBackup(), current: true });

  async function save(src: ExportSource = source ?? currentSource()) {
    setBusy(true);
    try {
      const res = await saveTextFile(src.fileName, await src.json());
      if (res.status === 'cancelado') {
        toast({ title: 'Exportação cancelada', description: 'Nenhum arquivo foi salvo.', tone: 'info' });
        return; // mantém as opções abertas para tentar de novo
      }
      if (src.current) await service.noteBackupExported();
      toast({ title: 'Backup salvo', description: `${res.where}. Guarde uma cópia em local seguro.` });
      setSource(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const src = source ?? currentSource();
    setBusy(true);
    try {
      // Compartilhar não confirma se o arquivo chegou ao destino: não conta como "último backup".
      await shareTextFile(src.fileName, await src.json(), 'Backup do Ofício');
      setSource(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  /** Exporta os dados atuais ou, com `src`, outra fonte (ex.: cópia de segurança automática). */
  function start(src?: ExportSource) {
    const s = src ?? currentSource();
    if (canShareFiles()) setSource(s);
    else void save(s);
  }

  const sheet = (
    <Sheet open={!!source} onClose={() => setSource(null)} title={source?.title ?? 'Exportar backup'}>
      <p className="mb-4 text-sm text-muted">O arquivo contém todos os seus dados. Guarde-o em local seguro e não o envie a pessoas desconhecidas.</p>
      <div className="space-y-2">
        <Button block size="lg" icon={<Share2 size={20} />} disabled={busy} onClick={() => void share()}>Compartilhar (Drive, e-mail…)</Button>
        <Button block size="lg" variant="secondary" icon={<FolderDown size={20} />} disabled={busy} onClick={() => void save()}>Salvar no aparelho</Button>
      </div>
      <p className="mt-3 text-sm text-muted">“Salvar no aparelho” abre a janela do Android para você escolher a pasta (Documentos, Downloads ou Drive).</p>
    </Sheet>
  );

  return { start, busy, sheet };
}
