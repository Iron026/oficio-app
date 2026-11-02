/**
 * Teste de ponta a ponta do APK em um emulador Android (executado no CI).
 *
 * Uso: node e2e/android.e2e.mjs caminho/para/app.apk
 * Requer `adb` no PATH e um emulador/dispositivo conectado.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { _android as android } from 'playwright-core';

const PKG = 'io.github.iron026.oficio';
const OUT = 'e2e-results';
const apk = process.argv[2];
if (!apk) throw new Error('Informe o caminho do APK.');
mkdirSync(OUT, { recursive: true });

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' });
const shot = (name) => writeFileSync(`${OUT}/${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p']));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('OK');
  } catch (err) {
    results.push({ name, ok: false, error: String(err?.message ?? err) });
    console.log('FALHOU\n', err);
    shot(`falha-${results.length}`);
    throw err;
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const resumedPackage = () => adb('shell', 'dumpsys', 'activity', 'activities').match(/(?:mResumedActivity|ResumedActivity).*?\{[^}]*\s([\w.]+)\/[\w.]+/)?.[1] ?? '';
const back = () => {
  // Fecha diálogos do sistema que possam ter surgido antes de pressionar Voltar.
  try {
    adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS');
  } catch { /* opcional */ }
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
};
/**
 * Toque em um elemento. O Playwright às vezes calcula mal a viewport de
 * WebViews Android via CDP ("element is outside of the viewport"); nesse
 * caso o clique é disparado diretamente no elemento.
 */
const tap = async (locator) => {
  await locator.waitFor();
  try {
    await locator.click({ timeout: 3000 });
  } catch {
    // O clique pode ter funcionado mas demorado a ser confirmado (o painel já
    // fechou): só usa o plano B se o elemento ainda existir.
    if ((await locator.count()) > 0) await locator.first().evaluate((el) => el.click()).catch(() => undefined);
  }
};

const [device] = await android.devices({ omitDriverInstall: true });
assert(device, 'Nenhum dispositivo Android encontrado.');
console.log(`Dispositivo: ${device.model()} · Android SDK ${adb('shell', 'getprop', 'ro.build.version.sdk').trim()}`);

async function launch() {
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 90_000 });
  const page = await webview.page();
  page.setDefaultTimeout(20_000);
  return page;
}

let page;
let backupJson = '';
try {
  await step('Preparar emulador', async () => {
    // Emuladores do CI às vezes exibem "app não está respondendo" do launcher,
    // que cobre a tela e consome toques. Oculta esses avisos do sistema.
    adb('shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1');
    adb('shell', 'settings', 'put', 'secure', 'anr_show_background', '0');
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('shell', 'wm', 'dismiss-keyguard');
    await wait(15_000); // deixa o launcher terminar de iniciar
    adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS');
  });

  await step('Instalar APK', async () => {
    adb('install', '-r', apk);
    adb('shell', 'pm', 'clear', PKG);
  });

  await step('Abrir app e mostrar boas-vindas', async () => {
    page = await launch();
    await page.getByRole('button', { name: /começar/i }).waitFor();
    await wait(800);
    shot('01-boas-vindas');
  });

  await step('Conteúdo não fica sob a barra de status', async () => {
    // Dois modos válidos (Capacitor SystemBars):
    // - WebView >= 140: tela inteira, com --safe-area-inset-top > 0 aplicado no layout;
    // - WebView < 140: o WebView é posicionado entre as barras (viewport menor que a tela).
    const m = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        insetTop: parseFloat(cs.getPropertyValue('--safe-area-inset-top')) || 0,
        paddingTop: parseFloat(getComputedStyle(document.querySelector('.min-h-dvh')).paddingTop),
        screenH: screen.height,
        innerH: innerHeight,
        webview: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1],
      };
    });
    console.log('\n  medidas:', JSON.stringify(m));
    const edgeToEdge = m.insetTop > 0;
    if (edgeToEdge) assert(m.paddingTop >= m.insetTop, `padding ${m.paddingTop}px < inset ${m.insetTop}px`);
    else assert(m.screenH - m.innerH > 40, 'WebView ocupa a tela inteira sem recuo das barras do sistema');
    // Nenhuma barra de título nativa deve aparecer sobre o app
    // (id exato "action_bar"; "action_bar_root" é só o contêiner do AppCompat).
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
    const ui = adb('shell', 'cat', '/sdcard/ui.xml');
    assert(!/id\/action_bar"/.test(ui), 'barra de título nativa (action_bar) visível');
  });

  await step('Voltar no cadastro retorna ao passo anterior', async () => {
    await tap(page.getByRole('button', { name: /começar/i }));
    await page.getByRole('radio', { name: /beleza/i }).waitFor();
    back();
    await page.getByRole('button', { name: /começar/i }).waitFor();
  });

  await step('Cadastro inicial (Beleza)', async () => {
    await tap(page.getByRole('button', { name: /começar/i }));
    await tap(page.getByRole('radio', { name: /beleza/i }));
    await tap(page.getByRole('button', { name: /continuar/i }));
    await page.getByLabel(/seu nome/i).fill('Ana Teste');
    await tap(page.getByRole('button', { name: /entrar no ofício/i }));
    await page.getByText(/atendimentos na semana/i).waitFor();
    await wait(1500);
    shot('02-painel-claro');
  });

  await step('Voltar fecha o painel aberto sem sair do app', async () => {
    await tap(page.getByRole('button', { name: /^cliente$/i }));
    await page.getByRole('dialog').waitFor();
    await wait(1500); // aguarda a animação de entrada do painel
    shot('03-formulario');
    back();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert(resumedPackage() === PKG, 'o app saiu do primeiro plano');
  });

  await step('Cadastrar cliente', async () => {
    await tap(page.getByRole('button', { name: /^cliente$/i }));
    await page.getByLabel(/^nome/i).fill('Cliente Persistente');
    await page.getByLabel(/telefone/i).fill('11912345678');
    await tap(page.getByRole('button', { name: /cadastrar cliente/i }));
    await page.getByText(/cliente cadastrado/i).first().waitFor();
  });

  await step('Serviço com data futura: aviso, Voltar e Concluir mesmo assim', async () => {
    const t = new Date(Date.now() + 2 * 86_400_000);
    const amanha = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    await tap(page.getByRole('button', { name: /^agendar$/i }));
    const form = page.getByRole('dialog');
    await form.getByLabel(/descrição/i).fill('Corte antecipado');
    await form.getByLabel(/^data/i).fill(amanha);
    await form.getByLabel(/valor/i).fill('70,00');
    await tap(form.getByRole('button', { name: /^agendar$/i }));
    await form.waitFor({ state: 'detached' });
    await tap(page.getByRole('navigation').getByRole('link', { name: /agenda/i }));
    await tap(page.getByRole('button', { name: /corte antecipado/i }));
    await tap(page.getByRole('button', { name: /concluir atendimento/i }));
    const aviso = page.getByRole('dialog', { name: 'Data futura' });
    await aviso.waitFor();
    await wait(1500);
    shot('07-aviso-data-futura');
    await tap(aviso.getByRole('button', { name: 'Voltar' }));
    await aviso.waitFor({ state: 'detached' });
    await tap(page.getByRole('button', { name: /concluir atendimento/i }));
    await tap(page.getByRole('dialog', { name: 'Data futura' }).getByRole('button', { name: /concluir mesmo assim/i }));
    await page.getByText(/atendimento concluído/i).first().waitFor();
    await tap(page.getByRole('navigation').getByRole('link', { name: /finanças/i }));
    await page.getByTestId('data-futura').waitFor();
    await wait(600);
    shot('08-financas-data-futura');
    await tap(page.getByRole('navigation').getByRole('link', { name: /painel/i }));
  });

  await step('Voltar em outra tela retorna ao Painel', async () => {
    await tap(page.getByRole('navigation').getByRole('link', { name: /finanças/i }));
    await page.waitForFunction(() => location.hash === '#/financas');
    back();
    await page.waitForFunction(() => location.hash === '#/painel');
  });

  await step('Modo escuro', async () => {
    await tap(page.getByRole('button', { name: /ajustes/i }));
    await tap(page.getByRole('radio', { name: /escuro/i }));
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await tap(page.getByRole('navigation').getByRole('link', { name: /painel/i }));
    await wait(1000);
    shot('04-painel-escuro');
    await tap(page.getByRole('button', { name: /^agendar$/i }));
    await page.getByRole('dialog').waitFor();
    await wait(1200);
    shot('04b-agendar-escuro');
    back();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  });

  await step('Exportar backup para Documentos', async () => {
    await tap(page.getByRole('button', { name: /ajustes/i }));
    await tap(page.getByRole('button', { name: /exportar backup/i }));
    await tap(page.getByRole('button', { name: /salvar em documentos/i }));
    await page.getByText(/backup salvo/i).first().waitFor();
    await wait(800);
    shot('05-backup-salvo');
    const files = adb('shell', 'ls', '/sdcard/Documents/Oficio/').trim().split(/\s+/);
    console.log('\n  arquivos:', files.join(', '));
    const file = files.find((f) => f.startsWith('oficio-backup-'));
    assert(file, 'arquivo de backup não encontrado em Documentos/Oficio');
    backupJson = adb('shell', 'cat', `/sdcard/Documents/Oficio/${file}`);
    assert(JSON.parse(backupJson).data.clients.some((c) => c.name === 'Cliente Persistente'), 'backup sem o cliente cadastrado');
  });

  await step('Botão Voltar no Painel minimiza o app', async () => {
    await tap(page.getByRole('navigation').getByRole('link', { name: /painel/i }));
    await page.waitForFunction(() => location.hash === '#/painel');
    back();
    await wait(1500);
    assert(resumedPackage() !== PKG, 'o app continuou em primeiro plano');
  });

  await step('Persistência após forçar o fechamento e reabrir', async () => {
    adb('shell', 'am', 'force-stop', PKG);
    await wait(1000);
    page = await launch();
    await page.getByText(/atendimentos na semana/i).waitFor();
    const xp = await page.getByText(/\d+ XP/).first().textContent();
    assert(xp && parseInt(xp) > 0, `XP não persistiu (${xp})`);
    assert(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'tema escuro não persistiu');
    await tap(page.getByRole('navigation').getByRole('link', { name: /finanças/i }));
    await page.getByTestId('data-futura').waitFor(); // receita antecipada e selo preservados
    const receitas = await page.getByText('Corte antecipado').count();
    assert(receitas === 1, `receita antecipada duplicada ou ausente (${receitas})`);
    await tap(page.getByRole('navigation').getByRole('link', { name: /clientes/i }));
    await page.getByText('Cliente Persistente').waitFor();
    shot('06-clientes-apos-reabrir');
  });

  await step('Importar backup (ex.: vindo da versão web)', async () => {
    const data = JSON.parse(backupJson);
    data.data.clients.push({ ...data.data.clients[0], id: 'importado-1', name: 'Cliente Importado' });
    await tap(page.getByRole('button', { name: /ajustes/i }));
    await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await tap(page.getByRole('button', { name: /^importar$/i }));
    await page.getByText(/backup importado/i).first().waitFor();
    await tap(page.getByRole('navigation').getByRole('link', { name: /clientes/i }));
    await page.getByText('Cliente Importado').waitFor();
    await page.getByText('Cliente Persistente').waitFor();
  });
} finally {
  writeFileSync(`${OUT}/resultado.json`, JSON.stringify(results, null, 2));
  try {
    writeFileSync(`${OUT}/logcat.txt`, adb('logcat', '-d', '-t', '3000'));
  } catch { /* sem logcat */ }
  await device?.close().catch(() => undefined);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} etapas aprovadas.`);
process.exit(failed.length ? 1 : 0);
