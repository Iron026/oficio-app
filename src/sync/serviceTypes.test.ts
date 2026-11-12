import { moveServiceType, serviceChoices, serviceNameKey, sortServiceTypes, isValidServiceType, MAX_SERVICE_TYPES } from '../domain/serviceTypes';
import { signed } from '../test/backupFile';
import type { ServiceType } from '../domain/types';
import { totalXp } from '../gamification/engine';
import { AppService, ValidationError } from '../state/service';
import { parseBackup } from '../storage/backup';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from './engine';
import { MemoryRemote } from './memoryRemote';
import { TrackedStorage } from './tracked';
import { BASE_SYNC_COLLECTIONS, SYNC_COLLECTIONS } from './types';

/** Rodada 3: tipos de serviço personalizados (opção A — coleção própria, offline-first). */
const NOW = new Date(2026, 10, 4, 10, 0);
const st = (id: string, name: string, over: Partial<ServiceType> = {}): ServiceType => ({ id, name, price: null, pinned: false, order: 0, createdAt: 'x', updatedAt: 'x', ...over });

async function setup() {
  const storage = createMemoryAdapter();
  const service = await AppService.load(storage, () => NOW);
  await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return { service, storage };
}

describe('tipos de serviço — regras puras', () => {
  it('nome comparável ignora acentos, maiúsculas e espaços', () => {
    expect(serviceNameKey('  Hora  de Trabalho ')).toBe(serviceNameKey('hora de trabalho'));
    expect(serviceNameKey('Coloração')).toBe(serviceNameKey('coloracao'));
  });

  it('ordem: fixados primeiro, depois a ordem manual', () => {
    const list = sortServiceTypes([st('a', 'A', { order: 2 }), st('b', 'B', { pinned: true, order: 5 }), st('c', 'C', { order: 1 })]);
    expect(list.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('atalhos: tipos próprios e, depois, sugestões da profissão sem repetir nomes', () => {
    const c = serviceChoices([st('a', 'corte', { price: 7000, pinned: true })], [{ name: 'Corte', suggestedPrice: 6000 }, { name: 'Escova', suggestedPrice: 5000 }]);
    expect(c).toEqual([
      { name: 'corte', price: 7000, source: 'proprio', pinned: true },
      { name: 'Escova', price: 5000, source: 'sugestao', pinned: false },
    ]);
  });

  it('mover só dentro do grupo (fixados ou não)', () => {
    const types = [st('p', 'P', { pinned: true, order: 0 }), st('a', 'A', { order: 0 }), st('b', 'B', { order: 1 })];
    expect(moveServiceType(types, 'a', -1)).toEqual([]); // não passa para o grupo dos fixados
    const changes = moveServiceType(types, 'a', 1);
    const moved = types.map((t) => ({ ...t, order: changes.find((c) => c.id === t.id)?.order ?? t.order }));
    expect(sortServiceTypes(moved).map((t) => t.id)).toEqual(['p', 'b', 'a']);
    expect(changes).toEqual([{ id: 'a', order: 2 }]); // só grava o que mudou
  });

  it('validação de registro (backup e nuvem): campos e limites', () => {
    expect(isValidServiceType(st('a', 'Corte', { price: 6000 }))).toBe(true);
    expect(isValidServiceType(st('a', 'Corte'))).toBe(true);
    expect(isValidServiceType(st('a', ''))).toBe(false);
    expect(isValidServiceType(st('a', 'x'.repeat(61)))).toBe(false);
    expect(isValidServiceType(st('a', 'Corte', { price: 0 }))).toBe(false);
    expect(isValidServiceType(st('a', 'Corte', { price: 12.5 }))).toBe(false);
    expect(isValidServiceType({ ...st('a', 'Corte'), xp: 10 })).toBe(false);
  });
});

describe('tipos de serviço — serviço do app', () => {
  it('cria, edita, fixa, reordena e exclui sem dar XP nem tocar em outros dados', async () => {
    const { service, storage } = await setup();
    const appt = await service.saveAppointment({ title: 'Hora de trabalho', clientId: '', date: '2026-11-05', time: '10:00', price: '80,00', notes: '' });
    const xp = totalXp(service.data.xpEvents);
    const events = service.data.xpEvents.length;
    const a = await service.saveServiceType({ name: '  Hora de   trabalho ', price: '80,00' });
    expect(a).toMatchObject({ name: 'Hora de trabalho', price: 8000, pinned: false, order: 0 });
    const b = await service.saveServiceType({ name: 'Diária', price: '' });
    expect(b).toMatchObject({ price: null, order: 1 });
    await service.saveServiceType({ name: 'Diária completa', price: '350' }, b.id);
    await service.setServiceTypePinned(b.id, true);
    expect(sortServiceTypes(service.data.serviceTypes).map((t) => t.name)).toEqual(['Diária completa', 'Hora de trabalho']);
    const c = await service.saveServiceType({ name: 'Visita', price: '' });
    await service.moveServiceType(c.id, -1);
    expect(sortServiceTypes(service.data.serviceTypes).map((t) => t.name)).toEqual(['Diária completa', 'Visita', 'Hora de trabalho']);
    await service.deleteServiceType(a.id);
    expect(service.data.serviceTypes.map((t) => t.name).sort()).toEqual(['Diária completa', 'Visita']);
    // Serviço já agendado com o nome excluído continua igual.
    expect(service.data.appointments.find((x) => x.id === appt.appointment.id)?.title).toBe('Hora de trabalho');
    // Tipos de serviço não dão XP.
    expect(totalXp(service.data.xpEvents)).toBe(xp);
    expect(service.data.xpEvents).toHaveLength(events);
    // Persistido pelo StorageAdapter.
    expect((await storage.serviceTypes.list()).map((t) => t.name).sort()).toEqual(['Diária completa', 'Visita']);
    const reloaded = await AppService.load(storage, () => NOW);
    expect(reloaded.data.serviceTypes).toHaveLength(2);
  });

  it('recusa nome vazio, repetido (mesmo com acentos ou maiúsculas) e valor inválido', async () => {
    const { service } = await setup();
    await service.saveServiceType({ name: 'Coloração', price: '' });
    await expect(service.saveServiceType({ name: '', price: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.saveServiceType({ name: 'COLORACAO', price: '' })).rejects.toMatchObject({ errors: { name: expect.stringMatching(/já existe/i) } });
    await expect(service.saveServiceType({ name: 'Mechas', price: '0' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.saveServiceType({ name: 'Mechas', price: 'abc' })).rejects.toBeInstanceOf(ValidationError);
    expect(service.data.serviceTypes).toHaveLength(1);
  });

  it('limite de tipos', async () => {
    const { service } = await setup();
    for (let i = 0; i < MAX_SERVICE_TYPES; i++) await service.saveServiceType({ name: `Serviço ${i}`, price: '' });
    await expect(service.saveServiceType({ name: 'Mais um', price: '' })).rejects.toThrow(/limite/i);
  });
});

describe('tipos de serviço — armazenamento, backup e nuvem', () => {
  it('migração do IndexedDB v3 → v4 preserva tudo e cria o store novo', async () => {
    const name = `migr4-${Math.random()}`;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(name, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['clients', 'appointments', 'transactions', 'xpEvents', 'achievements', 'sealAwards', 'profileImages']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('meta');
        db.createObjectStore('kv');
        req.transaction!.objectStore('clients').put({ id: 'c1', name: 'Cliente da beta.2', phone: '', email: '', address: '', notes: '', createdAt: 'x', updatedAt: 'x' });
        req.transaction!.objectStore('sealAwards').put({ id: 'metas', stage: 2, reachedAt: ['a', 'b', null, null], createdAt: 'x', updatedAt: 'x' });
        req.transaction!.objectStore('kv').put({ version: 1 }, 'sync:state');
      };
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
    });
    const adapter = await createIndexedDbAdapter(name);
    const all = await adapter.loadAll();
    expect(all.clients.map((c) => c.name)).toEqual(['Cliente da beta.2']);
    expect(all.sealAwards.map((s) => s.stage)).toEqual([2]);
    expect(all.serviceTypes).toEqual([]);
    expect(await adapter.kvGet('sync:state')).toEqual({ version: 1 });
    await adapter.serviceTypes.put(st('s1', 'Corte'));
    expect((await adapter.loadAll()).serviceTypes).toHaveLength(1);
  });

  it('backup leva os tipos; backup antigo (sem o campo) importa e itens inválidos são descartados', async () => {
    const { service } = await setup();
    await service.saveServiceType({ name: 'Hora de trabalho', price: '80,00' });
    const json = service.exportBackup();
    expect(parseBackup(json).serviceTypes.map((t) => t.name)).toEqual(['Hora de trabalho']);
    const parsed = JSON.parse(json);
    delete parsed.data.serviceTypes;
    expect(parseBackup(signed(parsed)).serviceTypes).toEqual([]);
    parsed.data.serviceTypes = [st('a', 'Ok'), st('a', 'Repetido'), { id: 'b', name: '' }, { ...st('c', 'Extra'), url: 'x' }];
    expect(parseBackup(signed(parsed)).serviceTypes.map((t) => t.name)).toEqual(['Ok']);
  });

  it('sem as regras novas (padrão do APK): ficam só no aparelho, sem pendência nem envio', async () => {
    const remote = new MemoryRemote();
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, () => NOW);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now: () => NOW, isOnline: () => true, collections: BASE_SYNC_COLLECTIONS });
    await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await sync.setUser('uid-1');
    await sync.link('uid-1', 'mesclar');
    await service.saveServiceType({ name: 'Hora de trabalho', price: '80,00' });
    await sync.sync();
    expect(sync.pendingCount).toBe(0);
    expect(sync.getStatus().state).toBe('sincronizado');
    expect([...remote.dump('uid-1')!.records.keys()].some((k) => k.startsWith('serviceTypes__'))).toBe(false);
    expect(service.data.serviceTypes).toHaveLength(1);
  });

  it('com as regras novas: chegam ao outro aparelho, edições e exclusões também', async () => {
    const remote = new MemoryRemote();
    const dev = async () => {
      const tracked = new TrackedStorage(createMemoryAdapter());
      const service = await AppService.load(tracked, () => NOW);
      const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now: () => NOW, isOnline: () => true, collections: SYNC_COLLECTIONS });
      return { service, sync };
    };
    const a = await dev();
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const t1 = await a.service.saveServiceType({ name: 'Hora de trabalho', price: '80,00' });
    const t2 = await a.service.saveServiceType({ name: 'Diária', price: '' });
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const b = await dev();
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');
    expect(b.service.data.serviceTypes.map((t) => t.name).sort()).toEqual(['Diária', 'Hora de trabalho']);
    await a.service.setServiceTypePinned(t2.id, true);
    await a.service.deleteServiceType(t1.id);
    await a.sync.sync();
    await b.sync.sync();
    expect(b.service.data.serviceTypes).toEqual([expect.objectContaining({ name: 'Diária', pinned: true })]);
  });
});
