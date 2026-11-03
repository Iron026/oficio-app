// Rede de segurança visual do Ofício.
//
// Gera capturas de referência das telas principais em larguras de celular (Galaxy S26),
// tablet e computador, nos temas claro e escuro, com relógio fixo e dados criados pela
// própria interface. Em cada captura também verifica:
//   - transbordo horizontal da página (falha);
//   - erros de JavaScript na página (falha);
//   - acessibilidade com axe-core (WCAG 2.1 AA). Contraste só falha com --strict;
//   - sobreposição do botão flutuante sobre o fim da lista (falha).
//
// Uso:  npm run build && node e2e/visual.mjs [--out visual-results] [--strict]
//        [--scale 2] [--dist outra-pasta-de-build] [--viewports celular-360,celular-412]
// Não grava nada fora da pasta de saída e não acessa a internet nem o Firebase.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = opt('out', 'visual-results');
const STRICT = args.includes('--strict');
const PORT = Number(opt('port', '4317'));
const SCALE = Number(opt('scale', '1'));
const DIST = opt('dist', 'dist');
const ONLY = opt('viewports', '');
const BASE = `http://localhost:${PORT}/`;
// Quarta-feira, 4 de novembro de 2026, 10h30 em Brasília: datas e saudação estáveis.
const NOW = new Date('2026-11-04T10:30:00-03:00');

const VIEWPORTS = [
  { id: 'celular-360', width: 360, height: 780, mobile: true }, // Galaxy S26
  { id: 'celular-412', width: 412, height: 915, mobile: true }, // celulares maiores
  { id: 'tablet-820', width: 820, height: 1180, mobile: true },
  { id: 'computador-1280', width: 1280, height: 800, mobile: false },
];
const THEMES = ['claro', 'escuro'];
const SELECTED = ONLY ? VIEWPORTS.filter((v) => ONLY.split(',').includes(v.id)) : VIEWPORTS;
const SCREENS = [
  { id: 'painel', hash: '#/painel' },
  { id: 'agenda', hash: '#/agenda' },
  { id: 'clientes', hash: '#/clientes' },
  { id: 'financas', hash: '#/financas' },
  { id: 'evolucao', hash: '#/evolucao' },
  { id: 'ajustes', hash: '#/ajustes' },
];

mkdirSync(OUT, { recursive: true });
const report = { geradoEm: new Date().toISOString(), relogio: NOW.toISOString(), estrito: STRICT, capturas: [], falhas: [], avisos: [] };
const fail = (msg) => { report.falhas.push(msg); console.log(`  ✗ ${msg}`); };
const warn = (msg) => { report.avisos.push(msg); console.log(`  ! ${msg}`); };

// ---------------------------------------------------------------- servidor local (dist/)
// A porta precisa estar livre: um servidor antigo serviria outro build sem aviso.
if (await fetch(BASE).then(() => true, () => false)) throw new Error(`A porta ${PORT} já está em uso; encerre o servidor anterior ou use --port.`);
// Grupo de processos próprio: encerrar o `npx` também encerra o `vite` filho.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', DIST], { stdio: 'ignore', detached: true });
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* já encerrado */ } };
process.on('exit', stopServer);
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* ainda subindo */ }
  if (i > 60) throw new Error('vite preview não respondeu (rode `npm run build` antes).');
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function newPage(vp, theme) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: SCALE,
    isMobile: vp.mobile, hasTouch: vp.mobile, colorScheme: theme === 'escuro' ? 'dark' : 'light',
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  page.on('pageerror', (e) => fail(`erro de JavaScript (${vp.id}/${theme}): ${e.message}`));
  return { ctx, page };
}

/** Espera os avisos temporários sumirem para a captura não depender do tempo. */
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('[role="status"] > *'), null, { timeout: 8000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------- dados pela interface
async function seed(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: /começar/i }).click();
  await page.getByRole('radio', { name: /beleza/i }).click();
  await page.getByRole('button', { name: /continuar/i }).click();
  await page.getByLabel(/seu nome/i).fill('Ana Souza');
  await page.getByLabel(/nome do negócio/i).fill('Studio Ana Beleza');
  await page.getByRole('button', { name: /entrar no ofício/i }).click();
  await page.getByRole('navigation', { name: /navegação principal/i }).waitFor();

  const clients = [
    ['Maria Oliveira', '11912340001'],
    ['Juliana Ramos de Albuquerque', '11912340002'],
    ['Carla Mendes', '11912340003'],
    ['Fernanda Lima', '11912340004'],
    ['Maria Aparecida dos Santos Figueiredo de Albuquerque', '11912340005'], // nome longo
  ];
  for (const [name, phone] of clients) {
    await page.getByRole('button', { name: /^cliente$/i }).click();
    const form = page.getByRole('dialog', { name: /novo cliente/i });
    await form.getByLabel(/^nome/i).fill(name);
    await form.getByLabel(/telefone/i).fill(phone);
    await form.getByRole('button', { name: /cadastrar cliente/i }).click();
    await form.waitFor({ state: 'detached' });
  }

  const appts = [
    ['Escova modelada', 'Fernanda Lima', '2026-11-04', '09:00', '60,00', true],
    ['Corte e escova', 'Maria Oliveira', '2026-11-04', '14:00', '90,00', false],
    ['Coloração completa com hidratação profunda', 'Juliana Ramos de Albuquerque', '2026-11-04', '16:30', '280,00', false],
    ['Manicure e pedicure', 'Carla Mendes', '2026-11-05', '09:30', '45,00', false],
    ['Penteado para casamento', 'Maria Oliveira', '2026-11-07', '08:00', '180,00', false],
    // valor alto e título longo, concluído (gera receita alta no mês)
    ['Pacote noiva completo com maquiagem, penteado e prova', 'Maria Aparecida dos Santos Figueiredo de Albuquerque', '2026-11-04', '07:30', '12.480,00', true],
    // data passada ainda não concluída: aparece como "Pendente"
    ['Hidratação capilar', 'Carla Mendes', '2026-11-03', '15:00', '75,00', false],
  ];
  for (const [title, client, date, time, price, done] of appts) {
    await page.getByRole('button', { name: /^agendar$/i }).first().click();
    const form = page.getByRole('dialog');
    await form.getByLabel(/descrição/i).fill(title);
    await form.getByLabel(new RegExp(clientLabel, 'i')).selectOption({ label: client });
    await form.getByLabel(/^data/i).fill(date);
    await form.getByLabel(/horário/i).fill(time);
    await form.getByLabel(/valor/i).fill(price);
    await form.getByRole('button', { name: /^agendar$/i }).click();
    await form.waitFor({ state: 'detached' });
    if (done) {
      await page.goto(BASE + '#/agenda');
      await page.getByRole('button', { name: new RegExp(title, 'i') }).first().click();
      await page.getByRole('button', { name: /concluir/i }).first().click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      await page.goto(BASE + '#/painel');
    }
  }

  const expenses = [
    ['85,00', 'Produtos de coloração', '2026-11-04'],
    ['3.250,00', 'Equipamentos e mobiliário para a nova bancada de atendimento', '2026-11-02'], // valor alto
    ['450,00', 'Aluguel da cadeira', '2026-10-20'], // mês anterior com saldo negativo
  ];
  for (const [amount, description, date] of expenses) {
    await page.getByRole('button', { name: /^despesa$/i }).click();
    const tx = page.getByRole('dialog');
    await tx.getByLabel(/valor/i).fill(amount);
    await tx.getByLabel(/descrição/i).fill(description);
    await tx.getByLabel(/categoria/i).selectOption({ index: 1 });
    await tx.getByLabel(/^data/i).fill(date);
    await tx.getByRole('button', { name: /registrar/i }).click();
    await tx.waitFor({ state: 'detached' });
  }
  await settle(page);
}
// Rótulo do campo de cliente na profissão Beleza (vem de profession.terms).
const clientLabel = '^cliente';

// ---------------------------------------------------------------- verificações
async function checks(page, tag) {
  const m = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    // Botão flutuante x último item da lista, rolando até o fim.
    window.scrollTo(0, document.documentElement.scrollHeight);
    const fab = [...document.querySelectorAll('body > button')].find((b) => getComputedStyle(b).position === 'fixed');
    // Cartões = elementos do conteúdo com borda visível.
    const cards = [...document.querySelectorAll('main *')].filter((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0);
    let fabOverlap = 0;
    if (fab) {
      const a = fab.getBoundingClientRect();
      for (const c of cards) {
        const b = c.getBoundingClientRect();
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        fabOverlap = Math.max(fabOverlap, Math.round(x * y));
      }
    }
    window.scrollTo(0, 0);
    return { overflow, fabOverlap };
  });
  if (m.overflow > 0) fail(`${tag}: transbordo horizontal de ${m.overflow}px`);
  if (m.fabOverlap > 0) fail(`${tag}: botão flutuante cobre o último item da lista (${m.fabOverlap}px²)`);

  await page.addScriptTag({ content: axeSource });
  const axe = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, exemplos: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  });
  for (const v of axe) {
    const msg = `${tag}: axe ${v.id} (${v.impact}) em ${v.count} elemento(s) — ${v.exemplos.join(' | ')}`;
    if (v.id === 'color-contrast' && !STRICT) warn(msg);
    else fail(msg);
  }
  return { ...m, axe };
}

async function capture(page, vp, theme, id, opts = {}) {
  await settle(page);
  const file = `${vp.id}-${theme}-${id}.png`;
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: !!opts.full });
  const tag = `${vp.id}/${theme}/${id}`;
  const result = opts.skipChecks ? {} : await checks(page, tag);
  report.capturas.push({ arquivo: file, viewport: vp.id, tema: theme, tela: id, ...result });
}

// ---------------------------------------------------------------- execução
try {
  for (const vp of SELECTED) {
    for (const theme of THEMES) {
      console.log(`• ${vp.id} · ${theme}`);
      // Primeira abertura (sem dados).
      const fresh = await newPage(vp, theme);
      await fresh.page.goto(BASE);
      await fresh.page.getByRole('button', { name: /começar/i }).waitFor();
      await capture(fresh.page, vp, theme, 'boas-vindas');
      await fresh.page.getByRole('button', { name: /começar/i }).click();
      await capture(fresh.page, vp, theme, 'profissao');
      // Estados vazios: cadastro concluído, sem nenhum registro.
      await fresh.page.getByRole('radio', { name: /beleza/i }).click();
      await fresh.page.getByRole('button', { name: /continuar/i }).click();
      await fresh.page.getByLabel(/seu nome/i).fill('Ana Souza');
      await fresh.page.getByRole('button', { name: /entrar no ofício/i }).click();
      for (const s of SCREENS.filter((x) => ['painel', 'agenda', 'clientes', 'financas'].includes(x.id))) {
        await fresh.page.goto(BASE + s.hash);
        await fresh.page.getByRole('navigation', { name: /navegação principal/i }).waitFor();
        await capture(fresh.page, vp, theme, `vazio-${s.id}`);
      }
      await fresh.ctx.close();

      const { ctx, page } = await newPage(vp, theme);
      await seed(page);
      for (const s of SCREENS) {
        await page.goto(BASE + s.hash);
        await page.getByRole('navigation', { name: /navegação principal/i }).waitFor();
        await capture(page, vp, theme, s.id);
        if (vp.id === 'celular-360' && ['painel', 'evolucao', 'agenda'].includes(s.id)) {
          await capture(page, vp, theme, `${s.id}-inteira`, { full: true, skipChecks: true });
        }
      }
      await page.goto(BASE + '#/financas');
      await page.getByRole('button', { name: /mês anterior/i }).click();
      await capture(page, vp, theme, 'financas-mes-anterior');
      if (vp.id === 'celular-360') {
        await page.goto(BASE + '#/clientes');
        await capture(page, vp, theme, 'clientes-inteira', { full: true, skipChecks: true });
        await page.goto(BASE + '#/financas');
        await capture(page, vp, theme, 'financas-inteira', { full: true, skipChecks: true });
      }
      await page.goto(BASE + '#/clientes');
      await page.getByRole('button', { name: /^cliente$/i }).click();
      await page.getByRole('dialog').waitFor();
      await capture(page, vp, theme, 'formulario-cliente');
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  stopServer();
}

// ---------------------------------------------------------------- relatório
writeFileSync(`${OUT}/relatorio.json`, JSON.stringify(report, null, 2));
const cards = report.capturas.map((c) => `<figure><img loading="lazy" src="${c.arquivo}" alt=""><figcaption>${c.viewport} · ${c.tema} · ${c.tela}</figcaption></figure>`).join('\n');
writeFileSync(`${OUT}/index.html`, `<!doctype html><meta charset="utf-8"><title>Capturas do Ofício</title>
<style>body{font:14px system-ui;margin:16px;background:#f4f7f7}main{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
figure{margin:0;max-width:420px}img{max-width:100%;border:1px solid #ccd;border-radius:8px;background:#fff}li{margin:2px 0}</style>
<h1>Capturas do Ofício</h1><p>Relógio: ${report.relogio}. Falhas: ${report.falhas.length}. Avisos: ${report.avisos.length}.</p>
<details><summary>Falhas e avisos</summary><ul>${[...report.falhas, ...report.avisos].map((t) => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')}</ul></details>
<main>${cards}</main>`);

console.log(`\n${report.capturas.length} capturas em ${OUT}/ · ${report.falhas.length} falha(s) · ${report.avisos.length} aviso(s)`);
process.exit(report.falhas.length ? 1 : 0);
