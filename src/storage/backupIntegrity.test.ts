import { createMemoryAdapter } from './memory';
import { parseBackup, serializeBackup } from './backup';
import { AppService } from '../state/service';

/** Restauração: integridade dos campos que entram nos totais e versão do app no arquivo. */
async function sample() {
  const s = await AppService.load(createMemoryAdapter(), () => new Date(2026, 10, 4, 10));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const { client } = await s.saveClient({ name: 'Maria', phone: '', email: '', address: '', notes: '' });
  const { appointment } = await s.saveAppointment({ title: 'Corte', clientId: client.id, date: '2026-11-03', time: '10:00', price: '80,00', notes: '' });
  await s.completeAppointment(appointment.id, { registerIncome: true });
  await s.saveTransaction({ type: 'despesa', amount: '25,50', description: '', category: 'Produtos', date: '2026-11-02' });
  return s;
}
type Raw = { transactions: Record<string, unknown>[]; appointments: Record<string, unknown>[]; xpEvents: Record<string, unknown>[]; clients: Record<string, unknown>[] };
/** Arquivo antigo (sem soma de verificação, anterior à beta.5) alterado: só a validação estrutural o protege. */
const tamper = (json: string, fn: (d: Raw) => void) => {
  const raw = JSON.parse(json);
  delete raw.checksum;
  fn(raw.data);
  return JSON.stringify(raw);
};

describe('Backup: integridade antes de restaurar', () => {
  it('o arquivo novo leva a versão do app; arquivos antigos (sem versão) continuam válidos', async () => {
    const s = await sample();
    const json = s.exportBackup();
    expect(JSON.parse(json).appVersion).toBe(__APP_VERSION__);
    expect(s.previewBackup(json).appVersion).toBe(__APP_VERSION__);
    const old = JSON.parse(json);
    delete old.appVersion;
    delete old.checksum;
    delete old.data.serviceTypes;
    delete old.data.sealAwards;
    delete old.data.profileImages;
    expect(() => parseBackup(JSON.stringify(old))).not.toThrow(); // formato da 0.2/0.3
    expect(s.previewBackup(JSON.stringify(old)).appVersion).toBeNull();
    expect(serializeBackup(s.data, new Date(), '9.9.9')).toContain('"appVersion": "9.9.9"');
  });

  it.each([
    ['valor de lançamento em texto', (d: Raw) => { d.transactions[0]!.amount = '80,00'; }, /transactions.*item 1: valor/],
    ['valor negativo', (d: Raw) => { d.transactions[1]!.amount = -100; }, /transactions.*item 2: valor/],
    ['valor com fração de centavo', (d: Raw) => { d.transactions[0]!.amount = 80.5; }, /transactions.*valor/],
    ['tipo desconhecido', (d: Raw) => { d.transactions[0]!.type = 'transferencia'; }, /transactions.*tipo/],
    ['data fora do formato', (d: Raw) => { d.transactions[0]!.date = '03/11/2026'; }, /transactions.*data/],
    ['preço do serviço em texto', (d: Raw) => { d.appointments[0]!.price = 'oitenta'; }, /appointments.*valor/],
    ['situação desconhecida', (d: Raw) => { d.appointments[0]!.status = 'feito'; }, /appointments.*situação/],
    ['XP não numérico', (d: Raw) => { d.xpEvents[0]!.xp = 'muito'; }, /xpEvents/],
  ])('recusa %s com mensagem que aponta o item', async (_n, fn, msg) => {
    const s = await sample();
    expect(() => parseBackup(tamper(s.exportBackup(), fn))).toThrow(msg);
  });

  it('arquivo recusado não altera nada (nem a cópia atual, nem os totais)', async () => {
    const s = await sample();
    const before = JSON.stringify(s.data);
    const broken = tamper(s.exportBackup(), (d) => { d.transactions[0]!.amount = 'x'; d.clients.push({ id: 'novo', name: 'Invasor' }); });
    await expect(s.importBackup(broken)).rejects.toThrow(/valor/);
    expect(JSON.stringify(s.data)).toBe(before);
  });
});
