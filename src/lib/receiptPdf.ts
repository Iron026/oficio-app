import { amountInWords, type Receipt } from '../domain/receipt';
import { dateBR } from '../domain/statement';
import { formatMoney } from './money';
import { A4, PdfDocument, fitText, textWidth, wrapText, type PdfPage, type RGB } from './pdf';

const INK: RGB = [17, 24, 28];
const MUTED: RGB = [86, 103, 110];
const LINE: RGB = [216, 225, 227];
const SOFT: RGB = [244, 247, 247];
const BRAND: RGB = [15, 98, 91]; // petróleo 700: identidade do Ofício no documento
const WARN_BG: RGB = [253, 241, 220];
const WARN: RGB = [138, 76, 0];
const DANGER_BG: RGB = [253, 232, 230];
const DANGER: RGB = [160, 38, 24];

const M = 48;
const W = A4.width - 2 * M;
const BOTTOM = A4.height - 70; // acima do rodapé

export const RECEIPT_FOOTER = 'Recibo simples. Não é nota fiscal e não substitui documento fiscal.';

/**
 * Recibo em PDF (A4). Usa o mesmo gerador do extrato (Helvetica, WinAnsi: cobre o português). Textos longos
 * quebram em linhas e, se não couberem, continuam em outra página; o rodapé aparece em todas.
 */
export function receiptPdf(r: Receipt, issuedAt: Date, appVersion: string): Uint8Array {
  const doc = new PdfDocument({ title: `Recibo ${r.number} — Ofício`, creator: `Ofício v${appVersion}` });
  let page = doc.addPage();
  let y = M;
  const ensure = (h: number) => {
    if (y + h <= BOTTOM) return;
    page = doc.addPage();
    y = M;
  };
  const para = (text: string, size: number, opts: { font?: 'regular' | 'bold'; color?: RGB; x?: number; width?: number; gap?: number } = {}) => {
    const x = opts.x ?? M;
    const lines = wrapText(text, opts.width ?? W, size, opts.font);
    for (const line of lines) {
      ensure(size * 1.45);
      page.text(x, y + size, line, { size, font: opts.font, color: opts.color ?? INK });
      y += size * 1.45;
    }
    y += opts.gap ?? 0;
  };

  // Faixa de título.
  page.rect(M, y, W, 64, BRAND);
  page.text(M + 18, y + 30, 'RECIBO', { size: 22, font: 'bold', color: [255, 255, 255] });
  page.text(M + 18, y + 49, 'de pagamento recebido', { size: 10, color: [220, 238, 235] });
  page.text(M + W - 18, y + 30, r.number, { size: 12, font: 'bold', color: [255, 255, 255], align: 'right' });
  page.text(M + W - 18, y + 49, `Pagamento em ${dateBR(r.paymentDate)}`, { size: 10, color: [220, 238, 235], align: 'right' });
  y += 84;

  // Quem emite.
  const issuer = r.issuer.business || r.issuer.name || 'Profissional';
  para(issuer, 14, { font: 'bold' });
  if (r.issuer.business && r.issuer.name) para(r.issuer.name, 10.5, { color: MUTED });
  y += 10;

  // Valor recebido em destaque.
  ensure(70);
  page.rect(M, y, W, 62, SOFT);
  page.text(M + 18, y + 22, 'Valor recebido', { size: 10, color: MUTED });
  page.text(M + 18, y + 48, fitText(formatMoney(r.amount), W - 36, 24, 'bold'), { size: 24, font: 'bold', color: INK });
  y += 80;

  // Declaração.
  const who = r.client ? `Recebi de ${r.client}` : 'Recebi';
  const when = r.serviceDate ? `, realizado em ${dateBR(r.serviceDate)}` : '';
  para(`${who} a quantia de ${formatMoney(r.amount)} (${amountInWords(r.amount)}), referente a ${r.service}${when}.`, 11.5, { gap: 14 });

  // Detalhes.
  const rows: [string, string][] = [
    ['Data do pagamento', dateBR(r.paymentDate)],
    ['Forma de pagamento', r.method ?? 'Não informada'],
    ['Serviço', r.service],
    ...(r.serviceDate ? [['Data do serviço', dateBR(r.serviceDate)] as [string, string]] : []),
    ...(r.client ? [['Cliente', r.client] as [string, string]] : []),
    ['Identificação', r.number],
  ];
  const labelW = 130;
  for (const [label, value] of rows) {
    const lines = wrapText(value, W - labelW - 16, 10.5);
    const h = Math.max(1, lines.length) * 15 + 10;
    ensure(h);
    page.line(M, y, M + W, y, LINE);
    page.text(M + 4, y + 17, label, { size: 10, color: MUTED });
    lines.forEach((line, i) => page.text(M + labelW, y + 17 + i * 15, line, { size: 10.5, font: 'bold' }));
    y += h;
  }
  page.line(M, y, M + W, y, LINE);
  y += 18;

  // Pagamento parcial: o recibo é só do valor recebido neste lançamento.
  if (r.partial) {
    const t = `Pagamento parcial. Este recibo corresponde apenas a ${formatMoney(r.amount)}. Valor combinado do serviço: ${formatMoney(r.partial.contracted)}; recebido até a emissão: ${formatMoney(r.partial.receivedTotal)}.`;
    box(t, WARN_BG, WARN);
  }
  // Situação atual: estornos, sem apagar o histórico.
  if (r.status !== 'valido') {
    const list = r.refunds.map((x) => `${formatMoney(x.amount)} em ${dateBR(x.date)}`).join('; ');
    const t = r.status === 'estornado'
      ? `Situação atual: pagamento estornado integralmente (${list}). Valor líquido: ${formatMoney(Math.max(0, r.net))}.`
      : `Situação atual: pagamento estornado em parte (${list}). Valor líquido: ${formatMoney(r.net)}.`;
    box(t, DANGER_BG, DANGER);
  }
  if (r.inReview) box('Há estornos deste pagamento aguardando revisão no aplicativo; a situação pode mudar.', DANGER_BG, DANGER);

  // Assinatura.
  ensure(70);
  y += 34;
  page.line(M + W / 2 - 120, y, M + W / 2 + 120, y, MUTED, 0.7);
  y += 14;
  const sig = fitText(issuer, 240, 10.5);
  page.text(M + W / 2 - textWidth(sig, 10.5) / 2, y, sig, { size: 10.5, color: INK });

  // Rodapé em todas as páginas.
  const issued = `Emitido em ${issuedAt.toLocaleDateString('pt-BR')} às ${issuedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} pelo Ofício`;
  const total = doc.pages.length;
  doc.pages.forEach((p: PdfPage, i) => {
    p.line(M, A4.height - 52, M + W, A4.height - 52, LINE);
    p.text(M, A4.height - 38, RECEIPT_FOOTER, { size: 8.5, font: 'bold', color: MUTED });
    p.text(M, A4.height - 26, issued, { size: 8, color: MUTED });
    p.text(M + W, A4.height - 26, `${r.number} · página ${i + 1} de ${total}`, { size: 8, color: MUTED, align: 'right' });
  });
  return doc.toBytes();

  function box(text: string, bg: RGB, fg: RGB) {
    const lines = wrapText(text, W - 28, 10);
    const h = lines.length * 14 + 16;
    ensure(h + 10);
    page.rect(M, y, W, h, bg);
    lines.forEach((line, i) => page.text(M + 14, y + 18 + i * 14, line, { size: 10, color: fg }));
    y += h + 10;
  }
}
