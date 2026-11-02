import type { AuthService, CloudUser } from '../cloud/auth';
import type { LinkAnalysis, LinkMode, SyncEngine } from '../sync/engine';

export type SignInOutcome =
  | { status: 'cancelado' }
  | { status: 'conectado'; user: CloudUser }
  | { status: 'escolher'; user: CloudUser; analysis: LinkAnalysis };

/**
 * Orquestra conta Google + sincronização. Nada é enviado à nuvem antes de o
 * usuário ver o que será sincronizado e confirmar (assistente de associação).
 */
export class AccountController {
  constructor(
    readonly auth: AuthService,
    readonly sync: SyncEngine,
  ) {}

  get available() {
    return this.auth.available && this.sync.cloudAvailable;
  }

  /** Abre a escolha de conta. Se a conta ainda não está associada a este aparelho, devolve a análise para o usuário decidir. */
  async signIn(): Promise<SignInOutcome> {
    const user = await this.auth.signInWithGoogle();
    if (!user) return { status: 'cancelado' };
    return this.afterSignIn(user);
  }

  async afterSignIn(user: CloudUser): Promise<SignInOutcome> {
    await this.sync.setUser(user.uid);
    if (this.sync.linkedUid === user.uid) return { status: 'conectado', user };
    return { status: 'escolher', user, analysis: await this.sync.analyze(user.uid) };
  }

  /** Confirma a associação escolhida pelo usuário. */
  async link(mode: LinkMode) {
    const user = this.auth.current();
    if (!user) throw new Error('Conta não conectada.');
    await this.sync.link(user.uid, mode);
  }

  /** Cancela a associação: sai da conta; nenhum dado local ou da nuvem é alterado. */
  async cancelLink() {
    await this.auth.signOut();
    await this.sync.setUser(null);
  }

  /** Desconecta: os dados ficam no aparelho; a nuvem permanece como estava. */
  async disconnect() {
    await this.sync.unlink();
    await this.auth.signOut();
  }

  /** Exclui os dados do Ofício na nuvem e a conta de acesso. Os dados do aparelho são mantidos. */
  async deleteAccount() {
    const user = this.auth.current();
    if (!user) throw new Error('Conta não conectada.');
    await this.sync.deleteCloudData(user.uid);
    await this.auth.deleteUser();
  }
}
