import { useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, ChevronRight, CircleMinus, CirclePlus, HandCoins, Lightbulb, RefreshCcw, SlidersHorizontal, Target, TriangleAlert, Undo2, UserPlus } from 'lucide-react';
import { dashboardEntries, readDashboard, type DashboardCardId } from '../domain/dashboard';
import { monthTotals } from '../domain/finance';
import { overdue, upcoming } from '../domain/insights';
import { receivables } from '../domain/payments';
import { refundIssues } from '../domain/refundReview';
import { missionProgress, monthlyGoal, weeklyGoal } from '../gamification/engine';
import { monthKey, monthLabel } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { useCloud } from '../state/CloudContext';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { Card, EmptyState, ProgressBar, SectionTitle } from '../ui/Misc';
import { Money } from '../ui/Money';
import { ProfileAvatar, TierChip } from '../ui/ProfileAvatar';
import { useProfile } from '../state/useProfile';
import { HeroSlot } from './Shell';
import { AppointmentItem } from './AppointmentItem';
import { DashboardCustomizer } from './DashboardCustomizer';
import { AppointmentFormSheet } from './forms/AppointmentForm';
import { ClientFormSheet } from './forms/ClientForm';
import { TransactionFormSheet } from './forms/TransactionForm';

type Sheet = null | 'agendar' | 'cliente' | 'receita' | 'despesa' | 'personalizar';

const linkClass = '-my-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 dark:text-brand-300';

/** Aviso que fica sempre no topo do Painel, mesmo com todos os cartões ocultos. */
function Alert({ href, tone, icon, children, id }: { href: string; tone: 'amber' | 'red'; icon: ReactNode; children: ReactNode; id: string }) {
  return (
    <a
      href={href}
      data-dashboard-alert={id}
      className={tone === 'red'
        ? 'press-soft flex items-center gap-3 rounded-2xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100'
        : 'press-soft flex items-center gap-3 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-100'}
    >
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      <span className="flex-1">{children}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </a>
  );
}

export function Dashboard() {
  const { data, profession } = useApp();
  const cloud = useCloud();
  const [sheet, setSheet] = useState<Sheet>(null);
  const now = new Date();
  const profile = data.profile!;
  const t = profession.terms;
  const month = monthTotals(data.transactions, monthKey(now));
  const week = weeklyGoal(profile, data, now);
  const goal = monthlyGoal(profile, data, now);
  const next = upcoming(data.appointments, now, 3);
  const late = overdue(data.appointments, now);
  const toReceive = useMemo(() => receivables(data.appointments, data.transactions), [data.appointments, data.transactions]);
  const reviews = useMemo(() => refundIssues(data.transactions).length, [data.transactions]);
  const conflicts = cloud.linked ? cloud.sync.conflicts.length : 0;
  const missions = missionProgress(profession, data, now).filter((m) => !m.done).slice(0, 2);
  const tip = profession.tips[now.getDate() % profession.tips.length];
  const firstName = profile.name.split(' ')[0];
  const { lv, tier } = useProfile();
  const dateLine = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const entries = dashboardEntries(readDashboard(data.settings.dashboard)).filter((e) => e.visible).map((e) => e.id);

  const quick = [
    { id: 'agendar' as const, label: 'Agendar', icon: CalendarPlus, tone: '' },
    { id: 'cliente' as const, label: 'Cliente', icon: UserPlus, tone: 'text-brand-600 dark:text-brand-300' },
    { id: 'receita' as const, label: 'Receita', icon: CirclePlus, tone: 'text-income' },
    { id: 'despesa' as const, label: 'Despesa', icon: CircleMinus, tone: 'text-expense' },
  ];

  const monthHeader = (
    <div className="flex items-center justify-between gap-3">
      <p className="font-sans text-xs font-bold uppercase tracking-wider text-muted">{monthLabel(monthKey(now))}</p>
      <a href="#/financas" className={cx(linkClass, 'gap-0.5')}>
        Finanças <ChevronRight size={16} aria-hidden="true" />
      </a>
    </div>
  );
  const movement = (
    <dl className="mt-4 divide-y divide-line rounded-xl bg-surface-2 dark:divide-line/70">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <dt className="flex items-center gap-2 text-sm text-muted"><CirclePlus size={18} className="text-income" aria-hidden="true" /> Receitas</dt>
        <dd className="text-base font-bold"><Money cents={month.income} kind="income" /></dd>
      </div>
      {month.refund > 0 && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <dt className="flex items-center gap-2 text-sm text-muted"><Undo2 size={18} aria-hidden="true" /> Estornos</dt>
          <dd className="text-base font-bold"><Money cents={month.refund} kind="expense" /></dd>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <dt className="flex items-center gap-2 text-sm text-muted"><CircleMinus size={18} className="text-expense" aria-hidden="true" /> Despesas</dt>
        <dd className="text-base font-bold"><Money cents={month.expense} kind="expense" /></dd>
      </div>
    </dl>
  );

  const render = (id: DashboardCardId, withMovement: boolean): ReactNode => {
    switch (id) {
      case 'saldo':
        return (
          <Card className="!p-5 shadow-md">
            {monthHeader}
            <p className="mt-1 text-sm text-muted">Saldo do mês</p>
            <p className="text-title-1 font-extrabold tracking-tight sm:text-display"><Money cents={month.balance} kind="balance" /></p>
            {withMovement && movement}
          </Card>
        );
      case 'movimento':
        return <Card className="!p-5">{monthHeader}{movement}</Card>;
      case 'nivel':
        return (
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
        );
      case 'atalhos':
        return (
          <div className="grid grid-cols-2 gap-2.5">
            {quick.map(({ id: q, label, icon: Icon, tone }) => (
              <Button key={q} variant={q === 'agendar' ? 'primary' : 'secondary'} className="!justify-start" icon={<Icon size={20} className={tone} aria-hidden="true" />} onClick={() => setSheet(q)}>
                {label}
              </Button>
            ))}
          </div>
        );
      case 'semana':
        return (
          <Card className="!p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-muted"><Target size={16} className="shrink-0" aria-hidden="true" /> {t.services} na semana</p>
              <p className="num shrink-0 text-lg font-bold">{week.current}<span className="text-sm font-medium text-muted"> de {week.target}</span></p>
            </div>
            <ProgressBar value={week.progress} label="Meta semanal" className="mt-2 !h-2" />
          </Card>
        );
      case 'receber':
        return (
          <a href="#/financas" className="press-soft block rounded-2xl border border-line bg-surface p-3.5" data-dashboard-card="receber">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-muted"><HandCoins size={16} className="shrink-0" aria-hidden="true" /> A receber</p>
              <p className="shrink-0 text-lg font-bold"><Money cents={toReceive.pending} /></p>
            </div>
            <p className="mt-1 text-sm text-muted">
              {toReceive.count === 0 ? `Nada pendente nos ${t.services.toLowerCase()} ${t.completedLabelPlural}.` : `${toReceive.count} ${toReceive.count === 1 ? `${t.service.toLowerCase()} ${t.completedLabel}` : `${t.services.toLowerCase()} ${t.completedLabelPlural}`} com valor pendente. Fora do saldo até receber.`}
            </p>
          </a>
        );
      case 'meta-mes':
        return (
          <Card className="!p-3.5">
            <p className="flex items-center gap-2 text-sm text-muted"><Target size={16} className="shrink-0" aria-hidden="true" /> Meta do mês</p>
            <p className="mt-0.5 text-sm"><span className="text-lg font-bold"><Money cents={goal.current} /></span><span className="text-muted"> de <Money cents={goal.target} /></span></p>
            <ProgressBar value={goal.progress} label="Meta de receita do mês" className="mt-2 !h-2" />
          </Card>
        );
      case 'proximos':
        return (
          <section>
            <SectionTitle action={<a href="#/agenda" className={linkClass}>Agenda</a>}>Próxim{t.serviceArticle}s {t.services.toLowerCase()}</SectionTitle>
            {next.length ? (
              <div className="space-y-2.5">{next.map((a) => <AppointmentItem key={a.id} a={a} showDate />)}</div>
            ) : (
              <Card className="!p-0">
                <EmptyState icon={<CalendarPlus size={28} />} title="Agenda livre" text={`Agende ${t.serviceArticle === 'a' ? 'a próxima' : 'o próximo'} ${t.service.toLowerCase()} e receba lembretes visuais aqui.`} />
              </Card>
            )}
          </section>
        );
      case 'missoes':
        return missions.length > 0 ? (
          <section>
            <SectionTitle action={<a href="#/evolucao" className={linkClass}>Evolução</a>}>Missões</SectionTitle>
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
          </section>
        ) : null;
      case 'dica':
        return tip ? (
          <Card className="mt-2 flex items-start gap-3 !bg-brand-50/60 dark:!bg-brand-500/10">
            <Lightbulb size={20} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">Dica para {profession.name.toLowerCase()}</p>
              <p className="mt-0.5 text-base">{tip}</p>
            </div>
          </Card>
        ) : null;
    }
  };

  // Saldo e movimento juntos no mesmo cartão quando estão lado a lado (o Painel aprovado).
  const blocks: { id: DashboardCardId; node: ReactNode }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const id = entries[i]!;
    const merged = id === 'saldo' && entries[i + 1] === 'movimento';
    blocks.push({ id, node: render(id, merged) });
    if (merged) i++;
  }

  const block = (b: (typeof blocks)[number]) => (b.node ? <div key={b.id} data-dashboard-card={b.id} className="min-w-0">{b.node}</div> : null);

  return (
    <div className="enter-stagger grid gap-[var(--gap-list)]">
      <HeroSlot overlap>
        <p className="pt-1 text-sm text-on-hero-soft">{greeting},</p>
        <h2 className="font-display text-title-1 font-extrabold leading-tight [overflow-wrap:anywhere]">{firstName}</h2>
        <p className="mt-0.5 text-sm text-on-hero-soft">{[profile.businessName, dateLine].filter(Boolean).join(' · ')}</p>
      </HeroSlot>

      {blocks.slice(0, 1).map(block)}
      {/* Avisos que pedem ação: fora da personalização, sempre visíveis (logo abaixo do primeiro cartão, que fica
          sob a curva do cabeçalho; sem cartões, no topo). */}
      {reviews > 0 && (
        <Alert id="estornos" href="#/financas" tone="red" icon={<TriangleAlert size={20} />}>
          {reviews === 1 ? '1 pagamento tem estornos para revisar.' : `${reviews} pagamentos têm estornos para revisar.`} Os totais ainda não estão reconciliados.
        </Alert>
      )}
      {conflicts > 0 && (
        <Alert id="conflitos" href="#/ajustes/conta" tone="red" icon={<RefreshCcw size={20} />}>
          {conflicts === 1 ? '1 registro financeiro tem versões diferentes entre aparelhos.' : `${conflicts} registros financeiros têm versões diferentes entre aparelhos.`} Toque para revisar.
        </Alert>
      )}
      {late.length > 0 && (
        <Alert id="atrasados" href="#/agenda" tone="amber" icon={<TriangleAlert size={20} />}>
          {late.length === 1 ? `1 ${t.service.toLowerCase()} passad${t.serviceArticle} aguarda` : `${late.length} ${t.services.toLowerCase()} passad${t.serviceArticle}s aguardam`} conclusão.
        </Alert>
      )}

      {blocks.slice(1).map(block)}

      {entries.length === 0 && (
        <Card className="!p-0">
          <EmptyState icon={<SlidersHorizontal size={28} />} title="Todos os cartões estão ocultos" text="Seus dados continuam guardados. Escolha o que mostrar no Painel." />
        </Card>
      )}

      <div className="flex justify-center pt-1">
        <Button variant="ghost" icon={<SlidersHorizontal size={18} />} onClick={() => setSheet('personalizar')}>Personalizar Painel</Button>
      </div>

      <AppointmentFormSheet open={sheet === 'agendar'} onClose={() => setSheet(null)} />
      <ClientFormSheet open={sheet === 'cliente'} onClose={() => setSheet(null)} />
      <TransactionFormSheet open={sheet === 'receita' || sheet === 'despesa'} defaultType={sheet === 'despesa' ? 'despesa' : 'receita'} onClose={() => setSheet(null)} />
      <DashboardCustomizer open={sheet === 'personalizar'} onClose={() => setSheet(null)} />
    </div>
  );
}

