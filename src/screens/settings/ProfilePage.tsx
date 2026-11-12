import { useState } from 'react';
import { InitialSetupSheet } from '../InitialSetupSheet';
import { Award, Check, ListChecks, Pencil, Target, UserRound, Sparkles } from 'lucide-react';
import { PROFESSION_LIST } from '../../domain/professions';
import { avatarOf, featuredSealOf } from '../../domain/preferences';
import type { ProfessionId, SealId } from '../../domain/types';
import { ROMAN, type SealProgress } from '../../gamification/seals';
import { hasErrors, validateProfile, type Errors, type ProfileInput } from '../../lib/validation';
import { formatMoney } from '../../lib/money';
import { useApp, useErrorHandler, useFeedback } from '../../state/AppContext';
import { useProfile } from '../../state/useProfile';
import { getInternalAvatar } from '../../ui/avatarCatalog';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { TextField } from '../../ui/Field';
import { ProfessionIcon } from '../../ui/icons';
import { Card } from '../../ui/Misc';
import { SealMedal } from '../../ui/SealMedal';
import { useHideValues } from '../../ui/privacy';
import { ProfileAvatar } from '../../ui/ProfileAvatar';
import { SavedNote, useSavedNote } from '../../ui/SavedNote';
import { Sheet } from '../../ui/Sheet';
import { GoalsSheet } from '../Evolution';
import { ProfileImageSheet } from '../ProfileImageSheet';
import { ServiceTypesSheet } from '../ServiceTypesSheet';
import { OptionRow, SettingsSubpage } from './shared';

type ProfileSheetId = null | 'perfil' | 'profissao' | 'imagem' | 'selo' | 'metas' | 'servicos' | 'sugestoes';

export function ProfilePage() {
  const { data, profession } = useApp();
  const { featured, seals } = useProfile();
  const [sheet, setSheet] = useState<ProfileSheetId>(null);
  const profile = data.profile!;
  const choice = avatarOf(data.settings);
  const imageDetail = choice.kind === 'foto' && data.profileImages[0] ? 'Sua foto' : choice.kind === 'interno' ? `Avatar: ${getInternalAvatar(choice.id)?.name ?? 'do Ofício'}` : 'Iniciais';
  const sealChoice = featuredSealOf(data.settings);
  const sealDetail = featured ? `${sealChoice === 'auto' ? 'Automático · ' : ''}${featured.def.name} ${ROMAN[featured.stage]}` : 'Nenhum selo conquistado ainda';
  const close = () => setSheet(null);
  const hidden = useHideValues();
  return (
    <SettingsSubpage id="perfil">
      <Card className="!p-0">
        <OptionRow onClick={() => setSheet('perfil')} label="Nome e negócio" detail={[profile.name, profile.businessName].filter(Boolean).join(' · ')} icon={<Pencil size={18} />} />
        <OptionRow onClick={() => setSheet('profissao')} label={profession.name} detail="Profissão · adapta termos e missões" icon={<ProfessionIcon icon={profession.icon} size={18} />} />
        <OptionRow onClick={() => setSheet('imagem')} label="Imagem de perfil" detail={imageDetail} icon={<UserRound size={18} />} />
        <OptionRow onClick={() => setSheet('selo')} label="Selo em destaque" detail={sealDetail} icon={<Award size={18} />} />
        <OptionRow
          onClick={() => setSheet('metas')}
          label="Metas"
          detail={`${profile.weeklyGoalServices} ${profession.terms.services.toLowerCase()} por semana · ${hidden ? 'R$ •••••' : formatMoney(profile.monthlyGoalRevenue)} por mês`}
          icon={<Target size={18} />}
        />
        <OptionRow
          onClick={() => setSheet('servicos')}
          label="Tipos de serviço"
          detail={data.serviceTypes.length ? `${data.serviceTypes.length} ${data.serviceTypes.length === 1 ? 'tipo' : 'tipos'} · ${data.serviceTypes.filter((s) => s.pinned).length} fixado(s)` : 'Atalhos de nome e valor para agendar'}
          icon={<ListChecks size={18} />}
        />
        <OptionRow onClick={() => setSheet('sugestoes')} label={`Sugestões para ${profession.name.toLowerCase()}`} detail="Serviços comuns, Painel, Agenda, cor e imagem" icon={<Sparkles size={18} />} />
      </Card>
      <ProfileSheet open={sheet === 'perfil'} onClose={close} />
      <ProfessionSheet open={sheet === 'profissao'} onClose={close} />
      <ProfileImageSheet open={sheet === 'imagem'} onClose={close} />
      <FeaturedSealSheet open={sheet === 'selo'} seals={seals} onClose={close} />
      <GoalsSheet open={sheet === 'metas'} onClose={close} />
      <ServiceTypesSheet open={sheet === 'servicos'} onClose={close} />
      <InitialSetupSheet open={sheet === 'sugestoes'} onClose={close} />
    </SettingsSubpage>
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

/**
 * beta.7: escolher um selo não fecha a tela. A prévia do avatar mostra o selo aplicado, aparece
 * "Atualizado" e a pessoa continua trocando até tocar em "Concluído" (ou no X / Voltar).
 */
function FeaturedSealSheet({ open, seals, onClose }: { open: boolean; seals: SealProgress[]; onClose: () => void }) {
  const { data, service } = useApp();
  const { tier, featured } = useProfile();
  const onError = useErrorHandler();
  const note = useSavedNote();
  const current = featuredSealOf(data.settings);
  async function choose(id: SealId | 'auto') {
    try {
      await service.updateSettings({ featuredSeal: id });
      note.flash();
    } catch (err) {
      onError(err);
    }
  }
  const option = (active: boolean, disabled?: boolean) => cx('press-soft flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left', active ? 'border-brand-500' : 'border-line', disabled && 'opacity-60');
  return (
    <Sheet open={open} onClose={onClose} title="Selo em destaque" footer={<Button block size="lg" variant="secondary" onClick={onClose}>Concluído</Button>}>
      <div className="mb-3 flex flex-col items-center gap-1" data-seal-preview>
        <ProfileAvatar data={data} tier={tier} size={88} seal={featured ? { id: featured.def.id, stage: featured.stage } : null} />
        <p className="text-center text-sm font-semibold">{featured ? `${current === 'auto' ? 'Automático · ' : ''}${featured.def.name} ${ROMAN[featured.stage]}` : 'Nenhum selo conquistado ainda'}</p>
        <SavedNote shown={note.shown} label="Selo em destaque atualizado" />
      </div>
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
                <span className="block text-sm text-muted">{locked ? 'Ainda não conquistado' : <>Estágio {ROMAN[p.stage]}<span className="sr-only"> de IV</span> · {p.def.unit(p.value)}</>}</span>
              </span>
              {active && <Check size={20} className="text-brand-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
