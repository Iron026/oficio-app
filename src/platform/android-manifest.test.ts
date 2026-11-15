import { readFileSync } from 'node:fs';

/** Regressão: o backup usa o Storage Access Framework, sem acesso amplo ao armazenamento. */
describe('AndroidManifest: permissões mínimas', () => {
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  const declared = [...manifest.matchAll(/<uses-permission([^>]*)>/g)].map((m) => m[1]!);
  // Entradas com tools:node="remove" tiram do manifesto final permissões que plugins declaram.
  const permissions = declared.filter((d) => !/tools:node="remove"/.test(d)).map((d) => /android:name="([^"]+)"/.exec(d)![1]);
  const removed = declared.filter((d) => /tools:node="remove"/.test(d)).map((d) => /android:name="([^"]+)"/.exec(d)![1]);

  it('não solicita acesso irrestrito ao armazenamento', () => {
    for (const p of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES']) {
      expect(permissions).not.toContain(`android.permission.${p}`);
    }
  });

  it('declara somente as permissões necessárias', () => {
    expect(permissions).toEqual(['android.permission.INTERNET']);
  });

  it('beta.4: lembretes não exatos — remove SCHEDULE_EXACT_ALARM (e não pede USE_EXACT_ALARM)', () => {
    expect(removed).toEqual(['android.permission.SCHEDULE_EXACT_ALARM']);
    expect(permissions).not.toContain('android.permission.USE_EXACT_ALARM');
    expect(manifest).toMatch(/xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  });

  it('beta.4: notificações com ícone pequeno monocromático próprio', () => {
    const icon = readFileSync('android/app/src/main/res/drawable/ic_stat_oficio.xml', 'utf8');
    expect(icon).toMatch(/<vector/);
    expect([...icon.matchAll(/android:(?:fill|stroke)Color="([^"]+)"/g)].map((m) => m[1])).toEqual(['#FFFFFF', '#FFFFFF']);
    expect(readFileSync('capacitor.config.ts', 'utf8')).toMatch(/smallIcon: 'ic_stat_oficio'/);
  });

  it('registra o plugin de salvar backup na atividade principal', () => {
    const activity = readFileSync('android/app/src/main/java/io/github/iron026/oficio/MainActivity.java', 'utf8');
    expect(activity).toMatch(/registerPlugin\(BackupFilePlugin\.class\)/);
    const plugin = readFileSync('android/app/src/main/java/io/github/iron026/oficio/BackupFilePlugin.java', 'utf8');
    expect(plugin).toMatch(/ACTION_CREATE_DOCUMENT/);
    expect(plugin).toMatch(/StandardCharsets\.UTF_8/);
  });

  it('beta.5: vibração pelo feedback tátil do sistema (respeita o ajuste do Android), sem o plugin que vibra direto', () => {
    const activity = readFileSync('android/app/src/main/java/io/github/iron026/oficio/MainActivity.java', 'utf8');
    expect(activity).toMatch(/registerPlugin\(HapticsPlugin\.class\)/);
    const plugin = readFileSync('android/app/src/main/java/io/github/iron026/oficio/HapticsPlugin.java', 'utf8');
    expect(plugin).toMatch(/performHapticFeedback\(effect\)/);
    const code = plugin.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // sem comentários
    expect(code).not.toMatch(/FLAG_IGNORE_GLOBAL_SETTING|Vibrator/);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capacitor/haptics']).toBeUndefined();
    expect(readFileSync('android/capacitor.settings.gradle', 'utf8')).not.toMatch(/haptics/);
  });

  it('estabilização 0.5.0: FileProvider expõe só a pasta de compartilhamento e as fotos da câmera do próprio app', () => {
    const paths = readFileSync('android/app/src/main/res/xml/file_paths.xml', 'utf8');
    const entries = [...paths.matchAll(/<([\w-]+-path)\s+name="([^"]+)"\s+path="([^"]*)"\s*\/>/g)].map((m) => `${m[1]} ${m[3]}`);
    // Antes: external-path "." (todo o armazenamento compartilhado) e cache-path "." (todo o cache).
    expect(entries).toEqual(['cache-path compartilhar/', 'external-files-path Pictures/']);
    expect(manifest).toMatch(/android:exported="false"/);
    expect(manifest).toMatch(/android:grantUriPermissions="true"/);
    // A pasta usada pelo app (src/platform/files.ts) é a mesma liberada no FileProvider.
    expect(readFileSync('src/platform/files.ts', 'utf8')).toMatch(/const SHARE_DIR = 'compartilhar';/);
  });

  it('estabilização 0.5.0: a exportação não leva o conteúdo no estado salvo da atividade', () => {
    const plugin = readFileSync('android/app/src/main/java/io/github/iron026/oficio/BackupFilePlugin.java', 'utf8');
    // O conteúdo vai para um arquivo privado antes de abrir a janela; a chamada guarda só o caminho.
    const save = plugin.slice(plugin.indexOf('public void saveDocument'), plugin.indexOf('@ActivityCallback'));
    expect(save.indexOf('call.getData().remove("content")')).toBeGreaterThan(-1);
    expect(save.indexOf('call.getData().remove("content")')).toBeLessThan(save.indexOf('startActivityForResult'));
    expect(plugin).toMatch(/PENDING_DIR = "exportacao-pendente"/);
    expect(plugin).toMatch(/getCacheDir\(\), PENDING_DIR/);
    // A pasta temporária não é exposta pelo FileProvider.
    expect(readFileSync('android/app/src/main/res/xml/file_paths.xml', 'utf8')).not.toMatch(/exportacao-pendente/);
  });
});

