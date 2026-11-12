/**
 * 0.5.0-beta.4 — lembretes com os dados reais do app: reconciliação idempotente (sem duplicar), reagendar,
 * cancelar, excluir, séries recorrentes, desligar, permissão (nunca pedida automaticamente), atualização depois
 * de sincronizar e preferências locais (fora do backup e da nuvem).
 */
import { reminderId } from '../domain/reminders';
import { memoryReminderPlatform, reconcileReminders } from '../platform/reminders';
import { setReminderPlatform, startReminderSync } from '../platform/reminderSync';
import type { AppointmentInput } from '../lib/validation';
import { createMemoryAdapter } from '../storage/memory';
import { AppService } from './service';

const clock = new Date(2026, 10, 12, 9, 0); // quinta, 12/11/2026 09:00
const now = () => clock;
const input = (extra: Partial<AppointmentInput> = {}): AppointmentInput => ({ title: 'Manicure', clientId: '', date: '2026-11-13', time: '10:00', price: '50,00', notes: '', ...extra });

async function app(storage = createMemoryAdapter()) {
  const s = await AppService.load(storage, now);
  if (!s.data.profile) await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return s;
}
const reconcile = (s: AppService, platform: ReturnType<typeof memoryReminderPlatform>['platform']) =>
  reconcileReminders(platform, { appointments: s.data.appointments, clients: s.data.clients, prefs: s.devicePrefs.reminders, now: clock, serviceTerm: 'Atendimento' });
const enable = (s: AppService, offsets: (15 | 30 | 60 | 1440)[] = [30]) => s.updateDevicePrefs({ reminders: { enabled: true, offsets, showClient: false } });

afterEach(() => setReminderPlatform(null));

describe('reconciliação', () => {
  it('desligado por padrão: nada agendado e nenhuma permissão pedida', async () => {
    const s = await app();
    await s.saveAppointment(input());
    const m = memoryReminderPlatform('prompt');
    const r = await reconcile(s, m.platform);
    expect(s.devicePrefs.reminders.enabled).toBe(false);
    expect(r).toMatchObject({ scheduled: 0, total: 0, permission: 'prompt' });
    expect(m.state.requests).toBe(0);
  });

  it('agenda uma vez; rodar de novo não duplica nem reagenda', async () => {
    const s = await app();
    await s.saveAppointment(input());
    await s.saveAppointment(input({ title: 'Pé', date: '2026-11-20', time: '15:00' }));
    await enable(s, [30, 1440]);
    const m = memoryReminderPlatform('granted');
    expect(await reconcile(s, m.platform)).toMatchObject({ scheduled: 4, cancelled: 0, total: 4 });
    for (let i = 0; i < 3; i++) expect(await reconcile(s, m.platform)).toMatchObject({ scheduled: 0, cancelled: 0, total: 4 });
    expect(m.state.pending.size).toBe(4);
    expect(m.state.scheduleCalls).toBe(1);
    expect(m.state.cancelCalls).toBe(0);
  });

  it('reagendar troca o horário do mesmo aviso; cancelar e excluir removem', async () => {
    const s = await app();
    const a = (await s.saveAppointment(input())).appointment;
    const b = (await s.saveAppointment(input({ title: 'Pé', time: '11:00' }))).appointment;
    const c = (await s.saveAppointment(input({ title: 'Mão', time: '12:00' }))).appointment;
    await enable(s);
    const m = memoryReminderPlatform('granted');
    await reconcile(s, m.platform);
    const id = reminderId(a.id, 30);
    expect(m.state.pending.get(id)!.at).toBe(new Date(2026, 10, 13, 9, 30).getTime());

    await s.saveAppointment(input({ date: '2026-11-14', time: '16:00' }), a.id);
    expect(await reconcile(s, m.platform)).toMatchObject({ scheduled: 1, cancelled: 1, total: 3 });
    expect(m.state.pending.get(id)!.at).toBe(new Date(2026, 10, 14, 15, 30).getTime());

    await s.setAppointmentStatus(b.id, 'cancelado');
    await s.deleteAppointment(c.id);
    expect(await reconcile(s, m.platform)).toMatchObject({ scheduled: 0, cancelled: 2, total: 1 });
    expect([...m.state.pending.keys()]).toEqual([id]);
  });

  it('concluir antes da hora remove o aviso; atendimento passado nunca é agendado', async () => {
    const s = await app();
    const a = (await s.saveAppointment(input())).appointment;
    await s.saveAppointment(input({ title: 'Ontem', date: '2026-11-11' }));
    await enable(s);
    const m = memoryReminderPlatform('granted');
    expect(await reconcile(s, m.platform)).toMatchObject({ total: 1 });
    await s.completeAppointment(a.id, { payment: { mode: 'nenhum' } });
    expect(await reconcile(s, m.platform)).toMatchObject({ cancelled: 1, total: 0 });
    expect(m.state.pending.size).toBe(0);
  });

  it('série recorrente: uma vez por ocorrência nos 30 dias; gerar mais ocorrências não duplica; cancelar a série remove todas', async () => {
    const s = await app();
    const { appointment } = await s.saveAppointment(input({ date: '2026-11-13', repeat: { freq: 'semanal', interval: '1', days: [4], end: 'nunca', until: '', count: '' } }));
    await enable(s, [60]);
    const m = memoryReminderPlatform('granted');
    const first = await reconcile(s, m.platform);
    // Sextas de 13/11 a 11/12 (30 dias a partir de 12/11 09:00): 13, 20, 27/11, 4 e 11/12.
    expect(first.total).toBe(5);
    await s.extendSeries();
    expect(await reconcile(s, m.platform)).toMatchObject({ scheduled: 0, cancelled: 0, total: 5 });
    expect(new Set([...m.state.pending.values()].map((p) => p.at)).size).toBe(5);
    await s.cancelSeries(appointment.id, 'serie');
    expect(await reconcile(s, m.platform)).toMatchObject({ cancelled: 5, total: 0 });
  });

  it('desligar cancela todos os avisos do app', async () => {
    const s = await app();
    await s.saveAppointment(input());
    await enable(s, [15, 30]);
    const m = memoryReminderPlatform('granted');
    await reconcile(s, m.platform);
    await s.updateDevicePrefs({ reminders: { ...s.devicePrefs.reminders, enabled: false } });
    expect(await reconcile(s, m.platform)).toMatchObject({ cancelled: 2, total: 0 });
    expect(m.state.pending.size).toBe(0);
  });

  it('permissão negada: não agenda, não pede de novo e limpa o que estava pendente', async () => {
    const s = await app();
    await s.saveAppointment(input());
    await enable(s);
    const m = memoryReminderPlatform('granted');
    await reconcile(s, m.platform);
    m.state.permission = 'denied'; // a pessoa bloqueou nas configurações do Android
    for (let i = 0; i < 3; i++) expect(await reconcile(s, m.platform)).toMatchObject({ total: 0, permission: 'denied' });
    expect(m.state.requests).toBe(0);
    expect(m.state.pending.size).toBe(0);
  });
});

describe('controlador (startReminderSync)', () => {
  it('reconcilia ao iniciar, ao mudar a agenda, ao mudar preferências e depois de sincronizar — sem pedir permissão', async () => {
    const s = await app();
    const m = memoryReminderPlatform('granted');
    setReminderPlatform(m.platform);
    const ctl = startReminderSync(s, { debounceMs: 0, now });
    try {
      await vi.waitFor(() => expect(m.state.pending.size).toBe(0));
      await enable(s);
      await s.saveAppointment(input());
      await vi.waitFor(() => expect(m.state.pending.size).toBe(1));
      // Depois de sincronizar: outro aparelho reagendou para sábado 11:00.
      const next = structuredClone(s.data);
      next.appointments[0]!.date = '2026-11-14';
      next.appointments[0]!.time = '11:00';
      await s.applySyncedData(next);
      await vi.waitFor(() => expect([...m.state.pending.values()][0]!.at).toBe(new Date(2026, 10, 14, 10, 30).getTime()));
      expect(m.state.pending.size).toBe(1);
      expect(m.state.requests).toBe(0);
    } finally {
      ctl.stop();
    }
  });

  it('parado: mudanças não reconciliam mais', async () => {
    const s = await app();
    const m = memoryReminderPlatform('granted');
    setReminderPlatform(m.platform);
    const ctl = startReminderSync(s, { debounceMs: 0, now });
    await ctl.runNow();
    ctl.stop();
    await enable(s);
    await s.saveAppointment(input());
    await new Promise((r) => setTimeout(r, 20));
    expect(m.state.pending.size).toBe(0);
  });
});

describe('preferências locais', () => {
  it('ficam no aparelho (sobrevivem a reabrir) e não entram no backup nem nos dados sincronizados', async () => {
    const storage = createMemoryAdapter();
    const s = await app(storage);
    await s.updateDevicePrefs({ reminders: { enabled: true, offsets: [15, 1440], showClient: true } });
    const again = await app(storage);
    expect(again.devicePrefs.reminders).toEqual({ enabled: true, offsets: [15, 1440], showClient: true });
    expect(again.exportBackup()).not.toMatch(/reminders|lembretes/i);
    expect(JSON.stringify(again.data)).not.toMatch(/reminders/);
  });

  it('importar um backup não liga nem desliga os lembretes deste aparelho', async () => {
    const s = await app();
    await s.saveAppointment(input());
    const backup = s.exportBackup();
    await enable(s, [60]);
    await s.importBackup(backup);
    expect(s.devicePrefs.reminders).toEqual({ enabled: true, offsets: [60], showClient: false });
  });
});
