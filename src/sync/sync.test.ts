import { totals } from '../domain/finance';
import { totalXp } from '../gamification/engine';
import { levelInfo } from '../gamification/levels';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from './engine';
import { MemoryRemote } from './memoryRemote';
import { TrackedStorage } from './tracked';

const NOW = new Date(2026, 10, 4, 10, 0);
const client = (name: string) => ({ name, phone: '', email: '', address: '', notes: '' });
const appt = (title: string, price = '100,00') => ({ title, clientId: '', date: '2026-11-04', time: '', price, notes: '' });
const expense = (description: string, amount = '30,00') => ({ type: 'despesa', amount, description, category: 'Produtos', date: '2026-11-04' });

async function device(remote: MemoryRemote, storage = createMemoryAdapter()) {
  const tracked = new TrackedStorage(storage);
  const service = await AppService.load(tracked, () => NOW);
  const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now: () => NOW, isOnline: () => !remote.offline });
  return { service, sync, storage };
}

async function onboarded(remote: MemoryRemote, name = 'Ana') {
  const d = await device(remote);
  await d.service.completeOnboarding({ name, businessName: '', professionId: 'beleza' });
  return d;
}

/** Usuário com meses de uso: clientes, serviços concluídos, despesas, XP e conquistas. */
async function seasoned(remote: MemoryRemote) {
  const d = await onboarded(remote);
  const { client: c } = await d.service.saveClient(client('Maria'));
  for (let i = 0; i < 3; i++) {
    const { appointment } = await d.service.saveAppointment({ ...appt(`Corte ${i}`), clientId: c.id });
    await d.service.completeAppointment(appointment.id, { registerIncome: true });
  }
  await d.service.saveTransaction(expense('Produtos'));
  return d;
}

const snapshot = (s: AppService) => ({
  clients: s.data.clients.map((c) => c.name).sort(),
  appointments: s.data.appointments.map((a) => `${a.title}:${a.status}`).sort(),
  totals: totals(s.data.transactions),
  xp: totalXp(s.data.xpEvents),
  level: levelInfo(totalXp(s.data.xpEvents)).level,
  achievements: s.data.achievements.map((a) => a.id).sort(),
  xpKeys: s.data.xpEvents.map((e) => e.key).sort(),
});

describe('conectar conta e migrar dados existentes', () => {
  it('migração inicial: envia todos os dados locais e só então marca como sincronizado', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    const before = snapshot(a.service);
    expect(a.sync.lastSyncedAt).toBeNull();

    const analysis = await a.sync.analyze('uid-1');
    expect(analysis).toMatchObject({ localHasData: true, remoteHasData: false, automatic: true });

    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');

    expect(a.sync.getStatus().state).toBe('sincronizado');
    expect(a.sync.lastSyncedAt).not.toBeNull();
    expect(a.sync.pendingCount).toBe(0);
    expect(snapshot(a.service)).toEqual(before); // dados locais intactos
    expect([...remote.dump('uid-1')!.records.values()].filter((r) => r.data).length).toBe(
      a.service.data.clients.length + a.service.data.appointments.length + a.service.data.transactions.length + a.service.data.xpEvents.length + a.service.data.achievements.length,
    );
  });

  it('faz cópia de segurança local antes de migrar', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const backups = await a.sync.listBackups();
    expect(backups).toHaveLength(1);
    expect(JSON.parse((await a.sync.getBackupJson(backups[0]!.key))!).data.clients[0].name).toBe('Maria');
  });

  it('sem internet ao conectar: nada é alterado e a conta não fica associada (pode tentar de novo)', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    const before = snapshot(a.service);
    remote.offline = true;
    await expect(a.sync.link('uid-1', 'mesclar')).rejects.toThrow();
    expect(a.sync.linkedUid).toBeNull();
    expect(snapshot(a.service)).toEqual(before);
  });

  it('repetir a migração não duplica clientes, serviços, receitas nem XP (idempotente)', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const once = snapshot(a.service);
    await a.sync.link('uid-1', 'mesclar');
    await a.sync.link('uid-1', 'mesclar');
    expect(snapshot(a.service)).toEqual(once);
    expect(a.service.data.transactions).toHaveLength(4);
  });
});

describe('recuperação em nova instalação', () => {
  it('celular novo recupera clientes, serviços, finanças, XP, nível e conquistas', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');

    const b = await device(remote); // app recém-instalado, sem cadastro
    const analysis = await b.sync.analyze('uid-1');
    expect(analysis).toMatchObject({ localHasData: false, remoteHasData: true, suggested: 'usarNuvem', automatic: true });
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');

    expect(b.service.data.profile?.name).toBe('Ana');
    expect(snapshot(b.service)).toEqual(snapshot(a.service));
    expect(b.sync.getStatus().state).toBe('sincronizado');
  });

  it('reinstalação: os dados persistem no IndexedDB do novo aparelho após reiniciar', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');

    const dbName = `reinstall-${Math.random()}`;
    const b = await device(remote, await createIndexedDbAdapter(dbName));
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');

    const reopened = await device(remote, await createIndexedDbAdapter(dbName));
    expect(snapshot(reopened.service)).toEqual(snapshot(a.service));
    expect(reopened.sync.linkedUid).toBe('uid-1'); // sessão de sincronização preservada
  });
});

describe('sincronização entre aparelhos', () => {
  async function pair() {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const b = await device(remote);
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');
    return { remote, a, b };
  }

  it('alteração em um aparelho aparece no outro', async () => {
    const { a, b } = await pair();
    await a.service.saveClient(client('João'));
    await a.sync.sync();
    await b.sync.sync();
    expect(b.service.data.clients.map((c) => c.name).sort()).toEqual(['João', 'Maria']);
  });

  it('cliente editado em campos diferentes nos dois aparelhos: as duas edições são mantidas', async () => {
    const { a, b } = await pair();
    const id = a.service.data.clients[0]!.id;
    await a.service.saveClient({ ...client('Maria'), phone: '(11) 91234-5678' }, id);
    await b.service.saveClient({ ...client('Maria'), notes: 'Prefere manhã' }, id);
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();
    for (const d of [a, b]) expect(d.service.data.clients[0]).toMatchObject({ phone: '(11) 91234-5678', notes: 'Prefere manhã' });
  });

  it('valor financeiro alterado nos dois aparelhos: não sobrescreve, registra conflito para o usuário decidir', async () => {
    const { a, b } = await pair();
    const tx = a.service.data.transactions.find((t) => t.type === 'despesa')!;
    await a.service.saveTransaction({ ...expense('Produtos', '40,00') }, tx.id);
    await b.service.saveTransaction({ ...expense('Produtos', '55,00') }, tx.id);
    await a.sync.sync();
    await b.sync.sync();

    expect(b.service.data.transactions.find((t) => t.id === tx.id)!.amount).toBe(5500); // valor local preservado
    expect(b.sync.conflicts).toHaveLength(1);
    expect(b.sync.conflicts[0]).toMatchObject({ collection: 'transactions', kind: 'campos', fields: ['amount'] });

    await b.sync.resolveConflict(b.sync.conflicts[0]!.key, 'remote');
    await a.sync.sync();
    for (const d of [a, b]) expect(d.service.data.transactions.find((t) => t.id === tx.id)!.amount).toBe(4000);
    expect(b.sync.conflicts).toHaveLength(0);
  });

  it('lançamento excluído em um aparelho e alterado no outro: é restaurado e sinalizado', async () => {
    const { a, b } = await pair();
    const tx = a.service.data.transactions.find((t) => t.type === 'despesa')!;
    await a.service.saveTransaction({ ...expense('Produtos', '45,00') }, tx.id);
    await a.sync.sync();
    await b.service.deleteTransaction(tx.id);
    await b.sync.sync();
    expect(b.service.data.transactions.find((t) => t.id === tx.id)?.amount).toBe(4500);
    expect(b.sync.conflicts[0]).toMatchObject({ kind: 'excluido_aqui' });
  });

  it('mesma recompensa conquistada offline nos dois aparelhos não gera XP em dobro', async () => {
    const remote = new MemoryRemote();
    const a = await onboarded(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const b = await device(remote);
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');

    // Offline, cada aparelho cadastra o primeiro cliente → missão "inicio_cliente" nos dois.
    remote.offline = true;
    await a.service.saveClient(client('Cliente A'));
    await b.service.saveClient(client('Cliente B'));
    await a.sync.sync();
    expect(a.sync.getStatus().state).toBe('offline');
    remote.offline = false;
    for (let i = 0; i < 3; i++) for (const d of [a, b]) await d.sync.sync();

    for (const d of [a, b]) {
      const keys = d.service.data.xpEvents.map((e) => e.key);
      expect(keys.filter((k) => k === 'mission:inicio_cliente')).toHaveLength(1);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(snapshot(a.service)).toEqual(snapshot(b.service));
  });
});

describe('funcionamento offline', () => {
  it('sem internet: cadastra normalmente, guarda pendências e envia quando a conexão volta', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const syncedAt = a.sync.lastSyncedAt;

    remote.offline = true;
    await a.service.saveClient(client('Offline'));
    const { appointment } = await a.service.saveAppointment(appt('Escova offline'));
    await a.service.completeAppointment(appointment.id, { registerIncome: true });
    await a.service.saveTransaction(expense('Gasolina'));
    await a.sync.sync();

    expect(a.sync.getStatus().state).toBe('offline');
    expect(a.sync.pendingCount).toBeGreaterThan(0);
    expect(a.sync.lastSyncedAt).toBe(syncedAt); // não finge que salvou
    expect(a.service.data.clients.map((c) => c.name)).toContain('Offline');

    remote.offline = false;
    await a.sync.sync();
    expect(a.sync.getStatus().state).toBe('sincronizado');
    expect(a.sync.pendingCount).toBe(0);

    const b = await device(remote);
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');
    expect(snapshot(b.service)).toEqual(snapshot(a.service));
  });

  it('erro do servidor durante o envio: mantém pendências e não marca como sincronizado', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const syncedAt = a.sync.lastSyncedAt;
    await a.service.saveClient(client('Novo'));
    remote.failNextPush = true;
    await a.sync.sync();
    expect(a.sync.getStatus().state).toBe('erro');
    expect(a.sync.lastSyncedAt).toBe(syncedAt);
    expect(a.sync.pendingCount).toBe(2); // cliente + evento de XP do cadastro
    await a.sync.sync();
    expect(a.sync.getStatus().state).toBe('sincronizado');
  });
});

describe('dados de demonstração', () => {
  it('não são enviados para a nuvem', async () => {
    const remote = new MemoryRemote();
    const a = await onboarded(remote);
    await a.service.loadDemoData();
    await a.service.saveClient(client('Real'));
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    await a.service.saveClient(client('Real 2'));
    await a.sync.sync();
    expect(a.sync.pendingCount).toBe(0);
    const names = [...remote.dump('uid-1')!.records.values()].filter((r) => r.collection === 'clients').map((r) => r.data?.name);
    expect(names.sort()).toEqual(['Real', 'Real 2']);
    expect([...remote.dump('uid-1')!.records.values()].some((r) => r.data?.isDemo)).toBe(false);
  });
});

describe('isolamento, desconexão e exclusão', () => {
  it('contas diferentes não veem os dados uma da outra', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const b = await device(remote);
    expect(await b.sync.analyze('uid-2')).toMatchObject({ remoteHasData: false });
    expect((await remote.pull('uid-2', 0)).records).toHaveLength(0);
  });

  it('desconectar mantém os dados no aparelho e não altera a nuvem', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const before = snapshot(a.service);
    const cloud = remote.dump('uid-1')!.records.size;
    await a.sync.unlink();
    await a.service.saveClient(client('Depois de sair'));
    expect(a.sync.linkedUid).toBeNull();
    expect(snapshot(a.service).clients).toEqual([...before.clients, 'Depois de sair'].sort());
    expect(remote.dump('uid-1')!.records.size).toBe(cloud);
  });

  it('excluir conta apaga os dados na nuvem e preserva os do aparelho', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const before = snapshot(a.service);
    await a.sync.deleteCloudData('uid-1');
    expect(await remote.hasData('uid-1')).toBe(false);
    expect(a.sync.linkedUid).toBeNull();
    expect(snapshot(a.service)).toEqual(before);
  });

  it('"Apagar todos os dados" do aparelho não apaga a nuvem', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    await a.service.resetAll();
    expect(a.sync.linkedUid).toBeNull();
    expect(await remote.hasData('uid-1')).toBe(true);
  });

  it('importar backup manual com conta conectada propaga para a nuvem', async () => {
    const remote = new MemoryRemote();
    const a = await seasoned(remote);
    const json = a.service.exportBackup();
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    await a.service.saveClient(client('Temporário'));
    await a.service.importBackup(json);
    await a.sync.sync();
    const b = await device(remote);
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');
    expect(b.service.data.clients.map((c) => c.name)).toEqual(['Maria']);
  });
});

describe('migração do banco local v1 → v2', () => {
  it('preserva os dados existentes ao criar o armazenamento auxiliar', async () => {
    const name = `v1-${Math.random()}`;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['clients', 'appointments', 'transactions', 'xpEvents', 'achievements']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('meta');
        req.transaction!.objectStore('clients').put({ id: 'c1', name: 'Cliente v1', phone: '', email: '', address: '', notes: '', createdAt: '', updatedAt: '' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const adapter = await createIndexedDbAdapter(name);
    expect((await adapter.clients.list()).map((c) => c.name)).toEqual(['Cliente v1']);
    await adapter.kvSet('x', 1);
    expect(await adapter.kvGet('x')).toBe(1);
    await adapter.replaceAll({ ...(await adapter.loadAll()), clients: [] });
    expect(await adapter.kvGet('x')).toBe(1); // kv não é afetado por replaceAll
  });
});

describe('SyncEngine.dispose', () => {
  afterEach(() => vi.useRealTimers());

  it('cancela a sincronização agendada e não agenda outra depois de encerrado', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const remote = new MemoryRemote();
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, () => NOW);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: true, now: () => NOW, isOnline: () => true });
    await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await sync.setUser('uid-1');
    await sync.link('uid-1', 'mesclar');
    await service.saveClient(client('Maria'));
    expect(vi.getTimerCount()).toBeGreaterThan(0); // sincronização agendada (1,5 s)

    const listener = vi.fn();
    sync.subscribe(listener);
    sync.dispose();
    expect(vi.getTimerCount()).toBe(0);

    await service.saveClient(client('João')); // alteração local continua salva…
    expect(vi.getTimerCount()).toBe(0); // …mas nenhum novo agendamento
    expect(listener).not.toHaveBeenCalled();
    expect(service.data.clients.map((c) => c.name).sort()).toEqual(['João', 'Maria']);
  });
});
