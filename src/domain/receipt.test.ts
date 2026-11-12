import { amountInWords, integerInWords, receiptNumber } from './receipt';

describe('valor por extenso', () => {
  it.each([
    [1, 'um centavo'], [99, 'noventa e nove centavos'], [100, 'um real'], [150, 'um real e cinquenta centavos'],
    [10_000, 'cem reais'], [12_345, 'cento e vinte e três reais e quarenta e cinco centavos'],
    [100_000, 'mil reais'], [120_050, 'mil e duzentos reais e cinquenta centavos'], [123_400, 'mil duzentos e trinta e quatro reais'],
    [200_500, 'dois mil e cinco reais'], [2_150_000, 'vinte e um mil e quinhentos reais'],
    [10_123_456, 'cento e um mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [100_000_000, 'um milhão de reais'], [235_000_000, 'dois milhões trezentos e cinquenta mil reais'],
    [100_100_000, 'um milhão e mil reais'], [0, 'zero real'],
  ])('%i centavos → %s', (cents, words) => expect(amountInWords(cents)).toBe(words));

  it('inteiros: dezenas, centenas e milhares', () => {
    expect(integerInWords(16)).toBe('dezesseis');
    expect(integerInWords(101)).toBe('cento e um');
    expect(integerInWords(999_999)).toBe('novecentos e noventa e nove mil novecentos e noventa e nove');
  });
});

describe('número do recibo', () => {
  it('estável, derivado da data e do id; ids diferentes dão códigos diferentes', () => {
    const a = receiptNumber({ id: 'pg-abc', date: '2026-11-12' });
    expect(a).toMatch(/^REC-20261112-[0-9A-Z]{4}$/);
    expect(receiptNumber({ id: 'pg-abc', date: '2026-11-12' })).toBe(a);
    const codes = new Set(Array.from({ length: 500 }, (_, i) => receiptNumber({ id: `id-${i}`, date: '2026-11-12' })));
    expect(codes.size).toBeGreaterThan(495);
  });
});
