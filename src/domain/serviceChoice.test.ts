import { applyServiceChoice } from './serviceTypes';

describe('beta.5: escolher sugestão no agendamento', () => {
  const form = { title: 'Corte', price: '75,00', clientId: 'c1', date: '2026-11-05', time: '10:00', notes: 'obs' };
  it('troca descrição e valor pelos da sugestão, mesmo com valor editado; o resto do formulário fica', () => {
    expect(applyServiceChoice(form, { name: 'Escova', price: 5_000 })).toEqual({ ...form, title: 'Escova', price: '50,00' });
  });
  it('sugestão sem valor limpa o valor (reflete o serviço escolhido)', () => {
    expect(applyServiceChoice(form, { name: 'Visita', price: null })).toEqual({ ...form, title: 'Visita', price: '' });
  });
  it('trocas sucessivas: sempre vale a última sugestão', () => {
    const a = applyServiceChoice(form, { name: 'Escova', price: 5_000 });
    const b = applyServiceChoice({ ...a, price: '99,00' }, { name: 'Manicure', price: 5_500 });
    expect(b).toMatchObject({ title: 'Manicure', price: '55,00' });
  });
});
