// Gera o favicon (public/icon.svg), os ícones do Android (mipmap-*) e as telas de abertura
// (drawable*/splash.png, Android 11 e anteriores) da logomarca opção A.
// A geometria é a de src/ui/brand.ts (src/ui/brand.test.ts confere que continuam iguais).
// Uso: node scripts/icone-app.mjs   (precisa do Chromium do Playwright)
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright-core');

const L = {
  squircle: 'M32 2C55 2 62 9 62 32S55 62 32 62 2 55 2 32 9 2 32 2Z',
  arch: 'M19.5 42 32 20l12.5 22',
  archWidth: 5,
  dot: { cx: 32, cy: 41.2, r: 3.4 },
  gold: '#fbbf24',
  top: '#159a8b',
  bottom: '#0d5a54',
};
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.top}"/><stop offset="1" stop-color="${L.bottom}"/></linearGradient></defs>`;
const glyph = `<path d="${L.arch}" fill="none" stroke="#fff" stroke-width="${L.archWidth}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${L.dot.cx}" cy="${L.dot.cy}" r="${L.dot.r}" fill="${L.gold}"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${grad}${body}</svg>`;

const SVGS = {
  // Ícone tradicional (Android < 8 e lojas): squircle com o símbolo.
  ic_launcher: svg(`<path d="${L.squircle}" fill="url(#g)"/>${glyph}`),
  ic_launcher_round: svg(`<circle cx="32" cy="32" r="30" fill="url(#g)"/>${glyph}`),
  // Ícone adaptável (Android 8+): fundo em degradê e símbolo por cima (o sistema recorta a forma).
  ic_launcher_background: svg(`<rect width="64" height="64" fill="url(#g)"/>`),
  ic_launcher_foreground: svg(glyph),
};
writeFileSync('public/icon.svg', SVGS.ic_launcher + '\n');

const SIZES = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const b = await chromium.launch();
for (const [density, px] of Object.entries(SIZES)) {
  for (const [name, code] of Object.entries(SVGS)) {
    const p = await b.newPage({ viewport: { width: px, height: px } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${code.replace('<svg ', `<svg width="${px}" height="${px}" `)}</body></html>`);
    await p.screenshot({ path: `android/app/src/main/res/mipmap-${density}/${name}.png`, omitBackground: name !== 'ic_launcher_background' });
    await p.close();
  }
}

// Telas de abertura: petróleo (#0F7B71, o mesmo de capacitor.config.ts e @color/splash_background),
// símbolo no centro e o nome em Manrope logo abaixo. Mantém o tamanho de cada arquivo existente.
const SPLASH_BG = '#0f7b71';
const font = readFileSync('node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2').toString('base64');
const RES = 'android/app/src/main/res';
const splashes = readdirSync(RES).filter((d) => d.startsWith('drawable') && existsSync(`${RES}/${d}/splash.png`));
for (const dir of splashes) {
  const file = `${RES}/${dir}/splash.png`;
  const head = readFileSync(file).subarray(16, 24);
  const w = head.readUInt32BE(0), h = head.readUInt32BE(4);
  const unit = Math.min(w, h);
  const mark = Math.round(unit * 0.3); // símbolo (área 64) ocupa 30% do lado menor
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<html><head><style>@font-face{font-family:M;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}</style></head>
    <body style="margin:0;width:${w}px;height:${h}px;background:${SPLASH_BG};display:grid;place-items:center">
    <div style="display:grid;justify-items:center;gap:${Math.round(unit * 0.005)}px">
      <svg width="${mark}" height="${mark}" viewBox="0 0 64 64">${glyph}</svg>
      <span style="font:800 ${Math.round(unit * 0.085)}px M,sans-serif;color:#fff;letter-spacing:-0.02em;margin-top:-${Math.round(mark * 0.27)}px">Ofício</span>
    </div></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file });
  await p.close();
}
await b.close();
console.log(`Ícones e ${splashes.length} telas de abertura gerados.`);
