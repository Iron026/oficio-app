"""Gera src/lib/pdfFontWidths.ts: larguras da Helvetica (via Liberation Sans, métricas
compatíveis) para os códigos WinAnsi 32–255. Uso: python3 scripts/pdf-larguras.py"""
import json
from fontTools.ttLib import TTFont

FONTS = '/usr/share/fonts/truetype/liberation/LiberationSans-{}.ttf'


def table(style):
    f = TTFont(FONTS.format(style))
    cmap, hm, upm = f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm
    out = []
    for code in range(32, 256):
        try:
            ch = bytes([code]).decode('cp1252')
        except UnicodeDecodeError:
            out.append(0)
            continue
        g = cmap.get(ord(ch))
        out.append(round(hm[g][0] * 1000 / upm) if g else 0)
    return out


TS = '''/**
 * Larguras (1/1000 em) da Helvetica e Helvetica-Bold para os códigos WinAnsi 32–255.
 * Geradas de Liberation Sans (métricas compatíveis com Arial/Helvetica) por
 * scripts/pdf-larguras.py (fontTools). 0 = código sem caractere.
 */
export const HELVETICA: readonly number[] = %s;
export const HELVETICA_BOLD: readonly number[] = %s;
'''
open('src/lib/pdfFontWidths.ts', 'w').write(TS % (json.dumps(table('Regular')), json.dumps(table('Bold'))))
