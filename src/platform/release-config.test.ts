/**
 * 0.5.0 estável — configuração de release: versionCode, assinatura por segredos, release não depurável, nenhuma
 * chave no repositório e o fluxo de produção restrito ao ambiente protegido.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const versionCode = (v?: string) => execFileSync('node', ['ci/version-code.mjs', ...(v ? [v] : [])], { encoding: 'utf8' }).trim();

describe('0.5.0 estável: versionCode de release', () => {
  it('é determinístico, maior que o da RC.1 (227) e cresce com a versão', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const lock = JSON.parse(read('package-lock.json')) as { version: string; packages: Record<string, { version: string }> };
    expect(pkg.version).toBe('0.5.0');
    expect(lock.version).toBe('0.5.0');
    expect(lock.packages['']!.version).toBe('0.5.0');
    expect(versionCode()).toBe('50099');
    expect(Number(versionCode())).toBeGreaterThan(227);
    const order = ['0.5.0-alpha.1', '0.5.0-beta.1', '0.5.0-rc.1', '0.5.0-rc.2', '0.5.0', '0.5.1', '0.6.0-rc.1', '0.6.0', '1.0.0'].map((v) => Number(versionCode(v)));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(() => versionCode('0.5.0-build.7')).toThrow();
  });
});

describe('0.5.0 estável: assinatura e compilação de release', () => {
  const gradle = read('android/app/build.gradle');
  const release = gradle.slice(gradle.indexOf('buildTypes'), gradle.indexOf('repositories'));

  it('release não depurável, sem otimização que mude o comportamento validado e assinada só por variáveis de ambiente', () => {
    expect(release).toMatch(/release \{[\s\S]*debuggable false/);
    expect(release).toMatch(/minifyEnabled false/);
    expect(release).toMatch(/if \(System\.getenv\('OFICIO_RELEASE_KEYSTORE'\)\) \{\s*signingConfig signingConfigs\.release/);
    for (const v of ['OFICIO_RELEASE_STORE_PASSWORD', 'OFICIO_RELEASE_KEY_ALIAS', 'OFICIO_RELEASE_KEY_PASSWORD']) expect(gradle).toContain(`System.getenv('${v}')`);
    // A única senha literal é a da chave de DEPURAÇÃO derivada no CI ("android", padrão do Android).
    expect([...gradle.matchAll(/(?:store|key)Password\s+'([^']*)'/g)].map((m) => m[1])).toEqual(['android', 'android']);
    const releaseBlock = release.slice(release.indexOf('release {'));
    expect(releaseBlock).not.toMatch(/signingConfigs\.debug/);
  });

  it('chaves, senhas e google-services.json nunca entram no repositório', () => {
    const ignore = read('.gitignore');
    for (const p of ['*.jks', '*.keystore', '*.p12', 'keystore.properties', 'android/app/google-services.json']) expect(ignore).toContain(p);
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
    expect(tracked.filter((f) => /\.(jks|keystore|p12|pfx)$|google-services\.json$/.test(f))).toEqual([]);
  });

  it('registros do Capacitor só em depuração', () => {
    expect(read('capacitor.config.ts')).toMatch(/loggingBehavior: 'debug'/);
    expect(read('capacitor.config.ts')).not.toMatch(/webContentsDebuggingEnabled:\s*true/);
  });

  it('produção só por acionamento manual, no ambiente protegido, com segredos e conferência dos artefatos', () => {
    const wf = read('.github/workflows/release.yml');
    const prod = wf.slice(wf.indexOf('  producao:'));
    expect(prod).toMatch(/if: github\.event_name == 'workflow_dispatch' && inputs\.assinatura == 'producao'/);
    expect(prod).toMatch(/environment: producao/);
    expect(prod).toMatch(/secrets\.OFICIO_RELEASE_KEYSTORE_BASE64/);
    // Nada publica: sem GitHub Release, tag, Pages ou envio à Play Store.
    expect(wf).not.toMatch(/softprops|gh release create|git tag|deploy-pages|upload-google-play|r0adkll|fastlane/);
    const action = read('.github/actions/release-build/action.yml');
    expect(action).toMatch(/node ci\/verify-release\.mjs/);
    expect(action).toMatch(/rm -f "\$OFICIO_RELEASE_KEYSTORE"/);
    expect(action).toMatch(/::add-mask::\$PW/);
    // Nenhum echo de segredo.
    expect(action).not.toMatch(/echo[^\n]*\$(KS_B64|KS_PASS|KEY_PASS)\b(?![^\n]*>> "\$GITHUB_ENV")/);
  });
});
