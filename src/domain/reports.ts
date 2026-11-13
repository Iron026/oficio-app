/**
 * Relatórios gerenciais (0.5.0-beta.4). Funções puras, derivadas dos lançamentos e agendamentos existentes —
 * nada é gravado nem duplicado. Os totais de caixa usam a mesma função de Finanças e do extrato (`totals`),
 * então os números batem com essas telas. Tudo em centavos inteiros.
 *
 * Definições (também exibidas na tela):
 *  - Receita bruta  = Σ recebimentos (receitas) com data no mês — pagamentos parciais e antecipados contam na
 *                     data em que entraram;
 *  - Estornos       = Σ estornos de pagamentos com data no mês (não são despesas operacionais);
 *  - Receita líquida = receita bruta − estornos;
 *  - Saldo          = receita bruta − estornos − despesas operacionais;
 *  - Pendente (a receber) e previsto (agendados) ficam em blocos próprios e nunca entram no saldo;
 *  - Ticket médio   = Σ líquido recebido dos atendimentos concluídos no mês (pagamentos de qualquer data,
 *                     menos estornos) ÷ nº desses atendimentos com algum valor recebido.
 */
import { addMonths, isInMonth, monthKey, parseDateKey } from '../lib/dates';
import { byCategory, growthPercent, totals, transactionsInMonth, type Totals } from './finance';
import { completedInMonth } from './insights';
import { byAppointment, paymentSummary, receivables } from './payments';
import { refundIssues } from './refundReview';
import type { AppData } from './types';

type Data = Pick<AppData, 'clients' | 'appointments' | 'transactions'>;

export interface CashTotals { gross: number; refunds: number; net: number; expense: number; balance: number }
const cash = (t: Totals): CashTotals => ({ gross: t.income, refunds: t.refund, net: t.income - t.refund, expense: t.expense, balance: t.balance });

export interface MonthReport {
  month: string;
  totals: CashTotals;
  previous: CashTotals;
  /** Variação % em relação ao mês anterior (null quando não há base). */
  change: { gross: number | null; net: number | null; expense: number | null; balance: number | null; completed: number | null };
  completed: number;
  previousCompleted: number;
  ticket: { value: number | null; numerator: number; denominator: number };
  expenseByCategory: { category: string; amount: number }[];
  /** Recebimentos do mês por tipo de serviço (título do atendimento); avulsos em "Outras receitas". Soma = receita bruta. */
  incomeByService: { service: string; amount: number; count: number }[];
  /** Clientes com 2 ou mais atendimentos concluídos no mês. */
  recurringClients: { clientId: string; name: string; count: number }[];
  /** Serviços mais realizados (concluídos no mês). */
  topServices: { service: string; count: number }[];
  /** A receber hoje (concluídos com controle de pagamento) — independe do mês, fora do saldo. */
  pending: { amount: number; count: number };
  /** Previsto: agendados com data no mês, descontado o que já foi antecipado — fora do saldo. */
  forecast: { amount: number; count: number };
  /** Estornos aguardando revisão (conflito entre aparelhos): os totais não estão reconciliados. */
  review: { count: number; inMonth: boolean };
  /** Mês sem nenhum lançamento nem atendimento concluído. */
  empty: boolean;
}

const prevMonth = (mKey: string) => monthKey(addMonths(parseDateKey(`${mKey}-01`), -1));
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

function groupCount<T>(items: T[], key: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
}

export function monthReport(data: Data, mKey: string): MonthReport {
  const monthTx = transactionsInMonth(data.transactions, mKey);
  const t = cash(totals(monthTx));
  const prevKey = prevMonth(mKey);
  const p = cash(totals(transactionsInMonth(data.transactions, prevKey)));
  const done = completedInMonth(data.appointments, mKey);
  const prevDone = completedInMonth(data.appointments, prevKey);

  // Ticket médio.
  const linked = byAppointment(data.transactions);
  let numerator = 0;
  let denominator = 0;
  for (const a of done) {
    const s = paymentSummary(a, linked.get(a.id) ?? []);
    if (s.net > 0) { numerator += s.net; denominator++; }
  }

  // Recebimentos por tipo de serviço.
  const apptById = new Map(data.appointments.map((a) => [a.id, a]));
  const services = new Map<string, { amount: number; count: number }>();
  for (const tx of monthTx) {
    if (tx.type !== 'receita') continue;
    const ap = tx.appointmentId ? apptById.get(tx.appointmentId) : undefined;
    const name = tx.appointmentId ? norm(ap?.title || tx.description || 'Serviço excluído') : 'Outras receitas';
    const cur = services.get(name) ?? { amount: 0, count: 0 };
    services.set(name, { amount: cur.amount + tx.amount, count: cur.count + 1 });
  }

  const clientName = new Map(data.clients.map((c) => [c.id, c.name]));
  const recurring = [...groupCount(done.filter((a) => a.clientId && clientName.has(a.clientId)), (a) => a.clientId!)]
    .filter(([, n]) => n >= 2)
    .map(([clientId, count]) => ({ clientId, name: clientName.get(clientId)!, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
  const top = [...groupCount(done, (a) => norm(a.title))]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service, 'pt-BR'))
    .slice(0, 5);

  // Previsto: agendados no mês (sem duplicar o que já entrou como antecipado).
  let forecastAmount = 0;
  let forecastCount = 0;
  for (const a of data.appointments) {
    if (a.status !== 'agendado' || !isInMonth(a.date, mKey)) continue;
    forecastCount++;
    forecastAmount += Math.max(0, a.price - Math.max(0, paymentSummary(a, linked.get(a.id) ?? []).net));
  }

  const issues = refundIssues(data.transactions);
  return {
    month: mKey,
    totals: t,
    previous: p,
    change: {
      gross: growthPercent(t.gross, p.gross), net: growthPercent(t.net, p.net), expense: growthPercent(t.expense, p.expense),
      balance: growthPercent(t.balance, p.balance), completed: growthPercent(done.length, prevDone.length),
    },
    completed: done.length,
    previousCompleted: prevDone.length,
    ticket: { value: denominator ? Math.round(numerator / denominator) : null, numerator, denominator },
    expenseByCategory: byCategory(monthTx, 'despesa'),
    incomeByService: [...services].map(([service, v]) => ({ service, ...v })).sort((a, b) => b.amount - a.amount || a.service.localeCompare(b.service, 'pt-BR')),
    recurringClients: recurring,
    topServices: top,
    pending: (({ pending, count }) => ({ amount: pending, count }))(receivables(data.appointments, data.transactions)),
    forecast: { amount: forecastAmount, count: forecastCount },
    review: { count: issues.length, inMonth: issues.some((i) => i.refunds.some((r) => isInMonth(r.date, mKey)) || (!!i.payment && isInMonth(i.payment.date, mKey))) },
    empty: monthTx.length === 0 && done.length === 0,
  };
}

export interface HistoryPoint extends CashTotals { month: string }

/** Últimos `months` meses até `mKey` (mais antigo primeiro), com os mesmos totais de Finanças. */
export function cashHistory(data: Pick<AppData, 'transactions'>, mKey: string, months: 6 | 12): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  const base = parseDateKey(`${mKey}-01`);
  for (let i = months - 1; i >= 0; i--) {
    const m = monthKey(addMonths(base, -i));
    out.push({ month: m, ...cash(totals(transactionsInMonth(data.transactions, m))) });
  }
  return out;
}

export const TICKET_DEFINITION = 'Soma do valor líquido recebido (pagamentos menos estornos, de qualquer data) dos atendimentos concluídos no mês, dividida pelo número desses atendimentos com algum valor recebido.';

