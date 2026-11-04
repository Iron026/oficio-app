import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AVATAR_AREAS, INTERNAL_AVATARS, avatarsByArea, getInternalAvatar, groupOf } from './avatarCatalog';

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
    // Só referências internas (recorte circular dos personagens: url(#c)); nada externo.
    expect(svg).not.toMatch(/<(script|image|foreignObject)|href=|url\((?!#)/i);
    expect(svg.length).toBeLessThan(f.startsWith('personagem-') ? 8192 : 4096);
  });

  it('nomes curtos nos avatares do pacote e nos ícones (aparecem na prévia e no detalhe do perfil)', () => {
    // Rodada 3: a galeria não mostra nomes embaixo das imagens; os personagens novos têm o nome
    // completo da área ("Campo e agronegócio, mulher") só para o TalkBack e a prévia.
    for (const a of INTERNAL_AVATARS.filter((x) => !x.gender)) expect(a.name.split(' ').every((w) => w.length <= 11)).toBe(true);
  });
});

describe('Galeria de avatares (rodada 3)', () => {
  it('cada área tem uma mulher e um homem e ao menos um ícone', () => {
    for (const area of AVATAR_AREAS) {
      const people = INTERNAL_AVATARS.filter((a) => a.area === area.id && a.gender);
      expect(people.map((p) => p.gender).sort()).toEqual(['f', 'm']);
      expect(INTERNAL_AVATARS.some((a) => a.area === area.id && groupOf(a) === 'icones')).toBe(true);
    }
  });

  it('ids únicos e estáveis; os do pacote anterior continuam válidos', () => {
    const ids = INTERNAL_AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const legacy of ['retrato-perfil-geral', 'retrato-criatividade', 'simbolo-saude', 'simbolo-beleza', 'simbolo-limpeza', 'retrato-consultoria']) {
      expect(getInternalAvatar(legacy)).toBeDefined();
    }
    expect(getInternalAvatar('personagem-saude-f')?.name).toBe('Saúde e ciência, mulher');
  });

  it('abas: personagens novos primeiro (mulher, homem); ícones separados', () => {
    const people = avatarsByArea('personagens');
    expect(people).toHaveLength(AVATAR_AREAS.length);
    for (const g of people) expect(g.items.slice(0, 2).map((a) => a.gender)).toEqual(['f', 'm']);
    expect(avatarsByArea('icones').flatMap((g) => g.items).every((a) => a.kind === 'simbolo')).toBe(true);
  });

  it('personagens SVG: disco centrado 256×256, recorte circular, nome acessível, sem script nem link externo', () => {
    for (const area of AVATAR_AREAS) {
      for (const g of ['f', 'm']) {
        const svg = readFileSync(resolve(__dirname, `../assets/avatars/personagem-${area.id}-${g}.svg`), 'utf8');
        expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256" role="img" aria-label="[^"]+, (mulher|homem)">/);
        expect(svg).toContain('<circle cx="128" cy="128" r="128" fill="#d2eded"/>');
        expect(svg).toContain('clip-path="url(#c)"');
        expect(svg).not.toMatch(/<script|href=|xlink|<image|<text|NaN|undefined/);
        expect(svg.length).toBeLessThan(8000);
      }
    }
  });
});
