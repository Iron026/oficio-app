/** Usuário autenticado: somente o necessário para identificar a conta. */
export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Autenticação com conta Google. A interface isola o restante do app do
 * Firebase: a implementação real fica em `firebaseAuth.ts`.
 */
export interface AuthService {
  /** false quando o Firebase não foi configurado neste build. */
  readonly available: boolean;
  current(): CloudUser | null;
  /** Notifica mudanças (inclusive a sessão restaurada ao abrir o app). */
  onChange(cb: (user: CloudUser | null) => void): () => void;
  /** Resolve quando a sessão salva foi verificada. */
  ready(): Promise<void>;
  /** Abre a escolha de conta Google. Retorna null se o usuário cancelar. */
  signInWithGoogle(): Promise<CloudUser | null>;
  signOut(): Promise<void>;
  /** Exclui a conta (pode pedir para escolher a conta novamente, por segurança). */
  deleteUser(): Promise<void>;
}

/** Usado quando o Firebase não está configurado: o app funciona só no aparelho. */
export class UnavailableAuth implements AuthService {
  readonly available = false;
  current() {
    return null;
  }
  onChange() {
    return () => undefined;
  }
  async ready() {}
  async signInWithGoogle(): Promise<CloudUser | null> {
    throw new Error('A conta Google ainda não está disponível nesta versão.');
  }
  async signOut() {}
  async deleteUser() {}
}

/** Autenticação simulada para testes automatizados (não substitui o teste com conta real). */
export class FakeAuth implements AuthService {
  readonly available = true;
  private user: CloudUser | null = null;
  private listeners = new Set<(u: CloudUser | null) => void>();
  /** Próximo resultado da escolha de conta: um usuário ou 'cancel'. */
  next: CloudUser | 'cancel' = { uid: 'uid-teste', name: 'Ana Teste', email: 'ana@example.com', photoURL: null };
  deleted: string[] = [];

  constructor(initial: CloudUser | null = null) {
    this.user = initial;
  }
  current() {
    return this.user;
  }
  onChange(cb: (u: CloudUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async ready() {}
  private emit() {
    this.listeners.forEach((l) => l(this.user));
  }
  async signInWithGoogle() {
    if (this.next === 'cancel') return null;
    this.user = this.next;
    this.emit();
    return this.user;
  }
  async signOut() {
    this.user = null;
    this.emit();
  }
  async deleteUser() {
    if (this.user) this.deleted.push(this.user.uid);
    this.user = null;
    this.emit();
  }
}

export function isCancelError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const text = `${e?.code ?? ''} ${e?.message ?? ''}`;
  return /popup-closed-by-user|cancelled-popup-request|user-cancel|cancel+ed|canceled|cancelado|No credentials available|activity is cancelled/i.test(text);
}
