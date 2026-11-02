import { centsToInput, formatMoney, parseMoney } from './money';

describe('money', () => {
  it.each([
    ['150', 15000], ['150,5', 15050], ['1.234,56', 123456], ['R$ 99,90', 9990], ['99.90', 9990], ['1.000', 100000], ['0', 0],
  ])('converte "%s" em %i centavos', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(['', 'abc', '12,345', '1,2,3', '-5'])('rejeita "%s"', (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it('formata em reais', () => {
    expect(formatMoney(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });

  it('gera valor editável', () => {
    expect(centsToInput(15050)).toBe('150,50');
    expect(centsToInput(0)).toBe('');
  });
});
