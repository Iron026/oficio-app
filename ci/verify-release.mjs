#!/usr/bin/env node
// Conferência dos artefatos de RELEASE (APK + AAB) do Ofício. Falha (exit 1) se algo não bater.
// Grava release-manifest.json (sem segredos: só versões, certificados públicos e somas SHA-256).
// Uso: node ci/verify-release.mjs --apk A --aab B --tools BUILD_TOOLS --bundletool JAR --mode teste|producao
//        --firebase true|false --version V --code N --commit SHA --out manifest.json [--summary arquivo.md]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const opt = Object.fromEntries(['apk', 'aab', 'tools', 'bundletool', 'mode', 'firebase', 'version', 'code', 'commit', 'out', 'summary'].map((k) => [k, arg(k)]));
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

export const PACKAGE = 'io.github.iron026.oficio';
export const DEBUG_CERT_SHA256 = 'd39f3729217b3e3c59bf3bd43552d0eee13dd1162163e44b32ab3038bdbb67a3';
export const FORBIDDEN_PERMISSIONS = [
  'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO',
  'READ_MEDIA_AUDIO', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM', 'CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION', 'READ_CONTACTS', 'READ_PHONE_STATE', 'SYSTEM_ALERT_WINDOW', 'REQUEST_INSTALL_PACKAGES',
].map((p) => `android.permission.${p}`);

// ---- APK: identidade, depuração, permissões, backup, FileProvider, Firebase
const aapt2 = join(opt.tools, 'aapt2');
const badging = run(aapt2, ['dump', 'badging', opt.apk]);
const pkg = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/.exec(badging);
check(pkg?.[1] === PACKAGE, `pacote do APK: ${pkg?.[1]}`);
check(pkg?.[2] === opt.code, `versionCode do APK: ${pkg?.[2]} (esperado ${opt.code})`);
check(pkg?.[3] === opt.version, `versionName do APK: ${pkg?.[3]} (esperado ${opt.version})`);
check(!/application-debuggable/.test(badging), 'APK depurável (application-debuggable)');
const permissions = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]).sort();
for (const p of FORBIDDEN_PERMISSIONS) check(!permissions.includes(p), `permissão não permitida: ${p}`);

const manifest = run(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', opt.apk]);
check(!/:debuggable\([^)]*\)=true/.test(manifest), 'android:debuggable=true no manifesto');
check(/:allowBackup\([^)]*\)=false/.test(manifest), 'android:allowBackup não é false');
check(new RegExp(`authorities\\([^)]*\\)="${PACKAGE.replace(/\./g, '\\.')}\\.fileprovider"`).test(manifest), 'FileProvider ausente');
// Em release, o Gradle encurta os caminhos dos recursos (res/xml/file_paths.xml → res/Xy.xml): o caminho real vem da
// tabela de recursos.
const resources = run(aapt2, ['dump', 'resources', opt.apk]);
const pathsFile = /xml\/file_paths\b[\s\S]*?\(file\) (\S+)/.exec(resources)?.[1];
check(!!pathsFile, 'recurso xml/file_paths (FileProvider) não encontrado');
const paths = pathsFile ? run(aapt2, ['dump', 'xmltree', '--file', pathsFile, opt.apk]) : '';
// Os atributos de file_paths (name, path) não têm namespace: aparecem como `A: path="…"` (sem `android:` nem id).
export const fileProviderEntries = (xml) => xml.split(/\n(?=\s*E: )/).flatMap((block) => {
  const el = /E: ([\w-]+-path)\b/.exec(block)?.[1];
  const path = /(?:^|[\s:])path(?:\([^)]*\))?="([^"]*)"/m.exec(block)?.[1];
  return el ? [`${el} ${path ?? ''}`] : [];
});
const pathEntries = fileProviderEntries(paths);
check(JSON.stringify(pathEntries) === JSON.stringify(['cache-path compartilhar/', 'external-files-path Pictures/']), `FileProvider com escopo inesperado: ${pathEntries.join(', ')}`);
const firebaseIncluded = /string\/google_app_id/.test(resources);
// Configuração do Capacitor embutida: registros só em depuração e inspeção da WebView não forçada (o padrão do
// Capacitor liga a inspeção apenas quando o app é depurável).
const capConfig = JSON.parse(run('unzip', ['-p', opt.apk, 'assets/capacitor.config.json']) || '{}');
check(capConfig.loggingBehavior === 'debug', `loggingBehavior do Capacitor: ${capConfig.loggingBehavior} (esperado "debug")`);
check(capConfig.android?.webContentsDebuggingEnabled !== true, 'inspeção da WebView forçada (android.webContentsDebuggingEnabled)');
check(capConfig.appId === PACKAGE && capConfig.server?.hostname === 'localhost' && capConfig.server?.androidScheme === 'https', 'appId ou origem https://localhost alterados na configuração do Capacitor');
if (opt.firebase === 'true') check(firebaseIncluded, 'configuração do Firebase (google_app_id) ausente no APK');

// ---- APK: assinatura
const apksigner = join(opt.tools, 'apksigner');
const signer = run(apksigner, ['verify', '--verbose', '--print-certs', opt.apk]);
check(/Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(signer), 'APK sem assinatura v2 válida');
// O rótulo do assinante varia com a versão do apksigner ("Signer #1" ou "Signer (minSdkVersion=…)"): usa o primeiro.
const signerCerts = new Set([...signer.matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/g)].map((m) => m[1]));
check(signerCerts.size === 1, `esperado 1 certificado no APK, encontrados ${signerCerts.size}`);
const certSha256 = /certificate SHA-256 digest: ([0-9a-f]{64})/.exec(signer)?.[1];
const certSha1 = /certificate SHA-1 digest: ([0-9a-f]{40})/.exec(signer)?.[1];
const certDn = /certificate DN: (.+)/.exec(signer)?.[1]?.trim();
check(!!certSha256 && !!certSha1, 'certificado do APK não lido');
check(certSha256 !== DEBUG_CERT_SHA256, 'APK de release assinado com a chave de DEPURAÇÃO');
check(!/Android Debug/i.test(certDn ?? ''), 'APK assinado com a chave de depuração padrão do Android');
if (opt.mode === 'teste') check(/TESTE/.test(certDn ?? ''), 'build de teste sem a chave efêmera de teste');
if (opt.mode === 'producao') check(!/TESTE/.test(certDn ?? ''), 'build de produção assinada com chave de teste');

// ---- AAB: versões e certificado iguais aos do APK
const bt = (xpath) => run('java', ['-jar', opt.bundletool, 'dump', 'manifest', '--bundle', opt.aab, '--xpath', xpath]).trim();
check(bt('/manifest/@package') === PACKAGE, 'pacote do AAB difere');
check(bt('/manifest/@android:versionCode') === opt.code, `versionCode do AAB: ${bt('/manifest/@android:versionCode')}`);
check(bt('/manifest/@android:versionName') === opt.version, `versionName do AAB: ${bt('/manifest/@android:versionName')}`);
check(bt('/manifest/application/@android:debuggable') !== 'true', 'AAB depurável');
const aabCert = run('keytool', ['-printcert', '-jarfile', opt.aab]);
const aabSha256 = /SHA256: ([0-9A-F:]+)/.exec(aabCert)?.[1]?.replace(/:/g, '').toLowerCase();
check(aabSha256 === certSha256, 'AAB assinado com certificado diferente do APK');

const result = {
  app: PACKAGE,
  version: opt.version,
  versionCode: Number(opt.code),
  commit: opt.commit,
  signing: opt.mode,
  publishable: opt.mode === 'producao',
  certificate: { dn: certDn, sha256: certSha256, sha1: certSha1 },
  firebaseIncluded,
  debuggable: false,
  capacitor: { loggingBehavior: capConfig.loggingBehavior, webContentsDebuggingEnabled: capConfig.android?.webContentsDebuggingEnabled ?? 'padrão (só se depurável)' },
  permissions,
  fileProvider: pathEntries,
  files: {
    [basename(opt.apk)]: { sha256: sha256(opt.apk), bytes: readFileSync(opt.apk).length },
    [basename(opt.aab)]: { sha256: sha256(opt.aab), bytes: readFileSync(opt.aab).length },
  },
  failures,
};
writeFileSync(opt.out, JSON.stringify(result, null, 2));
// Saídas brutas das ferramentas (só dados públicos: certificados e manifesto) para conferência manual.
writeFileSync(opt.out.replace(/\.json$/, '-ferramentas.txt'), [
  '== apksigner verify --print-certs', signer, '== aapt2 xmltree file_paths', paths, '== keytool -printcert (AAB)', aabCert,
].join('\n'));
const colon = (h) => h?.toUpperCase().match(/../g)?.join(':');
const lines = [
  `### Release ${opt.version} (${opt.mode === 'producao' ? 'PRODUÇÃO' : 'TESTE — NÃO PUBLICAR'})`,
  `- Commit: \`${opt.commit}\` · versionCode ${opt.code} · Firebase incluído: ${firebaseIncluded}`,
  `- Certificado: ${certDn}`,
  `  - SHA-256: \`${colon(certSha256)}\``,
  `  - SHA-1: \`${colon(certSha1)}\``,
  ...Object.entries(result.files).map(([f, v]) => `- \`${f}\` · SHA-256 \`${v.sha256}\` · ${v.bytes} bytes`),
  `- Permissões: ${permissions.join(', ')}`,
  failures.length ? `- **Falhas:** ${failures.join('; ')}` : '- Conferência: **aprovada**',
];
console.log(lines.join('\n'));
if (opt.summary) appendFileSync(opt.summary, lines.join('\n') + '\n');
if (failures.length) {
  console.error(`\nFalhas na conferência:\n- ${failures.join('\n- ')}`);
  console.error(`\n--- apksigner ---\n${signer}\n--- file_paths ---\n${paths}`);
  process.exit(1);
}
