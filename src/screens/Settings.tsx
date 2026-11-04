import { useRef, useState } from 'react';
import { Award, Camera, Check, Crown, Database, Download, ExternalLink, FlaskConical, Lock, Monitor, Moon, Pencil, ShieldCheck, Sun, Trash2, Type, Upload, UserRound } from 'lucide-react';
import { isNative, platformName } from '../platform/native';
import { PROFESSION_LIST } from '../domain/professions';
import { accentOf, avatarOf, featuredSealOf } from '../domain/preferences';
import type { ProfessionId, SealId, ThemePreference } from '../domain/types';
import { ROMAN, type SealProgress } from '../gamification/seals';
import { hasErrors, validateProfile, type Errors, type ProfileInput } from '../lib/validation';
import { CATEGORY_LABEL, FEATURES } from '../monetization/catalog';
import { canUse, freeEntitlements } from '../monetization/entitlements';
import { usePrefs, useApp, useErrorHandler, useFeedback } from '../state/AppContext';
import { navigate } from '../state/router';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { cx } from '../ui/cx';
import { TextField } from '../ui/Field';
import { ProfessionIcon } from '../ui/icons';
import { Card, SectionTitle, Segmented, Switch } from '../ui/Misc';
import { getInternalAvatar } from '../ui/avatarCatalog';
import { ProfileAvatar, TierChip } from '../ui/ProfileAvatar';
import { SealMedal } from '../ui/SealMedal';
import { useProfile } from '../state/useProfile';
import { ProfileImageSheet } from './ProfileImageSheet';
import { HeroSlot } from './Shell';
import { PALETTES } from '../ui/palettes';
import { applyAccentWithTransition } from '../ui/appearance';
import { sealsPhotoSyncEnabled } from '../sync/features';
import { Sheet } from '../ui/Sheet';
import { AccountSection } from './Account';
import { useBackupExport } from './BackupExport';
import { useCloud } from '../state/CloudContext';
import { useToast } from '../ui/Toast';

export const APP_VERSION = __APP_VERSION__;

/** Política de privacidade pública (abre no navegador). */
export const PRIVACY_POLICY_URL = 'https://github.com/Iron026/oficio-app/blob/main/docs/PRIVACIDADE.md';

/** Amostras das cores de destaque (tons 500 e 700 de cada paleta em index.css). */
const ACCENT_OPTIONS = PALETTES.map((p) => ({ id: p.id, label: p.name, c1: p.scale[5]!, c2: p.hero[1] }));

export function Settings() {
  const { data, service, profession, persistent } = useApp();
  const prefs = usePrefs();
  const cloud = useCloud();
  const confirm = useConfirm();
  const toast = useToast();
  const onError = useErrorHandler();
  const [sheet, setSheet] = useState<null | 'perfil' | 'profissao' | 'planos' | 'imagem' | 'selo'>(null);
  const { tier, featured, seals } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const profile = data.profile!;
  const ent = freeEntitlements();
  const hasDemo = service.hasDemoData();

  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Escuro', icon: Moon },
    { value: 'system', label: 'Sistema', icon: Monitor },
  ];

  const backup = useBackupExport();

  async function importData(file: File) {
    const linked = cloud.linked;
    const ok = await confirm({
      title: 'Importar backup?',
      message: linked
        ? 'Todos os dados atuais serão substituídos pelos do arquivo — neste aparelho, na nuvem e nos outros aparelhos conectados. Registros criados depois desse backup serão excluídos. Uma cópia de segurança dos dados atuais é guardada neste aparelho antes.'
        : 'Todos os dados atuais deste aparelho serão substituídos pelos dados do arquivo. Uma cópia de segurança dos dados atuais é guardada antes.',
      confirmLabel: 'Importar',
      danger: true,
    });
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

  const choice = avatarOf(data.settings);
  const imageDetail = choice.kind === 'foto' && data.profileImages[0] ? 'Sua foto' : choice.kind === 'interno' ? `Avatar: ${getInternalAvatar(choice.id)?.name ?? 'do Ofício'}` : 'Iniciais';
  const sealChoice = featuredSealOf(data.settings);
  const sealDetail = featured ? `${sealChoice === 'auto' ? 'Automático · ' : ''}${featured.def.name} ${ROMAN[featured.stage]}` : 'Nenhum selo conquistado ainda';
  const accent = accentOf(data.settings);

  return (
    <div>
      <HeroSlot overlap>
        <div className="flex items-center gap-4 pt-1">
          <span className="relative shrink-0">
            <ProfileAvatar data={data} tier={tier} size={76} seal={featured ? { id: featured.def.id, stage: featured.stage } : null} onHero />
            <button type="button" onClick={() => setSheet('imagem')} aria-label="Alterar imagem de perfil" title="Alterar imagem de perfil" className="press absolute -bottom-1 -left-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--hero-1)] bg-white text-[var(--hero-2)] shadow">
              <Camera size={16} aria-hidden="true" />
            </button>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-title-2 font-extrabold leading-tight [overflow-wrap:anywhere]">{profile.name}</h2>
            <p className="mt-0.5 text-sm text-on-hero-soft [overflow-wrap:anywhere]">{[profile.businessName, profession.name].filter(Boolean).join(' · ')}</p>
            <TierChip tier={tier} onHero className="mt-1.5" />
          </div>
        </div>
      </HeroSlot>

      <Card className="!p-4 shadow-md">
        <p className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-muted">Atalhos</p>
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
          {themes.map(({ value, label, icon: Icon }) => {
            const active = prefs.theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => service.updateDevicePrefs({ theme: value }).catch(onError)}
                className={cx('press flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-surface text-sm font-medium transition-colors', active ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'border-line')}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 border-t border-line pt-1">
          <Switch checked={prefs.hideValues} onChange={(v) => service.updateDevicePrefs({ hideValues: v }).catch(onError)} label="Ocultar valores" description="Mostra R$ ••••• no lugar dos valores, só neste aparelho" />
        </div>
      </Card>

      <SectionTitle>Perfil e identidade</SectionTitle>
      <Card className="!p-0">
        <Row onClick={() => setSheet('perfil')} label="Nome e negócio" detail={[profile.name, profile.businessName].filter(Boolean).join(' · ')} icon={<Pencil size={18} />} />
        <Row onClick={() => setSheet('imagem')} label="Imagem de perfil" detail={imageDetail} icon={<UserRound size={18} />} />
        <Row onClick={() => setSheet('selo')} label="Selo em destaque" detail={sealDetail} icon={<Award size={18} />} />
        <Row onClick={() => setSheet('profissao')} label={profession.name} detail="Profissão · adapta termos e missões" icon={<ProfessionIcon icon={profession.icon} size={18} />} />
      </Card>

      <SectionTitle>Aparência</SectionTitle>
      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold" id="accent-label">Cor de destaque</p>
          <div role="radiogroup" aria-labelledby="accent-label" className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
            {ACCENT_OPTIONS.map((a) => {
              const active = accent === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { applyAccentWithTransition(a.id, prefs.motion === 'reduzir' || matchMedia('(prefers-reduced-motion: reduce)').matches); service.updateSettings({ accent: a.id }).catch(onError); }}
                  className={cx('press flex min-h-12 items-center gap-2.5 rounded-xl border-2 px-3 text-left text-sm font-medium', active ? 'border-brand-500' : 'border-line')}
                >
                  <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                    <span className="h-5 w-5 rounded-full border-2 border-surface" style={{ background: a.c1 }} />
                    <span className="h-5 w-5 rounded-full border-2 border-surface" style={{ background: a.c2 }} />
                  </span>
                  <span className="min-w-0 flex-1">{a.label}</span>
                  {active && <Check size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">A paleta acompanha sua conta e muda o topo, os botões, a navegação e as seleções. Receitas, despesas, XP, alertas e medalhões de categoria mantêm as cores próprias.</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Densidade das listas</p>
          <Segmented label="Densidade das listas" value={prefs.density} onChange={(v) => service.updateDevicePrefs({ density: v }).catch(onError)} options={[{ value: 'confortavel', label: 'Confortável' }, { value: 'compacta', label: 'Compacta' }]} />
          <p className="mt-2 text-xs text-muted">Tema, densidade e ocultar valores valem só para este aparelho.</p>
        </div>
      </Card>

      <SectionTitle>Acessibilidade</SectionTitle>
      <Card className="space-y-3">
        <div>
          <p className="mb-2 text-sm font-semibold">Animações</p>
          <Segmented label="Animações" value={prefs.motion} onChange={(v) => service.updateDevicePrefs({ motion: v }).catch(onError)} options={[{ value: 'sistema', label: 'Seguir o sistema' }, { value: 'reduzir', label: 'Reduzir' }]} />
        </div>
        <p className="text-sm text-muted">
          <Type size={15} className="mr-1 inline align-[-2px]" aria-hidden="true" />
          O tamanho do texto acompanha o ajuste de fonte do aparelho{isNative() ? ' (Configurações do Android › Tela › Tamanho da fonte)' : ''}.
        </p>
      </Card>

      <AccountSection />

      <SectionTitle>Plano</SectionTitle>
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Check size={20} aria-hidden="true" /></span>
          <div className="flex-1">
            <p className="font-semibold">Plano Gratuito</p>
            <p className="text-sm text-muted">Todos os recursos desta versão estão liberados.</p>
          </div>
        </div>
        <Button variant="secondary" block className="mt-3" icon={<Crown size={18} className="text-xp-500" />} onClick={() => setSheet('planos')}>Conhecer o Premium (em breve)</Button>
      </Card>

      <SectionTitle>Dados</SectionTitle>
      <Card className="!p-0">
        <Row onClick={backup.start} label="Exportar backup" detail="Gera um arquivo .json com todos os seus dados" icon={<Download size={18} />} />
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
      <PrivacyCard />

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Database size={12} aria-hidden="true" /> Ofício v{APP_VERSION} · {platformName() === 'android' ? 'Android' : 'Web'} · armazenamento {persistent ? 'local' : 'temporário'}
      </p>

      {backup.sheet}
      <ProfileSheet open={sheet === 'perfil'} onClose={() => setSheet(null)} />
      <ProfessionSheet open={sheet === 'profissao'} onClose={() => setSheet(null)} />
      <ProfileImageSheet open={sheet === 'imagem'} onClose={() => setSheet(null)} />
      <FeaturedSealSheet open={sheet === 'selo'} seals={seals} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'planos'} onClose={() => setSheet(null)} title="Recursos do Ofício">
        <p className="mb-4 rounded-xl bg-xp-100/60 p-3 text-sm text-xp-700 dark:bg-xp-500/10 dark:text-xp-400">
          Nenhuma compra ou assinatura está disponível nesta versão. Os itens “Em breve” estão em desenvolvimento e não podem ser adquiridos.
        </p>
        {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((cat) => {
          const items = FEATURES.filter((f) => f.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">{CATEGORY_LABEL[cat]}</h3>
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
                        <p className="text-sm text-muted">{f.description}</p>
                      </div>
                      <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold', on ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-surface-2 text-muted')}>
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
    <button type="button" onClick={onClick} className="press-soft flex w-full items-center gap-3 border-b border-line p-3.5 text-left transition-colors last:border-0 hover:bg-surface-2">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2', danger ? 'text-red-600 dark:text-red-400' : 'text-brand-600 dark:text-brand-300')} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-medium', danger && 'text-red-600 dark:text-red-400')}>{label}</span>
        <span className="line-clamp-2 block text-sm text-muted [overflow-wrap:anywhere]">{detail}</span>
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
                <span className="block text-sm text-muted">{p.tagline}</span>
              </span>
              {active && <Check size={20} className="text-brand-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function PrivacyCard() {
  const { linked } = useCloud();
  return (
    <Card className="space-y-2 text-sm leading-relaxed">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-brand-600 dark:text-brand-300" aria-hidden="true" /> Seus dados são seus</p>
      {linked ? (
        <>
          <p className="text-muted">
            <strong>Com conta conectada:</strong> seus dados ficam neste aparelho e uma cópia é guardada na nuvem (Google Cloud Firestore, via Firebase), vinculada à sua conta
            Google. Regras de acesso permitem que somente a sua conta leia e grave esses dados. Do Google, o Ofício usa apenas nome, e-mail, foto e um identificador da conta.
          </p>
          {!sealsPhotoSyncEnabled() && <p className="text-muted">Nesta versão, a foto de perfil e os selos ficam só neste aparelho e no arquivo de backup; não vão para a nuvem.</p>}
          <p className="text-muted">Você pode exportar seus dados, desconectar ou excluir a conta e os dados da nuvem a qualquer momento em “Conta e sincronização”.</p>
        </>
      ) : (
        <p className="text-muted">
          <strong>Sem conta conectada:</strong> seus registros ficam salvos apenas neste aparelho e não são enviados para a internet. {isNative() ? 'O backup automático do Android está desativado.' : ''} Faça
          backups periódicos — desinstalar o app ou limpar os dados do navegador apaga as informações.
        </p>
      )}
      <p className="text-muted">Não vendemos dados nem os usamos para publicidade. O app não inclui SDKs de anúncios nem de análise de uso.</p>
      <p className="text-muted">
        <a
          className="inline-flex items-center gap-1.5 font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300"
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} aria-hidden="true" /> Ler Política de Privacidade
        </a>
      </p>
    </Card>
  );
}

function FeaturedSealSheet({ open, seals, onClose }: { open: boolean; seals: SealProgress[]; onClose: () => void }) {
  const { data, service } = useApp();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const current = featuredSealOf(data.settings);
  async function choose(id: SealId | 'auto') {
    try {
      await service.updateSettings({ featuredSeal: id });
      feedback(id === 'auto' ? 'Destaque automático' : 'Selo em destaque atualizado');
      onClose();
    } catch (err) {
      onError(err);
    }
  }
  const option = (active: boolean, disabled?: boolean) => cx('press-soft flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left', active ? 'border-brand-500' : 'border-line', disabled && 'opacity-60');
  return (
    <Sheet open={open} onClose={onClose} title="Selo em destaque">
      <p className="mb-3 text-sm text-muted">O selo em destaque aparece no canto do seu avatar. Selos são permanentes e não dão XP.</p>
      <div role="radiogroup" aria-label="Selo em destaque" className="space-y-2">
        <button type="button" role="radio" aria-checked={current === 'auto'} onClick={() => choose('auto')} className={option(current === 'auto')}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand-600 dark:text-brand-300"><Award size={20} aria-hidden="true" /></span>
          <span className="flex-1">
            <span className="block font-semibold">Automático</span>
            <span className="block text-sm text-muted">O de maior estágio; no empate, o mais recente</span>
          </span>
          {current === 'auto' && <Check size={20} className="text-brand-600" aria-hidden="true" />}
        </button>
        {seals.map((p) => {
          const locked = p.stage === 0;
          const active = current === p.def.id;
          return (
            <button key={p.def.id} type="button" role="radio" aria-checked={active} aria-disabled={locked} disabled={locked} onClick={() => choose(p.def.id)} className={option(active, locked)}>
              <SealMedal id={p.def.id} stage={p.stage} size={40} />
              <span className="flex-1">
                <span className="block font-semibold">{p.def.name}</span>
                <span className="block text-sm text-muted">{locked ? 'Ainda não conquistado' : `Estágio ${ROMAN[p.stage]} · ${p.def.unit(p.value)}`}</span>
              </span>
              {active && <Check size={20} className="text-brand-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
