import { useEffect, useRef, useState } from 'react';
import { HideValuesContext } from './ui/privacy';
import { useApp, useAppearanceEffect, usePrefs, useThemeEffect, AppProvider } from './state/AppContext';
import { decideBack } from './platform/backStack';
import { hideSplash, minimizeApp, onAndroidBack, setupKeyboard } from './platform/native';
import { navigate, useLocation, type Route } from './state/router';
import { AppService } from './state/service';
import { createStorage, type StorageAdapter } from './storage';
import { createCloud, type Cloud } from './cloud';
import { AccountController } from './state/account';
import { CloudProvider } from './state/CloudContext';
import { SyncEngine } from './sync/engine';
import { TrackedStorage } from './sync/tracked';
import { ConfirmProvider } from './ui/Confirm';
import { ToastProvider } from './ui/Toast';
import { CelebrationProvider } from './ui/Celebration';
import { Agenda } from './screens/Agenda';
import { Clients } from './screens/Clients';
import { Dashboard } from './screens/Dashboard';
import { Evolution } from './screens/Evolution';
import { Finance } from './screens/Finance';
import { Onboarding } from './screens/Onboarding';
import { Settings } from './screens/Settings';
import { settingsTitle } from './screens/settings/pages';
import { Logo, Shell } from './screens/Shell';
import { HideValuesToggle } from './screens/HideValuesToggle';

type Boot = { service: AppService; persistent: boolean; sync: SyncEngine };

interface AppProps {
  /** Permite injetar outro armazenamento (ex.: em testes). */
  storageFactory?: () => Promise<{ storage: StorageAdapter; persistent: boolean }>;
  /** Permite injetar a nuvem (ex.: autenticação simulada em testes). */
  cloudFactory?: () => Promise<Cloud>;
}

export function App({ storageFactory, cloudFactory }: AppProps) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [account, setAccount] = useState<AccountController | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sync: SyncEngine | null = null;
    let stopAuth: (() => void) | undefined;
    (async () => {
      const { storage, persistent } = await (storageFactory ?? createStorage)();
      const tracked = new TrackedStorage(storage);
      const service = await AppService.load(tracked);
      const engine = await SyncEngine.create(service, tracked, null);
      sync = engine;
      if (cancelled) return engine.dispose();
      // 0.4: reconhece selos já merecidos pelo histórico (idempotente, sem XP).
      await service.reconcileSeals();
      // beta.3: completa as séries recorrentes até 90 dias à frente (sem XP; idempotente).
      await service.extendSeries().catch(() => undefined);
      setBoot({ service, persistent, sync: engine });
      void setupKeyboard();
      // Conta Google e nuvem carregam depois, sem atrasar a abertura (e o app funciona sem elas).
      void (cloudFactory ?? createCloud)().then(async (cloud) => {
        if (cancelled) return;
        engine.setRemote(cloud.remote);
        const controller = new AccountController(cloud.auth, engine);
        stopAuth = cloud.auth.onChange((u) => void engine.setUser(u?.uid ?? null));
        await cloud.auth.ready().catch(() => undefined);
        if (cancelled) return;
        await engine.setUser(cloud.auth.current()?.uid ?? null);
        if (!cancelled) setAccount(controller);
      });
    })()
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setError('Não foi possível abrir seus dados. Feche e abra o app novamente. Se o problema continuar, restaure um backup em Ajustes.');
      })
      .finally(() => void hideSplash());
    return () => {
      // Ao desmontar, nenhum temporizador ou ouvinte do app pode continuar ativo.
      cancelled = true;
      stopAuth?.();
      sync?.dispose();
    };
  }, [storageFactory, cloudFactory]);

  if (error) return <Splash message={error} />;
  if (!boot) return <Splash />;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppProvider service={boot.service} persistent={boot.persistent}>
          <CloudProvider sync={boot.sync} account={account}>
            <Root />
          </CloudProvider>
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
  const { route, sub } = useLocation();
  const prefs = usePrefs();
  useThemeEffect(prefs.theme);
  useAppearanceEffect(data.settings, prefs);
  useAndroidBack(route, !data.profile, sub);
  if (!data.profile) return <Onboarding />;
  const screens: Record<Route, React.ReactNode> = {
    painel: <Dashboard />, agenda: <Agenda />, clientes: <Clients />, financas: <Finance />, evolucao: <Evolution />, ajustes: <Settings />,
  };
  return (
    <HideValuesContext.Provider value={prefs.hideValues}>
      <CelebrationProvider>
        <Shell
          route={route}
          pageKey={(route === 'ajustes' || route === 'financas') && sub ? `${route}/${sub}` : route}
          title={route === 'ajustes' ? settingsTitle(sub) : route === 'financas' && sub === 'relatorios' ? 'Relatórios' : TITLES[route]}
          action={route === 'painel' || route === 'financas' ? <HideValuesToggle /> : undefined}
        >
          {screens[route]}
        </Shell>
      </CelebrationProvider>
    </HideValuesContext.Provider>
  );
}

/** Botão Voltar do Android: fecha painéis, volta ao Painel e, por fim, minimiza o app. */
function useAndroidBack(route: Route, onboarding: boolean, sub = '') {
  const state = useRef({ route, onboarding, sub });
  useEffect(() => {
    state.current = { route, onboarding, sub };
  });
  useEffect(() => {
    let remove: (() => void) | undefined;
    let disposed = false;
    void onAndroidBack(() => {
      // beta.4: de Relatórios, o Voltar leva a Finanças.
      if (state.current.route === 'financas' && state.current.sub) return navigate('financas');
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
