import { createHash } from 'node:crypto';
import { canonicalJson, sha256Hex } from './sha256';

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ])('vetor padrão %j', (input, hex) => {
    expect(sha256Hex(input)).toBe(hex);
  });

  it('igual ao SHA-256 do Node para textos com acentos, emoji e tamanhos nas bordas dos blocos', () => {
    for (const s of ['Conceição — R$ 1.234,56 ✓', '😀'.repeat(40), 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(100_000)]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('canonicalJson', () => {
  it('ordem das chaves e espaços não mudam o texto; arrays mantêm a ordem', () => {
    const a = JSON.parse('{ "b": 1, "a": { "y": [3, 1], "x": "é" } }');
    const b = JSON.parse('{"a":{"x":"é","y":[3,1]},"b":1}');
    expect(canonicalJson(a)).toBe('{"a":{"x":"é","y":[3,1]},"b":1}');
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson({ a: [1, 3] })).not.toBe(canonicalJson({ a: [3, 1] }));
  });
});
