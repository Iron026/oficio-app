import type { RemoteStore } from '../sync/types';
import { UnavailableAuth, type AuthService } from './auth';
import { readEmulatorHost, readFirebaseConfig } from './config';

export interface Cloud {
  auth: AuthService;
  remote: RemoteStore | null;
  projectId: string | null;
}

/**
 * Inicializa o Firebase somente se este build foi configurado (variáveis
 * VITE_FIREBASE_*). O SDK é carregado sob demanda: sem configuração, nada do
 * Firebase é baixado e o app funciona apenas no aparelho.
 */
export async function createCloud(): Promise<Cloud> {
  const config = readFirebaseConfig();
  if (!config) return { auth: new UnavailableAuth(), remote: null, projectId: null };
  try {
    const [{ initializeApp }, { initializeFirestore, memoryLocalCache, connectFirestoreEmulator }, { FirebaseAuthService }, { FirestoreRemote }] = await Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
      import('./firebaseAuth'),
      import('./firestoreRemote'),
    ]);
    const app = initializeApp(config);
    // Cache em memória: os dados offline ficam no armazenamento próprio do Ofício.
    const db = initializeFirestore(app, { localCache: memoryLocalCache() });
    const emulator = readEmulatorHost();
    if (emulator) connectFirestoreEmulator(db, emulator, 8080);
    return { auth: new FirebaseAuthService(app, emulator), remote: new FirestoreRemote(db), projectId: config.projectId };
  } catch (err) {
    console.warn('Conta Google indisponível:', err);
    return { auth: new UnavailableAuth(), remote: null, projectId: null };
  }
}
