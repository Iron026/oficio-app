import { useEffect, useRef, useState } from 'react';
import { Download, FlaskConical, History, Trash2, Upload } from 'lucide-react';
import { isNative } from '../../platform/native';
import { useApp, useErrorHandler } from '../../state/AppContext';
import { useCloud } from '../../state/CloudContext';
import { navigate } from '../../state/router';
import type { BackupCounts } from '../../state/service';
import type { BackupEntry } from '../../sync/engine';
import { Button } from '../../ui/Button';
import { useConfirm } from '../../ui/Confirm';
import { Card } from '../../ui/Misc';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { useBackupExport } from '../BackupExport';
import { Group, OptionRow, SettingsSubpage } from './shared';

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "hoje", "ontem" ou a data, para o resumo do último backup. */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function CountsTable({ file, current, serviceLabel, exportedAt, appVersion }: { file: BackupCounts; current: BackupCounts; serviceLabel: string; exportedAt: string | null; appVersion: string | null }) {
  const rows: [string, keyof BackupCounts][] = [['Clientes', 'clients'], [serviceLabel, 'appointments'], ['Lançamentos', 'transactions']];
  return (
    <div className="rounded-xl border border-line text-sm">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line px-3 py-2 font-semibold">
        <span />
        <span className="text-right">Agora</span>
        <span className="text-right">No arquivo</span>
      </div>
      {rows.map(([label, k]) => (
        <div key={k} className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line px-3 py-2 last:border-0">
          <span className="text-muted">{label}</span>
          <span className="num text-right">{current[k]}</span>
          <span className="num text-right font-semibold">{file[k]}</span>
        </div>
      ))}
      {(exportedAt || appVersion) && (
        <p className="px-3 pb-2 text-xs text-muted">
          {exportedAt ? `Arquivo exportado em ${fmtDateTime(exportedAt)}` : 'Arquivo'}{appVersion ? ` pelo Ofício v${appVersion}` : ''}
        </p>
      )}
    </div>
  );
}

export function DataPage() {
  const { data, service, profession, persistent } = useApp();
  const cloud = useCloud();
  const confirm = useConfirm();
  const toast = useToast();
  const onError = useErrorHandler();
  const backup = useBackupExport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [copies, setCopies] = useState<BackupEntry[] | null>(null);
  const [copiesOpen, setCopiesOpen] = useState(false);
  const hasDemo = service.hasDemoData();
  const t = profession.terms;

  useEffect(() => {
    let alive = true;
    void cloud.sync.listBackups().then((l) => alive && setCopies(l), () => alive && setCopies([]));
    return () => { alive = false; };
  }, [cloud.sync, data]);

  async function importData(file: File) {
    let text: string;
    let preview;
    try {
      text = await file.text();
      preview = service.previewBackup(text); // valida o arquivo antes de pedir confirmação
    } catch (err) {
      onError(err);
      return;
    }
    const ok = await confirm({
      title: 'Importar e restaurar backup?',
      message: cloud.linked
        ? 'Todos os dados atuais serão substituídos pelos do arquivo — neste aparelho, na nuvem e nos outros aparelhos conectados. Registros criados depois desse backup serão excluídos. Uma cópia de segurança dos dados atuais é guardada neste aparelho antes.'
        : 'Todos os dados atuais deste aparelho serão substituídos pelos dados do arquivo. Uma cópia de segurança dos dados atuais é guardada antes.',
      details: <CountsTable file={preview.file} current={preview.current} serviceLabel={t.services} exportedAt={preview.exportedAt} appVersion={preview.appVersion} />,
      confirmLabel: 'Importar',
      danger: true,
    });
    if (!ok) return;
    try {
      await service.importBackup(text);
      const d = service.data;
      toast({ title: 'Backup importado com sucesso', description: `${d.clients.length} clientes, ${d.appointments.length} ${t.services.toLowerCase()} e ${d.transactions.length} lançamentos restaurados.` });
    } catch (err) {
      onError(err);
    }
  }

  async function toggleDemo() {
    try {
      if (hasDemo) {
        await service.clearDemoData();
        toast({ title: 'Dados de demonstração removidos', tone: 'info' });
      } else {
        await service.loadDemoData();
        toast({ title: 'Dados de demonstração carregados', description: 'Eles aparecem com o selo “Demonstração”.', tone: 'info' });
      }
    } catch (err) {
      onError(err);
    }
  }

  async function resetAll() {
    const ok = await confirm({
      title: 'Apagar todos os dados?',
      message: `Clientes, agenda, finanças, XP, conquistas e cópias de segurança deste aparelho serão apagados permanentemente.${cloud.linked ? ' Os dados já salvos na nuvem não são apagados, e o aparelho deixa de sincronizar.' : ''} Exporte um backup antes, se quiser guardar algo.`,
      confirmLabel: 'Apagar tudo',
      danger: true,
      requireText: 'APAGAR',
    });
    if (!ok) return;
    try {
      await service.resetAll();
      navigate('painel');
    } catch (err) {
      onError(err);
    }
  }

  const last = service.lastBackupExportAt;
  return (
    <SettingsSubpage id="dados">
      <Card className="!p-0">
        <OptionRow onClick={() => backup.start()} label="Exportar backup" detail={last ? `Arquivo .json com todos os seus dados · último salvo ${relativeDay(last)}` : 'Arquivo .json com todos os seus dados'} icon={<Download size={18} />} />
        <OptionRow onClick={() => fileRef.current?.click()} label="Importar e restaurar" detail="Substitui os dados atuais (com cópia de segurança antes)" icon={<Upload size={18} />} />
        <OptionRow
          onClick={() => setCopiesOpen(true)}
          label="Cópias de segurança automáticas"
          detail="Feitas antes de importar um backup ou conectar a conta"
          icon={<History size={18} />}
          value={copies === null ? undefined : String(copies.length)}
        />
      </Card>
      <Card className="!p-0">
        <OptionRow onClick={toggleDemo} label={hasDemo ? 'Remover dados de demonstração' : 'Carregar dados de demonstração'} detail={hasDemo ? 'Apaga somente os registros marcados como demonstração' : 'Exemplos fictícios, claramente identificados'} icon={<FlaskConical size={18} />} chevron={false} />
        <OptionRow onClick={resetAll} label="Apagar todos os dados" detail="Remove tudo deste aparelho" icon={<Trash2 size={18} />} danger chevron={false} />
      </Card>
      <Group title="Armazenamento">
        <Card>
          <p className="font-semibold">{persistent ? 'Local e persistente' : 'Temporário'}</p>
          <p className="text-sm text-muted">
            {data.clients.length} {data.clients.length === 1 ? t.client.toLowerCase() : t.clients.toLowerCase()} · {data.appointments.length} {t.services.toLowerCase()} · {data.transactions.length} lançamentos
          </p>
          {!persistent && <p className="mt-1 text-sm text-muted">Este navegador pode apagar os dados ao fechar. Exporte backups com frequência.</p>}
        </Card>
      </Group>
      <input
        ref={fileRef}
        type="file"
        // No Android, provedores (Drive, Meus arquivos) nem sempre informam o tipo
        // .json corretamente; o conteúdo é validado na importação.
        accept={isNative() ? undefined : 'application/json,.json'}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importData(f);
        }}
      />
      {backup.sheet}
      <Sheet open={copiesOpen} onClose={() => setCopiesOpen(false)} title="Cópias de segurança automáticas">
        <p className="mb-3 text-sm text-muted">O Ofício guarda até 5 cópias dos seus dados neste aparelho antes de mudanças grandes. Você pode exportar qualquer uma delas como arquivo de backup.</p>
        {copies && copies.length > 0 ? (
          <ul className="space-y-2">
            {copies.map((c) => (
              <li key={c.key} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{c.reason}</p>
                  <p className="text-sm text-muted">{fmtDateTime(c.createdAt)}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download size={16} />}
                  onClick={() => {
                    setCopiesOpen(false);
                    backup.start({
                      title: 'Exportar cópia de segurança',
                      fileName: `oficio-copia-${c.createdAt.slice(0, 10)}.json`,
                      current: false,
                      json: async () => {
                        const json = await cloud.sync.getBackupJson(c.key);
                        if (!json) throw new Error('Esta cópia não está mais disponível.');
                        return json;
                      },
                    });
                  }}
                >
                  Exportar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Nenhuma cópia automática ainda. Ela é criada antes de importar um backup ou conectar a conta Google.</p>
        )}
      </Sheet>
    </SettingsSubpage>
  );
}
