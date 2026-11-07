/** Reprodução dos achados da auditoria da v0.3 (testes de regressão). */
import { totals } from '../domain/finance';
import { FakeAuth } from '../cloud/auth';
import { AccountController } from '../state/account';
import { AppService } from '../state/service';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from './engine';
import { MemoryRemote } from './memoryRemote';
import { TrackedStorage } from './tracked';

const NOW = new Date(2026, 10, 4, 10, 0);
async function device(remote: MemoryRemote) {
  const tracked = new TrackedStorage(createMemoryAdapter());
  const service = await AppService.load(tracked, () => NOW);
  const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now: () => NOW, isOnline: () => !remote.offline });
  return { service, sync, tracked };
}

describe('auditoria: conclusão do mesmo serviço em dois aparelhos offline', () => {
  it('não duplica a receita automática', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const { appointment } = await a.service.saveAppointment({ title: 'Corte', clientId: '', date: '2026-11-04', time: '', price: '80,00', notes: '' });
    await a.sync.setUser('u1');
    await a.sync.link('u1', 'mesclar');
    const b = await device(remote);
    await b.sync.setUser('u1');
    await b.sync.link('u1', 'usarNuvem');

    remote.offline = true;
    await a.service.completeAppointment(appointment.id, { registerIncome: true });
    await b.service.completeAppointment(appointment.id, { registerIncome: true });
    remote.offline = false;
    for (let i = 0; i < 3; i++) for (const d of [a, b]) await d.sync.sync();

    for (const d of [a, b]) {
      const incomes = d.service.data.transactions.filter((t) => t.appointmentId === appointment.id);
      expect(incomes).toHaveLength(1);
      expect(totals(d.service.data.transactions).income).toBe(8000);
      // 0.5: a quitação é um pagamento com chave; o duplicado do outro aparelho é removido.
      expect(incomes[0]!.payment).toMatchObject({ kind: 'pagamento', key: `quitacao:${appointment.id}:0` });
    }
  });
});

describe('auditoria: troca de conta', () => {
  it('não mistura dados: aparelho associado à conta A recusa associar a conta B', async () => {
    const remote = new MemoryRemote();
    const d = await device(remote);
    await d.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await d.service.saveClient({ name: 'Cliente de A', phone: '', email: '', address: '', notes: '' });
    const auth = new FakeAuth();
    const acc = new AccountController(auth, d.sync);
    auth.next = { uid: 'A', name: 'A', email: 'a@example.com', photoURL: null };
    const first = await acc.signIn();
    expect(first.status).toBe('escolher');
    await acc.link('mesclar');
    // sessão de A expira; B entra no mesmo aparelho
    await auth.signOut();
    auth.next = { uid: 'B', name: 'B', email: 'b@example.com', photoURL: null };
    const second = await acc.signIn();
    expect(second.status).toBe('outraConta');
    expect(auth.current()).toBeNull(); // B não fica conectada
    expect(d.sync.linkedUid).toBe('A');
    expect(await remote.hasData('B')).toBe(false);
  });

  it('após desconectar A, o assistente avisa que os dados locais vieram de outra conta', async () => {
    const remote = new MemoryRemote();
    const d = await device(remote);
    await d.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const auth = new FakeAuth();
    const acc = new AccountController(auth, d.sync);
    auth.next = { uid: 'A', name: 'A', email: 'a@example.com', photoURL: null };
    await acc.signIn();
    await acc.link('mesclar');
    await acc.disconnect();
    auth.next = { uid: 'B', name: 'B', email: 'b@example.com', photoURL: null };
    const out = await acc.signIn();
    expect(out.status).toBe('escolher');
    if (out.status === 'escolher') expect(out.analysis.previousAccountEmail).toBe('a@example.com');
  });
});

describe('auditoria: desconectar com alterações pendentes', () => {
  it('tenta enviar antes e informa o que ficou pendente', async () => {
    const remote = new MemoryRemote();
    const d = await device(remote);
    await d.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const auth = new FakeAuth();
    const acc = new AccountController(auth, d.sync);
    auth.next = { uid: 'A', name: 'A', email: 'a@example.com', photoURL: null };
    await acc.signIn();
    await acc.link('mesclar');
    await d.service.saveClient({ name: 'Novo', phone: '', email: '', address: '', notes: '' });
    expect(await acc.flushBeforeDisconnect()).toBe(0); // online: envia tudo
    expect([...remote.dump('A')!.records.values()].some((r) => r.data?.name === 'Novo')).toBe(true);
    remote.offline = true;
    await d.service.saveClient({ name: 'Offline', phone: '', email: '', address: '', notes: '' });
    expect(await acc.flushBeforeDisconnect()).toBeGreaterThan(0);
  });
});

describe('auditoria: importar backup com conta conectada', () => {
  it('guarda cópia de segurança automática antes de substituir', async () => {
    const remote = new MemoryRemote();
    const d = await device(remote);
    await d.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const old = d.service.exportBackup();
    await d.sync.setUser('A');
    await d.sync.link('A', 'mesclar');
    await d.service.saveClient({ name: 'Criado depois do backup', phone: '', email: '', address: '', notes: '' });
    const before = (await d.sync.listBackups()).length;
    await d.service.importBackup(old);
    const backups = await d.sync.listBackups();
    expect(backups.length).toBe(before + 1);
    const pre = backups.find((b) => /importar/i.test(b.reason))!;
    expect(pre).toBeDefined();
    expect(JSON.parse((await d.sync.getBackupJson(pre.key))!).data.clients.map((c: { name: string }) => c.name)).toContain('Criado depois do backup');
  });
});

describe('auditoria: apagar todos os dados', () => {
  it('também apaga as cópias de segurança locais (privacidade)', async () => {
    const remote = new MemoryRemote();
    const d = await device(remote);
    await d.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await d.sync.setUser('A');
    await d.sync.link('A', 'mesclar');
    expect((await d.sync.listBackups()).length).toBeGreaterThan(0);
    await d.service.resetAll();
    expect(await d.sync.listBackups()).toHaveLength(0);
    expect(await remote.hasData('A')).toBe(true); // nuvem intacta
  });
});

describe('auditoria: conta excluída em outro aparelho', () => {
  it('o outro aparelho não recria os dados na nuvem e mantém os dados locais', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await a.service.saveClient({ name: 'Maria', phone: '', email: '', address: '', notes: '' });
    await a.sync.setUser('u1');
    await a.sync.link('u1', 'mesclar');
    const b = await device(remote);
    await b.sync.setUser('u1');
    await b.sync.link('u1', 'usarNuvem');

    await a.sync.deleteCloudData('u1');
    await b.service.saveClient({ name: 'Editado em B', phone: '', email: '', address: '', notes: '' });
    await b.sync.sync();

    expect(await remote.hasData('u1')).toBe(false); // nada foi recriado
    expect(b.sync.linkedUid).toBeNull();
    expect(b.sync.getStatus()).toMatchObject({ state: 'erro' });
    expect(b.service.data.clients.map((c) => c.name).sort()).toEqual(['Editado em B', 'Maria']);
  });

  it('exclusão comum de registro se propaga para o outro aparelho', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const { client } = await a.service.saveClient({ name: 'Maria', phone: '', email: '', address: '', notes: '' });
    const { transaction } = await a.service.saveTransaction({ type: 'despesa', amount: '10,00', description: 'X', category: 'Produtos', date: '2026-11-04' });
    await a.sync.setUser('u1');
    await a.sync.link('u1', 'mesclar');
    const b = await device(remote);
    await b.sync.setUser('u1');
    await b.sync.link('u1', 'usarNuvem');
    await a.service.deleteClient(client.id);
    await a.service.deleteTransaction(transaction.id);
    await a.sync.sync();
    await b.sync.sync();
    expect(b.service.data.clients).toHaveLength(0);
    expect(b.service.data.transactions).toHaveLength(0);
    expect(b.sync.conflicts).toHaveLength(0);
  });
});
