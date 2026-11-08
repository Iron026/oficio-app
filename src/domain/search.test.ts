import { normalizeSearch, searchAll } from './search';
import type { AppData } from './types';

const base = { createdAt: '2026-11-01T10:00:00Z', updatedAt: 'x' };
const data: Pick<AppData, 'clients' | 'appointments' | 'serviceTypes' | 'transactions'> = {
  clients: [
    { ...base, id: 'c1', name: 'Conceição Araújo', phone: '(11) 98765-4321', email: 'ceca@exemplo.com', address: '', notes: 'Prefere manhã' },
    { ...base, id: 'c2', name: 'José', phone: '', email: '', address: '', notes: '' },
  ],
  appointments: [
    { ...base, id: 'a1', title: 'Coloração', clientId: 'c1', date: '2026-11-20', time: '10:00', price: 30_000, status: 'agendado', notes: '', completedAt: null, transactionId: null },
    { ...base, id: 'a2', title: 'Corte', clientId: 'c2', date: '2026-11-02', time: '09:00', price: 6_000, status: 'concluido', notes: 'cabelo curto', completedAt: 'x', transactionId: null },
  ],
  serviceTypes: [{ ...base, id: 's1', name: 'Coloração completa', price: 25_000, pinned: false, order: 1 }],
  transactions: [
    { ...base, id: 't1', type: 'receita', amount: 6_000, description: 'Corte', category: 'Atendimento', date: '2026-11-02', appointmentId: 'a2' },
    { ...base, id: 't2', type: 'despesa', amount: 4_550, description: 'Tintas', category: 'Produtos', date: '2026-11-03', appointmentId: null },
  ],
};

describe('busca global', () => {
  it('ignora acentos e maiúsculas; agrupa por tipo', () => {
    expect(normalizeSearch('  CONCEIÇÃO   Araújo ')).toBe('conceicao araujo');
    const r = searchAll(data, 'coloracao');
    expect([r.clients.total, r.appointments.total, r.serviceTypes.total, r.transactions.total]).toEqual([0, 1, 1, 0]);
    expect(searchAll(data, 'CONCEICAO').clients.items.map((c) => c.id)).toEqual(['c1']);
  });

  it('cada palavra precisa aparecer: cliente + serviço encontra o atendimento dela', () => {
    expect(searchAll(data, 'coloração conceição').appointments.items.map((a) => a.id)).toEqual(['a1']);
    expect(searchAll(data, 'coloração josé').appointments.total).toBe(0);
  });

  it('telefone por dígitos, observações e data dd/mm', () => {
    expect(searchAll(data, '98765').clients.items.map((c) => c.id)).toEqual(['c1']);
    expect(searchAll(data, 'manhã').clients.total).toBe(1);
    expect(searchAll(data, '02/11').transactions.items.map((t) => t.id)).toEqual(['t1']);
  });

  it('valor só é pesquisável com valores visíveis', () => {
    expect(searchAll(data, '45,50', { hideValues: false }).transactions.items.map((t) => t.id)).toEqual(['t2']);
    expect(searchAll(data, '45,50', { hideValues: true }).total).toBe(0);
    expect(searchAll(data, '300', { hideValues: true }).total).toBe(0);
  });

  it('consulta curta não busca; limite por grupo com total real', () => {
    expect(searchAll(data, 'c').total).toBe(0);
    const many = { ...data, clients: Array.from({ length: 30 }, (_, i) => ({ ...data.clients[1]!, id: `x${i}`, name: `Maria ${i}` })) };
    const r = searchAll(many, 'maria');
    expect([r.clients.items.length, r.clients.total]).toEqual([20, 30]);
  });

  it('desempenho: 5 000 registros rapidamente (folga para o CI)', () => {
    const big = { ...data, transactions: Array.from({ length: 5000 }, (_, i) => ({ ...data.transactions[1]!, id: `t${i}`, description: `Compra ${i}` })) };
    const t0 = performance.now();
    searchAll(big, 'compra 49');
    expect(performance.now() - t0).toBeLessThan(150);
  });
});
