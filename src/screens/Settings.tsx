import { useState } from 'react';
import { Camera, Cloud, Database, HardDrive, Info, Palette, ShieldCheck, UserRound } from 'lucide-react';
import { accentOf } from '../domain/preferences';
import { platformName } from '../platform/native';
import { useApp, usePrefs } from '../state/AppContext';
import { useCloud } from '../state/CloudContext';
import { useLocation } from '../state/router';
import { useProfile } from '../state/useProfile';
import { Card } from '../ui/Misc';
import { getPalette } from '../ui/palettes';
import { ProfileAvatar, TierChip } from '../ui/ProfileAvatar';
import { statusLabel } from './Account';
import { ProfileImageSheet } from './ProfileImageSheet';
import { HeroSlot } from './Shell';
import { AboutPage } from './settings/AboutPage';
import { AccountPage } from './settings/AccountPage';
import { AppearancePage, PalettePage, themeLabel } from './settings/AppearancePages';
import { DataPage, relativeDay } from './settings/DataPage';
import { APP_VERSION, settingsPage, type SettingsPageId } from './settings/pages';
import { PrivacyPage } from './settings/PrivacyPage';
import { ProfilePage } from './settings/ProfilePage';
import { CategoryRow, openSettings, useRestoreScroll } from './settings/shared';

export { APP_VERSION, PRIVACY_POLICY_URL } from './settings/pages';

const PAGES: Record<SettingsPageId, () => React.ReactNode> = {
  aparencia: () => <AppearancePage />,
  'aparencia/paleta': () => <PalettePage />,
  perfil: () => <ProfilePage />,
  privacidade: () => <PrivacyPage />,
  conta: () => <AccountPage />,
  dados: () => <DataPage />,
  sobre: () => <AboutPage />,
};

/** Central de Ajustes: índice por categorias e páginas internas (#/ajustes/<página>). */
export function Settings() {
  const { sub } = useLocation();
  const page = settingsPage(sub);
  return page ? <div key={page}>{PAGES[page]()}</div> : <SettingsIndex />;
}

function SettingsIndex() {
  const { data, service, profession, persistent } = useApp();
  const prefs = usePrefs();
  const cloud = useCloud();
  const { tier, featured } = useProfile();
  const [imageOpen, setImageOpen] = useState(false);
  useRestoreScroll('index');
  const profile = data.profile!;
  const go = (to: SettingsPageId) => openSettings('index', to);

  const accountSummary = !cloud.account
    ? undefined
    : !cloud.available
      ? 'Só neste aparelho'
      : cloud.linked
        ? statusLabel(cloud.status).text
        : cloud.sync.linkedUid
          ? 'Sessão encerrada'
          : 'Não conectada';
  const last = service.lastBackupExportAt;

  return (
    <div>
      <HeroSlot overlap>
        <div className="flex items-center gap-4 pt-1">
          <span className="relative shrink-0">
            <ProfileAvatar data={data} tier={tier} size={76} seal={featured ? { id: featured.def.id, stage: featured.stage } : null} onHero />
            <button type="button" onClick={() => setImageOpen(true)} aria-label="Alterar imagem de perfil" title="Alterar imagem de perfil" className="press absolute -bottom-1 -left-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--hero-1)] bg-white text-[var(--hero-2)] shadow">
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

      <Card className="!p-0 shadow-md">
        <CategoryRow icon={<Palette size={20} />} title="Aparência e personalização" subtitle="Tema, paleta de cores e densidade" summary={`${themeLabel(prefs.theme)} · ${getPalette(accentOf(data.settings)).name}`} onClick={() => go('aparencia')} />
        <CategoryRow icon={<UserRound size={20} />} title="Perfil e negócio" subtitle="Nome, profissão, imagem, selo e metas" summary={profession.name} onClick={() => go('perfil')} />
        <CategoryRow icon={<ShieldCheck size={20} />} title="Privacidade e acessibilidade" subtitle="Ocultar valores, animações e privacidade" summary={`${prefs.hideValues ? 'Valores ocultos' : 'Valores visíveis'}${prefs.motion === 'reduzir' ? ' · Animações reduzidas' : ''}`} onClick={() => go('privacidade')} />
        <CategoryRow icon={<Cloud size={20} />} title="Conta e sincronização" subtitle="Conta Google e nuvem" summary={accountSummary} onClick={() => go('conta')} />
        <CategoryRow icon={<HardDrive size={20} />} title="Backup e dados" subtitle="Exportar, importar e cópias de segurança" summary={last ? `Último backup: ${relativeDay(last)}` : 'Nenhum backup exportado ainda'} onClick={() => go('dados')} />
        <CategoryRow icon={<Info size={20} />} title="Sobre o Ofício" subtitle="Versão, plano e informações" summary={`v${APP_VERSION}`} onClick={() => go('sobre')} />
      </Card>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Database size={12} aria-hidden="true" /> Ofício v{APP_VERSION} · {platformName() === 'android' ? 'Android' : 'Web'} · armazenamento {persistent ? 'local' : 'temporário'}
      </p>

      <ProfileImageSheet open={imageOpen} onClose={() => setImageOpen(false)} />
    </div>
  );
}
