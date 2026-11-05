import { compareVersions, isPaymentRecord, paidForAppointment, removableAutoIncome } from './compat';

describe('compatibilidade com a 0.5', () => {
  const auto = { id: 'auto', type: 'receita', amount: 30_000, appointmentId: 'a1' };
  const pg = { id: 'pg', type: 'receita', amount: 10_000, appointmentId: 'a1', payment: { method: 'pix' } };
  const other = { id: 'o', type: 'receita', amount: 5_000, appointmentId: 'a2', payment: {} };
  const expense = { id: 'd', type: 'despesa', amount: 999, appointmentId: 'a1' };

  it('reconhece pagamentos da 0.5 só em receitas vinculadas com o marcador', () => {
    expect(isPaymentRecord(pg)).toBe(true);
    expect(isPaymentRecord(auto)).toBe(false);
    expect(isPaymentRecord({ ...pg, payment: null })).toBe(false);
    expect(isPaymentRecord({ ...pg, appointmentId: null })).toBe(false);
    expect(isPaymentRecord({ ...pg, type: 'despesa' })).toBe(false);
  });

  it('pago = soma das receitas do serviço (com ou sem marcador), sem despesas nem outros serviços', () => {
    expect(paidForAppointment('a1', [auto, pg, other, expense])).toBe(40_000);
    expect(paidForAppointment('a3', [auto, pg])).toBe(0);
  });

  it('estorno da 0.5 (despesa vinculada com marcador) desconta do pago; despesa comum não', () => {
    const refund = { id: 'e', type: 'despesa', amount: 4_000, appointmentId: 'a1', payment: { kind: 'estorno', of: 'pg' } };
    expect(paidForAppointment('a1', [pg, refund])).toBe(6_000);
    expect(paidForAppointment('a1', [pg, refund, { ...refund, id: 'e2', amount: 50_000 }])).toBe(0);
    expect(paidForAppointment('a1', [pg, expense])).toBe(10_000);
  });

  it('só a receita automática da 0.4 pode ser removida; pagamento nunca', () => {
    expect(removableAutoIncome('auto', [auto, pg])?.id).toBe('auto');
    expect(removableAutoIncome('pg', [auto, pg])).toBeNull();
    expect(removableAutoIncome(null, [auto])).toBeNull();
    expect(removableAutoIncome('sumiu', [auto])).toBeNull();
  });

  it('compara versões, inclusive betas', () => {
    expect(compareVersions('0.5.0', '0.4.0-beta.4')).toBe(1);
    expect(compareVersions('0.4.0', '0.4.0-beta.4')).toBe(1);
    expect(compareVersions('0.4.0-beta.4', '0.4.0-beta.10')).toBe(-1);
    expect(compareVersions('0.4.0-beta.3', '0.4.0-beta.4')).toBe(-1);
    expect(compareVersions('0.4.0-beta.4', '0.4.0-beta.4')).toBe(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('lixo', '0.4.0')).toBeNull();
  });
});
