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
    writeFileSync(`${OUT}/logcat.txt`, adb('logcat', '-d', '-t', '3000'));
  } catch { /* sem logcat */ }
  await device?.close().catch(() => undefined);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} etapas aprovadas.`);
process.exit(failed.length ? 1 : 0);
