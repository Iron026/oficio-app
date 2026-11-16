// Teste rápido do APK de RELEASE no emulador (0.5.0 estável). O APK de release não é depurável, então o teste de
// ponta a ponta completo (que controla a WebView) roda no APK de depuração do mesmo commit; aqui conferimos o que só
// o artefato de release mostra:
//   1. não atualiza por cima do APK de depuração (assinatura diferente) e os dados do app de depuração continuam;
//   2. instala do zero, não é depurável (run-as recusado), versionCode/versionName corretos;
//   3. abre sem queda, sem registros de depuração do Capacitor e sem porta de inspeção da WebView.
// Uso: node e2e/release-smoke.mjs <apk-release> [apk-debug-anterior] <versionCode> <versionName>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [releaseApk, debugApk, expectedCode, expectedName] = process.argv.slice(2);
const PKG = 'io.github.iron026.oficio';
const OUT = 'e2e-results';
mkdirSync(OUT, { recursive: true });
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' });
const tryAdb = (...args) => { try { return { ok: true, out: adb(...args) }; } catch (e) { return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message}` }; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try { const info = await fn(); results.push({ name, ok: true, info }); console.log('OK', info ? `\n  ${info}` : ''); }
  catch (e) { results.push({ name, ok: false, error: String(e.message ?? e) }); console.log(`FALHOU\n  ${e.message ?? e}`); }
};
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const pidOf = () => adb('shell', `pidof ${PKG}; true`).trim();

adb('wait-for-device');
for (let i = 0; i < 60 && adb('shell', 'getprop', 'sys.boot_completed').trim() !== '1'; i++) await wait(2000);
tryAdb('uninstall', PKG);

if (debugApk) {
  await step('APK de release não atualiza por cima do APK de depuração (dados do app de depuração continuam)', async () => {
    adb('install', debugApk);
    adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
    await wait(6000);
    adb('shell', `run-as ${PKG} sh -c 'mkdir -p files && echo dados > files/marcador-migracao'`);
    const before = /versionCode=(\d+)/.exec(adb('shell', 'dumpsys', 'package', PKG))?.[1];
    const r = tryAdb('install', '-r', releaseApk);
    assert(!r.ok && /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(r.out), `a instalação por cima deveria ser recusada: ${r.out.slice(0, 300)}`);
    const after = /versionCode=(\d+)/.exec(adb('shell', 'dumpsys', 'package', PKG))?.[1];
    assert(after === before, `versionCode mudou após a tentativa (${before} → ${after})`);
    const marker = adb('shell', `run-as ${PKG} cat files/marcador-migracao`).trim();
    assert(marker === 'dados', 'os dados do app de depuração não continuaram após a tentativa');
    adb('uninstall', PKG);
    return `recusado como esperado (assinatura diferente); app de depuração intacto (versionCode ${before})`;
  });
}

await step('Instalar o APK de release do zero', async () => {
  adb('install', releaseApk);
  const dump = adb('shell', 'dumpsys', 'package', PKG);
  const code = /versionCode=(\d+)/.exec(dump)?.[1];
  const name = /versionName=([^\s]+)/.exec(dump)?.[1];
  assert(code === expectedCode, `versionCode instalado ${code} (esperado ${expectedCode})`);
  assert(name === expectedName, `versionName instalado ${name} (esperado ${expectedName})`);
  const flags = /pkgFlags=\[([^\]]*)\]/.exec(dump)?.[1] ?? '';
  assert(!/DEBUGGABLE/.test(flags), `pacote instalado é depurável: ${flags}`);
  return `versionCode ${code} · versionName ${name} · flags: ${flags.trim()}`;
});

await step('Não é depurável: run-as recusado', async () => {
  const r = tryAdb('shell', `run-as ${PKG} ls`);
  assert(!r.ok || /not debuggable|is not debuggable|Package .* is not/i.test(r.out), `run-as funcionou no APK de release: ${r.out.slice(0, 200)}`);
  return 'run-as recusado';
});

await step('Abre sem queda, sem registros de depuração e sem inspeção da WebView', async () => {
  adb('logcat', '-c');
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
  await wait(12000);
  const pid = pidOf();
  assert(pid, 'o app não ficou aberto');
  const log = adb('logcat', '-d', '-v', 'brief');
  assert(!new RegExp(`FATAL EXCEPTION[\\s\\S]{0,400}${PKG}`).test(log), 'queda (FATAL EXCEPTION) ao abrir');
  const appLog = log.split('\n').filter((l) => l.includes(`(${pid.padStart(5)})`) || l.includes(`( ${pid})`) || l.includes(`(${pid})`));
  const capacitorLines = appLog.filter((l) => /\/Capacitor/.test(l));
  assert(capacitorLines.length === 0, `registros de depuração do Capacitor no APK de release: ${capacitorLines.slice(0, 3).join(' | ')}`);
  const sockets = adb('shell', 'cat', '/proc/net/unix');
  assert(!new RegExp(`webview_devtools_remote_${pid}\\b`).test(sockets), 'porta de inspeção da WebView aberta no APK de release');
  writeFileSync(`${OUT}/release-aberto.png`, execFileSync('adb', ['exec-out', 'screencap', '-p']));
  const resumed = /ResumedActivity.*?\{[^}]*\s([\w.]+)\//.exec(adb('shell', 'dumpsys', 'activity', 'activities'))?.[1];
  assert(resumed === PKG, `tela em primeiro plano: ${resumed}`);
  return `processo ${pid}; ${appLog.length} linhas do app no logcat, nenhuma do Capacitor; sem porta de inspeção`;
});

writeFileSync(`${OUT}/release-smoke.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} etapas aprovadas.`);
process.exit(failed.length ? 1 : 0);
