/**
 * Testes contra o EMULADOR do Cloud Firestore com as regras reais
 * (firestore.rules). Comprovam o isolamento entre contas e a sincronização
 * de ponta a ponta usando o SDK oficial.
 */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { totals } from '../domain/finance';
import { totalXp } from '../gamification/engine';
import { AppService } from '../state/service';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { TrackedStorage } from '../sync/tracked';
import { FirestoreRemote } from './firestoreRemote';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-oficio',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});
afterEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore;
const record = (over: Record<string, unknown> = {}) => ({
  collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Maria' }, deleted: false, rev: 1, updatedAt: serverTimestamp(), deviceId: 'dev-1', ...over,
});

describe('regras de segurança (isolamento entre contas)', () => {
  it('o dono cria e lê os próprios registros', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice/records/clients__c1'), record()));
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/records/clients__c1')));
  });

  it('outra conta não lê nem grava dados de terceiros', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'users/alice/records/clients__c1'), { ...record(), updatedAt: new Date() });
    });
    await assertFails(getDoc(doc(db('bob'), 'users/alice/records/clients__c1')));
    await assertFails(setDoc(doc(db('bob'), 'users/alice/records/clients__c2'), record({ id: 'c2', data: { id: 'c2', name: 'X' } })));
    await assertFails(getDoc(doc(db('bob'), 'users/alice')));
  });

  it('sem login, nada é acessível', async () => {
    await assertFails(getDoc(doc(db(null), 'users/alice')));
    await assertFails(setDoc(doc(db(null), 'users/alice/records/clients__c1'), record()));
  });

  it('rejeita formato inválido: id do documento, coleção, campos extras e horário do cliente', async () => {
    const d = db('alice');
    await assertFails(setDoc(doc(d, 'users/alice/records/clients__outro'), record()));
    await assertFails(setDoc(doc(d, 'users/alice/records/senhas__c1'), record({ collection: 'senhas' })));
    await assertFails(setDoc(doc(d, 'users/alice/records/clients__c1'), { ...record(), extra: 1 }));
    await assertFails(setDoc(doc(d, 'users/alice/records/clients__c1'), record({ updatedAt: new Date() })));
    await assertFails(setDoc(doc(d, 'users/alice/records/clients__c1'), record({ deleted: true })));
  });

  it('controle de revisão: criação começa em 1 e cada atualização soma exatamente 1', async () => {
    const d = db('alice');
    const ref = doc(d, 'users/alice/records/clients__c1');
    await assertFails(setDoc(ref, record({ rev: 2 })));
    await assertSucceeds(setDoc(ref, record({ rev: 1 })));
    await assertFails(setDoc(ref, record({ rev: 1 })));
    await assertFails(setDoc(ref, record({ rev: 5 })));
    await assertSucceeds(setDoc(ref, record({ rev: 2 })));
  });

  it('direitos Premium são somente leitura para o app (login não concede compra)', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users/alice/entitlements/plan'), { plan: 'premium' }));
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/entitlements/plan')));
    await assertFails(getDoc(doc(db('bob'), 'users/alice/entitlements/plan')));
  });

  it('caminhos fora de users/{uid} são negados', async () => {
    await assertFails(setDoc(doc(db('alice'), 'publico/x'), { a: 1 }));
  });
});

describe('sincronização real com o Firestore (emulador)', () => {
  const NOW = new Date(2026, 10, 4, 10);
  async function device(uid: string) {
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, () => NOW);
    const sync = await SyncEngine.create(service, tracked, new FirestoreRemote(db(uid)), { autoSync: false, now: () => NOW, isOnline: () => true });
    return { service, sync };
  }

  it('migra, recupera em nova instalação e mantém XP, finanças e conquistas', async () => {
    const a = await device('alice');
    await a.service.completeOnboarding({ name: 'Alice', businessName: '', professionId: 'limpeza' });
    const { client } = await a.service.saveClient({ name: 'Maria', phone: '', email: '', address: '', notes: '' });
    const { appointment } = await a.service.saveAppointment({ title: 'Faxina', clientId: client.id, date: '2026-11-04', time: '', price: '180,00', notes: '' });
    await a.service.completeAppointment(appointment.id, { registerIncome: true });
    await a.sync.setUser('alice');
    await a.sync.link('alice', 'mesclar');
    expect(a.sync.getStatus().state).toBe('sincronizado');

    const b = await device('alice');
    await b.sync.setUser('alice');
    await b.sync.link('alice', 'usarNuvem');
    expect(b.service.data.profile?.name).toBe('Alice');
    expect(b.service.data.clients.map((c) => c.name)).toEqual(['Maria']);
    expect(totals(b.service.data.transactions)).toEqual(totals(a.service.data.transactions));
    expect(totalXp(b.service.data.xpEvents)).toBe(totalXp(a.service.data.xpEvents));
    expect(b.service.data.achievements.map((x) => x.id).sort()).toEqual(a.service.data.achievements.map((x) => x.id).sort());

    // alteração em B chega em A
    await b.service.saveTransaction({ type: 'despesa', amount: '20,00', description: 'Produtos', category: 'Produtos de limpeza', date: '2026-11-04' });
    await b.sync.sync();
    await a.sync.sync();
    expect(totals(a.service.data.transactions)).toEqual(totals(b.service.data.transactions));
  });

  it('outra conta não consegue ler os dados (permissão negada)', async () => {
    const a = await device('alice');
    await a.service.completeOnboarding({ name: 'Alice', businessName: '', professionId: 'outros' });
    await a.sync.setUser('alice');
    await a.sync.link('alice', 'mesclar');
    const intruder = new FirestoreRemote(db('bob'));
    await expect(intruder.pull('alice', 0)).rejects.toThrow();
  });

  it('excluir dados da conta remove tudo da nuvem', async () => {
    const a = await device('alice');
    await a.service.completeOnboarding({ name: 'Alice', businessName: '', professionId: 'outros' });
    await a.service.saveClient({ name: 'Maria', phone: '', email: '', address: '', notes: '' });
    await a.sync.setUser('alice');
    await a.sync.link('alice', 'mesclar');
    const remote = new FirestoreRemote(db('alice'));
    expect(await remote.hasData('alice')).toBe(true);
    await a.sync.deleteCloudData('alice');
    expect(await remote.hasData('alice')).toBe(false);
    expect(a.service.data.clients).toHaveLength(1); // aparelho preservado
  });
});
