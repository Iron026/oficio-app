import type { FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { isCancelError, type AuthService, type CloudUser } from './auth';

const toCloudUser = (u: User | null): CloudUser | null =>
  u ? { uid: u.uid, name: u.displayName, email: u.email, photoURL: u.photoURL } : null;

/** No app Android usa login nativo (Credential Manager), nunca login dentro do WebView. */
export const isNativeGoogle = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FirebaseAuthentication');

export class FirebaseAuthService implements AuthService {
  readonly available = true;
  private auth: Auth;
  private readyPromise: Promise<void>;

  constructor(app: FirebaseApp, emulatorHost: string | null) {
    const auth = initializeAuth(app, {
      // Sessão salva no aparelho: continua conectado ao reabrir o app.
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: isNativeGoogle() ? undefined : browserPopupRedirectResolver,
    });
    if (emulatorHost) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    this.auth = auth;
    this.readyPromise = (async () => {
      if (!isNativeGoogle()) await getRedirectResult(auth).catch(() => null);
      await auth.authStateReady();
    })();
  }

  current() {
    return toCloudUser(this.auth.currentUser);
  }

  onChange(cb: (u: CloudUser | null) => void) {
    return onAuthStateChanged(this.auth, (u) => cb(toCloudUser(u)));
  }

  ready() {
    return this.readyPromise;
  }

  private async googleCredential() {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const res = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: true });
    const idToken = res.credential?.idToken;
    if (!idToken) throw new Error('O Google não retornou a credencial da conta.');
    return GoogleAuthProvider.credential(idToken);
  }

  private provider() {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }

  async signInWithGoogle(): Promise<CloudUser | null> {
    try {
      if (isNativeGoogle()) {
        const cred = await signInWithCredential(this.auth, await this.googleCredential());
        return toCloudUser(cred.user);
      }
      try {
        const cred = await signInWithPopup(this.auth, this.provider());
        return toCloudUser(cred.user);
      } catch (err) {
        if ((err as { code?: string }).code === 'auth/popup-blocked') {
          await signInWithRedirect(this.auth, this.provider());
          return null;
        }
        throw err;
      }
    } catch (err) {
      if (isCancelError(err)) return null;
      throw err;
    }
  }

  async signOut() {
    if (isNativeGoogle()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut().catch(() => undefined);
    }
    await signOut(this.auth);
  }

  async deleteUser() {
    const user = this.auth.currentUser;
    if (!user) return;
    try {
      await user.delete();
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/requires-recent-login') throw err;
      // Segurança do Firebase: confirmar a conta antes de excluir.
      if (isNativeGoogle()) await reauthenticateWithCredential(user, await this.googleCredential());
      else await reauthenticateWithPopup(user, this.provider());
      await user.delete();
    }
    await this.signOut().catch(() => undefined);
  }
}
