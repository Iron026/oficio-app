import { useEffect, useRef, useState } from 'react';
import { useApp, useThemeEffect, AppProvider } from './state/AppContext';
import { decideBack } from './platform/backStack';
import { hideSplash, minimizeApp, onAndroidBack, setupKeyboard } from './platform/native';
import { navigate, useRoute, type Route } from './state/router';
import { AppService } from './state/service';
import { createStorage, type StorageAdapter } from './storage';
import { ConfirmProvider } from './ui/Confirm';
import { ToastProvider } from './ui/Toast';
import { Agenda } from './screens/Agenda';
import { Clients } from './screens/Clients';
import { Dashboard } from './screens/Dashboard';
import { Evolution } from './screens/Evolution';
import { Finance } from './screens/Finance';
import { Onboarding } from './screens/Onboarding';
import { Settings } from './screens/Settings';
import { Logo, Shell } from './screens/Shell';

type Boot = { service: AppService; persistent: boolean };

/** `storageFactory` permite injetar outro armazenamento (ex.: em testes). */
export function App({ storageFactory }: { storageFactory?: () => Promise<{ storage: StorageAdapter; persistent: boolean }> }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { storage, persistent } = await (storageFactory ?? createStorage)();
      const service = await AppService.load(storage);
      if (!cancelled) setBoot({ service, persistent });
      void setupKeyboard();
    })()
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setError('Não foi possível abrir seus dados. Feche e abra o app novamente. Se o problema continuar, restaure um backup em Ajustes.');
      })
      .finally(() => void hideSplash());
    return () => {
      cancelled = true;
    };
  }, [storageFactory]);

  if (error) return <Splash message={error} />;
  if (!boot) return <Splash />;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppProvider service={boot.service} persistent={boot.persistent}>
          <Root />
        </AppProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Splash({ message }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className={message ? '' : 'animate-pulse'}><Logo size={56} /></div>
      <p className="text-muted">{message ?? 'Carregando…'}</p>
    </div>
  );
}

const TITLES: Record<Route, string> = {
  painel: 'Painel', agenda: 'Agenda', clientes: 'Clientes', financas: 'Finanças', evolucao: 'Evolução', ajustes: 'Ajustes',
};

function Root() {
  const { data } = useApp();
  const route = useRoute();
  useThemeEffect(data.settings.theme);
  useAndroidBack(route, !data.profile);
  if (!data.profile) return <Onboarding />;
  const screens: Record<Route, React.ReactNode> = {
    painel: <Dashboard />, agenda: <Agenda />, clientes: <Clients />, financas: <Finance />, evolucao: <Evolution />, ajustes: <Settings />,
  };
  return (
    <Shell route={route} title={TITLES[route]}>
      {screens[route]}
    </Shell>
  );
}

/** Botão Voltar do Android: fecha painéis, volta ao Painel e, por fim, minimiza o app. */
function useAndroidBack(route: Route, onboarding: boolean) {
  const state = useRef({ route, onboarding });
  useEffect(() => {
    state.current = { route, onboarding };
  });
  useEffect(() => {
    let remove: (() => void) | undefined;
    let disposed = false;
    void onAndroidBack(() => {
      const action = decideBack(state.current.route, state.current.onboarding);
      if (action === 'home') navigate('painel');
      else if (action === 'exit') void minimizeApp();
    }).then((r) => {
      if (disposed) r();
      else remove = r;
    });
    return () => {
      disposed = true;
      remove?.();
    };
  }, []);
}
