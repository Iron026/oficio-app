/**
 * Configuração pública do app web do Firebase. Esses valores identificam o
 * projeto (não são segredos), mas dependem da conta do responsável: são
 * injetados no build pelo GitHub Actions (variáveis do repositório) e NUNCA
 * ficam versionados. Sem eles, o Ofício funciona apenas localmente.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

type Env = Record<string, string | boolean | undefined>;

export function readFirebaseConfig(env: Env = import.meta.env): FirebaseWebConfig | null {
  const get = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');
  const cfg = {
    apiKey: get('VITE_FIREBASE_API_KEY'),
    authDomain: get('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: get('VITE_FIREBASE_PROJECT_ID'),
    appId: get('VITE_FIREBASE_APP_ID'),
    storageBucket: get('VITE_FIREBASE_STORAGE_BUCKET') || undefined,
    messagingSenderId: get('VITE_FIREBASE_MESSAGING_SENDER_ID') || undefined,
  };
  return cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId ? cfg : null;
}

/** Emuladores locais do Firebase (somente testes automatizados). */
export function readEmulatorHost(env: Env = import.meta.env): string | null {
  const h = env.VITE_FIREBASE_EMULATOR_HOST;
  return typeof h === 'string' && h ? h : null;
}
