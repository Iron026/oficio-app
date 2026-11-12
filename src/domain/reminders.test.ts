/**
 * 0.5.0-beta.4 — planejamento de lembretes: antecedências combináveis, janela de 30 dias, nada no passado,
 * cancelados/concluídos/demonstração fora, ids estáveis (sem duplicar), reagendamento e privacidade.
 */
import type { Appointment } from './types';
import {
  DEFAULT_REMINDERS, REMINDER_DAYS, REMINDER_MAX, diffReminders, localStart, planReminders, readReminderPrefs, reminderId,
  type ReminderPrefs,
} from './reminders';

const now = new Date(2026, 10, 12, 9, 0); // 12/11/2026 09:00 (local)
const on = (offsets: ReminderPrefs['offsets'], showClient = false): ReminderPrefs => ({ enabled: true, offsets, showClient });
let seq = 0;
const appt = (p: Partial<Appointment>): Appointment =>
  ({ id: `a${++seq}`, title: 'Coloração', clientId: 'c1', date: '2026-11-13', time: '10:00', price: 30_000, notes: '', status: 'agendado', createdAt: '', updatedAt: '', ...p }) as Appointment;
const clients = [{ id: 'c1', name: 'Carla Souza' }];

describe('preferências', () => {
  it('padrão desligado, sem antecedências e sem nome do cliente', () => {
    expect(DEFAULT_REMINDERS).toEqual({ enabled: false, offsets: [], showClient: false });
    expect(readReminderPrefs(undefined)).toEqual(DEFAULT_REMINDERS);
  });
  it('lê só valores válidos, na ordem canônica', () => {
    expect(readReminderPrefs({ enabled: true, offsets: [1440, 7, 15, '30', 60], showClient: 'sim' })).toEqual({ enabled: true, offsets: [15, 60, 1440], showClient: false });
  });
});

describe('planReminders', () => {
  it('desligado ou sem antecedência: nada', () => {
    const a = [appt({})];
    expect(planReminders(a, clients, { ...on([30]), enabled: false }, now)).toEqual([]);
    expect(planReminders(a, clients, on([]), now)).toEqual([]);
  });

  it('antecedências combináveis: 15 min, 30 min, 1 h e 1 dia, no horário local', () => {
    const a = appt({ date: '2026-11-14', time: '14:30' });
    const plan = planReminders([a], clients, on([15, 30, 60, 1440]), now, 'Atendimento');
    const start = new Date(2026, 10, 14, 14, 30).getTime();
    expect(plan.map((p) => (start - p.at) / 60_000)).toEqual([1440, 60, 30, 15]);
    expect(plan.map((p) => p.title)).toEqual([
      'Atendimento amanhã · 14:30', 'Atendimento em 1 hora · 14:30', 'Atendimento em 30 minutos · 14:30', 'Atendimento em 15 minutos · 14:30',
    ]);
    expect(new Set(plan.map((p) => p.id)).size).toBe(4);
  });

  it('privacidade: sem nome do cliente e sem valores por padrão; nome só se a pessoa ligar', () => {
    const a = appt({ price: 123_456 });
    const [hidden] = planReminders([a], clients, on([30]), now);
    expect(`${hidden!.title} ${hidden!.body}`).not.toMatch(/Carla|R\$|1\.234|1234/);
    expect(hidden!.body).toBe('Coloração');
    const [shown] = planReminders([a], clients, on([30], true), now);
    expect(shown!.body).toBe('Coloração · Carla Souza');
  });

  it('só agendados, sem demonstração, com horário', () => {
    const list = [
      appt({ status: 'cancelado' }), appt({ status: 'concluido' }), appt({ isDemo: true }), appt({ time: '' }), appt({ id: 'ok' }),
    ];
    expect(planReminders(list, clients, on([30]), now).map((p) => p.apptId)).toEqual(['ok']);
  });

  it('nada no passado: atendimento passado fica fora; aviso que já teria passado é pulado', () => {
    const past = appt({ date: '2026-11-11' });
    const soon = appt({ date: '2026-11-12', time: '09:20' }); // começa em 20 min
    const plan = planReminders([past, soon], clients, on([15, 30, 1440]), now);
    expect(plan.map((p) => [p.apptId, p.offset])).toEqual([[soon.id, 15]]);
    expect(plan.every((p) => p.at > now.getTime())).toBe(true);
  });

  it(`janela de ${REMINDER_DAYS} dias`, () => {
    const inside = appt({ date: '2026-12-12', time: '08:59' });
    const outside = appt({ date: '2026-12-12', time: '09:01' });
    expect(planReminders([inside, outside], clients, on([30]), now).map((p) => p.apptId)).toEqual([inside.id]);
  });

  it('ocorrências de série: cada uma com ids próprios; a mesma lista duas vezes não duplica', () => {
    const occ = ['2026-11-16', '2026-11-23', '2026-11-30'].map((d) => appt({ id: `serie1-${d.replaceAll('-', '')}`, date: d }));
    const plan = planReminders([...occ, ...occ], clients, on([60, 1440]), now);
    expect(plan).toHaveLength(6);
    expect(new Set(plan.map((p) => p.id)).size).toBe(6);
  });

  it(`teto de ${REMINDER_MAX} avisos, os mais próximos primeiro`, () => {
    const many = Array.from({ length: 200 }, (_, i) => appt({ date: `2026-11-${String(13 + (i % 17)).padStart(2, '0')}`, time: `${String(8 + (i % 10)).padStart(2, '0')}:00` }));
    const plan = planReminders(many, clients, on([15]), now);
    expect(plan).toHaveLength(REMINDER_MAX);
    expect(plan.map((p) => p.at)).toEqual([...plan.map((p) => p.at)].sort((x, y) => x - y));
  });

  it('id estável, positivo e de 31 bits', () => {
    expect(reminderId('x', 30)).toBe(reminderId('x', 30));
    expect(reminderId('x', 30)).not.toBe(reminderId('x', 15));
    for (const id of ['a', 'serie-20261116', 'ç-é']) {
      const n = reminderId(id, 1440);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(0x7fffffff);
    }
  });

  it('localStart: data e hora locais; sem horário → null', () => {
    expect(localStart({ date: '2026-11-13', time: '07:05' })!.getHours()).toBe(7);
    expect(localStart({ date: '2026-11-13', time: '' })).toBeNull();
  });
});

describe('diffReminders', () => {
  const plan = planReminders([appt({ id: 'r1' }), appt({ id: 'r2', time: '11:00' })], clients, on([30]), now);
  const asPending = (p: (typeof plan)[number]) => ({ id: p.id, at: p.at, title: p.title, body: p.body });

  it('igual ao agendado: nada a fazer (idempotente)', () => {
    expect(diffReminders(plan.map(asPending), plan)).toEqual({ cancel: [], schedule: [] });
  });
  it('reagendado: cancela e agenda o mesmo id com o novo horário', () => {
    const moved = planReminders([appt({ id: 'r1', time: '15:00' }), appt({ id: 'r2', time: '11:00' })], clients, on([30]), now);
    const d = diffReminders(plan.map(asPending), moved);
    expect(d.cancel).toEqual([plan[0]!.id]);
    expect(d.schedule.map((p) => p.id)).toEqual([plan[0]!.id]);
  });
  it('removido do plano (cancelado/excluído): só cancela', () => {
    expect(diffReminders(plan.map(asPending), plan.slice(1))).toEqual({ cancel: [plan[0]!.id], schedule: [] });
  });
});
