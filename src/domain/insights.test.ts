import { completedCountByClient } from './insights';

describe('completedCountByClient', () => {
  it('conta só concluídos, por cliente, ignorando agendamentos sem cliente', () => {
    const a = (id: string, clientId: string | null, status: 'agendado' | 'concluido' | 'cancelado') => ({ id, clientId, status }) as never;
    const m = completedCountByClient([a('1', 'c1', 'concluido'), a('2', 'c1', 'concluido'), a('3', 'c1', 'cancelado'), a('4', 'c2', 'agendado'), a('5', null, 'concluido')]);
    expect(m.get('c1')).toBe(2);
    expect(m.get('c2')).toBeUndefined();
    expect(m.size).toBe(1);
  });
});
