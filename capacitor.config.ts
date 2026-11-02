import { existsSync, readFileSync } from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * O login Google nativo só entra no app quando o arquivo de configuração do
 * Firebase (android/app/google-services.json, fornecido pelo CI a partir de
 * um segredo do repositório) existe. Sem ele, o APK funciona só localmente,
 * sem risco de falha ao iniciar.
 */
const firebaseConfigured = existsSync('android/app/google-services.json');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
const nativePlugins = Object.keys(pkg.dependencies).filter(
  (d) => (d.startsWith('@capacitor/') && !['@capacitor/core', '@capacitor/android'].includes(d)) || d.startsWith('@capacitor-firebase/'),
);
const includePlugins = firebaseConfigured ? nativePlugins : nativePlugins.filter((d) => !d.startsWith('@capacitor-firebase/'));

/**
 * Configuração do app nativo (Capacitor).
 *
 * ATENÇÃO — valores que NÃO devem mudar depois de publicado:
 * - appId: identifica o app no Android/Play Store. Mudá-lo cria "outro app".
 * - server.androidScheme + hostname: definem a origem (https://localhost) onde
 *   o IndexedDB fica salvo. Mudá-los faz o app "perder" os dados locais.
 */
const config: CapacitorConfig = {
  appId: 'io.github.iron026.oficio',
  appName: 'Ofício',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    includePlugins,
  },
  plugins: {
    SystemBars: {
      // Injeta --safe-area-inset-* no CSS (corrige WebViews < 140).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false, // escondida pelo app quando os dados terminam de carregar
      launchFadeOutDuration: 200,
      backgroundColor: '#0f7b71',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
    FirebaseAuthentication: {
      // Login nativo apenas obtém a credencial Google; a sessão fica no SDK JS do Firebase.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
