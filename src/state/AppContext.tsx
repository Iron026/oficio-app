import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { getProfession, type ProfessionModule } from '../domain/professions';
import type { AppData } from '../domain/types';
import { useToast } from '../ui/Toast';
import { friendlyError } from '../lib/errors';
import { hapticSuccess, setSystemBarsDark } from '../platform/native';
import type { AppService, Feedback } from './service';

interface Ctx { service: AppService; persistent: boolean }

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ service, persistent, children }: Ctx & { children: ReactNode }) {
  return <AppCtx.Provider value={{ service, persistent }}>{children}</AppCtx.Provider>;
}

export function useApp(): { service: AppService; data: AppData; profession: ProfessionModule; persistent: boolean } {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp fora do AppProvider');
  const data = useSyncExternalStore(
    (cb) => ctx.service.subscribe(cb),
    () => ctx.service.data,
  );
  return { service: ctx.service, data, profession: getProfession(data.profile?.professionId), persistent: ctx.persistent };
}

/** Converte o resultado da gamificação em feedback visual (toasts). */
export function useFeedback() {
  const toast = useToast();
  return useCallback(
    (message: string, feedback?: Feedback, description?: string) => {
      toast({ title: message, description, tone: 'success', xp: feedback?.xpGained || undefined });
      void hapticSuccess(!!feedback && (feedback.achievements.length > 0 || !!feedback.levelUp));
      if (!feedback) return;
      for (const e of feedback.events) {
        if (e.category === 'missao' || e.category === 'meta') toast({ title: e.label, tone: 'xp', xp: e.xp });
      }
      for (const e of feedback.events.filter((x) => x.category === 'conquista')) {
        toast({ title: 'Conquista desbloqueada!', description: e.label.replace('Conquista: ', ''), tone: 'achievement', xp: e.xp });
      }
      if (feedback.levelUp) toast({ title: `Você chegou ao nível ${feedback.levelUp}!`, description: 'Continue evoluindo no seu ofício.', tone: 'achievement' });
    },
    [toast],
  );
}

/** Trata erros de operações exibindo uma mensagem amigável. */
export function useErrorHandler() {
  const toast = useToast();
  return useCallback(
    (err: unknown) => {
      const msg = friendlyError(err);
      if (!msg) return;
      console.error(err);
      toast({ ...msg, tone: 'error' });
    },
    [toast],
  );
}

/**
 * Cor dos ícones das barras do sistema no Android.
 * - Tela inteira (WebView >= 140): o app aparece atrás das barras → segue o tema do app.
 * - WebView posicionado entre as barras (WebView < 140): atrás delas fica o fundo
 *   da janela nativa, que segue o tema do SISTEMA → os ícones seguem o sistema.
 */
export function systemBarsShouldBeDark(appDark: boolean, systemDark: boolean, injectedInsetTop: number): boolean {
  const edgeToEdge = injectedInsetTop > 0;
  return edgeToEdge ? appDark : systemDark;
}

/** Aplica o tema (claro/escuro/sistema) ao documento. */
export function useThemeEffect(theme: AppData['settings']['theme']) {
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const systemDark = !!media?.matches;
      const dark = theme === 'dark' || (theme === 'system' && systemDark);
      document.documentElement.classList.toggle('dark', dark);
      const inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) || 0;
      void setSystemBarsDark(systemBarsShouldBeDark(dark, systemDark, inset));
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1215' : '#0f7b71');
    };
    apply();
    // O Capacitor injeta as áreas seguras após o carregamento: reavalia depois.
    const t = setTimeout(apply, 600);
    media?.addEventListener?.('change', apply);
    window.addEventListener('resize', apply);
    return () => {
      clearTimeout(t);
      media?.removeEventListener?.('change', apply);
      window.removeEventListener('resize', apply);
    };
  }, [theme]);
}
