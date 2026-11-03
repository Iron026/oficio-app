import { accentOf, avatarOf, DEFAULT_DEVICE_PREFS, featuredSealOf, readDevicePrefs } from './preferences';
import { AppService } from '../state/service';
import { createMemoryAdapter } from '../storage/memory';

describe('preferências do aparelho', () => {
  it('migração: na primeira abertura o tema vem da escolha anterior (settings.theme)', () => {
    expect(readDevicePrefs(undefined, 'dark')).toEqual({ ...DEFAULT_DEVICE_PREFS, theme: 'dark' });
    expect(readDevicePrefs(undefined, undefined).theme).toBe('system');
  });

  it('depois de salvas, o valor do aparelho vale (a conta não muda mais o tema)', () => {
    expect(readDevicePrefs({ version: 1, theme: 'light', density: 'compacta', hideValues: true, motion: 'reduzir' }, 'dark'))
      .toEqual({ version: 1, theme: 'light', density: 'compacta', hideValues: true, motion: 'reduzir' });
  });

  it('valores inválidos viram o padrão', () => {
    expect(readDevicePrefs({ theme: 'azul', density: 'x', hideValues: 'sim', motion: 1 }, 'dark')).toEqual(DEFAULT_DEVICE_PREFS);
  });

  it('o serviço migra, grava só no aparelho e "Apagar todos os dados" volta ao padrão', async () => {
    const storage = createMemoryAdapter();
    await storage.saveSettings({ theme: 'dark' });
    const s = await AppService.load(storage);
    expect(s.devicePrefs.theme).toBe('dark');
    await s.updateDevicePrefs({ theme: 'light', hideValues: true });
    expect(s.data.settings.theme).toBe('dark'); // a conta não é alterada (compatível com a 0.3.1)
    const again = await AppService.load(storage);
    expect(again.devicePrefs).toMatchObject({ theme: 'light', hideValues: true });
    expect(JSON.parse(again.exportBackup()).data.settings).not.toHaveProperty('hideValues');
    await again.resetAll();
    expect(again.devicePrefs).toEqual(DEFAULT_DEVICE_PREFS);
  });
});

describe('preferências da conta (validação)', () => {
  it('cor de destaque, avatar e selo inválidos viram o padrão', () => {
    expect(accentOf({ theme: 'system', accent: 'rosa' as never })).toBe('petroleo');
    expect(accentOf({ theme: 'system', accent: 'indigo' })).toBe('indigo');
    expect(avatarOf({ theme: 'system', avatar: { kind: 'url', src: 'https://x' } as never })).toEqual({ kind: 'iniciais' });
    expect(avatarOf({ theme: 'system', avatar: { kind: 'interno', id: 'retrato-saude' } })).toEqual({ kind: 'interno', id: 'retrato-saude' });
    expect(featuredSealOf({ theme: 'system', featuredSeal: 'vip' as never })).toBe('auto');
    expect(featuredSealOf({ theme: 'system', featuredSeal: 'metas' })).toBe('metas');
  });
});
