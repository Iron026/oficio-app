import { useState } from 'react';
import { CalendarPlus, ChevronRight, CircleMinus, CirclePlus, Lightbulb, Target, TriangleAlert, UserPlus } from 'lucide-react';
import { monthTotals } from '../domain/finance';
import { overdue, upcoming } from '../domain/insights';
import { missionProgress, weeklyGoal } from '../gamification/engine';
import { monthKey, monthLabel } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { Button } from '../ui/Button';
import { Card, EmptyState, ProgressBar, SectionTitle } from '../ui/Misc';
import { Money } from '../ui/Money';
import { ProfileAvatar, TierChip } from '../ui/ProfileAvatar';
import { useProfile } from '../state/useProfile';
import { HeroSlot } from './Shell';
import { AppointmentItem } from './AppointmentItem';
import { AppointmentFormSheet } from './forms/AppointmentForm';
import { ClientFormSheet } from './forms/ClientForm';
import { TransactionFormSheet } from './forms/TransactionForm';

type Sheet = null | 'agendar' | 'cliente' | 'receita' | 'despesa';

export function Dashboard() {
  const { data, profession } = useApp();
  const [sheet, setSheet] = useState<Sheet>(null);
  const now = new Date();
  const profile = data.profile!;
  const t = profession.terms;
  const month = monthTotals(data.transactions, monthKey(now));
  const week = weeklyGoal(profile, data, now);
  const next = upcoming(data.appointments, now, 3);
  const late = overdue(data.appointments, now);
  const missions = missionProgress(profession, data, now).filter((m) => !m.done).slice(0, 2);
  const tip = profession.tips[now.getDate() % profession.tips.length];
  const firstName = profile.name.split(' ')[0];
  const { lv, tier } = useProfile();
  const dateLine = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const quick = [
    { id: 'agendar' as const, label: 'Agendar', icon: CalendarPlus, tone: '' },
    { id: 'cliente' as const, label: 'Cliente', icon: UserPlus, tone: 'text-brand-600 dark:text-brand-300' },
    { id: 'receita' as const, label: 'Receita', icon: CirclePlus, tone: 'text-income' },
    { id: 'despesa' as const, label: 'Despesa', icon: CircleMinus, tone: 'text-expense' },
  ];

  return (
    <div className="enter-stagger grid gap-[var(--gap-list)]">
      <HeroSlot overlap>
        <p className="pt-1 text-sm text-white/85">{greeting},</p>
        <h2 className="font-display text-title-1 font-extrabold leading-tight [overflow-wrap:anywhere]">{firstName}</h2>
        <p className="mt-0.5 text-sm text-white/80">{[profile.businessName, dateLine].filter(Boolean).join(' · ')}</p>
      </HeroSlot>

      <Card className="!p-5 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <p className="font-sans text-xs font-bold uppercase tracking-wider text-muted">{monthLabel(monthKey(now))}</p>
          <a href="#/financas" className="-my-2 inline-flex min-h-10 items-center gap-0.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
            Finanças <ChevronRight size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="mt-1 text-sm text-muted">Saldo do mês</p>
        <p className="text-title-1 font-extrabold tracking-tight sm:text-display"><Money cents={month.balance} kind="balance" /></p>
        <dl className="mt-4 divide-y divide-line rounded-xl bg-surface-2 dark:divide-line/70">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="flex items-center gap-2 text-sm text-muted"><CirclePlus size={18} className="text-income" aria-hidden="true" /> Receitas</dt>
            <dd className="text-base font-bold"><Money cents={month.income} kind="income" /></dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="flex items-center gap-2 text-sm text-muted"><CircleMinus size={18} className="text-expense" aria-hidden="true" /> Despesas</dt>
            <dd className="text-base font-bold"><Money cents={month.expense} kind="expense" /></dd>
          </div>
        </dl>
      </Card>

      <a
        href="#/evolucao"
        className="press-soft block rounded-2xl border border-xp-400/50 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-xp-400)_16%,var(--surface)),var(--surface)_70%)] p-4 shadow-sm"
      >
        <div className="flex items-center gap-3.5">
          <ProfileAvatar data={data} tier={tier} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold leading-tight">Nível {lv.level} · {lv.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2"><TierChip tier={tier} /><span className="num text-sm text-muted">{lv.totalXp} XP</span></div>
          </div>
          <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
        </div>
        <ProgressBar value={lv.progress} label="Progresso do nível" tone="xp" className="mt-3" />
        <p className="mt-2 text-sm text-muted">Faltam <span className="num font-semibold text-fg">{lv.xpForNext - lv.xpIntoLevel} XP</span> para o nível {lv.level + 1}</p>
      </a>

      <div className="grid grid-cols-2 gap-2.5">
        {quick.map(({ id, label, icon: Icon, tone }) => (
          <Button key={id} variant={id === 'agendar' ? 'primary' : 'secondary'} className="!justify-start" icon={<Icon size={20} className={tone} aria-hidden="true" />} onClick={() => setSheet(id)}>
            {label}
          </Button>
        ))}
      </div>

      <Card className="!p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted"><Target size={16} className="shrink-0" aria-hidden="true" /> {t.services} na semana</p>
          <p className="num shrink-0 text-lg font-bold">{week.current}<span className="text-sm font-medium text-muted"> de {week.target}</span></p>
        </div>
        <ProgressBar value={week.progress} label="Meta semanal" className="mt-2 !h-2" />
      </Card>

      {late.length > 0 && (
        <a href="#/agenda" className="press-soft flex items-center gap-3 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
          <TriangleAlert size={20} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{late.length === 1 ? `1 ${t.service.toLowerCase()} passad${t.serviceArticle} aguarda` : `${late.length} ${t.services.toLowerCase()} passad${t.serviceArticle}s aguardam`} conclusão.</span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>
      )}

      <SectionTitle action={<a href="#/agenda" className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 dark:text-brand-300">Agenda</a>}>Próxim{t.serviceArticle}s {t.services.toLowerCase()}</SectionTitle>
      {next.length ? (
        <div className="space-y-2.5">{next.map((a) => <AppointmentItem key={a.id} a={a} showDate />)}</div>
      ) : (
        <Card className="!p-0">
          <EmptyState icon={<CalendarPlus size={28} />} title="Agenda livre" text={`Agende ${t.serviceArticle === 'a' ? 'a próxima' : 'o próximo'} ${t.service.toLowerCase()} e receba lembretes visuais aqui.`} />
        </Card>
      )}

      {missions.length > 0 && (
        <>
          <SectionTitle action={<a href="#/evolucao" className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 dark:text-brand-300">Evolução</a>}>Missões</SectionTitle>
          <div className="space-y-2.5">
            {missions.map((m) => (
              <Card key={m.key} className="!p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{m.template.title}</p>
                  <span className="shrink-0 text-sm font-semibold text-xp-600 dark:text-xp-400">+{m.template.xp} XP</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={m.current / m.template.target} label={m.template.title} tone="xp" />
                  <span className="shrink-0 text-sm num text-muted">{m.current}/{m.template.target}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tip && (
        <Card className="mt-2 flex items-start gap-3 !bg-brand-50/60 dark:!bg-brand-500/10">
          <Lightbulb size={20} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">Dica para {profession.name.toLowerCase()}</p>
            <p className="mt-0.5 text-base">{tip}</p>
          </div>
        </Card>
      )}

      <AppointmentFormSheet open={sheet === 'agendar'} onClose={() => setSheet(null)} />
      <ClientFormSheet open={sheet === 'cliente'} onClose={() => setSheet(null)} />
      <TransactionFormSheet open={sheet === 'receita' || sheet === 'despesa'} defaultType={sheet === 'despesa' ? 'despesa' : 'receita'} onClose={() => setSheet(null)} />
    </div>
  );
}
