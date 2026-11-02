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
const back = () => adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');

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
  });

  await step('Voltar no cadastro retorna ao passo anterior', async () => {
    await page.getByRole('button', { name: /começar/i }).click();
    await page.getByRole('radio', { name: /beleza/i }).waitFor();
    back();
    await page.getByRole('button', { name: /começar/i }).waitFor();
  });

  await step('Cadastro inicial (Beleza)', async () => {
    await page.getByRole('button', { name: /começar/i }).click();
    await page.getByRole('radio', { name: /beleza/i }).click();
    await page.getByRole('button', { name: /continuar/i }).click();
    await page.getByLabel(/seu nome/i).fill('Ana Teste');
    await page.getByRole('button', { name: /entrar no ofício/i }).click();
    await page.getByText(/atendimentos na semana/i).waitFor();
    await wait(1500);
    shot('02-painel-claro');
  });

  await step('Voltar fecha o painel aberto sem sair do app', async () => {
    await page.getByRole('button', { name: /^cliente$/i }).click();
    await page.getByRole('dialog').waitFor();
    shot('03-formulario');
    back();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert(resumedPackage() === PKG, 'o app saiu do primeiro plano');
  });

  await step('Cadastrar cliente', async () => {
    await page.getByRole('button', { name: /^cliente$/i }).click();
    await page.getByLabel(/^nome/i).fill('Cliente Persistente');
    await page.getByLabel(/telefone/i).fill('11912345678');
    await page.getByRole('button', { name: /cadastrar cliente/i }).click();
    await page.getByText(/cliente cadastrado/i).first().waitFor();
  });

  await step('Voltar em outra tela retorna ao Painel', async () => {
    await page.getByRole('link', { name: /finanças/i }).click();
    await page.waitForFunction(() => location.hash === '#/financas');
    back();
    await page.waitForFunction(() => location.hash === '#/painel');
  });

  await step('Modo escuro', async () => {
    await page.getByRole('button', { name: /ajustes/i }).click();
    await page.getByRole('radio', { name: /escuro/i }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.getByRole('link', { name: /painel/i }).click();
    await wait(1000);
    shot('04-painel-escuro');
  });

  await step('Exportar backup para Documentos', async () => {
    await page.getByRole('button', { name: /ajustes/i }).click();
    await page.getByRole('button', { name: /exportar backup/i }).click();
    await page.getByRole('button', { name: /salvar em documentos/i }).click();
    await page.getByText(/backup salvo/i).first().waitFor();
    shot('05-backup-salvo');
    const files = adb('shell', 'ls', '/sdcard/Documents/Oficio/').trim().split(/\s+/);
    console.log('\n  arquivos:', files.join(', '));
    const file = files.find((f) => f.startsWith('oficio-backup-'));
    assert(file, 'arquivo de backup não encontrado em Documentos/Oficio');
    backupJson = adb('shell', 'cat', `/sdcard/Documents/Oficio/${file}`);
    assert(JSON.parse(backupJson).data.clients.some((c) => c.name === 'Cliente Persistente'), 'backup sem o cliente cadastrado');
  });

  await step('Botão Voltar no Painel minimiza o app', async () => {
    await page.getByRole('link', { name: /painel/i }).click();
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
    await page.getByRole('link', { name: /clientes/i }).click();
    await page.getByText('Cliente Persistente').waitFor();
    shot('06-clientes-apos-reabrir');
  });

  await step('Importar backup (ex.: vindo da versão web)', async () => {
    const data = JSON.parse(backupJson);
    data.data.clients.push({ ...data.data.clients[0], id: 'importado-1', name: 'Cliente Importado' });
    await page.getByRole('button', { name: /ajustes/i }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.getByRole('button', { name: /^importar$/i }).click();
    await page.getByText(/backup importado/i).first().waitFor();
    await page.getByRole('link', { name: /clientes/i }).click();
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
