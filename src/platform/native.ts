import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';

/** true quando roda dentro do app Android (Capacitor), false no navegador. */
export const isNative = (): boolean => Capacitor.isNativePlatform();
export const platformName = (): string => Capacitor.getPlatform(); // 'android' | 'web'

/** Esconde a tela de abertura nativa quando os dados terminam de carregar. */
export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  const { SplashScreen } = await import('@capacitor/splash-screen');
  await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);
}

/** Ícones claros na barra de status/navegação no modo escuro e vice-versa. */
export async function setSystemBarsDark(dark: boolean, bar?: 'status' | 'navigation'): Promise<void> {
  if (!isNative()) return;
  const which = bar === 'status' ? SystemBarType.StatusBar : bar === 'navigation' ? SystemBarType.NavigationBar : undefined;
  await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light, ...(which ? { bar: which } : {}) }).catch(() => undefined);
}

/** Registra o botão Voltar do Android. Retorna função para remover. */
export async function onAndroidBack(handler: () => void): Promise<() => void> {
  if (!isNative()) return () => undefined;
  const { App } = await import('@capacitor/app');
  const sub = await App.addListener('backButton', handler);
  return () => void sub.remove();
}

/** Coloca o app em segundo plano (comportamento padrão do Android na tela inicial). */
export async function minimizeApp(): Promise<void> {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  await App.minimizeApp().catch(() => App.exitApp());
}

/** Ao abrir o teclado, mantém o campo em foco visível. */
export async function setupKeyboard(): Promise<void> {
  if (!isNative()) return;
  const { Keyboard } = await import('@capacitor/keyboard');
  await Keyboard.addListener('keyboardDidShow', () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

interface OficioHapticsPlugin { perform(opts: { strong: boolean }): Promise<{ performed: boolean }> }
let haptics: OficioHapticsPlugin | null = null;

/**
 * Toque curto de confirmação (somente no app, e só se a pessoa ligou em Ajustes).
 * Usa o feedback tátil do próprio Android (View.performHapticFeedback), que respeita o ajuste
 * do sistema "Vibração e tátil › Feedback tátil": desligado lá, nada vibra aqui.
 */
export async function hapticSuccess(enabled: boolean, strong = false): Promise<void> {
  if (!enabled || !isNative()) return;
  if (!haptics) {
    const { registerPlugin } = await import('@capacitor/core');
    haptics = registerPlugin<OficioHapticsPlugin>('OficioHaptics');
  }
  await haptics.perform({ strong }).catch(() => undefined);
}

/** Versão e número de compilação reais do app instalado (Android); null no navegador. */
export async function appBuildInfo(): Promise<{ version: string; build: string } | null> {
  if (!isNative()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return { version: info.version, build: info.build };
  } catch {
    return null;
  }
}
