import type { AccentId } from '../domain/types';

/** Paletas globais (rodada 5). Nomes, descrições e amostras; os tokens CSS estão em styles/palettes.css. */
export interface Palette {
  id: AccentId;
  name: string;
  note: string;
  /** brand 50…900 */
  scale: readonly string[];
  hero: readonly [string, string];
  heroDark: readonly [string, string];
}

export const PALETTES: readonly Palette[] = [
  { id: 'petroleo', name: 'Petróleo', note: 'Padrão. Verde-petróleo profundo, calmo e profissional.', scale: ["#effcf9", "#c9f5ec", "#94e9d9", "#57d4c0", "#2cb9a6", "#15998a", "#0f7b71", "#0f625b", "#114f4a", "#12413e"], hero: ['#0f7b71', '#0d4f4a'], heroDark: ['#0f5c55', '#0a2b29'] },
  { id: 'oceano', name: 'Oceano', note: 'Azul-esverdeado de mar aberto, mais luminoso que o Petróleo.', scale: ["#ecf8fb", "#cdeef6", "#9fdcec", "#62c2dc", "#2ea3c4", "#1488aa", "#0f6d8c", "#105872", "#11485e", "#103c4f"], hero: ['#0f6d8c', '#0c4a60'], heroDark: ['#0d5670', '#08283a'] },
  { id: 'safira', name: 'Safira', note: 'Azul real intenso, sóbrio e confiável.', scale: ["#eef2ff", "#dbe3fe", "#bccbfc", "#93a9f8", "#6a83f0", "#4a63e4", "#3a4cc9", "#313fa3", "#2c3882", "#283268"], hero: ['#3a4cc9', '#232c7a'], heroDark: ['#2c3a9c', '#141b4a'] },
  { id: 'indigo', name: 'Índigo', note: 'Violeta-azulado elegante, criativo sem perder a seriedade.', scale: ["#f0f0fd", "#e0dffb", "#c6c3f6", "#aaa4f0", "#8a82e6", "#6c63d6", "#5249b8", "#433c94", "#373277", "#2e2a60"], hero: ['#5249b8', '#2f2a70'], heroDark: ['#3f3891', '#1b1844'] },
  { id: 'ameixa', name: 'Ameixa', note: 'Roxo-ameixa sofisticado, quente e marcante.', scale: ["#faf1fb", "#f3def6", "#e7bdee", "#d593e0", "#bd68cb", "#a04bb0", "#843b93", "#6c3278", "#582b61", "#49254f"], hero: ['#843b93', '#4a1f55'], heroDark: ['#682e75', '#2a1131'] },
  { id: 'vinho', name: 'Vinho', note: 'Bordô profundo e clássico; distinto do laranja das despesas.', scale: ["#fdf2f5", "#fbe1e8", "#f6c2d0", "#ee96ad", "#e06386", "#c93f67", "#a92f55", "#8c2849", "#742440", "#622139"], hero: ['#a02c51', '#5a1830'], heroDark: ['#7e2342', '#330c1b'] },
  { id: 'grafite', name: 'Grafite', note: 'Cinza-azulado neutro e discreto, para quem prefere pouca cor.', scale: ["#f3f6f7", "#e3e9eb", "#c9d3d6", "#a7b5ba", "#7f9096", "#5f7178", "#4a5a61", "#3c4a50", "#323e43", "#2a3438"], hero: ['#45555c', '#252f34'], heroDark: ['#36444a', '#161d20'] },
  { id: 'oliva', name: 'Oliva', note: 'Verde-oliva terroso e natural; bem diferente do verde das receitas.', scale: ["#f7f8ec", "#edefd1", "#dcdfa6", "#c3c771", "#a7ab48", "#8a8e31", "#6e7226", "#575a21", "#47491f", "#3c3e1d"], hero: ['#666a25', '#383a17'], heroDark: ['#4f521f', '#21220d'] },
];

export const DEFAULT_PALETTE: AccentId = 'petroleo';

/** Paleta pelo id (desconhecido → Petróleo). */
export function getPalette(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}
