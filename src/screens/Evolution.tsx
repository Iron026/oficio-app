import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleCheck, Lock, Minus, Pencil } from 'lucide-react';
import { growthPercent } from '../domain/finance';
import { monthlyHistory } from '../domain/insights';
import { featuredSealOf } from '../domain/preferences';
import type { SealId } from '../domain/types';
import { ACHIEVEMENTS } from '../gamification/achievements';
import { missionProgress, monthlyGoal, realData, weeklyGoal, type MissionProgress } from '../gamification/engine';
import { totalXpForLevel } from '../gamification/levels';
import { ROMAN, type SealProgress } from '../gamification/seals';
import { TIERS, tierLabel, type Tier } from '../gamification/tiers';
import { monthLabel } from '../lib/dates';
import { centsToInput, formatMoney, formatMoneyShort, parseMoney } from '../lib/money';
import { useApp, useErrorHandler, useFeedback } from '../state/AppContext';
import { useProfile } from '../state/useProfile';
import { Button, IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { TextField } from '../ui/Field';
import { AchievementIcon } from '../ui/icons';
import { Card, ProgressBar, SectionTitle, Segmented } from '../ui/Misc';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { CategoryMedal } from '../ui/CategoryMedal';
import { useCelebration } from '../ui/celebrationContext';
import { SealMedal, StagePips } from '../ui/SealMedal';
import { Sheet } from '../ui/Sheet';
import { HeroSlot } from './Shell';
type Tab = 'missoes' | 'selos' | 'conquistas' | 'historico';
const TABS: { value: Tab; label: string }[] = [
  { value: 'missoes', label: 'Missões' },
  { value: 'selos', label: 'Selos' },
  { value: 'conquistas', label: 'Conquistas' },
  { value: 'historico', label: 'Histórico' },
];

export function Evolution() {
  const { data, service } = useApp();
  const { lv, tier, next, seals, featured } = useProfile();
  const [tab, setTab] = useState<Tab>('missoes');
  const owned = seals.filter((p) => p.stage > 0).length;

  const celebrate = useCelebration();
  // Categoria que subiu por sincronização (outro aparelho): comemora uma vez, ao abrir a Evolução.
  useEffect(() => {
    const due = service.celebrationDue();
    if (due) celebrate(due, lv.level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  return (
    <div>
      <HeroSlot overlap>
        <div className="flex items-center gap-4 pt-1">
          <span className="relative shrink-0">
            <ProfileAvatar data={data} tier={tier} size={92} onHero />
            <span className="absolute -bottom-1 -right-2 drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]"><CategoryMedal tier={tier} size={40} decorative /></span>
          </span>
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase tracking-[0.1em] text-on-hero-soft">{tier.name} · Nível</p>
            <h2 className="flex flex-wrap items-baseline gap-x-2 leading-none">
              <span className="num font-display text-[2.5rem] font-extrabold">{lv.level}</span>
              <span className="font-display text-lg font-bold leading-tight">{lv.title}</span>
            </h2>
            <p className="mt-1 text-sm text-on-hero-soft"><span className="num">{fmt(lv.totalXp)}</span> XP acumulados</p>
          </div>
        </div>
        <div role="progressbar" aria-label="Progresso para o próximo nível" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lv.progress * 100)} className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="bar-fill h-full w-full rounded-full bg-gradient-to-r from-xp-400 to-xp-500" style={{ transform: `scaleX(${Math.min(1, Math.max(0, lv.progress))})` }} />
        </div>
        <p className="mt-1.5 flex justify-between gap-3 text-[0.8125rem] text-on-hero-soft">
          <span className="num">{fmt(lv.xpIntoLevel)} / {fmt(lv.xpForNext)} XP</span>
          <span>nível <span className="num">{lv.level + 1}</span> em <span className="num">{fmt(totalXpForLevel(lv.level + 1))}</span> XP</span>
        </p>
      </HeroSlot>

      <Card className="!p-4 shadow-md">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="font-display font-bold">Sua trilha</h3>
          <span className="text-xs text-muted">toque para rever</span>
        </div>
        <TierTrail current={tier} level={lv.level} onReplay={(t) => celebrate(t, lv.level)} />
        <div className="mt-4 grid gap-2">
          <div className="relative flex items-center gap-3 rounded-2xl border border-brand-500 bg-brand-50 px-3 py-2.5 dark:bg-brand-500/15">
            <span className="absolute -top-2.5 right-3 rounded-full bg-brand-600 px-2 py-0.5 font-display text-xs font-extrabold text-white dark:bg-brand-300 dark:text-[#062421]">Você está aqui</span>
            <CategoryMedal tier={tier} size={40} decorative />
            <span className="min-w-0"><b className="font-display">{tier.name}</b><span className="block text-sm text-muted">desde o nível <span className="num">{tier.minLevel}</span></span></span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-3 py-2.5">
            <CategoryMedal tier={next.tier} size={40} decorative className="opacity-80 grayscale-[.4]" />
            <span className="min-w-0">
              <b className="font-display">{next.tier.id === tier.id ? `Próximo grau: ${next.tier.name}` : `Próxima: ${next.tier.name}`}</b>
              <span className="block text-sm text-muted">nível <span className="num">{next.tier.minLevel}</span> · faltam <span className="num">{fmt(next.xpNeeded)}</span> XP</span>
            </span>
          </div>
        </div>
      </Card>

      <div className="mt-[var(--gap-section)]">
        <Segmented label="Seções da evolução" value={tab} onChange={setTab} options={TABS} />
      </div>

      <div key={tab} className="animate-screen">
        {tab === 'missoes' && <MissionsTab />}
        {tab === 'selos' && <SealsTab seals={seals} featuredId={featured?.def.id ?? null} owned={owned} />}
        {tab === 'conquistas' && <AchievementsTab />}
        {tab === 'historico' && <HistoryTab />}
      </div>
    </div>
  );
}

/** Trilha das 6 categorias: conquistadas, atual (ampliada), próxima e bloqueadas. */
function TierTrail({ current, level, onReplay }: { current: Tier; level: number; onReplay: (t: Tier) => void }) {
  const idx = TIERS.findIndex((t) => t.id === current.id);
  return (
    <div className="relative px-0.5 pt-1">
      <div aria-hidden="true" className="absolute left-6 right-6 top-[1.6rem] h-1 rounded-full bg-line">
        <div className="bar-fill h-full w-full rounded-full bg-brand-500 dark:bg-brand-400" style={{ transform: `scaleX(${idx / (TIERS.length - 1)})` }} />
      </div>
      <ol aria-label={`Categorias: ${tierLabel(current)}`} className="relative flex justify-between">
        {TIERS.map((t, i) => {
          const state = i < idx ? 'done' : i === idx ? 'cur' : i === idx + 1 ? 'next' : 'lock';
          const shown = i === idx ? current : t;
          const label = state === 'done' ? 'conquistada' : state === 'cur' ? 'você está aqui' : `a partir do nível ${t.minLevel}`;
          return (
            <li key={t.id} aria-current={state === 'cur' ? 'step' : undefined}>
              <button
                type="button"
                disabled={state === 'next' || state === 'lock'}
                onClick={() => onReplay(shown)}
                aria-label={`${shown.name}: ${label}${state === 'done' || state === 'cur' ? '. Toque para rever a comemoração' : ''}`}
                className={cx(
                  'press grid h-12 w-12 place-items-center rounded-full bg-surface disabled:cursor-default',
                  state === 'cur' && 'scale-110 shadow-[0_0_0_3px_var(--surface),0_0_0_5px_var(--color-brand-500)]',
                  state === 'next' && 'opacity-80 grayscale-[.6]',
                  state === 'lock' && 'opacity-45 grayscale',
                )}
              >
                <CategoryMedal tier={shown} size={46} decorative />
              </button>
            </li>
          );
        })}
      </ol>
      <span className="sr-only">Nível {level}.</span>
    </div>
  );
}

function MissionsTab() {
  const { data, profession } = useApp();
  const [editingGoals, setEditingGoals] = useState(false);
  const now = new Date();
  const profile = data.profile!;
  const t = profession.terms;
  const week = weeklyGoal(profile, data, now);
  const month = monthlyGoal(profile, data, now);
  const missions = missionProgress(profession, data, now);
  const starters = missions.filter((m) => m.kind === 'inicial');
  const weekly = missions.filter((m) => m.kind === 'semanal');
  return (
    <>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Você ganha XP ao usar o app de verdade: cadastrar, agendar, concluir {t.services.toLowerCase()} e controlar o caixa. Cada ação vale XP uma única vez, há limite diário por tipo de ação e você nunca perde XP.
      </p>

      <SectionTitle action={<IconButton label="Editar metas" onClick={() => setEditingGoals(true)} className="-my-2 h-11 w-11"><Pencil size={16} /></IconButton>}>Metas</SectionTitle>
      <div className="enter-stagger grid gap-[var(--gap-list)]">
        <GoalCard title="Meta semanal" detail={`${week.current} de ${week.target} ${t.services.toLowerCase()} ${t.completedLabelPlural}`} progress={week.progress} done={week.done} />
        <GoalCard title="Meta do mês" detail={`${formatMoney(month.current)} de ${formatMoney(month.target)} em receitas`} progress={month.progress} done={month.done} />
      </div>

      {starters.some((m) => !m.done) && (
        <>
          <SectionTitle>Primeiros passos</SectionTitle>
          <div className="enter-stagger grid gap-[var(--gap-list)]">{starters.map((m) => <MissionCard key={m.key} m={m} />)}</div>
        </>
      )}

      <SectionTitle>Missões da semana</SectionTitle>
      <div className="enter-stagger grid gap-[var(--gap-list)]">{weekly.map((m) => <MissionCard key={m.key} m={m} />)}</div>
      <p className="mt-2 text-sm text-muted">Novas missões toda segunda-feira, adaptadas para {profession.name.toLowerCase()}.</p>
      <GoalsSheet open={editingGoals} onClose={() => setEditingGoals(false)} />
    </>
  );
}

function SealsTab({ seals, featuredId, owned }: { seals: SealProgress[]; featuredId: SealId | null; owned: number }) {
  const [open, setOpen] = useState<SealId | null>(null);
  const selected = seals.find((p) => p.def.id === open) ?? null;
  return (
    <>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Selos reconhecem hábitos mantidos ao longo do tempo. São permanentes: um estágio conquistado nunca é perdido, mesmo que registros sejam excluídos. Selos não dão XP.
      </p>
      <SectionTitle>Seus selos · <span className="num">{owned}/{seals.length}</span></SectionTitle>
      <ul className="enter-stagger grid grid-cols-1 gap-[var(--gap-list)] min-[400px]:grid-cols-2 lg:grid-cols-3">
        {seals.map((p) => {
          const target = p.next ?? p.def.thresholds[3];
          const prevT = p.stage > 0 ? p.def.thresholds[p.stage - 1]! : 0;
          const frac = p.next === null ? 1 : (p.value - prevT) / (p.next - prevT);
          return (
            <li key={p.def.id}>
              <button type="button" onClick={() => setOpen(p.def.id)} className="press-soft flex h-full w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left shadow-sm hover:bg-surface-2">
                <SealMedal id={p.def.id} stage={p.stage} size={56} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-display font-bold leading-snug">{p.def.name}</span>
                    {featuredId === p.def.id && <span className="rounded-full bg-brand-100 px-2 py-px text-xs font-semibold text-brand-800 dark:bg-brand-500/20 dark:text-brand-100">Em destaque</span>}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <StagePips stage={p.stage} />
                    {p.stage > 0 ? `Estágio ${ROMAN[p.stage]}` : 'Ainda não conquistado'}
                  </span>
                  <ProgressBar value={Math.max(0, Math.min(1, frac))} label={`${p.def.name}: progresso para o ${p.next === null ? 'último estágio' : `estágio ${ROMAN[p.stage + 1]}`}`} className="!h-2" />
                  <span className="text-xs text-muted">{p.next === null ? `Estágio máximo · ${p.def.unit(p.value)}` : `${p.def.unit(p.value)} · próximo: ${target}`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <SealSheet seal={selected} featuredId={featuredId} onClose={() => setOpen(null)} />
    </>
  );
}

function SealSheet({ seal, featuredId, onClose }: { seal: SealProgress | null; featuredId: SealId | null; onClose: () => void }) {
  const { data, service } = useApp();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const choice = featuredSealOf(data.settings);
  async function feature(id: SealId | 'auto') {
    try {
      await service.updateSettings({ featuredSeal: id });
      feedback(id === 'auto' ? 'Destaque automático' : 'Selo em destaque no perfil');
      onClose();
    } catch (err) {
      onError(err);
    }
  }
  const p = seal;
  return (
    <Sheet open={!!p} onClose={onClose} title={p ? `Selo ${p.def.name}` : ''}>
      {p && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <SealMedal id={p.def.id} stage={p.stage} size={72} />
            <div className="min-w-0">
              <p className="font-display text-lg font-bold">{p.stage > 0 ? `Estágio ${ROMAN[p.stage]} de IV` : 'Ainda não conquistado'}</p>
              <p className="text-sm text-muted">Hoje: {p.def.unit(p.value)}</p>
            </div>
          </div>
          <ol className="divide-y divide-line rounded-xl border border-line">
            {p.def.thresholds.map((th, i) => {
              const at = p.reachedAt[i];
              const done = i < p.stage;
              return (
                <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <span className="flex items-center gap-2.5">
                    <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', done ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted')}>{ROMAN[i + 1]}</span>
                    <span className="text-sm">{p.def.unit(th)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{done ? (at ? `em ${new Date(at).toLocaleDateString('pt-BR')}` : 'conquistado') : 'a conquistar'}</span>
                </li>
              );
            })}
          </ol>
          {p.stage > 0 ? (
            featuredId === p.def.id && choice === p.def.id ? (
              <Button variant="secondary" block onClick={() => feature('auto')}>Voltar ao destaque automático</Button>
            ) : (
              <Button block onClick={() => feature(p.def.id)}>{featuredId === p.def.id ? 'Fixar este selo no perfil' : 'Destacar no perfil'}</Button>
            )
          ) : (
            <p className="text-sm text-muted">Conquiste o estágio I para poder destacar este selo no seu perfil.</p>
          )}
          <p className="text-xs text-muted">No destaque automático, o perfil mostra o selo de maior estágio (no empate, o mais recente).</p>
        </div>
      )}
    </Sheet>
  );
}

function AchievementsTab() {
  const { data, profession } = useApp();
  const t = profession.terms;
  const unlocked = new Map(data.achievements.map((a) => [a.id, a.unlockedAt]));
  return (
    <>
      <SectionTitle>Conquistas · <span className="num">{unlocked.size}/{ACHIEVEMENTS.length}</span></SectionTitle>
      <ul className="enter-stagger grid grid-cols-2 gap-[var(--gap-list)] sm:grid-cols-3">
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked.get(a.id);
          return (
            <li key={a.id} className={cx('rounded-2xl border p-3.5', at ? 'border-xp-400/60 bg-xp-100/40 dark:bg-xp-500/10' : 'border-line bg-surface')}>
              <div className={cx('mb-2 flex h-10 w-10 items-center justify-center rounded-xl', at ? 'bg-xp-400 text-xp-950' : 'bg-surface-2 text-muted')}>
                {at ? <AchievementIcon icon={a.icon} size={20} /> : <Lock size={18} aria-hidden="true" />}
              </div>
              <p className="text-sm font-semibold leading-snug">{a.title(t)}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{a.description(t)}</p>
              <p className="mt-1.5 text-xs font-semibold text-xp-700 dark:text-xp-400">{at ? `Desbloqueada em ${new Date(at).toLocaleDateString('pt-BR')}` : `+${a.xp} XP`}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Escala da barra; valores pequenos (mas não zero) continuam visíveis. */
const barScale = (v: number, max: number) => (v > 0 ? Math.max(0.025, v / max) : 0);

function HistoryTab() {
  const { data, profession } = useApp();
  const t = profession.terms;
  const now = new Date();
  const history = monthlyHistory(realData(data), now, 6);
  const cur = history[history.length - 1]!;
  const prev = history[history.length - 2]!;
  const maxBar = Math.max(1, ...history.map((h) => Math.max(h.income, h.expense)));
  const recentXp = [...data.xpEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  return (
    <>
      <SectionTitle>Crescimento · {monthLabel(cur.month, true)} vs {monthLabel(prev.month, true)}</SectionTitle>
      <div className="grid gap-2 min-[480px]:grid-cols-3">
        <Growth label="Receitas" value={formatMoneyShort(cur.income)} pct={growthPercent(cur.income, prev.income)} />
        <Growth label={t.services} value={String(cur.servicesCompleted)} pct={growthPercent(cur.servicesCompleted, prev.servicesCompleted)} />
        <Growth label="Novos clientes" value={String(cur.newClients)} pct={growthPercent(cur.newClients, prev.newClients)} />
      </div>

      <SectionTitle>Histórico de 6 meses</SectionTitle>
      <Card>
        <div className="flex h-36 items-end justify-between gap-2" role="img" aria-label={`Receitas e despesas dos últimos 6 meses. ${history.map((h) => `${monthLabel(h.month)}: receitas ${formatMoney(h.income)}, despesas ${formatMoney(h.expense)}`).join('; ')}`}>
          {history.map((h) => (
            <div key={h.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div className="bar-rise h-full w-1/3 rounded-t bg-brand-500 dark:bg-brand-400" style={{ transform: `scaleY(${barScale(h.income, maxBar)})` }} />
                <div className="bar-rise h-full w-1/3 rounded-t bg-orange-400" style={{ transform: `scaleY(${barScale(h.expense, maxBar)})` }} />
              </div>
              <span className="text-xs capitalize text-muted">{monthLabel(h.month, true)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500 dark:bg-brand-400" />Receitas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-400" />Despesas</span>
        </div>
      </Card>

      <SectionTitle>Linha do tempo</SectionTitle>
      {recentXp.length ? (
        <ol className="space-y-0 border-l-2 border-line pl-4">
          {recentXp.map((e) => (
            <li key={e.id} className="relative pb-3">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-xp-500 ring-4 ring-bg" aria-hidden="true" />
              <div className="flex justify-between gap-2 text-sm">
                <span>{e.label}</span>
                <span className="shrink-0 font-semibold text-xp-700 dark:text-xp-400">+{e.xp} XP</span>
              </div>
              <p className="text-xs text-muted">{new Date(e.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Sua evolução aparecerá aqui conforme você usar o app.</p>
      )}
    </>
  );
}

function GoalCard({ title, detail, progress, done }: { title: string; detail: string; progress: number; done: boolean }) {
  return (
    <Card className="!p-3.5">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        {done ? <CircleCheck size={20} className="animate-pop text-brand-500" aria-label="Meta alcançada" /> : <span className="text-sm font-semibold num text-muted">{Math.round(progress * 100)}%</span>}
      </div>
      <p className="mb-2 text-sm text-muted">{detail}</p>
      <ProgressBar value={progress} label={title} />
    </Card>
  );
}

function MissionCard({ m }: { m: MissionProgress }) {
  return (
    <Card className={cx('!p-3.5', m.done && 'bg-surface-2')}>
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', m.done ? 'animate-pop border-brand-500 bg-brand-500 text-white' : 'border-line')}>
          {m.done && <CircleCheck size={16} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cx('font-semibold', m.done && 'line-through decoration-brand-500/60')}>{m.template.title}</p>
            <span className="shrink-0 text-sm font-semibold text-xp-600 dark:text-xp-400">+{m.template.xp} XP</span>
          </div>
          <p className="text-sm text-muted">{m.template.description}</p>
          {!m.done && (
            <div className="mt-2 flex items-center gap-3">
              <ProgressBar value={m.current / m.template.target} label={m.template.title} tone="xp" />
              <span className="shrink-0 text-sm num text-muted">{m.current}/{m.template.target}</span>
            </div>
          )}
        </div>
      </div>
      <span className="sr-only">{m.done ? 'Concluída' : 'Em andamento'}</span>
    </Card>
  );
}

function Growth({ label, value, pct }: { label: string; value: string; pct: number | null }) {
  const Icon = pct === null || pct === 0 ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="flex items-center justify-between gap-3 !p-3 min-[480px]:block">
      <p className="text-sm text-muted min-[480px]:text-xs">{label}</p>
      <div className="flex items-baseline gap-2 min-[480px]:block">
        <p className="text-base font-bold num [overflow-wrap:anywhere]">{value}</p>
        <p className={cx('mt-0.5 flex items-center gap-0.5 text-xs font-semibold', pct === null || pct === 0 ? 'text-muted' : pct > 0 ? 'text-income' : 'text-expense')}>
          <Icon size={13} aria-hidden="true" />
          {pct === null ? 'novo' : `${pct > 0 ? '+' : ''}${pct}%`}
        </p>
      </div>
    </Card>
  );
}

export function GoalsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, service, profession } = useApp();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const profile = data.profile!;
  const [weekly, setWeekly] = useState(String(profile.weeklyGoalServices));
  const [monthly, setMonthly] = useState(centsToInput(profile.monthlyGoalRevenue));
  const [errors, setErrors] = useState<{ weekly?: string; monthly?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(weekly);
    const m = parseMoney(monthly);
    const errs = {
      weekly: !Number.isInteger(w) || w < 1 || w > 200 ? 'Informe um número entre 1 e 200.' : undefined,
      monthly: m === null || m < 100 ? 'Informe um valor válido (mínimo R$ 1,00).' : undefined,
    };
    setErrors(errs);
    if (errs.weekly || errs.monthly) return;
    try {
      const fb = await service.updateProfile({ weeklyGoalServices: w, monthlyGoalRevenue: m! });
      feedback('Metas atualizadas', fb);
      onClose();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Suas metas">
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label={`${profession.terms.services} por semana`} inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value.replace(/\D/g, ''))} error={errors.weekly} />
        <TextField label="Faturamento mensal" prefix="R$" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} error={errors.monthly} hint="Defina metas realistas: a constância vale mais que números altos." />
        <Button type="submit" block size="lg">Salvar metas</Button>
      </form>
    </Sheet>
  );
}
