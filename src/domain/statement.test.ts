import { writeFileSync } from 'node:fs';
import { statementPdf } from '../lib/statementPdf';
import { fitText, textWidth, winAnsi } from '../lib/pdf';
import { emptyData } from '../state/service';
import { buildStatement, centsPlain, csvText, dateBR, statementCsv } from './statement';
import type { AppData, Transaction } from './types';

const tx = (i: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${i}`,
  type: i % 3 === 0 ? 'despesa' : 'receita',
  amount: 1000 + i * 137,
  description: `Lançamento ${i}`,
  category: i % 3 === 0 ? 'Produtos' : 'Atendimento',
  date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
  appointmentId: null,
  createdAt: `2026-11-01T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...over,
});

function data(transactions: Transaction[]): AppData {
  return { ...emptyData(), profile: { name: 'Ana Souza', businessName: 'Studio Ana Beleza', professionId: 'beleza', weeklyGoalServices: 10, monthlyGoalRevenue: 500000, createdAt: '2026-01-01T00:00:00.000Z' } as AppData['profile'], transactions };
}

const NOW = new Date(2026, 10, 4, 10, 30);
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('Extrato — dados', () => {
  it('só o mês pedido, em ordem cronológica, com os mesmos totais da tela', () => {
    const st = buildStatement(data([tx(1, { date: '2026-11-20' }), tx(2, { date: '2026-11-03' }), tx(3, { date: '2026-10-31' }), tx(4, { date: '2026-12-01' })]), '2026-11', NOW);
    expect(st.rows.map((r) => r.date)).toEqual(['2026-11-03', '2026-11-20']);
    expect(st.totals.income).toBe(tx(1).amount + tx(2).amount);
    expect(st.totals.expense).toBe(0);
    expect(st.monthTitle).toBe('Novembro de 2026');
  });

  it('não altera os dados de origem', () => {
    const d = data([tx(1), tx(2)]);
    const before = JSON.stringify(d);
    statementCsv(buildStatement(d, '2026-11', NOW));
    statementPdf(buildStatement(d, '2026-11', NOW), '0.4.0');
    expect(JSON.stringify(d)).toBe(before);
  });

  it('datas e valores sem erro de fuso nem de arredondamento', () => {
    expect(dateBR('2026-11-01')).toBe('01/11/2026');
    expect(centsPlain(0)).toBe('0,00');
    expect(centsPlain(5)).toBe('0,05');
    expect(centsPlain(123456)).toBe('1234,56');
    expect(centsPlain(-8500)).toBe('-85,00');
    expect(centsPlain(100_000_000)).toBe('1000000,00');
  });
});

describe('Extrato — CSV (Excel em português)', () => {
  it('BOM UTF-8, ";", CRLF, vírgula decimal, despesa negativa e acentos preservados', () => {
    const st = buildStatement(data([tx(1, { description: 'Coloração e escova', amount: 12345 }), tx(3, { description: '', amount: 8500, date: '2026-11-04' })]), '2026-11', NOW);
    const csv = statementCsv(st);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Data;Tipo;Categoria;Descrição;Valor (R$)');
    expect(lines[1]).toBe('02/11/2026;Receita;Atendimento;Coloração e escova;123,45');
    expect(lines[2]).toBe('04/11/2026;Despesa;Produtos;;-85,00'); // descrição opcional vazia
    expect(lines[3]).toBe('');
    expect(lines).toHaveLength(4);
  });

  it('soma das linhas confere com o saldo do mês', () => {
    const rows = Array.from({ length: 90 }, (_, i) => tx(i + 1));
    const st = buildStatement(data(rows), '2026-11', NOW);
    const sum = statementCsv(st).slice(1).trim().split('\r\n').slice(1)
      .map((l) => l.split(';').at(-1)!)
      .reduce((s, v) => s + Math.round(Number(v.replace(',', '.')) * 100), 0);
    expect(sum).toBe(st.totals.balance);
    expect(st.rows).toHaveLength(90);
  });

  it('protege contra fórmulas e escapa ; " e quebras de linha', () => {
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvText('+55 11')).toBe("'+55 11");
    expect(csvText('-desconto')).toBe("'-desconto");
    expect(csvText('@cmd')).toBe("'@cmd");
    expect(csvText('a;b')).toBe('"a;b"');
    expect(csvText('linha\r\nnova')).toBe('"linha\nnova"');
    expect(csvText('Normal')).toBe('Normal');
  });

  it('dados de demonstração aparecem identificados', () => {
    const csv = statementCsv(buildStatement(data([tx(1, { isDemo: true, description: 'Corte' })]), '2026-11', NOW));
    expect(csv).toContain(';Corte (demonstração);');
  });
});

describe('Extrato — PDF', () => {
  it('texto em WinAnsi: acentos do português, cedilha, travessão e reticências', () => {
    expect(winAnsi('ção…—€')).toEqual([0xe7, 0xe3, 0x6f, 0x85, 0x97, 0x80]);
    expect(winAnsi('R$ 1,00')).toEqual(winAnsi('R$ 1,00'));
    expect(winAnsi('🙂')).toEqual([63]);
    expect(textWidth('ABC', 10)).toBeCloseTo((667 + 667 + 722) / 100, 5);
    const cut = fitText('Equipamentos e mobiliário para a nova bancada de atendimento', 120, 8.5);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 8.5)).toBeLessThanOrEqual(120);
  });

  it('um mês longo vira várias páginas, com xref válido e paginação', () => {
    const rows = Array.from({ length: 120 }, (_, i) => tx(i + 1, i === 5 ? { description: 'Equipamentos e mobiliário para a nova bancada de atendimento (parcelado)' } : {}));
    const st = buildStatement(data(rows), '2026-11', NOW);
    const bytes = statementPdf(st, '0.4.0-beta.3');
    if (process.env.OFICIO_PDF_OUT) writeFileSync(process.env.OFICIO_PDF_OUT, bytes);
    const s = latin1(bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const pages = Number(s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)![1]);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(s).toContain(`(P\\341gina 1 de ${pages})`);
    expect(s).toContain(`(P\\341gina ${pages} de ${pages})`);
    // Cada entrada do xref aponta exatamente para o início do objeto.
    const xrefAt = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // Comprimento declarado de cada stream confere.
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
    // Todas as linhas estão no documento (cada valor aparece).
    for (const r of st.rows) expect(s).toContain(`(${(r.type === 'receita' ? '' : '-') + centsPlain(r.amount)})`);
  });

  it('mês sem lançamentos gera uma página com aviso', () => {
    const s = latin1(statementPdf(buildStatement(data([]), '2026-11', NOW), '0.4.0'));
    expect(s).toContain('/Count 1');
    expect(s).toContain('(Nenhum lan\\347amento neste m\\352s.)');
  });
});
