/* eslint-disable @typescript-eslint/no-explicit-any -- os testes editam o JSON bruto dos arquivos, sem tipo */
/**
 * Auditoria pré-RC (0.5.0) — política de restauração: preservar os dados compatíveis e recusar o arquivo inteiro quando
 * houver risco de perda silenciosa ou de dados que derrubariam as telas. Cada caso foi reproduzido antes da correção
 * (comportamento anterior anotado em cada teste).
 */
import { signed } from '../test/backupFile';
import { BackupError, inspectBackup } from './backup';
import { createMemoryAdapter } from './memory';
import { AppService } from '../state/service';
import { MAX_SERVICE_TYPES } from '../domain/serviceTypes';
import { refundIssues } from '../domain/refundReview';

const now = () => new Date(2026, 10, 12, 9, 0);
let text = '';
beforeAll(async () => {
  const s = await AppService.load(createMemoryAdapter(), now);
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const c = (await s.saveClient({ name: 'Carla', phone: '11999990000', email: '', address: '', notes: '' })).client;
  const a = (await s.saveAppointment({ title: 'Corte', clientId: c.id, date: '2026-11-10', time: '10:00', price: '100,00', notes: '' })).appointment;
  const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000, method: 'pix', date: '2026-11-10' });
  await s.refundPayment(p!.id, { amount: 2_000, date: '2026-11-11' });
  await s.saveAppointment({ title: 'Mani', clientId: c.id, date: '2026-11-16', time: '09:00', price: '50,00', notes: '', repeat: { freq: 'semanal', interval: '1', days: [0], end: 'nunca', until: '', count: '' } });
  await s.saveServiceType({ name: 'Escova', price: '50,00' });
  await s.saveTransaction({ type: 'despesa', amount: '30,00', description: 'Tinta', category: 'Produtos', date: '2026-11-05' });
  text = s.exportBackup();
});
const edit = (fn: (r: any) => void) => { const r = JSON.parse(text); fn(r); return signed(r); };
const tx = (r: any, pred: (t: any) => boolean) => r.data.transactions.find(pred);
const refund = (r: any) => tx(r, (t) => t.payment?.kind === 'estorno');
const payment = (r: any) => tx(r, (t) => t.payment?.kind === 'pagamento');
const seal = { id: 'constancia', stage: 2, reachedAt: ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' };
const photo = { id: 'atual', mime: 'image/webp', data: 'AAAA', bytes: 3, width: 200, height: 200, hash: 'h', createdAt: 'x', updatedAt: 'x' };

async function expectRejected(file: string, msg: RegExp) {
  let err: unknown;
  try { inspectBackup(file); } catch (e) { err = e; }
  expect(err).toBeInstanceOf(BackupError);
  expect((err as BackupError).kind).toBe('estrutura');
  expect((err as Error).message).toMatch(msg);
  const target = await AppService.load(createMemoryAdapter(), now);
  await target.completeOnboarding({ name: 'Atual', businessName: '', professionId: 'limpeza' });
  const before = JSON.stringify(target.data);
  await expect(target.importBackup(file)).rejects.toThrow(msg);
  expect(JSON.stringify(target.data)).toBe(before);
}

describe('selos (antes: inválidos descartados em silêncio; repetidos podiam gravar o estágio menor)', () => {
  it.each([
    ['estágio fora de 1–4', (r: any) => { r.data.sealAwards = [{ ...seal, stage: 9 }]; }],
    ['datas em número', (r: any) => { r.data.sealAwards = [{ ...seal, reachedAt: [1, 2] }]; }],
    ['sem createdAt', (r: any) => { const { createdAt: _c, ...s } = seal; void _c; r.data.sealAwards = [s]; }],
    ['lista em texto', (r: any) => { r.data.sealAwards = 'constancia'; }],
    ['selo repetido', (r: any) => { r.data.sealAwards = [{ ...seal, stage: 2 }, { ...seal, stage: 1, reachedAt: [seal.reachedAt[0]] }]; }],
  ])('%s: recusado', async (_n, fn) => {
    await expectRejected(edit(fn), /sealAwards|selos/);
  });

  it('selo de versão mais nova (id desconhecido, estrutura válida): preservado', () => {
    const d = inspectBackup(edit((r) => { r.data.sealAwards = [seal, { ...seal, id: 'selo-futuro' }]; })).data;
    expect(d.sealAwards.map((s) => s.id)).toEqual(['constancia', 'selo-futuro']);
  });
});

describe('foto de perfil (antes: inválida ou excedente descartada em silêncio)', () => {
  it.each([
    ['formato não aceito', (r: any) => { r.data.profileImages = [{ ...photo, mime: 'image/png' }]; }],
    ['base64 corrompido', (r: any) => { r.data.profileImages = [{ ...photo, data: '***' }]; }],
    ['duas fotos', (r: any) => { r.data.profileImages = [photo, { ...photo, hash: 'h2' }]; }],
  ])('%s: recusado', async (_n, fn) => {
    await expectRejected(edit(fn), /profileImages|foto/);
  });
  it('uma foto válida: preservada', () => {
    expect(inspectBackup(edit((r) => { r.data.profileImages = [photo]; })).data.profileImages).toEqual([photo]);
  });
});

describe('tipos de serviço (antes: inválidos, repetidos e excedentes descartados em silêncio)', () => {
  it.each([
    ['nome vazio', (r: any) => { r.data.serviceTypes.push({ ...r.data.serviceTypes[0], id: 'x', name: '' }); }],
    ['valor em texto', (r: any) => { r.data.serviceTypes.push({ ...r.data.serviceTypes[0], id: 'x', name: 'X', price: '50,00' }); }],
    ['id repetido', (r: any) => { r.data.serviceTypes.push({ ...r.data.serviceTypes[0], name: 'Outro' }); }],
    ['além do limite', (r: any) => { for (let i = 0; i < MAX_SERVICE_TYPES; i++) r.data.serviceTypes.push({ ...r.data.serviceTypes[0], id: `t${i}`, name: `T${i}`, order: i }); }],
  ])('%s: recusado', async (_n, fn) => {
    await expectRejected(edit(fn), /serviceTypes|tipos de serviço/);
  });
  it('campo de versão mais nova num tipo válido: tipo preservado com o campo', () => {
    const d = inspectBackup(edit((r) => { r.data.serviceTypes[0].cor = 'azul'; })).data;
    expect((d.serviceTypes[0] as unknown as Record<string, unknown>).cor).toBe('azul');
  });
});

describe('campos de texto que sempre existiram (antes: aceitos e derrubavam as telas)', () => {
  it.each([
    ['lançamento sem categoria (Finanças/Relatórios com erro)', (r: any) => { delete tx(r, (t) => t.description === 'Tinta').category; }, /transactions.*categoria/],
    ['lançamento sem descrição (Finanças quebrava)', (r: any) => { delete tx(r, (t) => t.description === 'Tinta').description; }, /transactions.*descrição/],
    ['cliente sem telefone (Painel, Agenda e Clientes quebravam)', (r: any) => { delete r.data.clients[0].phone; }, /clients.*telefone/],
    ['cliente com telefone numérico', (r: any) => { r.data.clients[0].phone = 11999; }, /clients.*telefone/],
    ['cliente sem observações', (r: any) => { delete r.data.clients[0].notes; }, /clients.*observações/],
    ['atendimento sem observações', (r: any) => { delete r.data.appointments[0].notes; }, /appointments.*observações/],
    ['conclusão em número', (r: any) => { r.data.appointments[0].completedAt = 5; }, /appointments.*conclusão/],
    ['metas do perfil em texto', (r: any) => { r.data.profile.weeklyGoalServices = 'cinco'; }, /Perfil/],
    // Revisão independente: metas sempre gravadas desde a v0.1; sem elas a meta vira NaN ("undefined por semana").
    ['meta semanal ausente', (r: any) => { delete r.data.profile.weeklyGoalServices; }, /Perfil/],
    ['meta mensal ausente', (r: any) => { delete r.data.profile.monthlyGoalRevenue; }, /Perfil/],
  ])('%s: recusado', async (_n, fn, msg) => {
    await expectRejected(edit(fn), msg);
  });
});

describe('estornos e marcadores financeiros (antes: aceitos; estorno sem referência reduzia o saldo sem ir para revisão)', () => {
  it.each([
    ['estorno sem "of"', (r: any) => { delete refund(r).payment.of; }, /estorno/],
    ['estorno com "of" numérico', (r: any) => { refund(r).payment.of = 5; }, /estorno/],
    ['estorno lançado como receita', (r: any) => { refund(r).type = 'receita'; }, /estorno/],
    ['pagamento lançado como despesa', (r: any) => { payment(r).type = 'despesa'; }, /pagamento/],
    ['tipo de marcador numérico', (r: any) => { payment(r).payment.kind = 1; }, /pagamento/],
    ['tipo de marcador desconhecido', (r: any) => { payment(r).payment.kind = 'ajuste'; }, /pagamento/],
    ['forma de pagamento numérica', (r: any) => { payment(r).payment.method = 7; }, /pagamento/],
    ['revisão em texto', (r: any) => { refund(r).payment.review = 'ok'; }, /pagamento/],
    ['trilha de revisões em texto', (r: any) => { payment(r).reviews = 'x'; }, /revisões/],
  ])('%s: recusado', async (_n, fn, msg) => {
    await expectRejected(edit(fn), msg);
  });

  it('estorno de um pagamento que não existe mais: aceito e marcado para revisão (nada some em silêncio)', async () => {
    const file = edit((r) => { const p = payment(r); r.data.transactions = r.data.transactions.filter((t: any) => t !== p); });
    const target = await AppService.load(createMemoryAdapter(), now);
    await target.importBackup(file);
    expect(refundIssues(target.data.transactions).map((i) => i.kind)).toEqual(['sem-pagamento']);
  });
});

describe('recorrência (antes: regra inválida aceita e a série deixava de existir em silêncio)', () => {
  const series = (r: any) => r.data.appointments.filter((a: any) => a.series);
  it.each([
    ['sem id', (r: any) => { for (const a of series(r)) delete a.series.id; }],
    ['frequência desconhecida', (r: any) => { for (const a of series(r)) a.series.freq = 'anual'; }],
    ['sem "through"', (r: any) => { for (const a of series(r)) delete a.series.through; }],
    ['dias em texto', (r: any) => { for (const a of series(r)) a.series.days = 'seg'; }],
    ['intervalo zero', (r: any) => { for (const a of series(r)) a.series.interval = 0; }],
  ])('%s: recusado', async (_n, fn) => {
    await expectRejected(edit(fn), /appointments.*recorrência/);
  });

  it('séries válidas com exceção e campos extras continuam aceitas', () => {
    const d = inspectBackup(edit((r) => { const a = series(r)[1]; a.series.detached = true; a.series.extraFuturo = 1; })).data;
    expect(d.appointments.filter((a) => a.series)).toHaveLength(JSON.parse(text).data.appointments.filter((a: any) => a.series).length);
  });
});

describe('compatibilidade', () => {
  it('backup completo exportado pelo app e dados de demonstração continuam aceitos', async () => {
    expect(inspectBackup(text).integrity).toBe('verificada');
    const s = await AppService.load(createMemoryAdapter(), now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'manutencao' });
    await s.loadDemoData();
    expect(() => inspectBackup(s.exportBackup())).not.toThrow();
  });
});
