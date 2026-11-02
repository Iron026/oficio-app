import type { CapacitorConfig } from '@capacitor/cli';

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
  },
};

export default config;
