import { useRef, useState } from 'react';
import { Check, Crown, Database, Download, FlaskConical, FolderDown, Lock, Monitor, Moon, Pencil, Share2, ShieldCheck, Sun, Trash2, Upload } from 'lucide-react';
import { canShareFiles, saveTextFile, shareTextFile } from '../platform/files';
import { isNative, platformName } from '../platform/native';
import { PROFESSION_LIST } from '../domain/professions';
import type { ProfessionId, ThemePreference } from '../domain/types';
import { hasErrors, validateProfile, type Errors, type ProfileInput } from '../lib/validation';
import { CATEGORY_LABEL, FEATURES } from '../monetization/catalog';
import { canUse, freeEntitlements } from '../monetization/entitlements';
import { useApp, useErrorHandler, useFeedback } from '../state/AppContext';
import { navigate } from '../state/router';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { cx } from '../ui/cx';
import { TextField } from '../ui/Field';
import { ProfessionIcon } from '../ui/icons';
import { Card, SectionTitle } from '../ui/Misc';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

export const APP_VERSION = __APP_VERSION__;

export function Settings() {
  const { data, service, profession, persistent } = useApp();
  const confirm = useConfirm();
  const toast = useToast();
  const onError = useErrorHandler();
  const [sheet, setSheet] = useState<null | 'perfil' | 'profissao' | 'planos' | 'exportar'>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const profile = data.profile!;
  const ent = freeEntitlements();
  const hasDemo = service.hasDemoData();

  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Escuro', icon: Moon },
    { value: 'system', label: 'Sistema', icon: Monitor },
  ];

  const backupName = () => `oficio-backup-${new Date().toISOString().slice(0, 10)}.json`;

  async function saveBackup() {
    setBusy(true);
    try {
      const { where } = await saveTextFile(backupName(), service.exportBackup());
      toast({ title: 'Backup salvo', description: isNative() ? `Arquivo em ${where}. Guarde uma cópia fora do aparelho.` : 'Guarde o arquivo em local seguro.' });
      setSheet(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function shareBackup() {
    setBusy(true);
    try {
      await shareTextFile(backupName(), service.exportBackup(), 'Backup do Ofício');
      setSheet(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  function exportData() {
    if (canShareFiles()) setSheet('exportar');
    else void saveBackup();
  }

  async function importData(file: File) {
    const ok = await confirm({ title: 'Importar backup?', message: 'Todos os dados atuais deste aparelho serão substituídos pelos dados do arquivo.', confirmLabel: 'Importar', danger: true });
    if (!ok) return;
    try {
      await service.importBackup(await file.text());
      const d = service.data;
      toast({ title: 'Backup importado com sucesso', description: `${d.clients.length} clientes, ${d.appointments.length} serviços e ${d.transactions.length} lançamentos restaurados.` });
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
    const ok = await confirm({ title: 'Apagar todos os dados?', message: 'Clientes, agenda, finanças, XP e conquistas deste aparelho serão apagados permanentemente. Faça um backup antes, se quiser guardar algo.', confirmLabel: 'Apagar tudo', danger: true });
    if (!ok) return;
    try {
      await service.resetAll();
      navigate('painel');
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div>
      <SectionTitle>Perfil</SectionTitle>
      <Card className="!p-0">
        <Row onClick={() => setSheet('perfil')} label={profile.name} detail={profile.businessName || 'Nome do negócio não informado'} icon={<Pencil size={18} />} />
        <Row onClick={() => setSheet('profissao')} label={profession.name} detail="Profissão · adapta termos e missões" icon={<ProfessionIcon icon={profession.icon} size={18} />} />
      </Card>

      <SectionTitle>Aparência</SectionTitle>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
        {themes.map(({ value, label, icon: Icon }) => {
          const active = data.settings.theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => service.updateSettings({ theme: value }).catch(onError)}
              className={cx('flex flex-col items-center gap-1.5 rounded-2xl border-2 bg-surface py-3 text-sm font-medium transition-colors', active ? 'border-brand-500 text-brand-700 dark:text-brand-200' : 'border-line')}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <SectionTitle>Plano</SectionTitle>
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Check size={20} aria-hidden="true" /></span>
          <div className="flex-1">
            <p className="font-semibold">Plano Gratuito</p>
            <p className="text-[13px] text-muted">Todos os recursos desta versão estão liberados.</p>
          </div>
        </div>
        <Button variant="secondary" block className="mt-3" icon={<Crown size={18} className="text-xp-500" />} onClick={() => setSheet('planos')}>Conhecer o Premium (em breve)</Button>
      </Card>

      <SectionTitle>Dados</SectionTitle>
      <Card className="!p-0">
        <Row onClick={exportData} label="Exportar backup" detail="Gera um arquivo .json com todos os seus dados" icon={<Download size={18} />} />
        <Row onClick={() => fileRef.current?.click()} label="Importar backup" detail="Restaura dados de um arquivo exportado" icon={<Upload size={18} />} />
        <Row onClick={toggleDemo} label={hasDemo ? 'Remover dados de demonstração' : 'Carregar dados de demonstração'} detail={hasDemo ? 'Apaga somente os registros marcados como demonstração' : 'Exemplos fictícios, claramente identificados'} icon={<FlaskConical size={18} />} />
        <Row onClick={resetAll} label="Apagar todos os dados" detail="Remove tudo deste aparelho" icon={<Trash2 size={18} />} danger />
      </Card>
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

      <SectionTitle>Privacidade</SectionTitle>
      <Card className="space-y-2 text-[14px] leading-relaxed">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-brand-600 dark:text-brand-300" aria-hidden="true" /> Seus dados são seus</p>
        <p className="text-muted">O Ofício não tem servidor nesta versão: tudo fica salvo apenas neste aparelho (IndexedDB do navegador). Nenhum dado é enviado para a internet, e não usamos rastreadores ou anúncios.</p>
        <p className="text-muted">Como os dados ficam só aqui, faça backups periódicos. {isNative() ? 'Desinstalar o app ou limpar os dados dele apaga as informações. O backup automático do Android está desativado para que nada seja enviado à nuvem sem você decidir.' : 'Limpar os dados do navegador apaga as informações do app.'}</p>
        <p className="text-muted">Para levar seus dados da versão web para o app Android (ou para outro aparelho): exporte o backup em um e importe no outro.</p>
      </Card>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
        <Database size={12} aria-hidden="true" /> Ofício v{APP_VERSION} · {platformName() === 'android' ? 'Android' : 'Web'} · armazenamento {persistent ? 'local' : 'temporário'}
      </p>

      <Sheet open={sheet === 'exportar'} onClose={() => setSheet(null)} title="Exportar backup">
        <p className="mb-4 text-[14px] text-muted">O arquivo contém todos os seus dados. Guarde-o em local seguro e não o envie a pessoas desconhecidas.</p>
        <div className="space-y-2">
          <Button block size="lg" icon={<Share2 size={20} />} disabled={busy} onClick={shareBackup}>Compartilhar (Drive, e-mail…)</Button>
          <Button block size="lg" variant="secondary" icon={<FolderDown size={20} />} disabled={busy} onClick={saveBackup}>Salvar em Documentos</Button>
        </div>
      </Sheet>
      <ProfileSheet open={sheet === 'perfil'} onClose={() => setSheet(null)} />
      <ProfessionSheet open={sheet === 'profissao'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'planos'} onClose={() => setSheet(null)} title="Recursos do Ofício">
        <p className="mb-4 rounded-xl bg-xp-100/60 p-3 text-[13px] text-xp-700 dark:bg-xp-500/10 dark:text-xp-400">
          Nenhuma compra ou assinatura está disponível nesta versão. Os itens “Em breve” estão em desenvolvimento e não podem ser adquiridos.
        </p>
        {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((cat) => {
          const items = FEATURES.filter((f) => f.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="mb-4">
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">{CATEGORY_LABEL[cat]}</h3>
              <ul className="space-y-2">
                {items.map((f) => {
                  const on = canUse(f, ent);
                  return (
                    <li key={f.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                      <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', on ? 'bg-brand-500 text-white' : 'bg-surface-2 text-muted')}>
                        {on ? <Check size={16} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{f.name}</p>
                        <p className="text-[13px] text-muted">{f.description}</p>
                      </div>
                      <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', on ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-surface-2 text-muted')}>
                        {on ? 'Incluído' : f.unlock.kind === 'purchase' ? 'Em breve · compra única' : 'Em breve · Premium'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </Sheet>
    </div>
  );
}

function Row({ label, detail, icon, onClick, danger }: { label: string; detail: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-line p-3.5 text-left transition-colors last:border-0 hover:bg-surface-2">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2', danger ? 'text-red-600 dark:text-red-400' : 'text-brand-600 dark:text-brand-300')} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-medium', danger && 'text-red-600 dark:text-red-400')}>{label}</span>
        <span className="block truncate text-[13px] text-muted">{detail}</span>
      </span>
    </button>
  );
}

function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar perfil">
      {open && <ProfileForm onDone={onClose} />}
    </Sheet>
  );
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { data, service } = useApp();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const [v, setV] = useState<ProfileInput>({ name: data.profile!.name, businessName: data.profile!.businessName });
  const [errors, setErrors] = useState<Errors<ProfileInput>>({});
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateProfile(v);
    setErrors(errs);
    if (hasErrors(errs)) return;
    try {
      await service.updateProfile(v);
      feedback('Perfil atualizado');
      onDone();
    } catch (err) {
      onError(err);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField label="Seu nome" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} maxLength={60} />
      <TextField label="Nome do negócio" value={v.businessName} onChange={(e) => setV({ ...v, businessName: e.target.value })} error={errors.businessName} optional maxLength={60} />
      <Button type="submit" block size="lg">Salvar</Button>
    </form>
  );
}

function ProfessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, service } = useApp();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  async function choose(id: ProfessionId) {
    try {
      await service.updateProfile({ professionId: id });
      feedback('Profissão atualizada', undefined, 'Termos, sugestões e missões foram adaptados.');
      onClose();
    } catch (err) {
      onError(err);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Sua profissão">
      <div role="radiogroup" aria-label="Profissão" className="space-y-2">
        {PROFESSION_LIST.map((p) => {
          const active = data.profile?.professionId === p.id;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={active} onClick={() => choose(p.id)} className={cx('flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left', active ? 'border-brand-500' : 'border-line')}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-brand-600 dark:text-brand-300"><ProfessionIcon icon={p.icon} size={20} /></span>
              <span className="flex-1">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-[13px] text-muted">{p.tagline}</span>
              </span>
              {active && <Check size={20} className="text-brand-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
