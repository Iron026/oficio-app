import { HELVETICA, HELVETICA_BOLD } from './pdfFontWidths';

/**
 * Gerador de PDF mínimo, sem dependências: páginas A4, Helvetica/Helvetica-Bold
 * (fontes padrão de todo leitor de PDF, codificação WinAnsi — cobre o português),
 * texto, retângulos e linhas. Coordenadas em pontos com origem no canto SUPERIOR esquerdo.
 */
export const A4 = { width: 595.28, height: 841.89 };

export type Font = 'regular' | 'bold';
export type RGB = readonly [number, number, number];

const CP1252_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Texto → códigos WinAnsi (caracteres fora dela viram "?"). Espaços especiais viram espaço comum. */
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize('NFC').replace(/[\u00a0\u202f\u2007]/g, ' ').replace(/[\r\n\t]+/g, ' ')) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c < 127) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else out.push(CP1252_EXTRA[ch] ?? 63);
  }
  return out;
}

export function textWidth(text: string, size: number, font: Font = 'regular'): number {
  const w = font === 'bold' ? HELVETICA_BOLD : HELVETICA;
  return winAnsi(text).reduce((sum, c) => sum + (w[c - 32] || 556), 0) * (size / 1000);
}

/** Corta o texto para caber na largura, terminando com "…". */
export function fitText(text: string, maxWidth: number, size: number, font: Font = 'regular'): string {
  if (textWidth(text, size, font) <= maxWidth) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(chars.slice(0, mid).join('').trimEnd() + '…', size, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '…' : chars.slice(0, lo).join('').trimEnd() + '…';
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const color = ([r, g, b]: RGB) => `${num(r / 255)} ${num(g / 255)} ${num(b / 255)}`;
const pdfString = (codes: number[]) =>
  '(' + codes.map((c) => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 128 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0'))).join('') + ')';

/** Texto dos metadados (título, autor): UTF-16BE em hexadecimal, como pede a especificação. */
const utf16 = (text: string) => '<FEFF' + [...text].map((ch) => {
  const c = ch.codePointAt(0)!;
  const units = c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c];
  return units.map((u) => u.toString(16).toUpperCase().padStart(4, '0')).join('');
}).join('') + '>';

export class PdfPage {
  readonly ops: string[] = [];
  text(x: number, y: number, text: string, opts: { size?: number; font?: Font; color?: RGB; align?: 'left' | 'right' } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? 'regular';
    const px = opts.align === 'right' ? x - textWidth(text, size, font) : x;
    this.ops.push(`BT /${font === 'bold' ? 'F2' : 'F1'} ${num(size)} Tf ${color(opts.color ?? [17, 24, 28])} rg ${num(px)} ${num(A4.height - y)} Td ${pdfString(winAnsi(text))} Tj ET`);
  }
  rect(x: number, y: number, w: number, h: number, fill: RGB) {
    this.ops.push(`${color(fill)} rg ${num(x)} ${num(A4.height - y - h)} ${num(w)} ${num(h)} re f`);
  }
  line(x1: number, y1: number, x2: number, y2: number, stroke: RGB, width = 0.5) {
    this.ops.push(`${color(stroke)} RG ${num(width)} w ${num(x1)} ${num(A4.height - y1)} m ${num(x2)} ${num(A4.height - y2)} l S`);
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(private readonly info: { title: string; creator: string }) {}
  addPage(): PdfPage {
    const p = new PdfPage();
    this.pages.push(p);
    return p;
  }
  /** Bytes do arquivo PDF 1.4. */
  toBytes(): Uint8Array {
    const objs: string[] = [];
    const add = (body: string) => objs.push(body); // número do objeto = posição + 1
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // Pages (preenchido depois)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    add(`<< /Title ${utf16(this.info.title)} /Creator ${utf16(this.info.creator)} /Producer ${utf16('Ofício')} >>`);
    const kids: number[] = [];
    for (const page of this.pages) {
      const content = page.ops.join('\n');
      add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const contentId = objs.length;
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
      kids.push(objs.length);
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // Todo o conteúdo é ASCII (textos acentuados vão como \ooo), exceto o comentário binário.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
