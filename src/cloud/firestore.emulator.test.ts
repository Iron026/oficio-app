/**
 * Testes contra o EMULADOR do Cloud Firestore com as regras reais
 * (firestore.rules). Comprovam o isolamento entre contas e a sincronização
 * de ponta a ponta usando o SDK oficial.
 */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
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


describe('regras: tentativas de acesso indevido (auditoria)', () => {
  async function seedAlice() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(f, 'users/alice'), { schemaVersion: 1, data: { profile: { name: 'Alice' } }, rev: 1, updatedAt: new Date(), deviceId: 'd' });
      await setDoc(doc(f, 'users/alice/records/transactions__t1'), { collection: 'transactions', id: 't1', data: { id: 't1', amount: 1000 }, deleted: false, rev: 1, updatedAt: new Date(), deviceId: 'd' });
    });
  }

  it('outra conta não altera, não exclui e não lista registros de terceiros', async () => {
    await seedAlice();
    const bob = db('bob');
    await assertFails(updateDoc(doc(bob, 'users/alice/records/transactions__t1'), { rev: 2, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(bob, 'users/alice/records/transactions__t1')));
    await assertFails(deleteDoc(doc(bob, 'users/alice')));
    await assertFails(getDocs(collection(bob, 'users/alice/records')));
    await assertFails(getDocs(collection(bob, 'users')));
  });

  it('o dono não consegue mudar a coleção de um registro nem pular revisões do perfil', async () => {
    await seedAlice();
    const alice = db('alice');
    await assertFails(setDoc(doc(alice, 'users/alice/records/transactions__t1'), { ...record({ collection: 'clients', id: 't1', data: { id: 't1' } }), rev: 2 }));
    await assertFails(setDoc(doc(alice, 'users/alice'), { schemaVersion: 1, data: {}, rev: 3, updatedAt: serverTimestamp(), deviceId: 'd' }));
    await assertSucceeds(setDoc(doc(alice, 'users/alice'), { schemaVersion: 1, data: {}, rev: 2, updatedAt: serverTimestamp(), deviceId: 'd' }));
    await assertSucceeds(getDocs(collection(alice, 'users/alice/records')));
  });

  it('lápide (exclusão) exige data nula e revisão +1', async () => {
    await seedAlice();
    const alice = db('alice');
    const ref = doc(alice, 'users/alice/records/transactions__t1');
    await assertFails(setDoc(ref, { collection: 'transactions', id: 't1', data: { id: 't1' }, deleted: true, rev: 2, updatedAt: serverTimestamp(), deviceId: 'd' }));
    await assertSucceeds(setDoc(ref, { collection: 'transactions', id: 't1', data: null, deleted: true, rev: 2, updatedAt: serverTimestamp(), deviceId: 'd' }));
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

  it('volume: mais de 100 registros (envio em lotes) chegam completos', async () => {
    const a = await device('alice');
    await a.service.completeOnboarding({ name: 'Alice', businessName: '', professionId: 'outros' });
    await a.service.loadDemoData(); // demonstração não sobe
    for (let i = 0; i < 130; i++) await a.service.saveTransaction({ type: 'despesa', amount: `${i + 1},00`, description: `Item ${i}`, category: 'Outros', date: '2026-11-04' });
    await a.sync.setUser('alice');
    await a.sync.link('alice', 'mesclar');
    expect(a.sync.pendingCount).toBe(0);
    const b = await device('alice');
    await b.sync.setUser('alice');
    await b.sync.link('alice', 'usarNuvem');
    expect(b.service.data.transactions.filter((t) => !t.isDemo)).toHaveLength(130);
    expect(totals(b.service.data.transactions)).toEqual(totals(a.service.data.transactions.filter((t) => !t.isDemo)));
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

// ------------------------------------------------------------------ 0.4: selos e foto
describe('regras 0.4: selos permanentes (sealAwards)', () => {
  const seal = (over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
    collection: 'sealAwards', id: 'experiencia', deleted: false, rev: 1, updatedAt: serverTimestamp(), deviceId: 'dev-1',
    data: { id: 'experiencia', stage: 2, reachedAt: ['2026-02-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', null, null], createdAt: 'x', updatedAt: 'y', ...data },
    ...over,
  });
  const ref = (uid: string, id = 'experiencia') => doc(db(uid), `users/alice/records/sealAwards__${id}`);

  it('o dono grava e lê; outra conta e visitante não', async () => {
    await assertSucceeds(setDoc(ref('alice'), seal()));
    await assertSucceeds(getDoc(ref('alice')));
    await assertFails(getDoc(ref('bob')));
    await assertFails(setDoc(doc(db('bob'), 'users/alice/records/sealAwards__metas'), seal({ id: 'metas' }, { id: 'metas' })));
    await assertFails(getDoc(doc(db(null), 'users/alice/records/sealAwards__experiencia')));
  });

  it('rejeita selo inventado, estágio fora de 1..4, campos extras e lápide', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users/alice/records/sealAwards__vip'), seal({ id: 'vip' }, { id: 'vip' })));
    for (const stage of [0, 5, 2.5, '3']) await assertFails(setDoc(ref('alice'), seal({}, { stage })));
    await assertFails(setDoc(ref('alice'), seal({}, { xp: 500 })));
    await assertFails(setDoc(ref('alice'), seal({}, { reachedAt: ['a', 'b', 'c', 'd', 'e'] })));
    await assertFails(setDoc(ref('alice'), { ...seal(), deleted: true, data: null }));
  });

  it('o estágio nunca diminui no servidor (atualização atrasada é recusada)', async () => {
    await assertSucceeds(setDoc(ref('alice'), seal({}, { stage: 3 })));
    await assertFails(setDoc(ref('alice'), seal({ rev: 2 }, { stage: 2 })));
    await assertFails(setDoc(ref('alice'), { ...seal({ rev: 2 }), deleted: true, data: null }));
    await assertSucceeds(setDoc(ref('alice'), seal({ rev: 2 }, { stage: 3 }))); // mesmo estágio (datas mais antigas)
    await assertSucceeds(setDoc(ref('alice'), seal({ rev: 3 }, { stage: 4 })));
  });
});

describe('regras 0.4: foto de perfil (profileImages)', () => {
  const MAX = 87_384;
  const img = (over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
    collection: 'profileImages', id: 'atual', deleted: false, rev: 1, updatedAt: serverTimestamp(), deviceId: 'dev-1',
    data: { id: 'atual', mime: 'image/webp', data: 'A'.repeat(40_000), bytes: 30_000, width: 320, height: 320, hash: 'abc', createdAt: 'x', updatedAt: 'y', ...data },
    ...over,
  });
  const ref = (uid: string, id = 'atual') => doc(db(uid), `users/alice/records/profileImages__${id}`);

  it('somente o dono lê e grava a foto', async () => {
    await assertSucceeds(setDoc(ref('alice'), img()));
    await assertSucceeds(getDoc(ref('alice')));
    await assertFails(getDoc(ref('bob')));
    await assertFails(setDoc(ref('bob'), img({ rev: 2 })));
    await assertFails(getDoc(ref(null as unknown as string)));
  });

  it('aceita o tamanho máximo (64 KiB = 87 384 caracteres) e recusa acima', async () => {
    await assertSucceeds(setDoc(ref('alice'), img({}, { data: 'A'.repeat(MAX), bytes: 65_536 })));
    await env.clearFirestore();
    await assertFails(setDoc(ref('alice'), img({}, { data: 'A'.repeat(MAX + 4) })));
    await assertFails(setDoc(ref('alice'), img({}, { bytes: 65_537 })));
  });

  it('limita quantidade (só "atual"), formato e dimensões', async () => {
    await assertFails(setDoc(ref('alice', 'segunda'), img({ id: 'segunda' }, { id: 'segunda' })));
    for (const mime of ['image/png', 'image/svg+xml', 'text/html']) await assertFails(setDoc(ref('alice'), img({}, { mime })));
    await assertFails(setDoc(ref('alice'), img({}, { width: 2048 })));
    await assertFails(setDoc(ref('alice'), img({}, { height: 64 })));
    await assertFails(setDoc(ref('alice'), img({}, { url: 'https://exemplo' })));
  });

  it('pode ser removida (lápide) e recolocada', async () => {
    await assertSucceeds(setDoc(ref('alice'), img()));
    await assertSucceeds(setDoc(ref('alice'), { ...img({ rev: 2 }), deleted: true, data: null }));
    await assertSucceeds(setDoc(ref('alice'), img({ rev: 3 })));
  });
});

describe('sincronização 0.4 real (emulador, coleções novas ativadas)', () => {
  const NOW = new Date(2026, 10, 4, 10);
  const V04 = ['clients', 'appointments', 'transactions', 'xpEvents', 'achievements', 'sealAwards', 'profileImages'] as const;
  async function device(uid: string) {
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, () => NOW);
    const sync = await SyncEngine.create(service, tracked, new FirestoreRemote(db(uid)), { autoSync: false, now: () => NOW, isOnline: () => true, collections: V04 });
    return { service, sync };
  }
  const photo = { id: 'atual' as const, mime: 'image/webp' as const, data: 'A'.repeat(60_000), bytes: 45_000, width: 320, height: 320, hash: 'h1', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };

  it('selos e foto chegam ao outro aparelho; XP intacto; excluir a conta remove tudo', async () => {
    const a = await device('alice');
    await a.service.completeOnboarding({ name: 'Alice', businessName: '', professionId: 'beleza' });
    for (let i = 0; i < 20; i++) await a.service.saveClient({ name: `C${i}`, phone: '', email: '', address: '', notes: '' });
    await a.service.setProfileImage(photo);
    const xpBefore = totalXp(a.service.data.xpEvents);
    expect(a.service.data.sealAwards.find((s) => s.id === 'carteira')?.stage).toBe(1);
    await a.sync.setUser('alice');
    await a.sync.link('alice', 'mesclar');
    expect(a.sync.getStatus().state).toBe('sincronizado');

    const b = await device('alice');
    await b.sync.setUser('alice');
    await b.sync.link('alice', 'usarNuvem');
    expect(b.service.data.profileImages[0]?.hash).toBe('h1');
    expect(b.service.data.sealAwards.find((s) => s.id === 'carteira')?.stage).toBe(1);
    expect(totalXp(b.service.data.xpEvents)).toBe(xpBefore);

    // Documento da foto: tamanho real no servidor (base64 + campos) fica abaixo de 90 KB.
    const snap = await getDoc(doc(db('alice'), 'users/alice/records/profileImages__atual'));
    expect(JSON.stringify(snap.data()).length).toBeLessThan(90_000);

    await a.sync.deleteCloudData('alice');
    const left = await getDocs(collection(db('alice'), 'users/alice/records'));
    expect(left.size).toBe(0);
  });
});
