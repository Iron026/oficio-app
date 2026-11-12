import { useId, useState } from 'react';
import { Info, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { BackupCounts } from '../../domain/backupPreview';
import { useApp } from '../../state/AppContext';
import { useCloud } from '../../state/CloudContext';
import type { BackupPreview } from '../../state/service';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Restauração de backup (beta.5): mostra o que o arquivo tem e o que acontece antes de qualquer alteração;
 * restaura só com confirmação explícita. O arquivo já foi validado por inteiro (soma e estrutura) ao abrir esta folha.
 */
export function RestoreSheet({ text, preview, onClose }: { text: string; preview: BackupPreview; onClose: () => void }) {
  const { service, profession } = useApp();
  const cloud = useCloud();
  const toast = useToast();
  const t = profession.terms;
  const checkId = useId();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { file, current, loss } = preview;

  const rows: [string, keyof BackupCounts][] = [
    ['Clientes', 'clients'], [t.services, 'appointments'], ['Lançamentos', 'transactions'], ['Pagamentos', 'payments'],
    ['Estornos', 'refunds'], ['XP (total)', 'xp'], ['Conquistas', 'achievements'], ['Selos', 'sealAwards'], ['Tipos de serviço', 'serviceTypes'],
  ];
  const v = preview.appVersion ? `v${preview.appVersion}` : '';
  const compat = {
    mesma: `Feito nesta mesma versão (${v}).`,
    anterior: `Feito numa versão anterior (${v}). Compatível com esta.`,
    'mais-nova': `Feito numa versão mais nova (${v}) que esta (v${__APP_VERSION__}). Os dados foram conferidos. Campos extras nos registros e nas preferências são mantidos; tipos de dados que esta versão não conhece são ignorados.`,
    desconhecida: 'Versão do app não informada no arquivo (backups anteriores à 0.4.0-beta.3). A estrutura foi conferida.',
  }[preview.compatibility];
  const r = loss.removed;
  const removedTotal = r.clients + r.appointments + r.transactions;

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      await service.importBackup(text);
      const d = service.data;
      toast({ title: 'Backup restaurado', description: `${d.clients.length} clientes, ${d.appointments.length} ${t.services.toLowerCase()} e ${d.transactions.length} lançamentos.` });
      onClose();
    } catch (err) {
      setError(`Nada foi alterado. ${err instanceof Error ? err.message : 'Não foi possível restaurar.'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Restaurar backup"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="danger" onClick={() => void restore()} disabled={!agreed || busy} data-restore-confirm>{busy ? 'Restaurando…' : 'Restaurar'}</Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm" data-restore-preview>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="font-semibold">Ofício {v || '(versão não informada)'}</p>
          <p className="text-muted">{preview.exportedAt ? `Exportado em ${fmtDateTime(preview.exportedAt)}` : 'Data de exportação não informada'}</p>
          <p className="mt-1">{compat}</p>
        </div>

        {preview.integrity === 'verificada' ? (
          <p className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-green-900 dark:bg-green-500/10 dark:text-green-100" data-restore-integrity="verificada">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span><b>Integridade verificada.</b> A soma SHA-256 confere com o conteúdo: o arquivo não foi alterado nem corrompido desde a exportação.</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3" data-restore-integrity="sem-soma">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span><b>Sem verificação de integridade.</b> Arquivos anteriores à 0.5.0-beta.5 não têm soma de verificação. A estrutura e os valores foram conferidos.</span>
          </p>
        )}

        <table className="w-full overflow-hidden rounded-xl border border-line text-left">
          <caption className="sr-only">Comparação entre os dados atuais e os do arquivo</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Registro</span></th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Agora</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">No arquivo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, k]) => (
              <tr key={k} className="border-b border-line last:border-0">
                <th scope="row" className="px-3 py-1.5 font-normal text-muted">{label}</th>
                <td className="num px-3 py-1.5 text-right">{current[k]}</td>
                <td className="num px-3 py-1.5 text-right font-semibold">{file[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(removedTotal > 0 || loss.newerThanFile > 0) && (
          <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-amber-950 dark:bg-amber-500/15 dark:text-amber-50" data-restore-loss>
            <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={18} aria-hidden="true" /> Dados atuais que serão perdidos</p>
            {removedTotal > 0 && (
              <p>
                {[r.clients && plural(r.clients, 'cliente', 'clientes'), r.appointments && plural(r.appointments, t.service.toLowerCase(), t.services.toLowerCase()), r.transactions && plural(r.transactions, 'lançamento', 'lançamentos')].filter(Boolean).join(', ')}{' '}
                não {removedTotal === 1 ? 'está' : 'estão'} no arquivo e {removedTotal === 1 ? 'será removido' : 'serão removidos'}
                {r.payments + r.refunds > 0 ? `, incluindo ${[r.payments && plural(r.payments, 'pagamento', 'pagamentos'), r.refunds && plural(r.refunds, 'estorno', 'estornos')].filter(Boolean).join(' e ')}` : ''}.
              </p>
            )}
            {loss.newerThanFile > 0 && <p>{plural(loss.newerThanFile, 'registro foi criado ou alterado', 'registros foram criados ou alterados')} depois da data deste backup; a versão atual se perde.</p>}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <p className="font-semibold">Será substituído</p>
            <p className="text-muted">Perfil, preferências da conta (cores, imagem, Painel), clientes, agenda, finanças, XP e conquistas.</p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="font-semibold">Será preservado</p>
            <p className="text-muted">Tema, lembretes e “Ocultar valores” deste aparelho, cópias de segurança e a conta conectada. Selos nunca perdem estágios.</p>
          </div>
        </div>

        <p className="flex items-start gap-2 text-muted"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> Antes de restaurar, uma cópia de segurança dos dados atuais é guardada neste aparelho (Backup e dados › Cópias de segurança).</p>

        {cloud.linked && (
          <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100" data-restore-cloud>
            <b>Conta conectada.</b> A restauração também vale para a nuvem e para os outros aparelhos da conta: o que não estiver no arquivo será removido deles na próxima sincronização. Se outro aparelho alterar um lançamento ao mesmo tempo, a diferença aparece para você revisar.
          </p>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900 dark:bg-red-500/10 dark:text-red-100">{error}</p>}

        <label htmlFor={checkId} className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-3">
          <input id={checkId} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
          <span>Entendi que os dados atuais {cloud.linked ? 'deste aparelho e da conta ' : ''}serão substituídos pelos do arquivo.</span>
        </label>
      </div>
    </Sheet>
  );
}
