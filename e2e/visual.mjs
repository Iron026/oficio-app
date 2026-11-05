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
const THEMES = opt('themes', 'claro,escuro').split(',');
// --section telas|experiente|paletas: roda só uma parte (depuração).
const SECTION = opt('section', '');
const runs = (name) => !SECTION || SECTION === name;
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
async function settle(page, keepScroll = false) {
  await page.waitForFunction(() => !document.querySelector('[role="status"] > *') && !document.querySelector('[data-celebration]'), null, { timeout: 8000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  if (!keepScroll) await page.evaluate(() => window.scrollTo(0, 0));
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
    await tx.getByRole('radiogroup', { name: /categoria/i }).getByRole('radio').first().click();
    await tx.getByLabel(/^data/i).fill(date);
    await tx.getByRole('button', { name: /registrar/i }).click();
    await tx.waitFor({ state: 'detached' });
  }
  await settle(page);
}
/**
 * Backup sintético de uma profissional com ~10 meses de uso (dados fictícios, sem
 * marca de demonstração): ~4 000 XP (Ouro), selos em vários estágios.
 */
function veteranBackup(accent, extraXp = 0) {
  const iso = (d, h = 10) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
  const day = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const names = ['Maria', 'Juliana', 'Carla', 'Fernanda', 'Patrícia', 'Aline', 'Beatriz', 'Camila', 'Daniela', 'Elaine', 'Gabriela', 'Helena'];
  const clients = Array.from({ length: 112 }, (_, i) => {
    const d = day(1 + (i % 10), 1 + (i % 27));
    return { id: `vc${i}`, name: `${names[i % names.length]} ${String.fromCharCode(65 + (i % 26))}. ${i + 1}`, phone: `119${String(10000000 + i).slice(0, 8)}`, email: '', address: '', notes: '', createdAt: iso(d), updatedAt: iso(d) };
  });
  const appointments = Array.from({ length: 262 }, (_, i) => {
    const d = day(1 + (i % 10), 1 + ((i * 7) % 27));
    const clientId = i < 60 ? `vc${i % 20}` : `vc${20 + (i % 92)}`; // 20 clientes com 3 ou mais atendimentos
    return { id: `va${i}`, title: ['Corte e escova', 'Coloração', 'Manicure', 'Hidratação'][i % 4], clientId, date: d, time: '10:00', price: 9000, status: 'concluido', notes: '', completedAt: iso(d, 13), transactionId: null, createdAt: iso(d, 9), updatedAt: iso(d, 13) };
  });
  const transactions = [];
  for (let m = 1; m <= 10; m++) {
    transactions.push({ id: `vr${m}`, type: 'receita', amount: 520000 + m * 15000, description: 'Atendimentos do mês', category: 'Atendimento', date: day(m, 25), appointmentId: null, createdAt: iso(day(m, 25)), updatedAt: iso(day(m, 25)) });
    transactions.push({ id: `vd${m}`, type: 'despesa', amount: m === 3 ? 900000 : 180000, description: 'Produtos e aluguel', category: 'Produtos', date: day(m, 26), appointmentId: null, createdAt: iso(day(m, 26)), updatedAt: iso(day(m, 26)) });
  }
  const xpEvents = [];
  for (let w = 2; w <= 15; w++) xpEvents.push({ id: `vw${w}`, key: `goal_week:2026-W${String(w).padStart(2, '0')}`, category: 'meta', xp: 50, label: 'Meta semanal batida', createdAt: iso(day(1 + Math.floor((w - 1) / 4.4), 1 + ((w * 7) % 27))) });
  for (const m of [2, 4, 6, 9]) xpEvents.push({ id: `vm${m}`, key: `goal_month:2026-${String(m).padStart(2, '0')}`, category: 'meta', xp: 100, label: 'Meta do mês batida', createdAt: iso(day(m, 27)) });
  for (const a of appointments) xpEvents.push({ id: `vx${a.id}`, key: `appointment_completed:${a.id}`, category: 'conclusao', xp: 12, label: 'Atendimento concluído', createdAt: a.completedAt });
  if (extraXp) xpEvents.push({ id: 'vextra', key: 'historico:importado', category: 'meta', xp: extraXp, label: 'Histórico anterior', createdAt: iso('2026-10-30') });
  return JSON.stringify({
    format: 'oficio-backup', version: 1, exportedAt: '2026-11-03T12:00:00.000Z',
    data: {
      profile: { name: 'Ana Souza', businessName: 'Studio Ana Beleza', professionId: 'beleza', createdAt: iso('2026-01-02'), weeklyGoalServices: 5, monthlyGoalRevenue: 600000 },
      settings: { theme: 'system', accent, avatar: { kind: 'interno', id: 'retrato-criatividade' }, featuredSeal: 'auto' },
      clients, appointments, transactions, xpEvents, achievements: [],
    },
  });
}

/** Foto de teste gerada no navegador (retrato estilizado 900×1200, sem pessoa real). */
async function samplePhoto(page) {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 1200;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 900, 1200);
    bg.addColorStop(0, '#f2d7b6'); bg.addColorStop(1, '#8aa9b8');
    g.fillStyle = bg; g.fillRect(0, 0, 900, 1200);
    g.fillStyle = '#3b2a20'; g.beginPath(); g.ellipse(450, 470, 230, 260, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e0b48f'; g.beginPath(); g.ellipse(450, 540, 180, 220, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f6f73'; g.beginPath(); g.ellipse(450, 1150, 380, 330, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3b2a20'; g.beginPath(); g.arc(385, 520, 16, 0, Math.PI * 2); g.arc(515, 520, 16, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#9a5a46'; g.lineWidth = 10; g.beginPath(); g.arc(450, 610, 60, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    return c.toDataURL('image/png');
  });
  return Buffer.from(url.split(',')[1], 'base64');
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
    // beta.5: trilha da Evolução — nenhum medalhão (com o anel do atual) encosta no vizinho
    // nem sai do cartão.
    const trail = [];
    const box = document.querySelector('[data-trail]');
    if (box) {
      const area = box.getBoundingClientRect();
      const items = [...box.querySelectorAll('[data-trail-item]')].map((btn) => {
        const r = btn.getBoundingClientRect();
        const ring = btn.dataset.trailItem === 'cur' ? 5 : 0;
        // O desenho do medalhão fica dentro do círculo do botão (94%); o atual soma o anel de 5 px.
        return { left: r.left - ring, right: r.right + ring, state: btn.dataset.trailItem };
      });
      items.forEach((it, i) => {
        const n = items[i + 1];
        if (n && it.right + 1 > n.left) trail.push(`${it.state}#${i} encosta no vizinho (${Math.round(it.right - n.left + 1)}px)`);
        if (it.left < area.left - 0.5 || it.right > area.right + 0.5) trail.push(`#${i} sai do cartão`);
      });
    }
    return { overflow, fabOverlap, trail };
  });
  if (m.overflow > 0) fail(`${tag}: transbordo horizontal de ${m.overflow}px`);
  if (m.trail.length) fail(`${tag}: trilha da Evolução: ${m.trail.join(', ')}`);
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
  await settle(page, opts.keepScroll);
  const file = `${vp.id}-${theme}-${id}.png`;
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: !!opts.full });
  const tag = `${vp.id}/${theme}/${id}`;
  const result = opts.skipChecks ? {} : await checks(page, tag);
  report.capturas.push({ arquivo: file, viewport: vp.id, tema: theme, tela: id, ...result });
}

// ---------------------------------------------------------------- execução
try {
  for (const vp of runs('telas') ? SELECTED : []) {
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
      // Central de Ajustes: páginas internas (rodada 5).
      for (const sub of ['aparencia', 'aparencia/paleta', 'perfil', 'privacidade', 'conta', 'dados', 'sobre']) {
        await page.goto(BASE + '#/ajustes/' + sub);
        await page.getByRole('link', { name: /^(ajustes|aparência)$/i }).waitFor();
        await capture(page, vp, theme, `ajustes-${sub.replace('/', '-')}`);
      }
      // Abas da Evolução (missões já foi capturada acima).
      await page.goto(BASE + '#/evolucao');
      for (const [tab, id] of [[/^selos$/i, 'selos'], [/^conquistas$/i, 'conquistas'], [/^histórico$/i, 'historico']]) {
        await page.getByRole('radio', { name: tab }).click();
        await capture(page, vp, theme, `evolucao-${id}`);
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
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      // Agendamento: atalhos de serviço (quebram linha, nunca cortam) e painel "Tipos de serviço".
      await page.goto(BASE + '#/painel');
      await page.getByRole('button', { name: /^agendar$/i }).first().click();
      const ag = page.getByRole('dialog');
      await ag.waitFor();
      await capture(page, vp, theme, 'formulario-agendar');
      await ag.getByRole('button', { name: /gerenciar/i }).click();
      const mgr = page.getByRole('dialog', { name: /tipos de serviço/i });
      await mgr.waitFor();
      await mgr.getByRole('button', { name: /adicionar tipo de serviço/i }).click();
      await mgr.getByLabel(/nome do serviço/i).fill('Hora de trabalho (diária completa com deslocamento)');
      await mgr.getByLabel(/valor sugerido/i).fill('480,00');
      await mgr.getByRole('button', { name: /^adicionar$/i }).click();
      await mgr.getByRole('button', { name: /^fixar hora de trabalho/i }).click();
      await mgr.getByRole('button', { name: /^desafixar hora de trabalho/i }).waitFor();
      await capture(page, vp, theme, 'tipos-de-servico');
      await page.keyboard.press('Escape');
      await mgr.waitFor({ state: 'detached' });
      await capture(page, vp, theme, 'formulario-agendar-com-tipo');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });

      // Ajustes: imagem de perfil (avatares do pack), recorte de foto e selo em destaque.
      { // todos os tamanhos (galeria e foto)
        await page.goto(BASE + '#/ajustes');
        await page.getByRole('button', { name: /alterar imagem de perfil/i }).click();
        await page.getByRole('dialog', { name: /imagem de perfil/i }).waitFor();
        await capture(page, vp, theme, 'ajustes-imagem-de-perfil');
        // Galeria (rodada 3): só imagens, nome no TalkBack. Cada cartão ≥ 48 px e a imagem inteira dentro dele,
        // também com a fonte grande do Android (≈130%: a grade usa rem e as colunas alargam).
        const tileProblems = () => page.evaluate(async () => {
          const out = [];
          // Avatares são arquivos próprios (não embutidos no JS): todos precisam carregar de verdade.
          const imgs = [...document.querySelectorAll('[data-avatar-id] img')];
          imgs.forEach((i) => { i.loading = 'eager'; });
          await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
          for (const i of imgs) if (!i.complete || i.naturalWidth === 0) out.push(`${i.closest('[data-avatar-id]').dataset.avatarId}: imagem não carregou`);
          for (const scale of ['', '130%']) {
            document.documentElement.style.fontSize = scale;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            for (const b of document.querySelectorAll('[data-avatar-id]')) {
              const r = b.getBoundingClientRect();
              const im = b.querySelector('img').getBoundingClientRect();
              if (!b.getAttribute('aria-label')) out.push(`${b.dataset.avatarId}: sem nome acessível`);
              if (r.width < 48 || r.height < 48) out.push(`${b.dataset.avatarId}: cartão ${Math.round(r.width)}px`);
              if (im.left < r.left - 0.5 || im.right > r.right + 0.5 || im.top < r.top - 0.5 || im.bottom > r.bottom + 0.5) out.push(`${b.dataset.avatarId}: imagem cortada${scale ? ' (fonte 130%)' : ''}`);
            }
          }
          document.documentElement.style.fontSize = '';
          return out;
        });
        for (const tab of ['personagens', 'icones']) {
          if (tab === 'icones') {
            await page.getByRole('radio', { name: /^ícones$/i }).click();
            await capture(page, vp, theme, 'ajustes-galeria-icones');
          }
          const problems = await tileProblems();
          if (problems.length) fail(`${vp.id}/${theme}: galeria (${tab}): ${problems.slice(0, 6).join(', ')}`);
        }
        await page.getByRole('radio', { name: /^personagens$/i }).click();
        // Galeria por dentro (a folha rola sozinha): meio e fim da lista de avatares.
        if (vp.id === 'celular-360') {
          for (const [frac, id] of [[0.45, 'ajustes-galeria-meio'], [1, 'ajustes-galeria-fim']]) {
            await page.evaluate((f) => {
              const box = [...document.querySelectorAll('[role="dialog"] *')].find((e) => e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
              if (box) box.scrollTop = (box.scrollHeight - box.clientHeight) * f;
            }, frac);
            await capture(page, vp, theme, id, { skipChecks: true, keepScroll: true });
          }
        }
        if (vp.id === 'celular-360') await capture(page, vp, theme, 'ajustes-imagem-de-perfil-inteira', { full: true, skipChecks: true });
        await page.getByRole('radio', { name: 'Criatividade, mulher' }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await capture(page, vp, theme, 'ajustes-com-avatar');
        await page.getByRole('button', { name: /alterar imagem de perfil/i }).click();
        const photo = await samplePhoto(page);
        await page.locator('input[type=file][aria-label="Escolher foto"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: photo });
        await page.getByRole('dialog', { name: /ajustar foto/i }).waitFor();
        await page.getByRole('button', { name: /aumentar zoom/i }).click();
        await capture(page, vp, theme, 'ajustes-recorte-da-foto');
        await page.getByRole('button', { name: /usar foto/i }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await capture(page, vp, theme, 'ajustes-com-foto');
        // A foto gravada no aparelho precisa respeitar os limites (WebP/JPEG, ≤ 64 KiB, 320 px).
        const saved = await page.evaluate(() => new Promise((resolve, reject) => {
          const req = indexedDB.open('oficio');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const get = req.result.transaction('profileImages').objectStore('profileImages').getAll();
            get.onsuccess = () => resolve(get.result.map((i) => ({ mime: i.mime, bytes: i.bytes, chars: i.data.length, width: i.width, height: i.height })));
            get.onerror = () => reject(get.error);
          };
        }));
        const img = saved[0];
        if (saved.length !== 1 || !img || !['image/webp', 'image/jpeg'].includes(img.mime) || img.bytes > 65536 || img.chars > 87384 || img.width !== 320) fail(`${vp.id}/${theme}: foto gravada fora dos limites ${JSON.stringify(saved)}`);
        else report.foto = report.foto ?? img;
        await page.goto(BASE + '#/ajustes/perfil');
        await page.getByRole('button', { name: /selo em destaque/i }).click();
        await page.getByRole('dialog', { name: /selo em destaque/i }).waitFor();
        await capture(page, vp, theme, 'ajustes-selo-em-destaque');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.goto(BASE + '#/ajustes/privacidade');
        await page.getByRole('switch', { name: /ocultar valores/i }).click();
        await page.goto(BASE + '#/painel');
        await capture(page, vp, theme, 'painel-valores-ocultos');
      }
      await ctx.close();
    }
  }
  // Profissional experiente: categorias altas e selos em vários estágios (via importação de backup).
  for (const vp of runs('experiente') ? SELECTED.filter((v) => v.id === 'celular-360' || v.id === 'computador-1280') : []) {
    for (const theme of THEMES) {
      console.log(`• ${vp.id} · ${theme} · experiente`);
      const { ctx, page } = await newPage(vp, theme);
      await page.goto(BASE);
      await page.getByRole('button', { name: /começar/i }).click();
      await page.getByRole('radio', { name: /beleza/i }).click();
      await page.getByRole('button', { name: /continuar/i }).click();
      await page.getByLabel(/seu nome/i).fill('Ana Souza');
      await page.getByRole('button', { name: /entrar no ofício/i }).click();
      await page.getByRole('navigation', { name: /navegação principal/i }).waitFor();
      await page.goto(BASE + '#/ajustes/dados');
      await page.getByRole('button', { name: /exportar backup/i }).waitFor();
      await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(veteranBackup(theme === 'escuro' ? 'oceano' : 'petroleo')) });
      await page.getByRole('button', { name: /^importar$/i }).click();
      await page.getByText(/backup importado/i).first().waitFor();
      await page.goto(BASE + '#/painel');
      await capture(page, vp, theme, 'experiente-painel');
      await page.goto(BASE + '#/evolucao');
      await capture(page, vp, theme, 'experiente-evolucao');
      // Rever a comemoração tocando na categoria atual da trilha (camada por cima da tela).
      await page.getByRole('button', { name: /você está aqui/i }).click();
      await page.locator('[data-celebration]').waitFor();
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${OUT}/${vp.id}-${theme}-experiente-comemoracao.png` });
      report.capturas.push({ arquivo: `${vp.id}-${theme}-experiente-comemoracao.png`, viewport: vp.id, tema: theme, tela: 'experiente-comemoracao' });
      // A camada não captura toques (beta.5): um toque em qualquer ponto a fecha.
      await page.mouse.click(8, Math.round((vp.height ?? 780) / 2));
      await page.locator('[data-celebration]').waitFor({ state: 'detached' });
      await page.getByRole('radio', { name: /^selos$/i }).click();
      await capture(page, vp, theme, 'experiente-selos');
      if (vp.id === 'celular-360') await capture(page, vp, theme, 'experiente-selos-inteira', { full: true, skipChecks: true });
      await page.getByRole('button', { name: /experiência/i }).click();
      await page.getByRole('dialog', { name: /selo experiência/i }).waitFor();
      await capture(page, vp, theme, 'experiente-detalhe-do-selo');
      await page.keyboard.press('Escape');
      // 112 clientes: o botão flutuante não pode cobrir o último cartão (checks rola até o fim).
      await page.goto(BASE + '#/clientes');
      await capture(page, vp, theme, 'experiente-clientes');
      const last = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const items = document.querySelectorAll('main li');
        const li = items[items.length - 1].getBoundingClientRect();
        const fab = [...document.querySelectorAll('body > button')].find((b) => getComputedStyle(b).position === 'fixed')?.getBoundingClientRect();
        const nav = document.querySelector('nav[aria-label="Navegação principal"]')?.getBoundingClientRect();
        return { liBottom: Math.round(li.bottom), fabTop: fab ? Math.round(fab.top) : null, navTop: nav ? Math.round(nav.top) : null };
      });
      if (last.fabTop !== null && last.liBottom > last.fabTop) fail(`${vp.id}/${theme}: último cliente (fim em ${last.liBottom}px) fica atrás do botão flutuante (${last.fabTop}px)`);
      report.fab = report.fab ?? [];
      report.fab.push({ viewport: vp.id, tema: theme, ...last });
      await capture(page, vp, theme, 'experiente-clientes-fim', { skipChecks: true, keepScroll: true });
      await page.goto(BASE + '#/ajustes');
      await capture(page, vp, theme, 'experiente-ajustes');
      // R3: nível 26 → Diamante III (só visual).
      if (vp.id === 'celular-360') {
        await page.goto(BASE + '#/ajustes/dados');
        await page.getByRole('button', { name: /exportar backup/i }).waitFor();
        await page.locator('input[type=file]').first().setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(veteranBackup('petroleo', 32500 - 4244)) });
        await page.getByRole('button', { name: /^importar$/i }).click();
        await page.getByText(/backup importado/i).first().waitFor();
        await page.goto(BASE + '#/evolucao');
        await page.getByText(/Diamante III/).first().waitFor();
        await capture(page, vp, theme, 'diamante-iii-evolucao');
      }
      await ctx.close();
    }
  }
  // Rodada 5: as 8 paletas nas telas principais, num formulário com erros e na reabertura
  // (sem piscar o Petróleo). Celular 360 (Galaxy S26), claro e escuro; axe em todas.
  const PALETTE_NAMES = { petroleo: 'Petróleo', oceano: 'Oceano', safira: 'Safira', indigo: 'Índigo', ameixa: 'Ameixa', vinho: 'Vinho', grafite: 'Grafite', oliva: 'Oliva' };
  if (runs('paletas') && (!ONLY || ONLY.split(',').includes('celular-360'))) {
    const vp = VIEWPORTS[0];
    for (const theme of THEMES) {
      console.log(`• ${vp.id} · ${theme} · 8 paletas`);
      const { ctx, page } = await newPage(vp, theme);
      await seed(page);
      for (const [id, name] of Object.entries(PALETTE_NAMES)) {
        await page.goto(BASE + '#/ajustes/aparencia/paleta');
        await page.getByRole('radio', { name: new RegExp(`^${name}`) }).click();
        await page.waitForFunction((a) => document.documentElement.dataset.accent === a, id);
        for (const s of SCREENS) {
          await page.goto(BASE + s.hash);
          await page.getByRole('navigation', { name: /navegação principal/i }).waitFor();
          await capture(page, vp, theme, `paleta-${id}-${s.id}`);
        }
        // Formulário com erros de validação (campos, mensagens, botão desabilitado ao salvar).
        await page.goto(BASE + '#/financas');
        await page.getByRole('button', { name: /^receita$/i }).first().click();
        const tx = page.getByRole('dialog');
        await tx.getByRole('button', { name: /registrar/i }).click();
        await tx.getByRole('alert').first().waitFor();
        await capture(page, vp, theme, `paleta-${id}-formulario-erros`);
        await page.keyboard.press('Escape');
        await tx.waitFor({ state: 'detached' });
        if (process.env.OFICIO_DEBUG_BAR) console.log('cache antes da reabertura', id, await page.evaluate(() => [localStorage.getItem('oficio:aparencia'), document.documentElement.className, getComputedStyle(document.documentElement).getPropertyValue('--hero-1')]));
        // Reabertura com o JavaScript do app bloqueado: só o script do <head> roda.
        await page.route(/\/assets\/index-[^/]+\.js$/, (r) => r.abort());
        await page.reload();
        const first = await page.evaluate(() => ({
          accent: document.documentElement.dataset.accent,
          dark: document.documentElement.classList.contains('dark'),
          hero: getComputedStyle(document.documentElement).getPropertyValue('--hero-1').trim(),
          bar: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
        }));
        await page.unroute(/\/assets\/index-[^/]+\.js$/);
        if (first.accent !== id) fail(`${theme}/${id}: reabertura pinta com a paleta "${first.accent ?? 'padrão'}" antes do app carregar`);
        if (first.dark !== (theme === 'escuro')) fail(`${theme}/${id}: reabertura pinta com o tema errado antes do app carregar`);
        if (first.bar !== first.hero) fail(`${theme}/${id}: barra do sistema ${first.bar} difere do cabeçalho ${first.hero} na reabertura`);
        report.reabertura = report.reabertura ?? [];
        report.reabertura.push({ tema: theme, paleta: id, ...first });
        await page.reload();
        await page.getByRole('navigation', { name: /navegação principal/i }).waitFor();
      }
      // Volta ao padrão: a escolha do Petróleo também precisa funcionar.
      await page.goto(BASE + '#/ajustes/aparencia/paleta');
      await page.getByRole('radio', { name: /^Petróleo/ }).click();
      await page.waitForFunction(() => document.documentElement.dataset.accent === 'petroleo');
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
