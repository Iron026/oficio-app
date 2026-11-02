import { useState } from 'react';
import { ArrowRight, ChevronLeft, LineChart, ShieldCheck, Trophy, Users } from 'lucide-react';
import { PROFESSION_LIST } from '../domain/professions';
import type { ProfessionId } from '../domain/types';
import { hasErrors, validateProfile, type Errors, type ProfileInput } from '../lib/validation';
import { useApp, useErrorHandler } from '../state/AppContext';
import { navigate } from '../state/router';
import { Button, IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { TextField } from '../ui/Field';
import { ProfessionIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { Logo } from './Shell';

type Step = 'welcome' | 'profession' | 'profile';

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [professionId, setProfessionId] = useState<ProfessionId | null>(null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      {step === 'welcome' && <Welcome onNext={() => setStep('profession')} />}
      {step === 'profession' && (
        <ProfessionStep value={professionId} onChange={setProfessionId} onBack={() => setStep('welcome')} onNext={() => setStep('profile')} />
      )}
      {step === 'profile' && professionId && <ProfileStep professionId={professionId} onBack={() => setStep('profession')} />}
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const items = [
    { icon: Users, title: 'Clientes e agenda', text: 'Tudo organizado em um só lugar.' },
    { icon: LineChart, title: 'Dinheiro sob controle', text: 'Receitas, despesas e saldo do mês.' },
    { icon: Trophy, title: 'Sua evolução', text: 'Metas, missões e conquistas reais.' },
  ];
  return (
    <div className="flex flex-1 animate-fade-up flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <Logo size={56} />
        <h1 className="mt-6 text-[32px] font-extrabold leading-tight tracking-tight">
          Seu trabalho.
          <br />
          <span className="text-brand-600 dark:text-brand-300">Sua evolução.</span>
        </h1>
        <p className="mt-3 text-[17px] text-muted">O Ofício ajuda profissionais autônomos a organizar o negócio e acompanhar o próprio crescimento.</p>
        <ul className="mt-8 space-y-4">
          {items.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mb-4 mt-8 flex items-center gap-2 text-[13px] text-muted">
        <ShieldCheck size={16} aria-hidden="true" /> Seus dados ficam salvos apenas neste aparelho.
      </p>
      <Button size="lg" block onClick={onNext} icon={<ArrowRight size={20} />} className="flex-row-reverse">Começar</Button>
    </div>
  );
}

function StepHeader({ step, title, subtitle, onBack }: { step: number; title: string; subtitle: string; onBack: () => void }) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-2">
        <IconButton label="Voltar" onClick={onBack} className="-ml-3"><ChevronLeft size={24} /></IconButton>
        <span className="text-sm text-muted">Passo {step} de 2</span>
      </div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-muted">{subtitle}</p>
    </header>
  );
}

function ProfessionStep({ value, onChange, onBack, onNext }: { value: ProfessionId | null; onChange: (p: ProfessionId) => void; onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex flex-1 animate-fade-up flex-col">
      <StepHeader step={1} title="Qual é o seu ofício?" subtitle="Vamos adaptar termos, sugestões e missões para você." onBack={onBack} />
      <div role="radiogroup" aria-label="Profissão" className="flex-1 space-y-3">
        {PROFESSION_LIST.map((p) => {
          const selected = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(p.id)}
              className={cx(
                'flex w-full items-center gap-4 rounded-2xl border-2 bg-surface p-4 text-left transition-all active:scale-[0.99]',
                selected ? 'border-brand-500 shadow-md shadow-brand-500/10' : 'border-line',
              )}
            >
              <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors', selected ? 'bg-brand-600 text-white' : 'bg-surface-2 text-brand-600 dark:text-brand-300')}>
                <ProfessionIcon icon={p.icon} size={24} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-sm text-muted">{p.examples}</span>
              </span>
            </button>
          );
        })}
      </div>
      <Button size="lg" block className="mt-6" disabled={!value} onClick={onNext}>Continuar</Button>
    </div>
  );
}

function ProfileStep({ professionId, onBack }: { professionId: ProfessionId; onBack: () => void }) {
  const { service } = useApp();
  const onError = useErrorHandler();
  const toast = useToast();
  const [v, setV] = useState<ProfileInput>({ name: '', businessName: '' });
  const [errors, setErrors] = useState<Errors<ProfileInput>>({});
  const [demo, setDemo] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateProfile(v);
    setErrors(errs);
    if (hasErrors(errs)) return;
    setSaving(true);
    try {
      await service.completeOnboarding({ ...v, professionId });
      if (demo) await service.loadDemoData();
      navigate('painel');
      toast({ title: 'Tudo pronto!', description: 'Bem-vindo(a) ao Ofício.', tone: 'success' });
    } catch (err) {
      onError(err);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 animate-fade-up flex-col">
      <StepHeader step={2} title="Como podemos te chamar?" subtitle="Você pode alterar isso depois em Ajustes." onBack={onBack} />
      <div className="flex-1 space-y-4">
        <TextField label="Seu nome" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} autoComplete="given-name" maxLength={60} />
        <TextField label="Nome do negócio" value={v.businessName} onChange={(e) => setV({ ...v, businessName: e.target.value })} error={errors.businessName} optional maxLength={60} placeholder="Ex.: Studio Ana Beleza" />
        <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" />
          <span>
            <span className="block font-semibold">Carregar dados de demonstração</span>
            <span className="text-muted">Clientes e serviços fictícios, marcados como “Demonstração”, para explorar o app. Não contam XP e podem ser removidos a qualquer momento.</span>
          </span>
        </label>
      </div>
      <Button type="submit" size="lg" block className="mt-6" disabled={saving}>Entrar no Ofício</Button>
    </form>
  );
}
