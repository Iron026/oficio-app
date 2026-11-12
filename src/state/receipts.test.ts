/**
 * 0.5.0-beta.4 — recibos: só de dinheiro recebido, parcial = valor recebido, situação de estornos, PDF válido
 * (rodapé, acentos, valores altos, nomes longos e quebra de página) e nenhum efeito colateral.
 */
import { receiptFor } from '../domain/receipt';
import { signed } from '../test/backupFile';
import { totalXp } from '../gamification/engine';
import { textWidth, wrapText } from '../lib/pdf';
import { RECEIPT_FOOTER, receiptPdf } from '../lib/receiptPdf';
import { createMemoryAdapter } from '../storage/memory';
import { AppService } from './service';

const clock = new Date(2026, 10, 12, 9, 0);
const now = () => clock;
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
/** Texto como o PDF grava (WinAnsi com acentos em octal). */
const pdfText = (s: string) => s.replace(/[^\x20-\x7e]/g, (ch) => `\\${ch.charCodeAt(0).toString(8).padStart(3, '0')}`).replace(/[()]/g, (c) => `\\${c}`);
/** Todo o texto visível do PDF, linha após linha, juntado por espaço (frases quebradas em linhas voltam a ser uma). */
const visible = (raw: string) => [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
  .map((m) => m[1]!.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\(.)/g, '$1'))
  .join(' ');

async function setup() {
  const s = await AppService.load(createMemoryAdapter(), now);
  await s.completeOnboarding({ name: 'Ana Souza', businessName: 'Studio Ana Beleza & Estética', professionId: 'beleza' });
  const { client } = await s.saveClient({ name: 'Conceição Araújo', phone: '', email: '', address: '', notes: '' });
  const ap = (await s.saveAppointment({ title: 'Coloração', clientId: client.id, date: '2026-11-10', time: '10:00', price: '300,00', notes: '' })).appointment;
  return { s, client, ap };
}

describe('recibos: quando existem', () => {
  it('pagamento parcial: recibo só do valor recebido, com o combinado como contexto', async () => {
    const { s, ap } = await setup();
    await s.completeAppointment(ap.id, { payment: { mode: 'parcial', amount: 10_000, method: 'pix', date: '2026-11-10' } });
    const tx = s.data.transactions.find((t) => t.type === 'receita')!;
    const r = receiptFor(s.data, tx.id)!;
    expect(r).toMatchObject({ amount: 10_000, client: 'Conceição Araújo', service: 'Coloração', paymentDate: '2026-11-10', method: 'Pix', kind: 'pagamento', status: 'valido', partial: { contracted: 30_000, receivedTotal: 10_000 } });
    expect(r.number).toMatch(/^REC-20261110-[0-9A-Z]{4}$/);
  });

  it('não há recibo de pendência, estorno ou despesa', async () => {
    const { s, ap } = await setup();
    const { transaction: p } = await s.registerPayment(ap.id, { amount: 30_000 });
    const { transaction: e } = await s.refundPayment(p!.id, { amount: 5_000 });
    await s.saveTransaction({ type: 'despesa', amount: '10,00', description: 'x', category: 'Produtos', date: '2026-11-10' });
    expect(receiptFor(s.data, e.id)).toBeNull();
    expect(receiptFor(s.data, s.data.transactions.find((t) => t.type === 'despesa' && t.category === 'Produtos')!.id)).toBeNull();
    expect(receiptFor(s.data, 'inexistente')).toBeNull();
  });

  it('estorno parcial e integral aparecem como situação atual; estorno em revisão é sinalizado', async () => {
    const { s, ap } = await setup();
    const { transaction: p } = await s.registerPayment(ap.id, { amount: 30_000, date: '2026-11-10' });
    await s.refundPayment(p!.id, { amount: 5_000, date: '2026-11-11' });
    expect(receiptFor(s.data, p!.id)).toMatchObject({ status: 'estornado-em-parte', refunded: 5_000, net: 25_000, refunds: [{ amount: 5_000, date: '2026-11-11' }], inReview: false });
    await s.refundPayment(p!.id, { amount: 'total', date: '2026-11-12' });
    expect(receiptFor(s.data, p!.id)).toMatchObject({ status: 'estornado', refunded: 30_000, net: 0 });
    // Conflito entre aparelhos: estorno extra importado.
    const json = JSON.parse(s.exportBackup());
    const r = json.data.transactions.find((t: { payment?: { kind?: string } }) => t.payment?.kind === 'estorno');
    json.data.transactions.push({ ...r, id: 'outro', createdAt: '2026-11-12T13:00:00Z' });
    await s.importBackup(signed(json));
    expect(receiptFor(s.data, p!.id)!.inReview).toBe(true);
  });

  it('receita automática da 0.4 (legado) e receita avulsa também têm recibo', async () => {
    const { s, ap } = await setup();
    const json = JSON.parse(s.exportBackup());
    json.data.transactions.push({ id: 'leg', type: 'receita', amount: 30_000, description: 'Coloração', category: 'Atendimento', date: '2026-10-01', appointmentId: ap.id, createdAt: 'a', updatedAt: 'a' });
    await s.importBackup(signed(json));
    expect(receiptFor(s.data, 'leg')).toMatchObject({ kind: 'legado', partial: null, client: 'Conceição Araújo' });
    const { transaction: av } = await s.saveTransaction({ type: 'receita', amount: '50,00', description: 'Venda de produto', category: 'Venda de produtos', date: '2026-11-12' });
    expect(receiptFor(s.data, av.id)).toMatchObject({ kind: 'avulso', client: null, service: 'Venda de produto' });
  });
});

describe('recibos: PDF', () => {
  it('PDF válido com rodapé obrigatório, acentos, valor por extenso e situação', async () => {
    const { s, ap } = await setup();
    const { transaction: p } = await s.registerPayment(ap.id, { amount: 12_345, date: '2026-11-10' });
    await s.refundPayment(p!.id, { amount: 2_345, date: '2026-11-11' });
    const bytes = receiptPdf(receiptFor(s.data, p!.id)!, clock, '0.5.0-beta.4');
    const txt = latin1(bytes);
    expect(txt.startsWith('%PDF-1.4')).toBe(true);
    expect(txt.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(txt).toContain(pdfText(RECEIPT_FOOTER));
    expect(txt).toContain(pdfText('Conceição Araújo'));
    const text = visible(txt);
    expect(text).toContain('(cento e vinte e três reais e quarenta e cinco centavos), referente a Coloração, realizado em 10/11/2026.');
    expect(text).toContain('Situação atual: pagamento estornado em parte');
    expect(text).toContain('Pagamento parcial.');
  });

  it('nomes muito longos quebram dentro da margem; valores altos; várias páginas mantêm o rodapé', async () => {
    const { s } = await setup();
    const long = 'Maria Aparecida dos Santos Figueiredo de Albuquerque e Vasconcellos '.repeat(30).trim();
    const { client } = await s.saveClient({ name: long.slice(0, 80), phone: '', email: '', address: '', notes: '' });
    const ap = (await s.saveAppointment({ title: `Pacote noiva completo ${'com prova '.repeat(6)}`.slice(0, 80), clientId: client.id, date: '2026-11-10', time: '', price: '1.000.000,00', notes: '' })).appointment;
    const { transaction: p } = await s.registerPayment(ap.id, { amount: 99_999_999, date: '2026-11-10' });
    const r = receiptFor(s.data, p!.id)!;
    const bytes = receiptPdf({ ...r, service: long }, clock, '0.5.0-beta.4');
    const txt = latin1(bytes);
    const pages = (txt.match(/\/Type \/Page /g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(1);
    expect((txt.match(new RegExp(pdfText(RECEIPT_FOOTER).replace(/[\\()]/g, '\\$&'), 'g')) ?? []).length).toBe(pages);
    expect(visible(txt)).toContain('novecentos e noventa e nove mil novecentos e noventa e nove reais e noventa e nove centavos');
    for (const line of wrapText(long, 499, 11.5)) expect(textWidth(line, 11.5)).toBeLessThanOrEqual(499);
  });

  it('emitir recibo não cria lançamento, receita nem XP', async () => {
    const { s, ap } = await setup();
    const { transaction: p } = await s.registerPayment(ap.id, { amount: 30_000 });
    const before = JSON.stringify(s.data);
    const xp = totalXp(s.data.xpEvents);
    receiptPdf(receiptFor(s.data, p!.id)!, clock, 'x');
    expect(JSON.stringify(s.data)).toBe(before);
    expect(totalXp(s.data.xpEvents)).toBe(xp);
  });
});
