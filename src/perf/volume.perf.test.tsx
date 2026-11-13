/* eslint-disable @typescript-eslint/no-explicit-any -- gera o JSON bruto de backups grandes, sem tipo */
/**
 * Auditoria pré-RC (0.5.0) — medições com volumes crescentes. Só roda com OFICIO_PERF=1 (tempo de relógio varia com a
 * máquina; não deve quebrar o CI). Grava os números em OFICIO_PERF_OUT (JSON) para o relatório.
 *   OFICIO_PERF=1 TZ=America/Sao_Paulo npx vitest run src/perf
 */
import { writeFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../App';
import { conflictMap, dayLayout, monthGrid, weekKeys, byDay } from '../domain/agenda';
import { clientHistory } from '../domain/clientHistory';
import { monthTotals } from '../domain/finance';
import { receivables } from '../domain/payments';
import { pendingOccurrences } from '../domain/recurrence';
import { planReminders, readReminderPrefs } from '../domain/reminders';
import { monthReport, cashHistory } from '../domain/reports';
import { searchAll } from '../domain/search';
import { buildStatement } from '../domain/statement';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { createMemoryAdapter } from '../storage/memory';
import { MemoryRemote } from '../sync/memoryRemote';
import { SyncEngine } from '../sync/engine';
import { TrackedStorage } from '../sync/tracked';
import { signed } from '../test/backupFile';
import { todayKey } from '../lib/dates';

const RUN = process.env.OFICIO_PERF === '1';
const TODAY = todayKey();
const MONTH = TODAY.slice(0, 7);

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const addDays = (key: string, n: number) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Modelo real (gerado pelo serviço) replicado: clientes, atendimentos (parte recorrente), pagamentos e estornos. */
async function makeBackup(clients: number, appts: number, txs: number, seriesCount: number) {
  const s = await AppService.load(createMemoryAdapter());
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const c = (await s.saveClient({ name: 'Carla Souza', phone: '11999990000', email: 'c@x.com', address: 'Rua A', notes: 'obs' })).client;
  const a = (await s.saveAppointment({ title: 'Corte feminino', clientId: c.id, date: TODAY, time: '10:00', price: '100,00', notes: '', duration: '60' } as any)).appointment;
  const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000 });
  await s.refundPayment(p!.id, { amount: 1_000 });
  await s.saveTransaction({ type: 'despesa', amount: '20,00', description: 'Produtos', category: 'Produtos', date: TODAY });
  await s.saveAppointment({ title: 'Manicure', clientId: c.id, date: TODAY, time: '14:00', price: '50,00', notes: '', duration: '60', repeat: { freq: 'semanal', interval: '1', days: [new Date(`${TODAY}T12:00:00`).getDay()], end: 'nunca', until: '', count: '' } } as any);
  const raw = JSON.parse(s.exportBackup());
  const d = raw.data;
  const tClient = d.clients[0];
  const tAppt = d.appointments.find((x: any) => !x.series);
  const tSeries = d.appointments.find((x: any) => x.series);
  const tPay = d.transactions.find((t: any) => t.payment?.kind === 'pagamento');
  const tRef = d.transactions.find((t: any) => t.payment?.kind === 'estorno');
  const tExp = d.transactions.find((t: any) => t.type === 'despesa' && !t.payment);
  d.clients = Array.from({ length: clients }, (_, i) => ({ ...tClient, id: `c${i}`, name: `Cliente ${i} Silva`, phone: `1199${String(i).padStart(7, '0')}` }));
  const out: any[] = [];
  // Séries: uma ocorrência materializada por semana nas últimas/ próximas 12 semanas.
  for (let k = 0; k < seriesCount; k++) {
    const sid = `s${k}`;
    for (let w = -12; w <= 12; w++) {
      const date = addDays(TODAY, w * 7 + (k % 7));
      out.push({ ...tSeries, id: `${sid}-${date.replace(/-/g, '')}`, date, clientId: `c${k % clients}`, time: `${String(8 + (k % 10)).padStart(2, '0')}:00`,
        status: w < 0 ? 'concluido' : 'agendado', series: { ...tSeries.series, id: sid, start: addDays(TODAY, -84 + (k % 7)), through: addDays(TODAY, 84 + (k % 7)) } });
    }
  }
  const single = Math.max(0, appts - out.length);
  for (let i = 0; i < single; i++) {
    const date = addDays(TODAY, -Math.floor(i * 1500 / Math.max(single, 1)) + 30);
    out.push({ ...tAppt, id: `a${i}`, clientId: `c${i % clients}`, date, time: `${String(8 + (i % 11)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, status: date < TODAY ? 'concluido' : 'agendado', title: i % 3 ? 'Corte feminino' : 'Escova progressiva' });
  }
  d.appointments = out;
  const tx: any[] = [];
  for (let i = 0; i < txs; i++) {
    const ap = out[i % out.length];
    const date = ap.date < TODAY ? ap.date : TODAY;
    const kind = i % 10;
    if (kind < 7) tx.push({ ...tPay, id: `p${i}`, appointmentId: ap.id, date, amount: 5_000 + (i % 50) * 100, payment: { ...tPay.payment, key: `k${i}` } });
    else if (kind === 7 && tx.length) { const of = tx[tx.length - 1]; if (of.payment?.kind === 'pagamento') tx.push({ ...tRef, id: `r${i}`, date, amount: 500, payment: { ...tRef.payment, of: of.id } }); }
    else tx.push({ ...tExp, id: `e${i}`, date, amount: 2_000 + (i % 30) * 100, description: `Despesa ${i}` });
  }
  d.transactions = tx;
  return signed(raw);
}

function time<T>(fn: () => T, reps = 5): { ms: number; value: T } {
  let value!: T; const runs: number[] = [];
  for (let i = 0; i < reps; i++) { const t0 = performance.now(); value = fn(); runs.push(performance.now() - t0); }
  runs.sort((a, b) => a - b);
  return { ms: +runs[Math.floor(runs.length / 2)]!.toFixed(2), value };
}
async function timeAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now(); const value = await fn(); return { ms: +(performance.now() - t0).toFixed(1), value };
}
const heapMb = () => { (globalThis as any).gc?.(); return +(process.memoryUsage().heapUsed / 1048576).toFixed(1); };

const TIERS = [
  { name: '1 ano', clients: 300, appts: 3_000, txs: 3_000, series: 40 },
  { name: '5 anos', clients: 1_500, appts: 15_000, txs: 15_000, series: 150 },
  { name: '10 anos', clients: 3_000, appts: 30_000, txs: 30_000, series: 300 },
];

describe.skipIf(!RUN)('auditoria pré-RC: desempenho com volumes crescentes', () => {
  const results: Record<string, unknown>[] = [];
  afterAll(() => {
    const out = process.env.OFICIO_PERF_OUT;
    if (out) writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  });

  it.each(TIERS)('$name', async (tier) => {
    const r: Record<string, unknown> = { tier: tier.name };
    const heap0 = heapMb();
    const file = await makeBackup(tier.clients, tier.appts, tier.txs, tier.series);
    r.backupKb = Math.round(file.length / 1024);
    const db = `perf-${tier.name}-${Math.random()}`;
    const s0 = await AppService.load(await createIndexedDbAdapter(db));
    r.restoreMs = (await timeAsync(() => s0.importBackup(file))).ms;
    const loaded = await timeAsync(async () => AppService.load(await createIndexedDbAdapter(db)));
    r.loadMs = loaded.ms;
    const s = loaded.value;
    const d = s.data;
    r.counts = { clients: d.clients.length, appointments: d.appointments.length, transactions: d.transactions.length };
    r.heapMb = +(heapMb() - heap0).toFixed(1);

    r.searchMs = { cliente: time(() => searchAll(d, 'cliente 12', { hideValues: false })).ms, numero: time(() => searchAll(d, '1199000', { hideValues: false })).ms, servico: time(() => searchAll(d, 'escova', { hideValues: false })).ms };
    r.agendaMs = {
      conflictMap: time(() => conflictMap(d.appointments)).ms,
      dia: time(() => dayLayout(d.appointments, TODAY)).ms,
      semana: time(() => byDay(d.appointments, weekKeys(TODAY))).ms,
      mes: time(() => byDay(d.appointments, monthGrid(TODAY).flat())).ms,
      pendingOccurrences: time(() => pendingOccurrences(d.appointments, TODAY)).ms,
    };
    r.financeMs = {
      monthTotals: time(() => monthTotals(d.transactions, MONTH)).ms,
      receivables: time(() => receivables(d.appointments, d.transactions)).ms,
      monthReport: time(() => monthReport(d, MONTH)).ms,
      cashHistory12: time(() => cashHistory(d, MONTH, 12)).ms,
      statement: time(() => buildStatement(d, MONTH, new Date())).ms,
      clientHistory: time(() => clientHistory('c1', d.appointments, d.transactions, TODAY)).ms,
    };
    const prefs = readReminderPrefs({ enabled: true, offsets: [1440, 60], showDetails: false });
    const plan = time(() => planReminders(d.appointments, d.clients, prefs, new Date()));
    r.remindersMs = plan.ms;
    r.remindersPlanned = plan.value.length;
    r.exportMs = time(() => s.exportBackup(), 3).ms;

    // Sincronização inicial completa (envio de tudo) e segundo aparelho baixando tudo.
    const remote = new MemoryRemote();
    const tracked = new TrackedStorage(await createIndexedDbAdapter(db));
    const sa = await AppService.load(tracked);
    const ea = await SyncEngine.create(sa, tracked, remote, { autoSync: false, isOnline: () => true });
    await ea.setUser('u');
    r.syncUploadMs = (await timeAsync(() => ea.link('u', 'mesclar'))).ms;
    const tb = new TrackedStorage(createMemoryAdapter());
    const sb = await AppService.load(tb);
    const eb = await SyncEngine.create(sb, tb, remote, { autoSync: false, isOnline: () => true });
    await eb.setUser('u');
    r.syncDownloadMs = (await timeAsync(() => eb.link('u', 'usarNuvem'))).ms;
    r.syncIncrementalMs = (await timeAsync(async () => { await sa.saveClient({ name: 'Novo', phone: '', email: '', address: '', notes: '' }); await ea.sync(); })).ms;
    expect(sb.data.transactions.length).toBe(d.transactions.length);
    ea.dispose?.(); eb.dispose?.();

    // Renderização (jsdom: relativo, não é o tempo do aparelho).
    const renders: Record<string, number> = {};
    for (const route of ['#/painel', '#/agenda', '#/clientes', '#/financas', '#/financas/relatorios']) {
      window.location.hash = route;
      const t0 = performance.now();
      render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(db), persistent: true })} />);
      await screen.findByRole('navigation', { name: /navegação principal/i }, { timeout: 60_000 });
      renders[route] = +(performance.now() - t0).toFixed(0);
      cleanup();
    }
    r.renderMs = renders;
    results.push(r);
  }, 600_000);
});
