/**
 * Logomarca do Ofício — opção A, "Arco refinado" (aprovada na beta.5). Fonte única da geometria
 * (área 64×64): o componente <Logo>, o favicon (public/icon.svg) e os ícones do Android
 * (scripts/icone-app.mjs) usam estes mesmos traços; src/ui/brand.test.ts confere.
 *
 * Desenho: quadrado de cantos contínuos (squircle), arco com traço de 5 e o ponto dourado assentado
 * entre as pernas, como a pedra-chave de um arco.
 */
export const LOGO = {
  squircle: 'M32 2C55 2 62 9 62 32S55 62 32 62 2 55 2 32 9 2 32 2Z',
  arch: 'M19.5 42 32 20l12.5 22',
  archWidth: 5,
  dot: { cx: 32, cy: 41.2, r: 3.4 },
  gold: '#fbbf24',
  /** Degradê do ícone do app (Petróleo, fixo: o ícone do aparelho não muda com a paleta). */
  top: '#159a8b',
  bottom: '#0d5a54',
} as const;
