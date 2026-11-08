/**
 * 0.5.0-beta.3 — atendimentos recorrentes no serviço e na sincronização: criação (XP uma vez), geração até o
 * horizonte sem lacunas preenchidas, exclusão/cancelamento que nunca voltam, exceções, "esta e as próximas",
 * "toda a série", pagamentos preservados, dois aparelhos offline e backup.
 */
import { seriesGroups, seriesOf } from '../domain/recurrence';
import type { Appointment } from '../domain/types';
import { missionProgress, totalXp } from '../gamification/engine';
import { getProfession } from '../domain/professions';
import type { AppointmentInput, RepeatInput } from '../lib/validation';
import { createMemoryAdapter } from '../storage/memory';
import { SyncEngine } from '../sync/engine';
import { MemoryRemote } from '../sync/memoryRemote';
import { TrackedStorage } from '../sync/tracked';
import { AppService } from './service';

let clock = new Date(2026, 10, 2, 9, 0); // segunda, 2/11/2026
const now = () => clock;
const advanceDays = (n: number) => { clock = new Date(clock.getTime() + n * 86_400_000); };
beforeEach(() => { clock = new Date(2026, 10, 2, 9, 0); });

const repeat = (r: Partial<RepeatInput>): RepeatInput => ({ freq: 'semanal', interval: '1', days: [0], end: 'nunca', until: '', count: '', ...r });
const input = (r?: Partial<RepeatInput>, extra: Partial<AppointmentInput> = {}): AppointmentInput => ({ title: 'Manicure', clientId: '', date: '2026-11-02', time: '10:00', price: '50,00', notes: '', duration: '60', ...(r ? { repeat: repeat(r) } : {}), ...extra });
async function app(storage = createMemoryAdapter()) {
  const s = await AppService.load(storage, now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return s;
}
const occ = (s: AppService) => [...s.data.appointments].sort((a, b) => (a.date < b.date ? -1 : 1));
const dates = (s: AppService, filter: (a: Appointment) => boolean = () => true) => occ(s).filter(filter).map((a) => a.date);

describe('criar e gerar', () => {
  it('semanal: primeira ocorrência + geradas até 90 dias, ids determinísticos, XP uma única vez, missão sem inflar', async () => {
    const s = await app();
    const xp0 = totalXp(s.data.xpEvents);
    const { appointment } = await s.saveAppointment(input({}));
    expect(appointment.id).toMatch(/-20261102$/);
    const d = dates(s);
    expect(d[0]).toBe('2026-11-02');
    expect(d.at(-1)).toBe('2027-01-25'); // última segunda até 31/1/2027
    expect(d).toHaveLength(13);
    expect(new Set(s.data.appointments.map((a) => a.id)).size).toBe(13);
    const created = s.data.xpEvents.filter((e) => e.key.startsWith('appointment_created'));
    expect(created).toHaveLength(1);
    expect(totalXp(s.data.xpEvents) - xp0).toBeLessThan(100); // XP de um agendamento (+ missão inicial), não de 13
    const weekly = missionProgress(getProfession('beleza'), s.data, clock).find((m) => m.template.metric === 'appointmentsScheduled' && m.kind === 'semanal');
    if (weekly) expect(weekly.current).toBeLessThanOrEqual(1);
    // Repetir a geração não cria nada; um dia depois entra só o que chegou ao horizonte.
    expect(await s.extendSeries()).toBe(0);
    advanceDays(7);
    expect(await s.extendSeries()).toBe(1);
    expect(dates(s).at(-1)).toBe('2027-02-01');
    expect(s.data.xpEvents.filter((e) => e.key.startsWith('appointment_created'))).toHaveLength(1);
  });

  it('término por quantidade e por data; mensal no dia 31 cai no último dia dos meses curtos', async () => {
    const s = await app();
    await s.saveAppointment(input({ freq: 'diaria', end: 'vezes', count: '3' }));
    expect(dates(s)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    const m = await app();
    clock = new Date(2026, 9, 31, 9, 0);
    await m.saveAppointment(input({ freq: 'mensal', end: 'data', until: '2027-03-31' }, { date: '2026-10-31' }));
    expect(dates(m)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']); // horizonte de 90 dias (até 29/1)
    advanceDays(62); // 1/1/2027: horizonte até 1/4
    await m.extendSeries();
    expect(dates(m)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
    advanceDays(60);
    expect(await m.extendSeries()).toBe(0); // terminou em 31/3
  });

  it('semanal com dias da semana começa na primeira data válida', async () => {
    const s = await app();
    await s.saveAppointment(input({ days: [1, 3], end: 'vezes', count: '4' })); // ter e qui; começa na segunda 2/11
    expect(dates(s)).toEqual(['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12']);
  });
});

describe('nada reaparece', () => {
  it('ocorrência excluída ou cancelada nunca é recriada, nem depois de dias', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    const [, second, third] = occ(s);
    await s.deleteAppointment(second!.id);
    await s.setAppointmentStatus(third!.id, 'cancelado');
    for (let i = 0; i < 4; i++) { advanceDays(7); await s.extendSeries(); }
    expect(s.data.appointments.some((a) => a.id === second!.id)).toBe(false);
    expect(s.data.appointments.find((a) => a.id === third!.id)!.status).toBe('cancelado');
  });

  it('excluir as últimas ocorrências geradas não faz o gerador voltar atrás', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    const all = occ(s);
    for (const a of all.slice(1)) await s.deleteAppointment(a.id); // sobra só a primeira
    expect(await s.extendSeries()).toBe(0);
    expect(dates(s)).toEqual(['2026-11-02']);
  });
});

describe('editar e cancelar com escopo', () => {
  it('"só esta" vira exceção; "esta e as próximas" respeita exceção, concluídas e valor de quem já pagou', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    const [first, second, third, fourth] = occ(s);
    await s.completeAppointment(first!.id, { payment: { mode: 'integral' } });
    await s.saveAppointment(input(undefined, { title: 'Manicure especial', date: third!.date, time: '15:00' }), third!.id, 'esta');
    await s.registerPayment(fourth!.id, { amount: 2_000 });
    await s.saveAppointment(input(undefined, { title: 'Manicure gel', price: '70,00', date: second!.date }), second!.id, 'proximas');
    const by = (id: string) => s.data.appointments.find((a) => a.id === id)!;
    expect(by(first!.id)).toMatchObject({ title: 'Manicure', status: 'concluido', price: 5_000 });
    expect(by(third!.id)).toMatchObject({ title: 'Manicure especial', time: '15:00' });
    expect(seriesOf(by(third!.id))!.detached).toBe(true);
    expect(by(second!.id)).toMatchObject({ title: 'Manicure gel', price: 7_000 });
    expect(by(fourth!.id)).toMatchObject({ title: 'Manicure gel', price: 5_000 }); // tem pagamento: valor mantido
    // As próximas geradas usam o modelo novo.
    advanceDays(7);
    await s.extendSeries();
    expect(occ(s).at(-1)).toMatchObject({ title: 'Manicure gel', price: 7_000 });
    expect(s.data.transactions.filter((t) => t.type === 'receita')).toHaveLength(2);
  });

  it('mudar a regra em "toda a série": série nova desde a primeira em aberto, sem duplicar datas, pagamentos preservados', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    const [first, second, third] = occ(s);
    await s.completeAppointment(first!.id, { payment: { mode: 'integral' } });
    await s.registerPayment(third!.id, { amount: 1_000 });
    await s.saveAppointment(input({ days: [2] }, { date: second!.date }), second!.id, 'serie'); // passa para quarta
    const ids = s.data.appointments.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const open = occ(s).filter((a) => a.status === 'agendado');
    expect(open[0]!.date).toBe('2026-11-11'); // a segunda 9/11 virou quarta 11/11
    expect(open.filter((a) => !seriesOf(a)!.detached).every((a) => a.date === '2026-11-11' || new Date(`${a.date}T12:00:00Z`).getUTCDay() === 3)).toBe(true);
    expect(s.data.appointments.find((a) => a.id === third!.id)).toMatchObject({ status: 'agendado' });
    expect(seriesOf(s.data.appointments.find((a) => a.id === third!.id)!)!.detached).toBe(true);
    expect(s.data.transactions.filter((t) => t.type === 'receita')).toHaveLength(2);
    expect(s.data.appointments.find((a) => a.id === first!.id)!.status).toBe('concluido');
    // A série antiga terminou: nada novo nas segundas.
    advanceDays(14);
    await s.extendSeries();
    expect(occ(s).filter((a) => a.status === 'agendado' && !seriesOf(a)!.detached).every((a) => new Date(`${a.date}T12:00:00Z`).getUTCDay() === 3)).toBe(true);
  });

  it('cancelar "esta e as próximas": intocadas saem, com pagamento ficam canceladas (dinheiro preservado), nada é gerado depois; Desfazer volta', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    const [, second, third, fourth] = occ(s);
    await s.registerPayment(fourth!.id, { amount: 2_000 });
    const before = s.data.appointments.length;
    const undo = await s.cancelSeries(second!.id, 'proximas');
    expect(dates(s)).toEqual(['2026-11-02', second!.date, fourth!.date]);
    expect(s.data.appointments.find((a) => a.id === second!.id)!.status).toBe('cancelado');
    expect(s.data.appointments.find((a) => a.id === fourth!.id)!.status).toBe('cancelado');
    expect(s.data.appointments.some((a) => a.id === third!.id)).toBe(false);
    expect(s.data.transactions).toHaveLength(1);
    await s.undo(undo);
    expect(s.data.appointments.length).toBe(before);
    await s.cancelSeries(second!.id, 'proximas');
    advanceDays(30);
    expect(await s.extendSeries()).toBe(0);
  });
});

describe('dois aparelhos offline', () => {
  async function device(remote: MemoryRemote) {
    const tracked = new TrackedStorage(createMemoryAdapter());
    const service = await AppService.load(tracked, now);
    const sync = await SyncEngine.create(service, tracked, remote, { autoSync: false, now, isOnline: () => !remote.offline });
    return { service, sync };
  }
  async function pair() {
    const remote = new MemoryRemote();
    const a = await device(remote);
    await a.service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await a.sync.setUser('u');
    await a.sync.link('u', 'mesclar');
    const b = await device(remote);
    await b.sync.setUser('u');
    await b.sync.link('u', 'usarNuvem');
    return { remote, a, b };
  }
  const all = async (...ds: { sync: SyncEngine }[]) => { for (let i = 0; i < 2; i++) for (const d of ds) await d.sync.sync(); };

  it('os dois geram as mesmas ocorrências offline (dias depois): nenhuma duplicada, nenhum conflito', async () => {
    const { remote, a, b } = await pair();
    await a.service.saveAppointment(input({}));
    await all(a, b);
    remote.offline = true;
    advanceDays(21);
    await a.service.extendSeries();
    await b.service.extendSeries();
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) {
      const ids = d.service.data.appointments.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(16);
    }
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });

  it('excluída em A enquanto B (offline) a tinha intocada ou a gerou de novo: não reaparece em nenhum', async () => {
    const { remote, a, b } = await pair();
    await a.service.saveAppointment(input({}));
    await all(a, b);
    const target = occ(a.service)[3]!;
    remote.offline = true;
    await a.service.deleteAppointment(target.id);
    advanceDays(7);
    await b.service.extendSeries();
    await a.service.extendSeries();
    remote.offline = false;
    await all(a, b);
    await all(a, b);
    for (const d of [a, b]) expect(d.service.data.appointments.some((x) => x.id === target.id)).toBe(false);
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });

  it('alteração feita num aparelho vence a ocorrência só gerada no outro', async () => {
    const { remote, a, b } = await pair();
    await a.service.saveAppointment(input({}));
    await all(a, b);
    const target = occ(a.service)[2]!;
    remote.offline = true;
    await a.service.saveAppointment(input(undefined, { title: 'Manicure (remarcada)', date: target.date, time: '16:00' }), target.id, 'esta');
    advanceDays(7);
    await b.service.extendSeries();
    remote.offline = false;
    await all(a, b);
    for (const d of [a, b]) expect(d.service.data.appointments.find((x) => x.id === target.id)).toMatchObject({ title: 'Manicure (remarcada)', time: '16:00' });
    expect([...a.sync.conflicts, ...b.sync.conflicts]).toEqual([]);
  });
});

describe('compatibilidade e backup', () => {
  it('backup preserva séries e exceções; restaurar não duplica nem recria', async () => {
    const s = await app();
    await s.saveAppointment(input({}));
    await s.deleteAppointment(occ(s)[1]!.id);
    const json = s.exportBackup();
    const r = await app();
    await r.importBackup(json);
    expect(JSON.stringify(r.data.appointments)).toBe(JSON.stringify(s.data.appointments));
    expect(await r.extendSeries()).toBe(0);
    expect(seriesGroups(r.data.appointments).size).toBe(1);
  });

  it('agendamentos da beta.2 (sem série) não mudam e não geram nada', async () => {
    const s = await app();
    await s.saveAppointment(input(undefined));
    const before = JSON.stringify(s.data.appointments);
    advanceDays(30);
    expect(await s.extendSeries()).toBe(0);
    expect(JSON.stringify(s.data.appointments)).toBe(before);
  });
});
