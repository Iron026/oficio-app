/**
 * Teste de ponta a ponta do APK em um emulador Android (executado no CI).
 *
 * Uso: node e2e/android.e2e.mjs caminho/para/app.apk
 * Requer `adb` no PATH e um emulador/dispositivo conectado.
 */
import { execFileSync, execSync, spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { _android as android } from 'playwright-core';

const PKG = 'io.github.iron026.oficio';
const OUT = 'e2e-results';
const apk = process.argv[2];
if (!apk) throw new Error('Informe o caminho do APK.');
mkdirSync(OUT, { recursive: true });

/*
 * Diagnóstico do emulador que "some" no meio do teste (sem mensagem de erro do emulador).
 * - logcat contínuo num arquivo: fica o registro do aparelho até o instante da queda;
 * - a cada 5 s, memória da máquina do CI e memória/CPU do processo do emulador;
 * - na falha, o log do kernel da máquina (OOM killer, segfault) e se o processo ainda existe.
 * Nada disso altera o teste nem os tempos limite.
 */
const sh = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (e) { return `(${String(e?.message ?? e).split('\n')[0]})`; }
};
const logcatFile = createWriteStream(`${OUT}/logcat-continuo.txt`);
const logcat = spawn('adb', ['logcat', '-v', 'time'], { stdio: ['ignore', 'pipe', 'ignore'] });
logcat.stdout.pipe(logcatFile);
logcat.on('error', () => {});
process.on('exit', () => { try { logcat.kill(); } catch { /* já encerrado */ } });
const HOST_LOG = `${OUT}/maquina-ci.log`;
/** Carga de 1 min dentro do Android (2 núcleos no CI); "?" se o aparelho não responder em 3 s. */
const guestLoad = () => {
  try { return execFileSync('adb', ['shell', 'cat', '/proc/loadavg'], { encoding: 'utf8', timeout: 3000 }).split(' ')[0]; } catch { return '?'; }
};
const sampleHost = () => {
  const mem = sh("free -m | awk '/^Mem:/{print \"usada=\"$3\"MB livre=\"$4\"MB disp=\"$7\"MB\"} /^Swap:/{print \"swap=\"$3\"MB\"}' | tr '\\n' ' '");
  const emu = sh("ps -C qemu-system-x86_64 -o pid=,rss=,pcpu= | awk '{print \"emulador pid=\"$1\" rss=\"int($2/1024)\"MB cpu=\"$3\"%\"}'") || 'emulador: processo ausente';
  const load = sh('cut -d" " -f1-3 /proc/loadavg');
  appendFileSync(HOST_LOG, `${new Date().toISOString()} ${mem}| ${emu} | carga ${load} | carga do Android ${guestLoad()}\n`);
};
sampleHost();
const sampler = setInterval(sampleHost, 5000);
sampler.unref();
const hostDiagnostics = (tag) => {
  sampleHost();
  const report = [
    `== ${tag} ${new Date().toISOString()}`,
    '-- processo do emulador:', sh('pgrep -a -f qemu-system || echo ausente'),
    '-- memória:', sh('free -m'),
    '-- kernel (OOM, kill, segfault):', sh("{ sudo -n dmesg -T 2>/dev/null || echo 'dmesg indisponível'; } | grep -iE 'oom|killed process|out of memory|segfault|qemu|emulator|indisponível' | tail -40; true") || 'nenhuma mensagem de OOM, kill ou segfault',
    '-- arquivos de falha do emulador:', sh("find /tmp/android-runner -type f -printf '%TT %10s %p\\n' 2>/dev/null | sort | tail -30; true") || 'nenhum',
    '-- minidumps copiados:', sh(`mkdir -p ${OUT}/emulador && find /tmp/android-runner -type f \\( -name '*.dmp' -o -name '*.txt' -o -name '*.log' \\) -exec cp -t ${OUT}/emulador/ {} + 2>/dev/null; ls ${OUT}/emulador; true`) || 'nenhum',
    '-- adb:', sh('adb devices -l'),
  ].join('\n');
  appendFileSync(`${OUT}/diagnostico-maquina.txt`, report + '\n\n');
  console.log(report.split('\n').map((l) => `  ${l}`).join('\n'));
};

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' });
const shot = (name) => {
  try {
    writeFileSync(`${OUT}/${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { timeout: 20_000 }));
  } catch (err) {
    console.log(`  (captura ${name} indisponível: ${String(err?.message ?? err).split('\n')[0]})`);
  }
};
let currentPage = null;
/** Estado da tela no momento da falha (rota, tema, diálogos e avisos), para diagnóstico. */
const describeScreen = async () => {
  if (!currentPage) return null;
  return Promise.race([
    currentPage.evaluate(() => ({
      hash: location.hash,
      dark: document.documentElement.classList.contains('dark'),
      dialogos: [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map((d) => d.getAttribute('aria-label') || d.textContent.slice(0, 60)),
      avisos: [...document.querySelectorAll('[role=status] > *')].map((t) => t.textContent.slice(0, 80)),
      comemoracao: !!document.querySelector('[data-celebration]'),
    })),
    wait(5000).then(() => 'sem resposta da página'),
  ]).catch((e) => `indisponível: ${String(e?.message ?? e).split('\n')[0]}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('OK');
  } catch (err) {
    const tela = await describeScreen();
    results.push({ name, ok: false, error: String(err?.message ?? err), tela });
    console.log('FALHOU\n', err, '\n  tela:', JSON.stringify(tela));
    hostDiagnostics(`falha na etapa ${results.length}`);
    // Captura e log do aparelho ANTES de encerrar (cada um com tempo limite próprio).
    shot(`falha-${results.length}`);
    try {
      writeFileSync(`${OUT}/falha-${results.length}-logcat.txt`, execFileSync('adb', ['logcat', '-d', '-t', '2000'], { encoding: 'utf8', timeout: 30_000 }));
    } catch (e) {
      console.log(`  (logcat indisponível: ${String(e?.message ?? e).split('\n')[0]})`);
    }
    writeFileSync(`${OUT}/resultado.json`, JSON.stringify(results, null, 2));
    // Nunca fica parado depois de uma falha: encerra em até 2 min mesmo se o aparelho não responder.
    setTimeout(() => {
      writeFileSync(`${OUT}/resultado.json`, JSON.stringify(results, null, 2));
      console.log('Encerrando: o aparelho não respondeu depois da falha.');
      process.exit(1);
    }, 120_000).unref();
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
 * caso o clique é disparado diretamente no elemento — mas só se ele ainda
 * estiver visível e habilitado (o primeiro toque pode ter funcionado e
 * apenas demorado a ser confirmado; tocar de novo poderia repetir a ação).
 */
const tap = async (locator) => {
  await locator.waitFor();
  try {
    await locator.click({ timeout: 3000 });
  } catch {
    const el = locator.first();
    const stillThere = (await locator.count()) > 0 && (await el.isVisible().catch(() => false)) && (await el.isEnabled().catch(() => false));
    if (stillThere) await el.evaluate((node) => node.click()).catch(() => undefined);
  }
};

/** Lê um store do IndexedDB do app (prova durável de que o dado foi salvo). */
const readStore = (page, store) =>
  page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('oficio');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const q = db.transaction(name, 'readonly').objectStore(name).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
    store,
  );

/** Espera até `fn` retornar verdadeiro (dados gravados de forma assíncrona). */
const eventually = async (fn, msg, ms = 10_000) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await wait(250);
  }
  throw new Error(`${msg} (último valor: ${JSON.stringify(last)})`);
};

/** Avisos temporários (toasts) são apenas registrados — a prova é sempre o dado salvo. */
const noteToast = async (page, re) => {
  const seen = await page.getByText(re).first().isVisible().catch(() => false);
  console.log(`\n  aviso "${re.source}": ${seen ? 'exibido' : 'não observado (temporário)'}`);
};

// `uiautomator dump` às vezes termina com código 137 no emulador mesmo após gravar o XML:
// aceita a saída "dumped", apaga o arquivo antigo antes e tenta de novo se não houver XML.
const dumpUi = () => {
  for (let i = 0; i < 3; i++) {
    adb('shell', 'rm', '-f', '/sdcard/ui.xml');
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
    } catch (err) {
      if (!/dumped/i.test(String(err?.stdout ?? ''))) continue;
    }
    const xml = adb('shell', "cat /sdcard/ui.xml 2>/dev/null; true");
    if (xml.includes('<hierarchy')) return xml;
  }
  throw new Error('uiautomator dump falhou 3 vezes');
};
/** Lê a árvore de elementos da tela (inclui janelas do sistema, como a "Salvar como"). */
const uiNodes = () => {
  const xml = dumpUi();
  return [...xml.matchAll(/<node [^>]*>/g)].map(([tag]) => {
    const attr = (k) => tag.match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? '';
    const [, x1, y1, x2, y2] = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/) ?? [];
    return { text: attr('text'), id: attr('resource-id'), enabled: attr('enabled') === 'true', x: Math.round((+x1 + +x2) / 2), y: Math.round((+y1 + +y2) / 2) };
  });
};
const findUiNode = (pred) => uiNodes().find(pred) ?? null;

/** Procura arquivos de backup do Ofício no armazenamento compartilhado. */
const findBackupFiles = () => {
  try {
    // Comando único com aspas: o shell do aparelho não expande os curingas; erros de pasta sem acesso são ignorados.
    return adb('shell', "find /sdcard/ -name 'oficio-backup-*.json' -not -path '*/Android/*' 2>/dev/null; true")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

/** Extratos exportados (PDF/CSV) no armazenamento compartilhado. */
const findStatementFiles = (ext) => {
  try {
    return adb('shell', `find /sdcard/ -name 'oficio-extrato-*.${ext}' -not -path '*/Android/*' 2>/dev/null; true`)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

const namesIn = (rows) => rows.map((r) => r.name ?? r.title ?? r.description);

const [device] = await android.devices({ omitDriverInstall: true });
assert(device, 'Nenhum dispositivo Android encontrado.');
console.log(`Dispositivo: ${device.model()} · Android SDK ${adb('shell', 'getprop', 'ro.build.version.sdk').trim()}`);

async function launch() {
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 90_000 });
  const page = await webview.page();
  page.setDefaultTimeout(20_000);
  currentPage = page;
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
    // O emulador do CI congelava ~2,5 min depois do boot, quando o teste coincidia com o trabalho
    // de primeiro boot do Android e do Google Play Services (CPU da máquina saturada). Antes das
    // etapas, espera o sistema se acalmar: carga do Android ≤ 2,0 em 3 leituras seguidas (5 s).
    // Limite de 6 min; se não estabilizar, segue assim mesmo e registra. Não muda nenhuma etapa.
    const start = Date.now();
    const loads = [];
    let calm = 0;
    while (calm < 3 && Date.now() - start < 360_000) {
      await wait(5000);
      const load = Number.parseFloat(guestLoad());
      loads.push(Number.isFinite(load) ? load : null);
      calm = load <= 2.0 ? calm + 1 : 0;
    }
    console.log(`\n  carga do Android após o boot (5 s): ${loads.join(' ')} → ${calm >= 3 ? 'estável' : 'não estabilizou'} em ${Math.round((Date.now() - start) / 1000)} s`);
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
    const ui = dumpUi();
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
    const form = page.getByRole('dialog', { name: /novo cliente/i });
    await form.getByLabel(/^nome/i).fill('Cliente Persistente');
    await form.getByLabel(/telefone/i).fill('11912345678');
    await tap(form.getByRole('button', { name: /cadastrar cliente/i }));
    await noteToast(page, /cliente cadastrado/i);
    // O formulário só fecha quando o cadastro é salvo com sucesso.
    await form.waitFor({ state: 'detached' });
    // Prova durável: gravado no IndexedDB exatamente uma vez...
    await eventually(async () => namesIn(await readStore(page, 'clients')).filter((n) => n === 'Cliente Persistente').length === 1, 'cliente não gravado (ou gravado em duplicidade) no IndexedDB');
    // ...e visível na lista de clientes.
    await tap(page.getByRole('navigation').getByRole('link', { name: /clientes/i }));
    await page.getByText('Cliente Persistente').waitFor();
    assert((await page.getByText('Cliente Persistente').count()) === 1, 'cliente aparece mais de uma vez na lista');
    await tap(page.getByRole('navigation').getByRole('link', { name: /painel/i }));
    await page.waitForFunction(() => location.hash === '#/painel');
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
    await noteToast(page, /atendimento concluído/i);
    // beta.5: os avisos não capturam toques fora do botão Desfazer, e há no máximo dois.
    const avisos = await page.evaluate(() => [...document.querySelectorAll('[data-toast]')].map((t) => {
      const r = t.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 12, r.top + r.height / 2);
      return { tipo: t.getAttribute('data-toast'), bloqueia: !!hit && t.contains(hit) };
    }));
    console.log(`\n  avisos na tela: ${JSON.stringify(avisos)}`);
    if (process.env.APK_RUN_ID) {
      // Diagnóstico com APK anterior à beta.5 (avisos ainda podiam empilhar/capturar toques): só registra.
      console.log(`  (APK da execução ${process.env.APK_RUN_ID}: regras de avisos da beta.5 apenas registradas)`);
    } else {
      assert(avisos.length <= 2, `mais de 2 avisos empilhados (${avisos.length})`);
      assert(avisos.every((a) => !a.bloqueia), 'um aviso está capturando toques fora do botão Desfazer');
    }
    // Prova durável: serviço concluído e UMA receita vinculada gravados.
    await eventually(async () => {
      const ap = (await readStore(page, 'appointments')).find((a) => a.title === 'Corte antecipado');
      const tx = (await readStore(page, 'transactions')).filter((t) => ap && t.appointmentId === ap.id);
      return ap?.status === 'concluido' && tx.length === 1 && ap.transactionId === tx[0].id;
    }, 'conclusão/receita não gravadas corretamente');
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
    await tap(page.getByRole('button', { name: /^ajustes$/i }));
    await tap(page.getByRole('button', { name: /aparência e personalização/i }));
    const escuro = page.getByRole('radio', { name: /escuro/i });
    await tap(escuro);
    // Duas provas separadas: o toque chegou ao seletor (marcado) e o tema foi aplicado.
    await eventually(async () => (await escuro.getAttribute('aria-checked')) === 'true', 'o toque em "Escuro" não chegou ao seletor de tema');
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

  await step('Central de Ajustes: Voltar do Android volta ao índice e depois ao Painel', async () => {
    await tap(page.getByRole('button', { name: /^ajustes$/i }));
    await tap(page.getByRole('button', { name: /sobre o ofício/i }));
    await page.waitForFunction(() => location.hash === '#/ajustes/sobre');
    await page.getByText(/compilação/i).waitFor(); // número real do APK instalado
    shot('04c-ajustes-sobre');
    back();
    await page.waitForFunction(() => location.hash === '#/ajustes');
    back();
    await page.waitForFunction(() => location.hash === '#/painel');
  });

  await step('Exportar backup: cancelar a janela "Salvar como" não salva nada', async () => {
    await tap(page.getByRole('button', { name: /^ajustes$/i }));
    await tap(page.getByRole('button', { name: /backup e dados/i }));
    await tap(page.getByRole('button', { name: /exportar backup/i }));
    const sheet = page.getByRole('dialog', { name: /exportar backup/i });
    await tap(sheet.getByRole('button', { name: /salvar no aparelho/i }));
    await eventually(() => /documentsui/.test(resumedPackage()), 'janela "Salvar como" do Android não abriu');
    await wait(1500);
    shot('05a-janela-salvar-como');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // cancela a janela do sistema
    await eventually(() => resumedPackage() === PKG, 'o app não voltou ao primeiro plano após cancelar');
    await sheet.waitFor(); // opções continuam abertas para tentar de novo
    await noteToast(page, /exportação cancelada/i);
    assert(findBackupFiles().length === 0, 'cancelar criou um arquivo de backup');
  });

  await step('Exportar backup: salvar pela janela "Salvar como" grava o JSON íntegro', async () => {
    const sheet = page.getByRole('dialog', { name: /exportar backup/i });
    await tap(sheet.getByRole('button', { name: /salvar no aparelho/i }));
    await eventually(() => /documentsui/.test(resumedPackage()), 'janela "Salvar como" do Android não abriu');
    // Botão "Salvar" da janela do sistema (texto depende do idioma do aparelho).
    const save = await eventually(() => findUiNode((n) => /^(save|salvar)$/i.test(n.text) && n.enabled), 'botão Salvar da janela do sistema não encontrado', 15_000);
    adb('shell', 'input', 'tap', String(save.x), String(save.y));
    await eventually(() => resumedPackage() === PKG, 'o app não voltou após salvar');
    await sheet.waitFor({ state: 'detached' }); // só fecha quando a gravação foi concluída
    await noteToast(page, /backup salvo/i);
    const files = await eventually(() => {
      const f = findBackupFiles();
      return f.length ? f : null;
    }, 'arquivo de backup não encontrado no armazenamento');
    console.log('\n  arquivo salvo:', files.join(', '));
    assert(files.length === 1, `esperado 1 arquivo de backup, encontrados ${files.length}`);
    shot('05-backup-salvo');
    backupJson = adb('shell', 'cat', files[0]);
    const saved = JSON.parse(backupJson);
    // Conteúdo íntegro: igual ao que está gravado no app.
    const dbClients = namesIn(await readStore(page, 'clients')).sort();
    const dbTx = (await readStore(page, 'transactions')).length;
    assert(saved.format === 'oficio-backup', 'formato do backup inválido');
    assert(JSON.stringify(namesIn(saved.data.clients).sort()) === JSON.stringify(dbClients), 'clientes do backup diferem do app');
    assert(saved.data.transactions.length === dbTx, 'lançamentos do backup diferem do app');
    assert(saved.data.clients.some((c) => c.name === 'Cliente Persistente'), 'backup sem o cliente cadastrado');
  });

  await step('Extrato do mês em PDF: "Salvar como" grava um PDF válido', async () => {
    await tap(page.getByRole('navigation').getByRole('link', { name: /finanças/i }));
    await tap(page.getByRole('button', { name: /exportar extrato do mês/i }));
    const sheet = page.getByRole('dialog', { name: /exportar extrato/i });
    await tap(sheet.getByRole('radio', { name: /pdf/i }));
    shot('05b-extrato-opcoes');
    await tap(sheet.getByRole('button', { name: /salvar no aparelho/i }));
    await eventually(() => /documentsui/.test(resumedPackage()), 'janela "Salvar como" do Android não abriu');
    const save = await eventually(() => findUiNode((n) => /^(save|salvar)$/i.test(n.text) && n.enabled), 'botão Salvar da janela do sistema não encontrado', 15_000);
    adb('shell', 'input', 'tap', String(save.x), String(save.y));
    await eventually(() => resumedPackage() === PKG, 'o app não voltou após salvar');
    await sheet.waitFor({ state: 'detached' });
    await noteToast(page, /extrato salvo/i);
    const files = await eventually(() => {
      const f = findStatementFiles('pdf');
      return f.length ? f : null;
    }, 'PDF do extrato não encontrado no armazenamento');
    console.log('\n  extrato salvo:', files.join(', '));
    // Binário íntegro: cabeçalho, fim e tamanho coerente (base64 → bytes no plugin nativo).
    const head = adb('shell', `head -c 8 '${files[0]}'`);
    const tail = adb('shell', `tail -c 6 '${files[0]}'`);
    const size = Number(adb('shell', `wc -c < '${files[0]}'`).trim());
    assert(head.startsWith('%PDF-1.4'), `cabeçalho do PDF inválido: ${JSON.stringify(head)}`);
    assert(tail.includes('%%EOF'), 'PDF sem marcador de fim');
    assert(size > 1500, `PDF pequeno demais (${size} bytes)`);
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
    const persisted = namesIn(await readStore(page, 'clients')).filter((n) => n === 'Cliente Persistente');
    assert(persisted.length === 1, `cliente não persistiu exatamente uma vez após reabrir (${persisted.length})`);
    await tap(page.getByRole('navigation').getByRole('link', { name: /clientes/i }));
    await page.getByText('Cliente Persistente').waitFor();
    shot('06-clientes-apos-reabrir');
  });

  await step('Importar backup (ex.: vindo da versão web)', async () => {
    const data = JSON.parse(backupJson);
    data.data.clients.push({ ...data.data.clients[0], id: 'importado-1', name: 'Cliente Importado' });
    await tap(page.getByRole('button', { name: /^ajustes$/i }));
    await tap(page.getByRole('button', { name: /backup e dados/i }));
    await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await tap(page.getByRole('button', { name: /^importar$/i }));
    await noteToast(page, /backup importado/i);
    await eventually(async () => {
      const names = namesIn(await readStore(page, 'clients'));
      return names.includes('Cliente Importado') && names.filter((n) => n === 'Cliente Persistente').length === 1;
    }, 'backup não importado no IndexedDB');
    await tap(page.getByRole('navigation').getByRole('link', { name: /clientes/i }));
    await page.getByText('Cliente Importado').waitFor();
    await page.getByText('Cliente Persistente').waitFor();
  });
} finally {
  writeFileSync(`${OUT}/resultado.json`, JSON.stringify(results, null, 2));
  try {
    writeFileSync(`${OUT}/logcat.txt`, execFileSync('adb', ['logcat', '-d', '-t', '3000'], { encoding: 'utf8', timeout: 30_000 }));
  } catch { /* sem logcat */ }
  await Promise.race([device?.close().catch(() => undefined), wait(15_000)]);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} etapas aprovadas.`);
process.exit(failed.length ? 1 : 0);
