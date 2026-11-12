/**
 * Regressão (beta.4, emulador Android): o plugin do Capacitor é um Proxy que responde a qualquer método,
 * inclusive `then`. Devolvê-lo de uma função async fazia o `await` chamar `LocalNotifications.then()`, que
 * falha no Android ("not implemented") — nenhum lembrete funcionava. O teste usa um Proxy igual.
 */
const calls: string[] = [];
vi.mock('@capacitor/local-notifications', () => {
  const impl: Record<string, (...a: unknown[]) => Promise<unknown>> = {
    checkPermissions: async () => ({ display: 'prompt' }),
    requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [{ id: 7, title: 't', body: 'b', schedule: { at: '2026-11-13T12:30:00.000Z' } }] }),
    cancel: async () => undefined,
    createChannel: async () => undefined,
    schedule: async () => ({ notifications: [] }),
  };
  const LocalNotifications = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      return (...args: unknown[]) => {
        calls.push(prop);
        if (!impl[prop]) throw new Error(`"LocalNotifications.${prop}()" is not implemented on android`);
        return impl[prop]!(...args);
      };
    },
  });
  return { LocalNotifications };
});
vi.mock('./native', () => ({ isNative: () => true }));

import { nativeReminderPlatform } from './reminders';

describe('plataforma nativa de lembretes (plugin como Proxy do Capacitor)', () => {
  beforeEach(() => { calls.length = 0; });

  it('consulta e pede permissão sem chamar then() no plugin', async () => {
    const p = nativeReminderPlatform();
    expect(await p.checkPermission()).toBe('prompt');
    expect(await p.requestPermission()).toBe('granted');
    expect(calls).not.toContain('then');
  });

  it('lê pendentes, cancela e agenda (canal privado, não exato)', async () => {
    const p = nativeReminderPlatform();
    expect(await p.pending()).toEqual([{ id: 7, at: Date.parse('2026-11-13T12:30:00.000Z'), title: 't', body: 'b' }]);
    await p.cancel([7]);
    await p.schedule([{ id: 9, at: Date.parse('2026-11-13T12:45:00.000Z'), apptId: 'a', offset: 15, title: 'x', body: 'y' }]);
    expect(calls.filter((c) => c !== 'then')).toEqual(['getPending', 'cancel', 'createChannel', 'schedule']);
    expect(calls).not.toContain('then');
  });
});
