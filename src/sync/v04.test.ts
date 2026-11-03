import type { ProfileImage, SealAward } from '../domain/types';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { createMemoryAdapter } from '../storage/memory';
import { parseBackup } from '../storage/backup';
import type { StorageAdapter } from '../storage/types';
import { SyncEngine } from './engine';
import { MemoryRemote } from './memoryRemote';
import { TrackedStorage } from './tracked';
import { BASE_SYNC_COLLECTIONS, SYNC_COLLECTIONS, recordKey } from './types';

/**
 * 0.4: selos permanentes (sealAwards) e foto de perfil (profileImages).
 * Cenários exigidos: dois aparelhos offline, estágios diferentes, atualizações
 * atrasadas, recuperação após erro, versões antigas, isolamento entre contas,
 * histórico de XP intacto e foto sem mistura nem downloads repetidos.
 */
const NOW = new Date(2026, 10, 4, 10, 0);
const V04 = SYNC_COLLECTIONS; // todas as coleções (regras novas publicadas)

async function device(remote: MemoryRemote, opts: { legacy?: boolean; storage?: StorageAdapter; name?: string } = {}) {
  const tracked = new TrackedStorage(opts.storage ?? createMemoryAdapter());
  const service = await AppService.load(tracked, () => NOW);
  const sync = await SyncEngine.create(service, tracked, remote, {
    autoSync: false, now: () => NOW, isOnline: () => !remote.offline,
    collections: opts.legacy ? BASE_SYNC_COLLECTIONS : V04,
  });
  if (!service.data.profile) await service.completeOnboarding({ name: opts.name ?? 'Ana', businessName: '', professionId: 'beleza' });
  return { service, sync, tracked };
}
type Dev = Awaited<ReturnType<typeof device>>;

const award = (id: SealAward['id'], stage: SealAward['stage'], dates: (string | null)[], updatedAt = '2026-11-01T10:00:00.000Z'): SealAward =>
  ({ id, stage, reachedAt: dates, createdAt: '2026-01-01T10:00:00.000Z', updatedAt });

/** Grava selos pelo caminho real de importação (marca pendências como o app faz). */
async function putAwards(d: Dev, awards: SealAward[]) {
  const json = JSON.stringify({ format: 'oficio-backup', version: 1, exportedAt: NOW.toISOString(), data: { ...d.service.data, sealAwards: awards } });
  await d.sync.beforeReplaceAll(parseBackup(json));
  await d.service.importBackup(json);
}

const B64 = (n: number) => 'A'.repeat(n * 4); // base64 válido (n × 4 caracteres)
const photo = (hash: string, updatedAt: string, n = 100): ProfileImage => ({ id: 'atual', mime: 'image/webp', data: B64(n), bytes: n * 3, width: 320, height: 320, hash, createdAt: updatedAt, updatedAt });

async function linkBoth(_remote: MemoryRemote, a: Dev, b: Dev) {
  await a.sync.setUser('uid-1');
  await a.sync.link('uid-1', 'mesclar');
  await b.sync.setUser('uid-1');
  await b.sync.link('uid-1', 'usarNuvem');
}

const xpSnapshot = (d: Dev) => d.service.data.xpEvents.map((e) => `${e.key}:${e.xp}`).sort();

describe('selos permanentes: sincronização', () => {
  it('sem as regras novas (padrão de produção): selos ficam no aparelho, sem pendência nem envio', async () => {
    const remote = new MemoryRemote();
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, () => NOW);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now: () => NOW, isOnline: () => true, collections: BASE_SYNC_COLLECTIONS });
    await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await sync.setUser('uid-1');
    await sync.link('uid-1', 'mesclar');
    await putAwards({ service, sync, tracked }, [award('carteira', 2, ['2026-03-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', null, null])]);
    await sync.sync();
    expect(sync.pendingCount).toBe(0);
    expect(sync.getStatus().state).toBe('sincronizado');
    expect([...remote.dump('uid-1')!.records.keys()].some((k) => k.startsWith('sealAwards__'))).toBe(false);
    expect(service.data.sealAwards).toHaveLength(1);
  });

  it('dois aparelhos offline com estágios diferentes convergem para o maior (e datas mais antigas)', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    const b = await device(remote);
    await linkBoth(remote, a, b);
    remote.offline = true;
    await putAwards(a, [award('experiencia', 2, ['2026-02-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', null, null])]);
    await putAwards(b, [award('experiencia', 3, ['2026-02-03T10:00:00.000Z', '2026-04-20T10:00:00.000Z', '2026-09-01T10:00:00.000Z', null])]);
    await a.sync.sync();
    await b.sync.sync();
    expect(a.sync.pendingCount).toBeGreaterThan(0); // offline: pendências guardadas
    remote.offline = false;
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();
    const expected = ['2026-02-01T10:00:00.000Z', '2026-04-20T10:00:00.000Z', '2026-09-01T10:00:00.000Z', null];
    for (const d of [a, b]) {
      const s = d.service.data.sealAwards.find((x) => x.id === 'experiencia')!;
      expect(s.stage).toBe(3);
      expect(s.reachedAt).toEqual(expected);
      expect(d.sync.pendingCount).toBe(0);
    }
    expect(remote.dump('uid-1')!.records.get(recordKey('sealAwards', 'experiencia'))!.data).toMatchObject({ stage: 3, reachedAt: expected });
  });

  it('atualização atrasada com estágio menor não reduz o estágio (local nem nuvem)', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    const b = await device(remote);
    await linkBoth(remote, a, b);
    remote.offline = true;
    await putAwards(b, [award('constancia', 1, ['2026-01-10T10:00:00.000Z', null, null, null], '2026-11-03T10:00:00.000Z')]); // B atrasado
    remote.offline = false;
    await putAwards(a, [award('constancia', 4, ['2026-01-04T10:00:00.000Z', '2026-02-01T10:00:00.000Z', '2026-04-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z'])]);
    await a.sync.sync(); // A envia IV
    await b.sync.sync(); // B chega depois com I
    await a.sync.sync();
    for (const d of [a, b]) expect(d.service.data.sealAwards.find((x) => x.id === 'constancia')!.stage).toBe(4);
    expect((remote.dump('uid-1')!.records.get(recordKey('sealAwards', 'constancia'))!.data as unknown as SealAward).stage).toBe(4);
  });

  it('recuperação após erro do servidor: nada se perde e a próxima tentativa conclui', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    await putAwards(a, [award('metas', 2, ['2026-01-31T10:00:00.000Z', '2026-03-31T10:00:00.000Z', null, null])]);
    remote.failNextPush = true;
    await a.sync.sync();
    expect(a.sync.getStatus().state).toBe('erro');
    expect(a.sync.pendingCount).toBeGreaterThan(0);
    expect(a.service.data.sealAwards[0]!.stage).toBe(2);
    await a.sync.sync();
    expect(a.sync.getStatus().state).toBe('sincronizado');
    expect(remote.dump('uid-1')!.records.has(recordKey('sealAwards', 'metas'))).toBe(true);
  });

  it('versão antiga (sem as coleções novas) continua sincronizando e não apaga selos nem foto', async () => {
    const remote = new MemoryRemote();
    const novo = await device(remote);
    await novo.sync.setUser('uid-1');
    await novo.sync.link('uid-1', 'mesclar');
    await putAwards(novo, [award('saude', 1, ['2026-01-31T23:59:59.000Z', null, null, null])]);
    await novo.service.setProfileImage(photo('h1', '2026-11-04T10:00:00.000Z'));
    await novo.sync.sync();

    const antigo = await device(remote, { legacy: true });
    await antigo.sync.setUser('uid-1');
    await antigo.sync.link('uid-1', 'usarNuvem');
    expect(antigo.sync.getStatus().state).toBe('sincronizado');
    expect(antigo.service.data.sealAwards).toEqual([]); // ignora o que não conhece
    await antigo.service.saveClient({ name: 'Cliente do aparelho antigo', phone: '', email: '', address: '', notes: '' });
    await antigo.service.updateSettings({ theme: 'dark' }); // grava as preferências inteiras
    await antigo.sync.sync();
    expect(antigo.sync.pendingCount).toBe(0);

    await novo.sync.sync();
    expect(novo.service.data.clients.map((c) => c.name)).toContain('Cliente do aparelho antigo');
    expect(novo.service.data.sealAwards.find((x) => x.id === 'saude')!.stage).toBe(1);
    expect(novo.service.data.profileImages[0]?.hash).toBe('h1');
    expect(remote.dump('uid-1')!.records.has(recordKey('sealAwards', 'saude'))).toBe(true);
    expect(novo.service.data.settings.avatar).toEqual({ kind: 'foto' }); // campo novo preservado pela versão antiga
  });

  it('isolamento entre contas: selos e foto da conta A nunca vão para a conta B', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    await a.sync.setUser('uid-A');
    await a.sync.link('uid-A', 'mesclar');
    await putAwards(a, [award('carteira', 3, ['2026-01-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', null])]);
    await a.service.setProfileImage(photo('foto-A', '2026-11-04T10:00:00.000Z'));
    await a.sync.sync();

    const contaB = await device(remote, { name: 'Bruno' });
    await contaB.sync.setUser('uid-B');
    await contaB.sync.link('uid-B', 'mesclar');
    // O aparelho de A troca para a conta B usando os dados da conta B.
    await a.sync.unlink();
    await a.sync.setUser('uid-B');
    await a.sync.link('uid-B', 'usarNuvem');
    expect(a.service.data.profile?.name).toBe('Bruno');
    expect(a.service.data.profileImages).toEqual([]);
    const bKeys = [...remote.dump('uid-B')!.records.keys()];
    expect(bKeys.some((k) => k.includes('foto') || k === recordKey('sealAwards', 'carteira'))).toBe(false);
    expect([...remote.dump('uid-B')!.records.values()].some((r) => (r.data as { hash?: string } | null)?.hash === 'foto-A')).toBe(false);
  });

  it('o histórico de XP fica idêntico antes e depois de sincronizar selos', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    for (let i = 0; i < 20; i++) await a.service.saveClient({ name: `C${i}`, phone: '', email: '', address: '', notes: '' });
    const before = xpSnapshot(a);
    expect(a.service.data.sealAwards.find((s) => s.id === 'carteira')?.stage).toBe(1); // 20 clientes → Carteira I
    await a.sync.setUser('uid-1');
    await a.sync.link('uid-1', 'mesclar');
    const b = await device(remote);
    await b.sync.setUser('uid-1');
    await b.sync.link('uid-1', 'usarNuvem');
    await b.service.reconcileSeals();
    await b.sync.sync();
    await a.sync.sync();
    expect(xpSnapshot(a)).toEqual(before);
    expect(xpSnapshot(b)).toEqual(before);
    expect(b.service.data.sealAwards.find((s) => s.id === 'carteira')?.stage).toBe(1);
  });
});

describe('foto de perfil: sincronização', () => {
  it('aparece no outro aparelho; troca e remoção propagam; nunca mistura campos de duas fotos', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    const b = await device(remote);
    await linkBoth(remote, a, b);
    await a.service.setProfileImage(photo('h-a', '2026-11-04T10:00:00.000Z', 50));
    await a.sync.sync();
    await b.sync.sync();
    expect(b.service.data.profileImages[0]).toMatchObject({ hash: 'h-a', data: B64(50) });

    // Troca simultânea offline: vence a mais recente, inteira.
    remote.offline = true;
    await a.service.setProfileImage(photo('h-a2', '2026-11-04T11:00:00.000Z', 60));
    await b.service.setProfileImage(photo('h-b', '2026-11-04T12:00:00.000Z', 70));
    remote.offline = false;
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();
    for (const d of [a, b]) expect(d.service.data.profileImages[0]).toMatchObject({ hash: 'h-b', data: B64(70), bytes: 210 });

    // Remoção propaga e não ressuscita.
    await b.service.removeProfileImage();
    await b.sync.sync();
    await a.sync.sync();
    await a.sync.sync();
    expect(a.service.data.profileImages).toEqual([]);
    expect(remote.dump('uid-1')!.records.get(recordKey('profileImages', 'atual'))!.data).toBeNull();
  });

  it('conflito em que só alguns campos coincidem com a foto anterior: nunca combina partes de duas fotos', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    const b = await device(remote);
    await linkBoth(remote, a, b);
    await a.service.setProfileImage(photo('base', '2026-11-04T09:00:00.000Z', 40));
    await a.sync.sync();
    await b.sync.sync();
    remote.offline = true;
    // A troca por uma foto maior; B por outra do MESMO tamanho da anterior (bytes iguais à base).
    await a.service.setProfileImage({ ...photo('foto-a', '2026-11-04T11:00:00.000Z', 90), width: 256, height: 256 });
    await b.service.setProfileImage(photo('foto-b', '2026-11-04T12:00:00.000Z', 40));
    remote.offline = false;
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();
    for (const d of [a, b]) {
      expect(d.service.data.profileImages[0]).toEqual(photo('foto-b', '2026-11-04T12:00:00.000Z', 40));
    }
  });

  it('a foto só é baixada quando muda (sem downloads repetidos)', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    const b = await device(remote);
    await linkBoth(remote, a, b);
    await a.service.setProfileImage(photo('h1', '2026-11-04T10:00:00.000Z'));
    await a.sync.sync();
    const pull = vi.spyOn(remote, 'pull');
    await b.sync.sync();
    const downloads = async () => (await Promise.all(pull.mock.results.map((r) => r.value as ReturnType<MemoryRemote['pull']>)))
      .flatMap((p) => p.records).filter((r) => r.collection === 'profileImages' && r.data).length;
    expect(await downloads()).toBeGreaterThanOrEqual(1);
    const afterFirst = await downloads();
    await b.sync.sync();
    await b.sync.sync();
    // Só a janela de segurança (OVERLAP) pode repetir um registro recente; depois disso, nada.
    expect(await downloads() - afterFirst).toBeLessThanOrEqual(2);
  });

  it('foto inválida (formato, tamanho ou id) é recusada antes de gravar', async () => {
    const remote = new MemoryRemote();
    const a = await device(remote);
    await expect(a.service.setProfileImage({ ...photo('x', NOW.toISOString()), data: B64(30_000) })).rejects.toThrow();
    await expect(a.service.setProfileImage({ ...photo('x', NOW.toISOString()), mime: 'image/png' as never })).rejects.toThrow();
    await expect(a.service.setProfileImage({ ...photo('x', NOW.toISOString()), id: 'outra' as never })).rejects.toThrow();
    expect(a.service.data.profileImages).toEqual([]);
  });
});

describe('armazenamento local e backup (0.4)', () => {
  it('migração do IndexedDB v2 → v3 preserva todos os dados e cria os stores novos', async () => {
    const name = `migr-${Math.random()}`;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(name, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['clients', 'appointments', 'transactions', 'xpEvents', 'achievements']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('meta');
        db.createObjectStore('kv');
        req.transaction!.objectStore('clients').put({ id: 'c1', name: 'Cliente da 0.3', phone: '', email: '', address: '', notes: '', createdAt: 'x', updatedAt: 'x' });
        req.transaction!.objectStore('meta').put({ theme: 'dark' }, 'settings');
        req.transaction!.objectStore('kv').put({ version: 1 }, 'sync:state');
      };
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
    });
    const adapter = await createIndexedDbAdapter(name);
    const all = await adapter.loadAll();
    expect(all.clients.map((c) => c.name)).toEqual(['Cliente da 0.3']);
    expect(all.settings.theme).toBe('dark');
    expect(all.sealAwards).toEqual([]);
    expect(all.profileImages).toEqual([]);
    expect(await adapter.kvGet('sync:state')).toEqual({ version: 1 });
  });

  it('backup leva selos e foto; backup antigo (sem esses campos) continua importando', async () => {
    const a = await device(new MemoryRemote());
    await putAwards(a, [award('fidelizacao', 2, ['2026-02-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', null, null])]);
    await a.service.setProfileImage(photo('hb', NOW.toISOString()));
    const json = a.service.exportBackup();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1); // a 0.3.1 aceita (só lê os campos que conhece)
    const back = parseBackup(json);
    expect(back.sealAwards[0]).toMatchObject({ id: 'fidelizacao', stage: 2 });
    expect(back.profileImages[0]?.hash).toBe('hb');
    delete parsed.data.sealAwards;
    delete parsed.data.profileImages;
    const old = parseBackup(JSON.stringify(parsed));
    expect(old.sealAwards).toEqual([]);
    expect(old.profileImages).toEqual([]);
    expect(old.clients).toEqual(back.clients);
  });

  it('dados malformados de selo ou foto no backup são descartados', () => {
    const json = JSON.stringify({ format: 'oficio-backup', version: 1, exportedAt: NOW.toISOString(), data: {
      profile: null, settings: { theme: 'system' }, clients: [], appointments: [], transactions: [], xpEvents: [], achievements: [],
      sealAwards: [{ id: 'inventado', stage: 9 }, award('metas', 1, [null, null, null, null])],
      profileImages: [{ id: 'atual', mime: 'image/svg+xml', data: '<svg/>' }],
    } });
    const d = parseBackup(json);
    expect(d.sealAwards.map((s) => s.id)).toEqual(['metas']);
    expect(d.profileImages).toEqual([]);
  });
});
