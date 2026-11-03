import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarPlus, ChevronRight, Lightbulb, Receipt, Target, TriangleAlert, UserPlus, Wallet } from 'lucide-react';
import { monthTotals } from '../domain/finance';
import { overdue, upcoming } from '../domain/insights';
import { missionProgress, totalXp, weeklyGoal } from '../gamification/engine';
import { levelInfo } from '../gamification/levels';
import { monthKey } from '../lib/dates';
import { formatMoneyShort } from '../lib/money';
import { useApp } from '../state/AppContext';
import { cx } from '../ui/cx';
import { Card, EmptyState, ProgressBar, SectionTitle } from '../ui/Misc';
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
  const lv = levelInfo(totalXp(data.xpEvents));
  const month = monthTotals(data.transactions, monthKey(now));
  const week = weeklyGoal(profile, data, now);
  const next = upcoming(data.appointments, now, 3);
  const late = overdue(data.appointments, now);
  const missions = missionProgress(profession, data, now).filter((m) => !m.done).slice(0, 2);
  const tip = profession.tips[now.getDate() % profession.tips.length];
  const firstName = profile.name.split(' ')[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const quick = [
    { id: 'agendar' as const, label: 'Agendar', icon: CalendarPlus },
    { id: 'cliente' as const, label: 'Cliente', icon: UserPlus },
    { id: 'receita' as const, label: 'Receita', icon: ArrowUpRight },
    { id: 'despesa' as const, label: 'Despesa', icon: ArrowDownRight },
  ];

  return (
    <div>
      <p className="text-muted">{greeting},</p>
      <h2 className="text-2xl font-bold tracking-tight">{firstName}</h2>

      <a href="#/evolucao" className="mt-4 block rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg shadow-brand-700/20 transition-transform active:scale-[0.99]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/75">Nível {lv.level}</p>
            <p className="text-xl font-bold">{lv.title}</p>
          </div>
          <span className="num rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">{lv.totalXp} XP</span>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Progresso do nível" aria-valuenow={Math.round(lv.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-xp-400 transition-[width] duration-500" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
        </div>
        <p className="mt-2 flex items-center justify-between text-sm text-white/80">
          Faltam {lv.xpForNext - lv.xpIntoLevel} XP para o nível {lv.level + 1}
          <ChevronRight size={16} aria-hidden="true" />
        </p>
      </a>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {quick.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setSheet(id)} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface py-3 text-sm font-medium transition-colors hover:bg-surface-2 active:scale-95">
            <Icon size={22} className="text-brand-600 dark:text-brand-300" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <SectionTitle action={<a href="#/financas" className="text-sm font-semibold text-brand-600 dark:text-brand-300">Ver tudo</a>}>Este mês</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Receitas" value={formatMoneyShort(month.income)} tone="income" />
        <Kpi label="Despesas" value={formatMoneyShort(month.expense)} tone="expense" />
        <Kpi label="Saldo" value={formatMoneyShort(month.balance)} tone={month.balance >= 0 ? 'neutral' : 'expense'} icon={<Wallet size={16} aria-hidden="true" />} />
        <Card className="!p-3.5">
          <p className="flex items-center gap-1.5 text-sm text-muted"><Target size={14} aria-hidden="true" /> {t.services} na semana</p>
          <p className="mt-1 text-xl font-bold num">{week.current}<span className="text-base font-medium text-muted">/{week.target}</span></p>
          <ProgressBar value={week.progress} label="Meta semanal" className="mt-2 !h-1.5" />
        </Card>
      </div>

      {late.length > 0 && (
        <a href="#/agenda" className="mt-4 flex items-center gap-3 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
          <TriangleAlert size={20} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{late.length === 1 ? `1 ${t.service.toLowerCase()} passad${t.serviceArticle} aguarda` : `${late.length} ${t.services.toLowerCase()} passad${t.serviceArticle}s aguardam`} conclusão.</span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>
      )}

      <SectionTitle action={<a href="#/agenda" className="text-sm font-semibold text-brand-600 dark:text-brand-300">Agenda</a>}>Próxim{t.serviceArticle}s {t.services.toLowerCase()}</SectionTitle>
      {next.length ? (
        <div className="space-y-2.5">{next.map((a) => <AppointmentItem key={a.id} a={a} showDate />)}</div>
      ) : (
        <Card className="!p-0">
          <EmptyState icon={<CalendarPlus size={28} />} title="Agenda livre" text={`Agende ${t.serviceArticle === 'a' ? 'a próxima' : 'o próximo'} ${t.service.toLowerCase()} e receba lembretes visuais aqui.`} />
        </Card>
      )}

      {missions.length > 0 && (
        <>
          <SectionTitle action={<a href="#/evolucao" className="text-sm font-semibold text-brand-600 dark:text-brand-300">Evolução</a>}>Missões</SectionTitle>
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
        <Card className="mt-6 flex items-start gap-3 !bg-brand-50/60 dark:!bg-brand-500/10">
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

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: 'income' | 'expense' | 'neutral'; icon?: React.ReactNode }) {
  return (
    <Card className="!p-3.5">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {icon ?? (tone === 'income' ? <ArrowUpRight size={14} aria-hidden="true" /> : <Receipt size={14} aria-hidden="true" />)}
        {label}
      </p>
      <p className={cx('mt-1 truncate text-xl font-bold num', tone === 'income' && 'text-income', tone === 'expense' && 'text-expense')} title={value}>{value}</p>
    </Card>
  );
}

