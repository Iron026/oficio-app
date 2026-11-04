import { hasErrors, validateAppointment, validateClient, validateProfile, validateTransaction } from './validation';

describe('validação de formulários', () => {
  it('exige nome do cliente e valida telefone e e-mail', () => {
    const e = validateClient({ name: '', phone: '123', email: 'x@', address: '', notes: '' });
    expect(e.name).toBeTruthy();
    expect(e.phone).toBeTruthy();
    expect(e.email).toBeTruthy();
    expect(hasErrors(validateClient({ name: 'Ana', phone: '(11) 91234-5678', email: 'ana@ex.com', address: '', notes: '' }))).toBe(false);
  });

  it('telefone e e-mail são opcionais', () => {
    expect(hasErrors(validateClient({ name: 'Ana', phone: '', email: '', address: '', notes: '' }))).toBe(false);
  });

  it('valida agendamento', () => {
    expect(validateAppointment({ title: '', clientId: '', date: '', time: '25:00', price: 'abc', notes: '' })).toMatchObject({
      title: expect.any(String), date: expect.any(String), time: expect.any(String), price: expect.any(String),
    });
    expect(hasErrors(validateAppointment({ title: 'Corte', clientId: '', date: '2026-11-02', time: '', price: '', notes: '' }))).toBe(false);
  });

  it('valida lançamento financeiro', () => {
    const e = validateTransaction({ type: 'receita', amount: '0', description: '', category: '', date: '' });
    expect(e.amount).toBeTruthy();
    expect(e.description).toBeUndefined(); // descrição é opcional
    expect(e.category).toBeTruthy(); // categoria é obrigatória
    expect(validateTransaction({ type: 'despesa', amount: '10', description: '   ', category: 'Produtos', date: '2026-01-01' })).toEqual({});
    expect(validateTransaction({ type: 'despesa', amount: '10', description: 'x'.repeat(81), category: 'Produtos', date: '2026-01-01' }).description).toBeTruthy();
    expect(e.date).toBeTruthy();
    expect(validateTransaction({ type: 'outro', amount: '10', description: 'x', category: 'y', date: '2026-01-01' }).type).toBeTruthy();
  });

  it('valida perfil', () => {
    expect(validateProfile({ name: '  ', businessName: '' }).name).toBeTruthy();
    expect(hasErrors(validateProfile({ name: 'Ana', businessName: '' }))).toBe(false);
  });
});
