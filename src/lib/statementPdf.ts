import { centsPlain, dateBR, rowDescription, typeLabel, type Statement } from '../domain/statement';
import { formatMoney } from './money';
import { A4, PdfDocument, fitText, type PdfPage, type RGB } from './pdf';

const INK: RGB = [17, 24, 28];
const MUTED: RGB = [86, 103, 110];
const LINE: RGB = [216, 225, 227];
const ZEBRA: RGB = [244, 247, 247];
const HEAD: RGB = [234, 240, 240];
const BRAND: RGB = [15, 98, 91]; // petróleo 700: identidade do Ofício no documento
const INCOME: RGB = [20, 122, 58];
const EXPENSE: RGB = [179, 64, 26];

const M = 40; // margem
const W = A4.width - 2 * M;
const BOTTOM = A4.height - 56; // acima do rodapé
const ROW = 17;

// Colunas da tabela (x inicial e largura).
const COLS = { data: [M + 6, 58], tipo: [M + 66, 52], categoria: [M + 120, 118], descricao: [M + 242, 190], valor: [M + W - 6, 80] } as const;

/** Valor com sinal para o extrato (despesa negativa), no formato brasileiro. */
const signedMoney = (cents: number) => (cents < 0 ? `-${formatMoney(-cents)}` : formatMoney(cents));

/**
 * Extrato mensal em PDF (A4, várias páginas). Todos os valores vêm de `Statement`, os
 * mesmos do CSV e da tela Finanças.
 */
export function statementPdf(st: Statement, appVersion: string): Uint8Array {
  const doc = new PdfDocument({ title: `Extrato de ${st.monthTitle.toLowerCase()} — Ofício`, creator: `Ofício v${appVersion}` });
  const generated = `${st.generatedAt.toLocaleDateString('pt-BR')} ${st.generatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  let page = doc.addPage();
  let y = M;

  // Cabeçalho da primeira página.
  page.rect(M, y, W, 3, BRAND);
  y += 26;
  page.text(M, y, `Extrato de ${st.monthTitle.toLowerCase()}`, { size: 18, font: 'bold', color: BRAND });
  y += 18;
  const who = [st.name, st.businessName].filter(Boolean).join(' · ');
  if (who) {
    page.text(M, y, fitText(who, W, 10), { size: 10, color: INK });
    y += 14;
  }
  page.text(M, y, `Gerado em ${generated} pelo Ofício v${appVersion}`, { size: 8.5, color: MUTED });
  y += 22;

  // Resumo do mês.
  const boxW = (W - 16) / 3;
  const summary: [string, number, RGB][] = [
    ['Receitas', st.totals.income, INCOME],
    ['Despesas', -st.totals.expense, EXPENSE],
    ['Saldo do mês', st.totals.balance, st.totals.balance < 0 ? EXPENSE : INCOME],
  ];
  summary.forEach(([label, value, c], i) => {
    const x = M + i * (boxW + 8);
    page.rect(x, y, boxW, 46, ZEBRA);
    page.text(x + 10, y + 16, label, { size: 8.5, color: MUTED });
    page.text(x + 10, y + 35, fitText(signedMoney(value), boxW - 20, 13, 'bold'), { size: 13, font: 'bold', color: c });
  });
  y += 46 + 20;

  // Por categoria (receitas e despesas lado a lado).
  const half = (W - 16) / 2;
  const catBlock = (x: number, title: string, items: { category: string; amount: number }[], c: RGB, startY: number) => {
    let yy = startY;
    page.text(x, yy, title, { size: 9, font: 'bold', color: INK });
    yy += 13;
    if (!items.length) {
      page.text(x, yy, 'Nenhum lançamento', { size: 8.5, color: MUTED });
      return yy + 12;
    }
    for (const it of items) {
      page.text(x, yy, fitText(it.category, half - 100, 8.5), { size: 8.5, color: INK });
      page.text(x + half, yy, formatMoney(it.amount), { size: 8.5, color: c, align: 'right' });
      yy += 12;
    }
    return yy;
  };
  if (st.rows.length) {
    const end = Math.max(
      catBlock(M, 'Receitas por categoria', st.incomeByCategory, INCOME, y),
      catBlock(M + half + 16, 'Despesas por categoria', st.expenseByCategory, EXPENSE, y),
    );
    y = end + 14;
  }

  // Tabela de lançamentos.
  const header = (p: PdfPage, at: number) => {
    p.rect(M, at, W, ROW + 2, HEAD);
    const ty = at + 12.5;
    p.text(COLS.data[0], ty, 'Data', { size: 8.5, font: 'bold' });
    p.text(COLS.tipo[0], ty, 'Tipo', { size: 8.5, font: 'bold' });
    p.text(COLS.categoria[0], ty, 'Categoria', { size: 8.5, font: 'bold' });
    p.text(COLS.descricao[0], ty, 'Descrição', { size: 8.5, font: 'bold' });
    p.text(COLS.valor[0], ty, 'Valor (R$)', { size: 8.5, font: 'bold', align: 'right' });
    return at + ROW + 2;
  };

  page.text(M, y, `Lançamentos (${st.rows.length})`, { size: 11, font: 'bold', color: INK });
  y += 10;
  if (!st.rows.length) {
    page.text(M, y + 14, 'Nenhum lançamento neste mês.', { size: 10, color: MUTED });
  } else {
    y = header(page, y);
    st.rows.forEach((r, i) => {
      if (y + ROW > BOTTOM) {
        page = doc.addPage();
        y = header(page, M);
      }
      if (i % 2 === 1) page.rect(M, y, W, ROW, ZEBRA);
      const ty = y + 12;
      const signed = r.type === 'receita' ? r.amount : -r.amount;
      page.text(COLS.data[0], ty, dateBR(r.date), { size: 8.5 });
      page.text(COLS.tipo[0], ty, typeLabel(r.type), { size: 8.5, color: r.type === 'receita' ? INCOME : EXPENSE });
      page.text(COLS.categoria[0], ty, fitText(r.category, COLS.categoria[1] - 6, 8.5), { size: 8.5 });
      page.text(COLS.descricao[0], ty, fitText(rowDescription(r) || '—', COLS.descricao[1] - 6, 8.5), { size: 8.5, color: r.description ? INK : MUTED });
      page.text(COLS.valor[0], ty, centsPlain(signed), { size: 8.5, font: 'bold', color: r.type === 'receita' ? INCOME : EXPENSE, align: 'right' });
      y += ROW;
    });
    page.line(M, y, M + W, y, LINE);
  }

  // Rodapé com paginação em todas as páginas.
  const total = doc.pages.length;
  doc.pages.forEach((p, i) => {
    p.line(M, A4.height - 40, M + W, A4.height - 40, LINE);
    p.text(M, A4.height - 26, `Ofício · Extrato de ${st.monthTitle.toLowerCase()}`, { size: 8, color: MUTED });
    p.text(M + W, A4.height - 26, `Página ${i + 1} de ${total}`, { size: 8, color: MUTED, align: 'right' });
  });
  return doc.toBytes();
}
