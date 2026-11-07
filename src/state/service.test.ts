import type { XpEvent } from '../domain/types';
import { totalXpForLevel } from '../gamification/levels';
import { createMemoryAdapter } from '../storage/memory';
import { AppService, ValidationError } from './service';

async function setup() {
  let now = new Date(2026, 10, 4, 10);
  const storage = createMemoryAdapter();
  const service = await AppService.load(storage, () => now);
  await service.completeOnboarding({ name: 'Ana', businessName: 'Studio', professionId: 'beleza' });
  return { service, storage, setNow: (d: Date) => (now = d) };
}

const clientInput = { name: 'Maria', phone: '(11) 91234-5678', email: '', address: '', notes: '' };
const apptInput = (clientId = '') => ({ title: 'Corte', clientId, date: '2026-11-04', time: '14:00', price: '60,00', notes: '' });

describe('AppService', () => {
  it('cadastra, edita e exclui cliente', async () => {
    const { service, storage } = await setup();
    const { client, feedback } = await service.saveClient(clientInput);
    expect(feedback.xpGained).toBeGreaterThanOrEqual(10);
    await service.saveClient({ ...clientInput, name: 'Maria Silva' }, client.id);
    expect((await storage.clients.get(client.id))?.name).toBe('Maria Silva');
    await service.deleteClient(client.id);
    expect(await storage.clients.list()).toHaveLength(0);
  });

  it('rejeita dados inválidos', async () => {
    const { service } = await setup();
    await expect(service.saveClient({ ...clientInput, name: '' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('editar não concede XP novamente', async () => {
    const { service } = await setup();
    const { client } = await service.saveClient(clientInput);
    const r = await service.saveClient({ ...clientInput, notes: 'x' }, client.id);
    expect(r.feedback.xpGained).toBe(0);
  });

  it('concluir com recebimento integral registra o pagamento; reabrir mantém; concluir de novo não repete XP nem receita', async () => {
    const { service } = await setup();
    const { appointment } = await service.saveAppointment(apptInput());
    const fb1 = await service.completeAppointment(appointment.id, { registerIncome: true });
    expect(fb1.events.some((e) => e.key === `appointment_completed:${appointment.id}`)).toBe(true);
    expect(service.data.transactions).toHaveLength(1);
    expect(service.data.transactions[0]).toMatchObject({ type: 'receita', amount: 6000, appointmentId: appointment.id });

    await service.setAppointmentStatus(appointment.id, 'agendado');
    expect(service.data.transactions).toHaveLength(1); // 0.5: reabrir nunca apaga dinheiro recebido

    const fb2 = await service.completeAppointment(appointment.id, { registerIncome: true });
    expect(fb2.events.some((e) => e.key.startsWith('appointment_completed:'))).toBe(false);
    expect(service.data.transactions).toHaveLength(1); // já pago: integral não lança de novo
  });

  it('0.5: excluir agendamento mantém o pagamento recebido em Finanças', async () => {
    const { service } = await setup();
    const { appointment } = await service.saveAppointment(apptInput());
    await service.completeAppointment(appointment.id, { registerIncome: true });
    await service.deleteAppointment(appointment.id);
    expect(service.data.transactions).toHaveLength(1);
    expect(service.data.appointments).toHaveLength(0);
  });

  it('excluir cliente mantém histórico sem vínculo', async () => {
    const { service } = await setup();
    const { client } = await service.saveClient(clientInput);
    await service.saveAppointment(apptInput(client.id));
    await service.deleteClient(client.id);
    expect(service.data.appointments[0]?.clientId).toBeNull();
  });

  it('CRUD de lançamentos', async () => {
    const { service } = await setup();
    const { transaction } = await service.saveTransaction({ type: 'despesa', amount: '45,90', description: 'Produtos', category: 'Produtos', date: '2026-11-04' });
    expect(transaction.amount).toBe(4590);
    await service.saveTransaction({ type: 'despesa', amount: '50', description: 'Produtos', category: 'Produtos', date: '2026-11-04' }, transaction.id);
    expect(service.data.transactions[0]?.amount).toBe(5000);
    await service.deleteTransaction(transaction.id);
    expect(service.data.transactions).toHaveLength(0);
  });

  it('dados de demonstração: identificados, sem XP e removíveis', async () => {
    const { service } = await setup();
    const xpBefore = service.data.xpEvents.length;
    await service.loadDemoData();
    expect(service.hasDemoData()).toBe(true);
    expect(service.data.clients.every((c) => c.isDemo)).toBe(true);
    expect(service.data.xpEvents.length).toBe(xpBefore);
    await service.clearDemoData();
    expect(service.hasDemoData()).toBe(false);
    expect(service.data.clients).toHaveLength(0);
  });

  it('backup completo: exporta, apaga e restaura', async () => {
    const { service } = await setup();
    await service.saveClient(clientInput);
    const json = service.exportBackup();
    await service.resetAll();
    expect(service.data.profile).toBeNull();
    await service.importBackup(json);
    expect(service.data.profile?.name).toBe('Ana');
    expect(service.data.clients).toHaveLength(1);
  });
});

describe('AppService: avisos de selo e de categoria (0.4)', () => {
  it('o 20º cliente concede Carteira I no feedback, sem XP extra; o 21º não repete', async () => {
    const { service } = await setup();
    let last: Awaited<ReturnType<typeof service.saveClient>>['feedback'] | undefined;
    for (let i = 1; i <= 20; i++) last = (await service.saveClient({ ...clientInput, name: `Cliente ${i}` })).feedback;
    expect(last!.seals.map((s) => [s.id, s.stage])).toEqual([['carteira', 1]]);
    expect(last!.events.some((e) => e.key.includes('carteira'))).toBe(false);
    const next = (await service.saveClient({ ...clientInput, name: 'Cliente 21' })).feedback;
    expect(next.seals).toEqual([]);
  });

  it('informa a nova categoria quando o nível cruza a faixa (Inicial → Bronze)', async () => {
    const storage = createMemoryAdapter();
    const first = await AppService.load(storage, () => new Date(2026, 10, 4, 10));
    await first.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    const need = totalXpForLevel(3) - 5;
    await storage.xpEvents.putMany([{ id: 'seed', key: 'seed', category: 'meta', xp: need, label: 'Histórico', createdAt: '2026-10-01T10:00:00.000Z' } as XpEvent]);
    const service = await AppService.load(storage, () => new Date(2026, 10, 4, 10));
    const { feedback } = await service.saveClient(clientInput);
    expect(feedback.levelUp).toBe(3);
    expect(feedback.tierUp?.id).toBe('bronze');
    const again = (await service.saveClient({ ...clientInput, name: 'Outra' })).feedback;
    expect(again.tierUp).toBeNull();
  });

  it('avisa o novo grau do Diamante (nível 21) sem mudar o XP recebido', async () => {
    const storage = createMemoryAdapter();
    const first = await AppService.load(storage, () => new Date(2026, 10, 4, 10));
    await first.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await storage.xpEvents.putMany([{ id: 'seed', key: 'seed', category: 'meta', xp: totalXpForLevel(21) - 5, label: 'Histórico', createdAt: '2026-10-01T10:00:00.000Z' } as XpEvent]);
    const service = await AppService.load(storage, () => new Date(2026, 10, 4, 10));
    const { feedback } = await service.saveClient(clientInput);
    expect(feedback.levelUp).toBe(21);
    expect(feedback.tierUp?.name).toBe('Diamante II');
    // XP só das regras de sempre (cliente + missão inicial); o grau não concede nada.
    expect(feedback.events.map((e) => [e.category, e.xp])).toEqual([['cliente', 10], ['missao', 20]]);
    expect(feedback.xpGained).toBe(30);
  });
});
