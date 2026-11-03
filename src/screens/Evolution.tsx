import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleCheck, Lock, Minus, Pencil } from 'lucide-react';
import { growthPercent } from '../domain/finance';
import { monthlyHistory } from '../domain/insights';
import { ACHIEVEMENTS } from '../gamification/achievements';
import { missionProgress, monthlyGoal, realData, totalXp, weeklyGoal, type MissionProgress } from '../gamification/engine';
import { levelInfo, totalXpForLevel } from '../gamification/levels';
import { monthLabel } from '../lib/dates';
import { centsToInput, formatMoney, formatMoneyShort, parseMoney } from '../lib/money';
import { useApp, useErrorHandler, useFeedback } from '../state/AppContext';
import { Button, IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { TextField } from '../ui/Field';
import { AchievementIcon } from '../ui/icons';
import { Card, ProgressBar, SectionTitle } from '../ui/Misc';
import { Sheet } from '../ui/Sheet';

export function Evolution() {
  const { data, profession } = useApp();
  const [editingGoals, setEditingGoals] = useState(false);
  const now = new Date();
  const profile = data.profile!;
  const t = profession.terms;
  const lv = levelInfo(totalXp(data.xpEvents));
  const week = weeklyGoal(profile, data, now);
  const month = monthlyGoal(profile, data, now);
  const missions = missionProgress(profession, data, now);
  const starters = missions.filter((m) => m.kind === 'inicial');
  const weekly = missions.filter((m) => m.kind === 'semanal');
  const history = monthlyHistory(realData(data), now, 6);
  const cur = history[history.length - 1]!;
  const prev = history[history.length - 2]!;
  const unlocked = new Map(data.achievements.map((a) => [a.id, a.unlockedAt]));
  const maxBar = Math.max(1, ...history.map((h) => Math.max(h.income, h.expense)));
  const recentXp = [...data.xpEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  return (
    <div>
      <Card className="relative overflow-hidden !p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-xp-400/15" aria-hidden="true" />
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-xp-400 text-xp-950 shadow-md shadow-xp-500/30">
            <span className="text-xs font-bold uppercase tracking-wider">Nível</span>
            <span className="num text-2xl font-extrabold leading-none">{lv.level}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold">{lv.title}</p>
            <p className="text-sm text-muted">{lv.totalXp} XP acumulados</p>
          </div>
        </div>
        <ProgressBar value={lv.progress} label="Progresso para o próximo nível" tone="xp" className="mt-4" />
        <p className="mt-2 text-sm text-muted">{lv.xpIntoLevel}/{lv.xpForNext} XP · nível {lv.level + 1} em {totalXpForLevel(lv.level + 1)} XP</p>
      </Card>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Você ganha XP ao usar o app de verdade: cadastrar, agendar, concluir {t.services.toLowerCase()} e controlar o caixa. Cada ação vale XP uma única vez, há limite diário por tipo de ação e você nunca perde XP.
      </p>

      <SectionTitle action={<IconButton label="Editar metas" onClick={() => setEditingGoals(true)} className="-my-2 h-9 w-9"><Pencil size={16} /></IconButton>}>Metas</SectionTitle>
      <div className="grid gap-3">
        <GoalCard title="Meta semanal" detail={`${week.current} de ${week.target} ${t.services.toLowerCase()} ${t.completedLabelPlural}`} progress={week.progress} done={week.done} />
        <GoalCard title="Meta do mês" detail={`${formatMoney(month.current)} de ${formatMoney(month.target)} em receitas`} progress={month.progress} done={month.done} />
      </div>

      {starters.some((m) => !m.done) && (
        <>
          <SectionTitle>Primeiros passos</SectionTitle>
          <div className="space-y-2.5">{starters.map((m) => <MissionCard key={m.key} m={m} />)}</div>
        </>
      )}

      <SectionTitle>Missões da semana</SectionTitle>
      <div className="space-y-2.5">{weekly.map((m) => <MissionCard key={m.key} m={m} />)}</div>
      <p className="mt-2 text-sm text-muted">Novas missões toda segunda-feira, adaptadas para {profession.name.toLowerCase()}.</p>

      <SectionTitle>Crescimento · {monthLabel(cur.month, true)} vs {monthLabel(prev.month, true)}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
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
                <div className="w-1/3 rounded-t bg-brand-500 transition-[height] duration-700" style={{ height: `${(h.income / maxBar) * 100}%`, minHeight: h.income ? 3 : 0 }} />
                <div className="w-1/3 rounded-t bg-orange-400 transition-[height] duration-700" style={{ height: `${(h.expense / maxBar) * 100}%`, minHeight: h.expense ? 3 : 0 }} />
              </div>
              <span className="text-xs capitalize text-muted">{monthLabel(h.month, true)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />Receitas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-400" />Despesas</span>
        </div>
      </Card>

      <SectionTitle>Conquistas · {unlocked.size}/{ACHIEVEMENTS.length}</SectionTitle>
      <ul className="grid grid-cols-2 gap-2.5">
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

      <GoalsSheet open={editingGoals} onClose={() => setEditingGoals(false)} />
    </div>
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
    <Card className="!p-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="truncate text-base font-bold num">{value}</p>
      <p className={cx('mt-0.5 flex items-center gap-0.5 text-xs font-semibold', pct === null || pct === 0 ? 'text-muted' : pct > 0 ? 'text-income' : 'text-expense')}>
        <Icon size={13} aria-hidden="true" />
        {pct === null ? 'novo' : `${pct > 0 ? '+' : ''}${pct}%`}
      </p>
    </Card>
  );
}

function GoalsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
