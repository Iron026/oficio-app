import { monthLabel } from '../lib/dates';
import { byCategory, totals, transactionsInMonth, type Totals } from './finance';
import type { AppData, TransactionType } from './types';

/**
 * Extrato mensal (rodada 3): mesmos lançamentos e totais da tela Finanças para o mês,
 * em ordem cronológica. Só leitura — não altera dados, XP nem cálculos.
 */
export interface StatementRow {
  /** aaaa-mm-dd */
  date: string;
  type: TransactionType;
  category: string;
  /** Pode ser vazia (descrição opcional). */
  description: string;
  /** Centavos, sempre positivo; o sinal vem do tipo. */
  amount: number;
  isDemo: boolean;
}

export interface Statement {
  monthKey: string;
  monthTitle: string;
  name: string;
  businessName: string;
  generatedAt: Date;
  rows: StatementRow[];
  totals: Totals;
  incomeByCategory: { category: string; amount: number }[];
  expenseByCategory: { category: string; amount: number }[];
}

export function buildStatement(data: AppData, mKey: string, now: Date): Statement {
  const month = transactionsInMonth(data.transactions, mKey);
  const rows = [...month]
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))
    .map((t) => ({ date: t.date, type: t.type, category: t.category, description: t.description.trim(), amount: t.amount, isDemo: !!t.isDemo }));
  return {
    monthKey: mKey,
    monthTitle: monthLabel(mKey),
    name: data.profile?.name ?? '',
    businessName: data.profile?.businessName ?? '',
    generatedAt: now,
    rows,
    totals: totals(month),
    incomeByCategory: byCategory(month, 'receita'),
    expenseByCategory: byCategory(month, 'despesa'),
  };
}

/** aaaa-mm-dd → dd/mm/aaaa (sem passar por Date: nunca muda de dia pelo fuso). */
export const dateBR = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

/** Centavos → "1234,56" / "-85,00" (sem separador de milhar: a planilha lê como número). */
export function centsPlain(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

export const statementFileName = (mKey: string, ext: 'csv' | 'pdf') => `oficio-extrato-${mKey}.${ext}`;

export const typeLabel = (t: TransactionType) => (t === 'receita' ? 'Receita' : 'Despesa');

/** Descrição exibida no extrato (marca dados de demonstração). */
export const rowDescription = (r: StatementRow) => `${r.description}${r.isDemo ? `${r.description ? ' ' : ''}(demonstração)` : ''}`;

/**
 * Célula de texto para CSV: protege contra fórmulas (=, +, -, @, tab, CR no início viram
 * texto com apóstrofo) e coloca entre aspas quando há ; " ou quebra de linha.
 */
export function csvText(value: string): string {
  let v = value.replace(/\r\n?/g, '\n');
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV para Excel/Planilhas em português: UTF-8 com BOM, separador ";", vírgula decimal,
 * datas dd/mm/aaaa e linhas CRLF. Despesas com valor negativo, para somar direto.
 */
export function statementCsv(st: Statement): string {
  const lines = ['Data;Tipo;Categoria;Descrição;Valor (R$)'];
  for (const r of st.rows) {
    lines.push([dateBR(r.date), typeLabel(r.type), csvText(r.category), csvText(rowDescription(r)), centsPlain(r.type === 'receita' ? r.amount : -r.amount)].join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
