import { DEFAULT_SETTINGS, type AppData, type Client } from '../domain/types';
import { parseBackup, serializeBackup } from './backup';
import { createIndexedDbAdapter } from './indexeddb';

const client = (id: string): Client => ({ id, name: `Cliente ${id}`, phone: '', email: '', address: '', notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });

describe('IndexedDB', () => {
  it('persiste entre aberturas do banco (simula recarregar a página)', async () => {
    const name = `test-${Math.random()}`;
    const a = await createIndexedDbAdapter(name);
    await a.saveProfile({ name: 'Ana', businessName: '', professionId: 'limpeza', createdAt: '', weeklyGoalServices: 3, monthlyGoalRevenue: 1000 });
    await a.clients.put(client('1'));
    await a.clients.putMany([client('2'), client('3')]);
    await a.clients.remove('2');
    await a.saveSettings({ theme: 'dark' });

    const b = await createIndexedDbAdapter(name);
    const data = await b.loadAll();
    expect(data.profile?.name).toBe('Ana');
    expect(data.settings.theme).toBe('dark');
    expect(data.clients.map((c) => c.id).sort()).toEqual(['1', '3']);
  });

  it('replaceAll e clearAll', async () => {
    const a = await createIndexedDbAdapter(`test-${Math.random()}`);
    await a.clients.put(client('old'));
    const data: AppData = { profile: null, settings: DEFAULT_SETTINGS, clients: [client('new')], appointments: [], transactions: [], xpEvents: [], achievements: [], sealAwards: [], profileImages: [] };
    await a.replaceAll(data);
    expect((await a.clients.list()).map((c) => c.id)).toEqual(['new']);
    await a.clearAll();
    expect(await a.clients.list()).toEqual([]);
    expect(await a.getProfile()).toBeNull();
  });
});

describe('backup', () => {
  const data: AppData = { profile: null, settings: DEFAULT_SETTINGS, clients: [client('1')], appointments: [], transactions: [], xpEvents: [], achievements: [], sealAwards: [], profileImages: [] };

  it('exporta e importa sem perdas', () => {
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });

  it('rejeita arquivos inválidos', () => {
    expect(() => parseBackup('nada')).toThrow(/JSON/);
    expect(() => parseBackup('{"format":"outro"}')).toThrow(/não é um backup/);
    expect(() => parseBackup(JSON.stringify({ format: 'oficio-backup', version: 1, data: { ...data, clients: [{ foo: 1 }] } }))).toThrow(/clients/);
  });
});
