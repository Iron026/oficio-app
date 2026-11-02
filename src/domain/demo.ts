import { addDays, toDateKey } from '../lib/dates';
import { newId } from '../lib/id';
import { getProfession } from './professions';
import type { Appointment, Client, ProfessionId, Transaction } from './types';

/**
 * Gera dados de DEMONSTRAÇÃO. Todos os registros têm `isDemo: true`,
 * aparecem com selo "Demonstração", não geram XP e podem ser removidos
 * de uma vez em Ajustes.
 */
export function buildDemoData(professionId: ProfessionId, now = new Date()) {
  const p = getProfession(professionId);
  const stamp = now.toISOString();
  const base = { createdAt: stamp, updatedAt: stamp, isDemo: true as const };
  const names = ['Ana Souza (demo)', 'Carlos Lima (demo)', 'Juliana Rocha (demo)', 'Marcos Silva (demo)'];
  const clients: Client[] = names.map((name, i) => ({
    ...base, id: newId(), name, phone: `(11) 9000${i}-000${i}`, email: '', address: '', notes: 'Cliente fictício para demonstração.',
  }));
  const day = (n: number) => toDateKey(addDays(now, n));
  const tpl = (i: number) => p.serviceTemplates[i % p.serviceTemplates.length]!;
  const appointments: Appointment[] = [];
  const transactions: Transaction[] = [];
  const specs: [number, number, Appointment['status']][] = [[-6, 0, 'concluido'], [-3, 1, 'concluido'], [-1, 2, 'concluido'], [0, 3, 'agendado'], [1, 0, 'agendado'], [3, 1, 'agendado']];
  specs.forEach(([offset, ci, status], i) => {
    const t = tpl(i);
    const id = newId();
    let transactionId: string | null = null;
    if (status === 'concluido') {
      transactionId = newId();
      transactions.push({ ...base, id: transactionId, type: 'receita', amount: t.suggestedPrice, description: t.name, category: p.incomeCategories[0]!, date: day(offset), appointmentId: id });
    }
    appointments.push({
      ...base, id, title: t.name, clientId: clients[ci]!.id, date: day(offset), time: `${9 + i}:00`.padStart(5, '0'),
      price: t.suggestedPrice, status, notes: '', completedAt: status === 'concluido' ? addDays(now, offset).toISOString() : null, transactionId,
    });
  });
  transactions.push(
    { ...base, id: newId(), type: 'despesa', amount: 8_500, description: 'Compra de material (demo)', category: p.expenseCategories[0]!, date: day(-4), appointmentId: null },
    { ...base, id: newId(), type: 'despesa', amount: 4_000, description: 'Transporte (demo)', category: p.expenseCategories.find((c) => /transporte|combust|entrega/i.test(c)) ?? p.expenseCategories[0]!, date: day(-2), appointmentId: null },
  );
  return { clients, appointments, transactions };
}
