import { clampCrop } from './photoEncode';

describe('recorte da foto', () => {
  it('zoom fica entre 1 e 4', () => {
    expect(clampCrop({ zoom: 0.2, x: 0, y: 0 }, 800, 600).zoom).toBe(1);
    expect(clampCrop({ zoom: 9, x: 0, y: 0 }, 800, 600).zoom).toBe(4);
  });

  it('sem zoom, foto quadrada não se move (nunca deixa borda vazia)', () => {
    expect(clampCrop({ zoom: 1, x: 0.3, y: -0.3 }, 500, 500)).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it('foto deitada move só na horizontal, até a borda', () => {
    const c = clampCrop({ zoom: 1, x: 5, y: 5 }, 1200, 600); // largura = 2× o quadro
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBe(0);
  });

  it('com zoom 2, a foto quadrada pode mover meio quadro para cada lado', () => {
    const c = clampCrop({ zoom: 2, x: -3, y: 3 }, 400, 400);
    expect(c.x).toBeCloseTo(-0.5);
    expect(c.y).toBeCloseTo(0.5);
  });
});
