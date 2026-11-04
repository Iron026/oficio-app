import { readdirSync, readFileSync } from 'node:fs';
import { AVATAR_AREAS, INTERNAL_AVATARS } from './avatarCatalog';

const DIR = 'src/assets/avatars';

describe('avatares do Ofício', () => {
  it('ids únicos e estáveis; toda área tem pelo menos um avatar', () => {
    const ids = INTERNAL_AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const area of AVATAR_AREAS) expect(INTERNAL_AVATARS.some((a) => a.area === area.id)).toBe(true);
    // ids já gravados por quem usou a beta (não podem mudar)
    for (const id of ['retrato-perfil-geral', 'simbolo-saude', 'simbolo-financas', 'simbolo-tecnologia', 'retrato-bombeiros']) expect(ids).toContain(id);
  });

  it('inclui Beleza e Estética e Limpeza e os 5 símbolos refeitos', () => {
    expect(AVATAR_AREAS.map((a) => a.label)).toEqual(expect.arrayContaining(['Beleza e Estética', 'Limpeza']));
    expect(INTERNAL_AVATARS.map((a) => a.id)).toEqual(expect.arrayContaining(['simbolo-ciencia', 'simbolo-agronegocio', 'simbolo-educacao', 'simbolo-engenharia', 'simbolo-negocios', 'simbolo-beleza', 'simbolo-limpeza']));
  });

  it('os símbolos com defeito do pack (PNG/WebP 06–10) não estão no app', () => {
    const files = readdirSync(DIR);
    expect(files.filter((f) => /^simbolo-(0[6-9]|10)_/.test(f) && !f.endsWith('.svg'))).toEqual([]);
  });

  it.each(readdirSync(DIR).filter((f) => f.endsWith('.svg')))('%s: quadro 256×256 com disco centralizado e sem conteúdo externo', (f) => {
    const svg = readFileSync(`${DIR}/${f}`, 'utf8');
    expect(svg).toMatch(/viewBox="0 0 256 256"/);
    expect(svg).toMatch(/<circle cx="128" cy="128" r="128"/);
    expect(svg).not.toMatch(/<(script|image|foreignObject)|href=|url\(/i);
    expect(svg.length).toBeLessThan(4096);
  });

  it('nomes curtos para a galeria (cabem em 2 linhas)', () => {
    for (const a of INTERNAL_AVATARS) expect(a.name.split(' ').every((w) => w.length <= 11)).toBe(true);
  });
});
