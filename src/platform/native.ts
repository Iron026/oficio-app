import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

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
export async function setSystemBarsDark(dark: boolean): Promise<void> {
  if (!isNative()) return;
  await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
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

/** Vibração curta de confirmação (somente no app). */
export async function hapticSuccess(strong = false): Promise<void> {
  if (!isNative()) return;
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
  await (strong ? Haptics.notification({ type: NotificationType.Success }) : Haptics.impact({ style: ImpactStyle.Light })).catch(() => undefined);
}
