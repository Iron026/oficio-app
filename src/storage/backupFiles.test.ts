/* eslint-disable @typescript-eslint/no-explicit-any -- os testes editam o JSON bruto dos arquivos, sem tipo */
/**
 * 0.5.0-beta.5 — arquivos de backup: soma SHA-256, arquivos antigos sem soma, corrompidos, truncados, repetidos,
 * tipos errados, versões mais novas, finanças complexas e recorrência. Arquivo inválido nunca altera nada.
 */
import { signed, unsigned } from '../test/backupFile';
import { backupChecksum, BackupError, inspectBackup } from './backup';
import { createMemoryAdapter } from './memory';
import { AppService } from '../state/service';
import { paymentSummary } from '../domain/payments';
import { totals } from '../domain/finance';

const now = () => new Date(2026, 10, 12, 9, 0);

/** Dados com pagamentos parcial e antecipado, estornos parcial e total, série com exceção e Painel personalizado. */
async function rich() {
  const s = await AppService.load(createMemoryAdapter(), now);
  await s.completeOnboarding({ name: 'Ana Conceição', businessName: 'Studio Ana', professionId: 'beleza' });
  const c = (await s.saveClient({ name: 'Maria José', phone: '', email: '', address: '', notes: '' })).client;
  const a = (await s.saveAppointment({ title: 'Coloração', clientId: c.id, date: '2026-11-10', time: '10:00', price: '300,00', notes: '' })).appointment;
  await s.completeAppointment(a.id, { payment: { mode: 'parcial', amount: 10_000, date: '2026-11-10' } });
  const b = (await s.saveAppointment({ title: 'Escova', clientId: c.id, date: '2026-11-20', time: '14:00', price: '80,00', notes: '' })).appointment;
  const { transaction: adv } = await s.registerPayment(b.id, { amount: 8_000, method: 'pix', date: '2026-11-11' });
  await s.refundPayment(adv!.id, { amount: 2_000, date: '2026-11-11' });
  const { transaction: p2 } = await s.registerPayment(a.id, { amount: 5_000, date: '2026-11-11' });
  await s.refundPayment(p2!.id, { amount: 'total', date: '2026-11-11' });
  const serie = (await s.saveAppointment({ title: 'Manicure', clientId: '', date: '2026-11-16', time: '09:00', price: '50,00', notes: '', repeat: { freq: 'semanal', interval: '1', days: [0], end: 'vezes', until: '', count: '4' } })).appointment;
  const second = s.data.appointments.filter((x) => x.series && x.id !== serie.id).sort((x, y) => (x.date < y.date ? -1 : 1))[0]!;
  await s.saveAppointment({ title: 'Manicure', clientId: '', date: second.date, time: '11:00', price: '60,00', notes: '' }, second.id, 'esta');
  await s.updateDashboard((l, at) => ({ ...l, hidden: ['dica'], hiddenAt: at }));
  return s;
}

const fresh = async () => {
  const s = await AppService.load(createMemoryAdapter(), now);
  await s.completeOnboarding({ name: 'Outra', businessName: '', professionId: 'limpeza' });
  await s.saveClient({ name: 'Cliente atual', phone: '', email: '', address: '', notes: '' });
  return s;
};

describe('soma de verificação', () => {
  it('arquivo novo: soma SHA-256 do conteúdo canônico, conferida', async () => {
    const s = await rich();
    const text = s.exportBackup();
    const raw = JSON.parse(text);
    expect(raw.checksum.algorithm).toBe('SHA-256');
    expect(raw.checksum.value).toMatch(/^[0-9a-f]{64}$/);
    expect(raw.checksum.value).toBe(backupChecksum(raw));
    expect(inspectBackup(text).integrity).toBe('verificada');
    // Indentação e ordem das chaves não mudam a soma (serialização canônica).
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(raw).reverse()));
    expect(inspectBackup(reordered).integrity).toBe('verificada');
  });

  it.each([
    ['valor alterado', (r: any) => { r.data.transactions[0].amount += 1; }],
    ['cliente renomeado', (r: any) => { r.data.clients[0].name = 'Outra pessoa'; }],
    ['data de exportação alterada', (r: any) => { r.exportedAt = '2020-01-01T00:00:00.000Z'; }],
    ['registro removido', (r: any) => { r.data.transactions.pop(); }],
    ['soma trocada', (r: any) => { r.checksum.value = '0'.repeat(64); }],
    ['soma malformada', (r: any) => { r.checksum.value = 'abc'; }],
    ['soma nula', (r: any) => { r.checksum = null; }],
    ['algoritmo desconhecido', (r: any) => { r.checksum.algorithm = 'MD5'; }],
  ])('soma inválida (%s): recusado como "integridade", sem alterar nada', async (_n, edit) => {
    const s = await rich();
    const raw = JSON.parse(s.exportBackup());
    edit(raw);
    const text = JSON.stringify(raw);
    const target = await fresh();
    const before = JSON.stringify(target.data);
    expect(() => inspectBackup(text)).toThrow(BackupError);
    try { inspectBackup(text); } catch (e) { expect((e as BackupError).kind).toBe('integridade'); }
    await expect(target.importBackup(text)).rejects.toThrow(/verificação de integridade falhou/);
    expect(JSON.stringify(target.data)).toBe(before);
  });
});

describe('arquivos antigos (sem soma) — beta.2, beta.3 e beta.4', () => {
  it.each(['0.5.0-beta.2', '0.5.0-beta.3', '0.5.0-beta.4'])('%s: aceito depois da validação estrutural, marcado "sem soma", nada se perde', async (v) => {
    const s = await rich();
    const raw = JSON.parse(s.exportBackup());
    raw.appVersion = v;
    const text = unsigned(raw);
    const p = (await fresh()).previewBackup(text);
    expect(p.integrity).toBe('sem-soma');
    expect(p.compatibility).toBe(v === __APP_VERSION__ ? 'mesma' : 'anterior');
    const target = await fresh();
    await target.importBackup(text);
    // Tudo o que é compatível volta igual: registros, pagamentos, estornos, série e exceção, Painel.
    expect(target.data.transactions).toEqual(s.data.transactions);
    expect(target.data.appointments).toEqual(s.data.appointments);
    expect(target.data.clients).toEqual(s.data.clients);
    expect(target.data.settings.dashboard).toEqual(s.data.settings.dashboard);
    expect(totals(target.data.transactions)).toEqual(totals(s.data.transactions));
    for (const a of s.data.appointments) {
      expect(paymentSummary(target.data.appointments.find((x) => x.id === a.id)!, target.data.transactions)).toEqual(paymentSummary(a, s.data.transactions));
    }
  });

  it('arquivo da 0.2/0.3 (sem versão do app, sem campos da 0.4): aceito', async () => {
    const s = await rich();
    const raw = JSON.parse(s.exportBackup());
    delete raw.appVersion;
    delete raw.data.sealAwards;
    delete raw.data.profileImages;
    delete raw.data.serviceTypes;
    const p = (await fresh()).previewBackup(unsigned(raw));
    expect(p.compatibility).toBe('desconhecida');
    expect(p.integrity).toBe('sem-soma');
  });
});

describe('arquivos recusados nunca alteram os dados', () => {
  const cases: [string, (text: string) => string, RegExp, BackupError['kind']][] = [
    ['truncado', (t) => t.slice(0, Math.floor(t.length * 0.6)), /JSON válido.*incompleto/, 'json'],
    ['JSON inválido', () => '{ "format": "oficio-backup", ', /JSON válido/, 'json'],
    ['vazio', () => '', /JSON válido/, 'json'],
    ['outro formato', () => '{"format":"planilha"}', /não é um backup/, 'formato'],
    ['formato futuro', (t) => { const r = JSON.parse(t); r.version = 2; return signed(r); }, /versão mais nova/, 'versao'],
    ['clientes repetidos', (t) => { const r = JSON.parse(t); r.data.clients.push({ ...r.data.clients[0] }); return signed(r); }, /repetidos em "clients"/, 'estrutura'],
    ['lançamentos repetidos', (t) => { const r = JSON.parse(t); r.data.transactions.push({ ...r.data.transactions[0], amount: 1 }); return signed(r); }, /repetidos em "transactions"/, 'estrutura'],
    ['valor em texto', (t) => { const r = JSON.parse(t); r.data.transactions[0].amount = '100,00'; return signed(r); }, /transactions.*valor/, 'estrutura'],
    ['data inválida', (t) => { const r = JSON.parse(t); r.data.appointments[0].date = '10/11/2026'; return signed(r); }, /appointments.*data/, 'estrutura'],
    ['horário numérico', (t) => { const r = JSON.parse(t); r.data.appointments[0].time = 1000; return signed(r); }, /appointments.*horário/, 'estrutura'],
    ['recorrência em texto', (t) => { const r = JSON.parse(t); r.data.appointments.find((a: any) => a.series).series = 'semanal'; return signed(r); }, /appointments.*recorrência/, 'estrutura'],
    ['pagamento em texto', (t) => { const r = JSON.parse(t); r.data.transactions.find((x: any) => x.payment).payment = 'pix'; return signed(r); }, /transactions.*pagamento/, 'estrutura'],
    ['lista ausente', (t) => { const r = JSON.parse(t); delete r.data.transactions; return signed(r); }, /transactions/, 'estrutura'],
    ['id vazio', (t) => { const r = JSON.parse(t); r.data.clients[0].id = ''; return signed(r); }, /clients/, 'estrutura'],
    ['preferências em lista', (t) => { const r = JSON.parse(t); r.data.settings = []; return signed(r); }, /Preferências inválidas/, 'estrutura'],
    ['conquista sem data', (t) => { const r = JSON.parse(t); r.data.achievements.push({ id: 'x', unlockedAt: 5 }); return signed(r); }, /achievements/, 'estrutura'],
  ];

  it.each(cases)('%s', async (_n, make, msg, kind) => {
    const text = make((await rich()).exportBackup());
    const target = await fresh();
    const before = JSON.stringify(target.data);
    let err: unknown;
    try { target.previewBackup(text); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(BackupError);
    expect((err as BackupError).kind).toBe(kind);
    expect((err as Error).message).toMatch(msg);
    await expect(target.importBackup(text)).rejects.toThrow(msg);
    expect(JSON.stringify(target.data)).toBe(before);
  });
});

describe('versões mais novas e campos desconhecidos', () => {
  it('arquivo de versão mais nova (formato 1, soma válida): aceito, avisado, campos novos preservados', async () => {
    const s = await rich();
    const raw = JSON.parse(s.exportBackup());
    raw.appVersion = '0.7.0';
    raw.futuro = { algo: true };
    raw.data.clients[0].fidelidade = { pontos: 10 };
    raw.data.transactions[0].payment.novoCampo = 'x';
    raw.data.settings.temaFuturo = 'neon';
    raw.data.settings.dashboard.cartaoFuturo = 1;
    raw.data.settings.dashboard.order.push('grafico-futuro');
    const text = signed(raw);
    const target = await fresh();
    const p = target.previewBackup(text);
    expect(p.compatibility).toBe('mais-nova');
    expect(p.newerApp).toBe(true);
    await target.importBackup(text);
    const c = target.data.clients.find((x) => x.id === raw.data.clients[0].id) as unknown as Record<string, unknown>;
    expect(c.fidelidade).toEqual({ pontos: 10 });
    expect((target.data.transactions[0]!.payment as Record<string, unknown>).novoCampo).toBe('x');
    expect((target.data.settings as unknown as Record<string, unknown>).temaFuturo).toBe('neon');
    expect((target.data.settings.dashboard as Record<string, unknown>).cartaoFuturo).toBe(1);
    expect((target.data.settings.dashboard as { order: string[] }).order).toContain('grafico-futuro');
  });
});

describe('pré-visualização', () => {
  it('conta pagamentos, estornos, XP e o que sai; avisa o que é mais novo no aparelho', async () => {
    const s = await rich();
    const text = s.exportBackup();
    const target = await fresh();
    const p = target.previewBackup(text);
    expect(p.file).toMatchObject({ payments: 3, refunds: 2, clients: 1 });
    expect(p.file.xp).toBeGreaterThan(0);
    expect(p.current.clients).toBe(1);
    expect(p.loss.removed.clients).toBe(1); // "Cliente atual" não está no arquivo
    // No próprio aparelho: lançar depois de exportar → aparece como perdido.
    const later = await AppService.load(createMemoryAdapter(), () => new Date(2026, 10, 13, 9));
    await later.importBackup(text);
    await later.saveTransaction({ type: 'despesa', amount: '10,00', description: '', category: 'Produtos', date: '2026-11-13' });
    const p2 = later.previewBackup(text);
    expect(p2.loss.newerThanFile).toBe(1);
    expect(p2.loss.removed.transactions).toBe(1);
  });

  it('XP repetido no arquivo (mesma chave) entra uma vez só', async () => {
    const s = await rich();
    const raw = JSON.parse(s.exportBackup());
    const e = raw.data.xpEvents[0];
    raw.data.xpEvents.push({ ...e, id: 'copia', createdAt: '2099-01-01T00:00:00.000Z' });
    const target = await fresh();
    await target.importBackup(signed(raw));
    expect(target.data.xpEvents.filter((x) => x.key === e.key)).toHaveLength(1);
    expect(target.data.xpEvents.find((x) => x.key === e.key)!.id).toBe(e.id);
  });

  it('restaurar o mesmo arquivo duas vezes não duplica nada', async () => {
    const text = (await rich()).exportBackup();
    const target = await fresh();
    await target.importBackup(text);
    const once = JSON.stringify(target.data);
    await target.importBackup(text);
    expect(JSON.stringify(target.data)).toBe(once);
  });
});
