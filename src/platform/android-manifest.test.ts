import { readFileSync } from 'node:fs';

/** Regressão: o backup usa o Storage Access Framework, sem acesso amplo ao armazenamento. */
describe('AndroidManifest: permissões mínimas', () => {
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  const permissions = [...manifest.matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]);

  it('não solicita acesso irrestrito ao armazenamento', () => {
    for (const p of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES']) {
      expect(permissions).not.toContain(`android.permission.${p}`);
    }
  });

  it('declara somente as permissões necessárias', () => {
    expect(permissions).toEqual(['android.permission.INTERNET']);
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
});
