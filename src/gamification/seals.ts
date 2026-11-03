import { monthTotals } from '../domain/finance';
import { isCompleted } from '../domain/insights';
import type { AppData, SealAward, SealId } from '../domain/types';
import { realData } from './engine';

/**
 * Selos profissionais (0.4): reconhecem hábitos mantidos ao longo do tempo, em 4 estágios.
 * - NÃO concedem XP (as conquistas e missões já têm recompensa própria).
 * - São calculados a partir dos registros que já existem (sem dados de demonstração).
 * - O maior estágio já alcançado fica guardado em `sealAwards` e nunca diminui
 *   (ver `mergeAward`), mesmo que registros sejam excluídos depois.
 */
export interface SealDef {
  id: SealId;
  name: string;
  /** Limites dos estágios I a IV (aprovados na 0.4). */
  thresholds: readonly [number, number, number, number];
  /** "9 semanas com a meta" etc. */
  unit: (n: number) => string;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export const SEALS: readonly SealDef[] = [
  { id: 'constancia', name: 'Constância', thresholds: [1, 4, 12, 26], unit: (n) => `${n} ${plural(n, 'semana', 'semanas')} com a meta` },
  { id: 'fidelizacao', name: 'Fidelização', thresholds: [1, 5, 15, 40], unit: (n) => `${n} ${plural(n, 'cliente fiel', 'clientes fiéis')}` },
  { id: 'metas', name: 'Metas', thresholds: [1, 3, 6, 12], unit: (n) => `${n} ${plural(n, 'mês', 'meses')} com a meta` },
  { id: 'experiencia', name: 'Experiência', thresholds: [25, 100, 250, 500], unit: (n) => `${n} ${plural(n, 'atendimento concluído', 'atendimentos concluídos')}` },
  { id: 'carteira', name: 'Carteira', thresholds: [20, 50, 100, 200], unit: (n) => `${n} ${plural(n, 'cliente', 'clientes')}` },
  { id: 'saude', name: 'Saúde financeira', thresholds: [1, 3, 6, 12], unit: (n) => `${n} ${plural(n, 'mês', 'meses')} no azul` },
];

export const SEAL_IDS: readonly SealId[] = SEALS.map((s) => s.id);
export const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

export function getSeal(id: string): SealDef | undefined {
  return SEALS.find((s) => s.id === id);
}

type Data = Pick<AppData, 'clients' | 'appointments' | 'transactions' | 'xpEvents'>;

/**
 * Datas (ordenadas) em que cada unidade do selo foi obtida, só com dados reais.
 * A n-ésima data é o momento em que o valor chegou a n.
 */
export function sealEventDates(rawData: Data): Record<SealId, string[]> {
  const d = realData(rawData);
  const sorted = (xs: string[]) => [...xs].sort();
  const completed = d.appointments.filter(isCompleted);
  const doneAt = (a: (typeof completed)[number]) => a.completedAt ?? `${a.date}T12:00:00.000Z`;

  // Fidelização: para cada cliente, a data do 3º atendimento concluído.
  const byClient = new Map<string, string[]>();
  for (const a of completed) if (a.clientId) byClient.set(a.clientId, [...(byClient.get(a.clientId) ?? []), doneAt(a)]);
  const loyal = [...byClient.values()].map(sorted).filter((ds) => ds.length >= 3).map((ds) => ds[2]!);

  // Saúde financeira: meses com receitas, despesas e saldo positivo; data = último lançamento do mês.
  const months = [...new Set(d.transactions.map((t) => t.date.slice(0, 7)))];
  const blue = months
    .filter((m) => {
      const t = monthTotals(d.transactions, m);
      return t.income > 0 && t.expense > 0 && t.balance > 0;
    })
    .map((m) => `${sorted(d.transactions.filter((t) => t.date.startsWith(m)).map((t) => t.date)).at(-1)}T23:59:59.000Z`);

  return {
    constancia: sorted(rawData.xpEvents.filter((e) => e.key.startsWith('goal_week:')).map((e) => e.createdAt)),
    metas: sorted(rawData.xpEvents.filter((e) => e.key.startsWith('goal_month:')).map((e) => e.createdAt)),
    experiencia: sorted(completed.map(doneAt)),
    carteira: sorted(d.clients.map((c) => c.createdAt)),
    fidelizacao: sorted(loyal),
    saude: sorted(blue),
  };
}

export interface SealProgress {
  def: SealDef;
  /** Valor atual calculado dos registros. */
  value: number;
  /** Estágio pelos registros atuais (0 = bloqueado). */
  computedStage: number;
  /** Estágio exibido: o maior entre o calculado e o guardado (nunca regride). */
  stage: number;
  /** Data em que cada estágio foi alcançado (índice 0 = estágio I). */
  reachedAt: (string | null)[];
  /** Próximo limite (null no estágio IV). */
  next: number | null;
}

const stageFor = (def: SealDef, value: number) => def.thresholds.filter((t) => value >= t).length;

/** Progresso de todos os selos, combinando os registros com os estágios já guardados. */
export function sealProgress(data: Data, awards: readonly SealAward[]): SealProgress[] {
  const dates = sealEventDates(data);
  return SEALS.map((def) => {
    const ds = dates[def.id];
    const value = ds.length;
    const computedStage = stageFor(def, value);
    const award = awards.find((a) => a.id === def.id);
    const stage = Math.max(computedStage, award?.stage ?? 0);
    const reachedAt = def.thresholds.map((t, i) => award?.reachedAt[i] ?? (value >= t ? ds[t - 1]! : null));
    return { def, value, computedStage, stage, reachedAt, next: stage < 4 ? def.thresholds[stage]! : null };
  });
}

/**
 * Mesclagem "só cresce" de dois registros do mesmo selo (aparelhos diferentes,
 * atualizações atrasadas): fica o maior estágio e, por estágio, a data mais antiga.
 * É comutativa, associativa e idempotente: a ordem de chegada não muda o resultado.
 */
export function mergeAward(a: SealAward, b: SealAward): SealAward {
  if (a.id !== b.id) throw new Error('Selos diferentes não podem ser mesclados.');
  const stage = Math.max(a.stage, b.stage) as SealAward['stage'];
  const reachedAt = [0, 1, 2, 3].map((i) => {
    const x = a.reachedAt[i] ?? null;
    const y = b.reachedAt[i] ?? null;
    if (x && y) return x < y ? x : y;
    return x ?? y;
  });
  const createdAt = a.createdAt < b.createdAt ? a.createdAt : b.createdAt;
  const updatedAt = a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt;
  return { id: a.id, stage, reachedAt, createdAt, updatedAt };
}

/**
 * Registros a gravar para que `sealAwards` guarde o maior estágio já merecido.
 * Usado na primeira abertura (reconhece selos já merecidos pelo histórico) e após
 * cada alteração. Só devolve o que mudou; nunca reduz um estágio.
 */
export function awardsToSave(data: Data, awards: readonly SealAward[], now: Date): SealAward[] {
  const out: SealAward[] = [];
  const iso = now.toISOString();
  for (const p of sealProgress(data, awards)) {
    if (p.computedStage === 0) continue;
    const current = awards.find((a) => a.id === p.def.id);
    const fresh: SealAward = {
      id: p.def.id,
      stage: p.computedStage as SealAward['stage'],
      reachedAt: p.reachedAt.map((d, i) => (i < p.computedStage ? d : null)),
      createdAt: current?.createdAt ?? iso,
      updatedAt: iso,
    };
    const merged = current ? mergeAward(current, fresh) : fresh;
    const same = current && merged.stage === current.stage && merged.reachedAt.every((d, i) => d === (current.reachedAt[i] ?? null));
    if (!same) out.push({ ...merged, updatedAt: iso });
  }
  return out;
}

/**
 * Selo exibido no perfil. 'auto' (padrão): o de maior estágio; no empate, o mais
 * recente. Um selo escolhido só vale se já foi conquistado (estágio ≥ I).
 */
export function featuredSeal(progress: readonly SealProgress[], pref: SealId | 'auto'): SealProgress | null {
  const owned = progress.filter((p) => p.stage > 0);
  if (pref !== 'auto') {
    const chosen = owned.find((p) => p.def.id === pref);
    if (chosen) return chosen;
  }
  const last = (p: SealProgress) => p.reachedAt[p.stage - 1] ?? '';
  return [...owned].sort((a, b) => b.stage - a.stage || last(b).localeCompare(last(a)))[0] ?? null;
}
