// Avatares internos do Ofício (pack "Avatares minimalistas revisados").
// Imagens locais em WebP (256 px, qualidade 82), empacotadas no app: funcionam offline.
// Os ids são estáveis: ficam gravados nas preferências da conta (settings.avatar).
//
// Símbolos 06–10 do pack (Ciência, Agronegócio, Educação, Engenharia, Negócios) tinham um
// disco branco deslocado e cortes: foram REFEITOS em SVG (scripts/avatares-svg.py), assim
// como os novos de Beleza e Estética e Limpeza. Ver docs/AVATARES.md.
import retratoGeral from '../assets/avatars/retrato-01_perfil_geral.webp';
import retratoSaude from '../assets/avatars/retrato-02_saude.webp';
import retratoDireito from '../assets/avatars/retrato-03_direito.webp';
import retratoCriatividade from '../assets/avatars/retrato-04_criatividade.webp';
import retratoConstrucao from '../assets/avatars/retrato-05_construcao_civil.webp';
import retratoGastronomia from '../assets/avatars/retrato-06_gastronomia.webp';
import retratoSeguranca from '../assets/avatars/retrato-07_seguranca.webp';
import retratoBombeiros from '../assets/avatars/retrato-08_bombeiros.webp';
import retratoArquitetura from '../assets/avatars/retrato-09_arquitetura.webp';
import retratoEducacao from '../assets/avatars/retrato-10_educacao.webp';
import retratoTecnologia from '../assets/avatars/retrato-11_tecnologia.webp';
import retratoConsultoria from '../assets/avatars/retrato-12_consultoria.webp';
import simboloSaude from '../assets/avatars/simbolo-01_saude.webp';
import simboloDireito from '../assets/avatars/simbolo-02_direito.webp';
import simboloFinancas from '../assets/avatars/simbolo-03_financas.webp';
import simboloTecnologia from '../assets/avatars/simbolo-04_tecnologia.webp';
import simboloDesign from '../assets/avatars/simbolo-05_design.webp';
import simboloCiencia from '../assets/avatars/simbolo-06_ciencia.svg';
import simboloAgro from '../assets/avatars/simbolo-07_agronegocio.svg';
import simboloEducacao from '../assets/avatars/simbolo-08_educacao.svg';
import simboloEngenharia from '../assets/avatars/simbolo-09_engenharia.svg';
import simboloNegocios from '../assets/avatars/simbolo-10_negocios.svg';
import simboloBeleza from '../assets/avatars/simbolo-11_beleza.svg';
import simboloLimpeza from '../assets/avatars/simbolo-12_limpeza.svg';
import simboloGeral from '../assets/avatars/simbolo-13_geral.svg';
import simboloAlimentacao from '../assets/avatars/simbolo-14_alimentacao.svg';
import simboloSeguranca from '../assets/avatars/simbolo-15_seguranca.svg';

// Rodada 3: personagens vetoriais (uma mulher e um homem por área), gerados por
// scripts/avatares-personagens.py e revisados um a um (40/64/128 px, claro e escuro).
const PERSONAGENS = import.meta.glob<string>('../assets/avatars/personagem-*.svg', { eager: true, query: '?url', import: 'default' });

export type AvatarArea = 'geral' | 'beleza' | 'limpeza' | 'saude' | 'direito-financas' | 'criatividade' | 'obras' | 'alimentacao' | 'campo' | 'seguranca' | 'educacao' | 'tecnologia';
/** retrato = personagem (ilustração de pessoa); simbolo = ícone da área. */
export type AvatarKind = 'retrato' | 'simbolo';
/** Abas da galeria. */
export type AvatarGroup = 'personagens' | 'icones';

export interface InternalAvatar {
  id: string;
  name: string;
  area: AvatarArea;
  kind: AvatarKind;
  src: string;
  /** Personagem da rodada 3 (mulher/homem); os demais retratos vêm do pacote anterior. */
  gender?: 'f' | 'm';
}

export const groupOf = (a: InternalAvatar): AvatarGroup => (a.kind === 'simbolo' ? 'icones' : 'personagens');

export const AVATAR_AREAS: { id: AvatarArea; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'beleza', label: 'Beleza e Estética' },
  { id: 'limpeza', label: 'Limpeza' },
  { id: 'saude', label: 'Saúde e ciência' },
  { id: 'direito-financas', label: 'Negócios, direito e finanças' },
  { id: 'criatividade', label: 'Criatividade' },
  { id: 'obras', label: 'Obras e engenharia' },
  { id: 'alimentacao', label: 'Alimentação' },
  { id: 'campo', label: 'Campo e agronegócio' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'educacao', label: 'Educação' },
  { id: 'tecnologia', label: 'Tecnologia' },
];

export const INTERNAL_AVATARS: InternalAvatar[] = [
  { id: 'retrato-perfil-geral', name: 'Perfil geral', area: 'geral', kind: 'retrato', src: retratoGeral },
  { id: 'retrato-consultoria', name: 'Consultoria', area: 'geral', kind: 'retrato', src: retratoConsultoria },
  { id: 'retrato-saude', name: 'Saúde', area: 'saude', kind: 'retrato', src: retratoSaude },
  { id: 'simbolo-saude', name: 'Medicina', area: 'saude', kind: 'simbolo', src: simboloSaude },
  { id: 'retrato-direito', name: 'Direito', area: 'direito-financas', kind: 'retrato', src: retratoDireito },
  { id: 'simbolo-direito', name: 'Balança', area: 'direito-financas', kind: 'simbolo', src: simboloDireito },
  { id: 'simbolo-financas', name: 'Gráfico', area: 'direito-financas', kind: 'simbolo', src: simboloFinancas },
  { id: 'retrato-criatividade', name: 'Artista', area: 'criatividade', kind: 'retrato', src: retratoCriatividade },
  { id: 'simbolo-design', name: 'Paleta e pincel', area: 'criatividade', kind: 'simbolo', src: simboloDesign },
  { id: 'retrato-construcao', name: 'Construção civil', area: 'obras', kind: 'retrato', src: retratoConstrucao },
  { id: 'retrato-arquitetura', name: 'Arquitetura', area: 'obras', kind: 'retrato', src: retratoArquitetura },
  { id: 'retrato-gastronomia', name: 'Cozinha', area: 'alimentacao', kind: 'retrato', src: retratoGastronomia },
  { id: 'retrato-seguranca', name: 'Segurança', area: 'seguranca', kind: 'retrato', src: retratoSeguranca },
  { id: 'retrato-bombeiros', name: 'Brigada de incêndio', area: 'seguranca', kind: 'retrato', src: retratoBombeiros },
  { id: 'retrato-educacao', name: 'Educação', area: 'educacao', kind: 'retrato', src: retratoEducacao },
  { id: 'retrato-tecnologia', name: 'Tecnologia', area: 'tecnologia', kind: 'retrato', src: retratoTecnologia },
  { id: 'simbolo-tecnologia', name: 'Código', area: 'tecnologia', kind: 'simbolo', src: simboloTecnologia },
  { id: 'simbolo-beleza', name: 'Tesoura', area: 'beleza', kind: 'simbolo', src: simboloBeleza },
  { id: 'simbolo-limpeza', name: 'Borrifador', area: 'limpeza', kind: 'simbolo', src: simboloLimpeza },
  { id: 'simbolo-ciencia', name: 'Laboratório', area: 'saude', kind: 'simbolo', src: simboloCiencia },
  { id: 'simbolo-negocios', name: 'Maleta', area: 'direito-financas', kind: 'simbolo', src: simboloNegocios },
  { id: 'simbolo-engenharia', name: 'Indústria', area: 'obras', kind: 'simbolo', src: simboloEngenharia },
  { id: 'simbolo-agronegocio', name: 'Broto', area: 'campo', kind: 'simbolo', src: simboloAgro },
  { id: 'simbolo-educacao', name: 'Formatura', area: 'educacao', kind: 'simbolo', src: simboloEducacao },
  { id: 'simbolo-geral', name: 'Prancheta', area: 'geral', kind: 'simbolo', src: simboloGeral },
  { id: 'simbolo-alimentacao', name: 'Chapéu de cozinha', area: 'alimentacao', kind: 'simbolo', src: simboloAlimentacao },
  { id: 'simbolo-seguranca', name: 'Escudo', area: 'seguranca', kind: 'simbolo', src: simboloSeguranca },
  // Personagens: mulher e homem de cada área (ids estáveis: personagem-<área>-<f|m>).
  ...AVATAR_AREAS.flatMap((area) =>
    (['f', 'm'] as const).map((g) => {
      const src = PERSONAGENS[`../assets/avatars/personagem-${area.id}-${g}.svg`];
      if (!src) throw new Error(`personagem ausente: ${area.id}-${g}`);
      return { id: `personagem-${area.id}-${g}`, name: `${area.label}, ${g === 'f' ? 'mulher' : 'homem'}`, area: area.id, kind: 'retrato' as const, src, gender: g };
    }),
  ),
];

/** Avatares de uma aba, por área: personagens novos (mulher, homem) primeiro, depois os do pacote anterior. */
export function avatarsByArea(group: AvatarGroup): { area: (typeof AVATAR_AREAS)[number]; items: InternalAvatar[] }[] {
  return AVATAR_AREAS.map((area) => ({
    area,
    items: INTERNAL_AVATARS.filter((a) => a.area === area.id && groupOf(a) === group).sort((a, b) => Number(!a.gender) - Number(!b.gender) || (a.gender ?? '').localeCompare(b.gender ?? '')),
  })).filter((g) => g.items.length > 0);
}

export function getInternalAvatar(id: string | undefined): InternalAvatar | undefined {
  return id ? INTERNAL_AVATARS.find((a) => a.id === id) : undefined;
}
