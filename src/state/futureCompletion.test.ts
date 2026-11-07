import { futureServiceDateFor, totals } from '../domain/finance';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { AppService } from './service';

// 04/11/2026 10:00 local; o serviço é marcado para 10/11 (futuro).
const NOW = new Date(2026, 10, 4, 10, 0);
const appt = { title: 'Corte', clientId: '', date: '2026-11-10', time: '', price: '80,00', notes: '' };

async function setup(dbName = `fut-${Math.random()}`) {
  const service = await AppService.load(await createIndexedDbAdapter(dbName), () => NOW);
  await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return { service, dbName };
}

describe('conclusão antecipada (serviço com data futura)', () => {
  it('conclui normalmente, gera UMA receita vinculada (data de hoje) e concede XP', async () => {
    const { service } = await setup();
    const { appointment } = await service.saveAppointment(appt);
    const fb = await service.completeAppointment(appointment.id, { registerIncome: true });
    expect(fb.events.some((e) => e.key === `appointment_completed:${appointment.id}`)).toBe(true);
    const income = service.data.transactions.filter((t) => t.appointmentId === appointment.id);
    expect(income).toHaveLength(1);
    expect(income[0]).toMatchObject({ type: 'receita', amount: 8000, date: '2026-11-04' });
    expect(futureServiceDateFor(income[0]!, service.data.appointments, NOW)).toBe('2026-11-10');
  });

  it('reabrir e concluir de novo não duplica receita nem XP', async () => {
    const { service } = await setup();
    const { appointment } = await service.saveAppointment(appt);
    await service.completeAppointment(appointment.id, { registerIncome: true });
    const xpAfterFirst = service.data.xpEvents.filter((e) => e.key.startsWith('appointment_completed:')).length;
    await service.setAppointmentStatus(appointment.id, 'agendado');
    await service.completeAppointment(appointment.id, { registerIncome: true });
    await service.completeAppointment(appointment.id, { registerIncome: true }); // clique duplo
    expect(service.data.transactions.filter((t) => t.appointmentId === appointment.id)).toHaveLength(1);
    expect(service.data.xpEvents.filter((e) => e.key.startsWith('appointment_completed:')).length).toBe(xpAfterFirst);
  });

  it('saldo continua correto com receitas antecipadas e despesas', async () => {
    const { service } = await setup();
    const { appointment } = await service.saveAppointment(appt);
    await service.completeAppointment(appointment.id, { registerIncome: true });
    await service.saveTransaction({ type: 'despesa', amount: '30,00', description: 'Produtos', category: 'Produtos', date: '2026-11-04' });
    expect(totals(service.data.transactions)).toEqual({ income: 8000, expense: 3000, balance: 5000 });
  });

  it('indicador some se a data do serviço for alterada para hoje (sem mexer na receita)', async () => {
    const { service } = await setup();
    const { appointment } = await service.saveAppointment(appt);
    await service.completeAppointment(appointment.id, { registerIncome: true });
    await service.saveAppointment({ ...appt, date: '2026-11-04', price: '80,00' }, appointment.id);
    const income = service.data.transactions.find((t) => t.appointmentId === appointment.id)!;
    expect(futureServiceDateFor(income, service.data.appointments, NOW)).toBeNull();
    expect(income.amount).toBe(8000);
    expect(service.data.transactions).toHaveLength(1);
  });

  it('dados e vínculo permanecem após reiniciar o app', async () => {
    const { service, dbName } = await setup();
    const { appointment } = await service.saveAppointment(appt);
    await service.completeAppointment(appointment.id, { registerIncome: true });
    const xp = service.data.xpEvents.length;

    const reopened = await AppService.load(await createIndexedDbAdapter(dbName), () => NOW);
    const a = reopened.data.appointments.find((x) => x.id === appointment.id)!;
    const t = reopened.data.transactions.find((x) => x.appointmentId === appointment.id)!;
    expect(a.status).toBe('concluido');
    expect(t.appointmentId).toBe(a.id); // 0.5: vínculo pelo serviço (pagamento), sem transactionId
    expect(reopened.data.xpEvents).toHaveLength(xp);
    expect(futureServiceDateFor(t, reopened.data.appointments, NOW)).toBe('2026-11-10');
  });
});
