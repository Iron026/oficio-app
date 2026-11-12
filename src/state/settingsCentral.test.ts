import { createMemoryAdapter } from '../storage/memory';
import { subpathOf } from './router';
import { AppService, LAST_EXPORT_KEY } from './service';
import { settingsPage, settingsTitle } from '../screens/settings/pages';

async function setup() {
  const now = new Date(2026, 10, 4, 10);
  const storage = createMemoryAdapter();
  const service = await AppService.load(storage, () => now);
  await service.completeOnboarding({ name: 'Ana', businessName: 'Studio', professionId: 'beleza' });
  await service.saveClient({ name: 'Maria Silva', phone: '', email: '', address: '', notes: '' });
  return { service, storage };
}

describe('Central de Ajustes — rotas', () => {
  it('lê a subpágina do hash e ignora rotas desconhecidas', () => {
    expect(subpathOf('#/ajustes')).toBe('');
    expect(subpathOf('#/ajustes/aparencia/paleta')).toBe('aparencia/paleta');
    expect(subpathOf('#/ajustes/dados/')).toBe('dados');
    expect(subpathOf('#/xyz/dados')).toBe('');
    expect(settingsPage('aparencia/paleta')).toBe('aparencia/paleta');
    expect(settingsPage('constructor')).toBeNull();
    expect(settingsTitle('dados')).toBe('Backup e dados');
    expect(settingsTitle('')).toBe('Ajustes');
  });
});

describe('Backup e dados — sem alterar dados', () => {
  it('pré-visualizar um backup não muda nada e compara arquivo × atual', async () => {
    const { service } = await setup();
    const other = await AppService.load(createMemoryAdapter(), () => new Date(2026, 9, 1, 9));
    await other.completeOnboarding({ name: 'Outra', businessName: '', professionId: 'beleza' });
    const json = other.exportBackup();
    const before = JSON.stringify(service.data);
    const p = service.previewBackup(json);
    expect(p.file).toMatchObject({ clients: 0, appointments: 0, transactions: 0, payments: 0, refunds: 0 });
    expect(p.integrity).toBe('verificada'); // beta.5: arquivo novo leva soma SHA-256
    expect(p.current.clients).toBe(1);
    expect(p.exportedAt).toBe(new Date(2026, 9, 1, 9).toISOString());
    expect(JSON.stringify(service.data)).toBe(before);
    expect(() => service.previewBackup('{"format":"outro"}')).toThrow(/não é um backup/i);
    expect(JSON.stringify(service.data)).toBe(before);
  });

  it('data do último backup exportado: só neste aparelho, fora do backup, e apagada com "Apagar tudo"', async () => {
    const { service, storage } = await setup();
    expect(service.lastBackupExportAt).toBeNull();
    const before = JSON.stringify(service.data);
    await service.noteBackupExported();
    expect(service.lastBackupExportAt).toBe(new Date(2026, 10, 4, 10).toISOString());
    expect(JSON.stringify(service.data)).toBe(before);
    expect(service.exportBackup()).not.toContain('lastBackup');
    expect((await AppService.load(storage)).lastBackupExportAt).toBe(service.lastBackupExportAt);
    await storage.kvSet(LAST_EXPORT_KEY, 'lixo');
    expect((await AppService.load(storage)).lastBackupExportAt).toBeNull();
    await service.resetAll();
    expect(service.lastBackupExportAt).toBeNull();
    expect(await storage.kvGet(LAST_EXPORT_KEY)).toBeUndefined();
  });
});
