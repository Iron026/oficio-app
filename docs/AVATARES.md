# Avatares do Ofício (0.4)

Origem: `Oficio_Pack_Avatares_Minimalistas_Revisado.zip` (enviado pelo responsável). Substitui os avatares anteriores.

## Integrados do ZIP (17)

Convertidos para **WebP 256 px, qualidade 82** (152 KB no total, empacotados no app; funcionam offline).
Arquivos em `src/assets/avatars/`, catálogo em `src/ui/avatarCatalog.ts` (ids estáveis, gravados em `settings.avatar`).

| Área | Retratos | Símbolos |
| --- | --- | --- |
| Geral | Perfil geral, Consultoria | — |
| Saúde | Saúde | Estetoscópio |
| Direito e finanças | Direito | Balança, Gráfico de crescimento |
| Criatividade | Criatividade | Paleta e pincel |
| Obras e manutenção | Construção civil, Arquitetura | — |
| Alimentação | Gastronomia | — |
| Segurança | Segurança, Brigada de incêndio | — |
| Educação | Educação | — |
| Tecnologia | Tecnologia | Notebook com código |

Verificado em 40, 64 e 128 px (claro e escuro): rosto, olhos, cabelo, acessórios e enquadramento corretos.
Em 128 px de tela num aparelho 3× a imagem de 256 px fica levemente suave (aceitável; reexportar em 384 px resolveria).

## Não incluídos do ZIP (substituídos por SVG na beta.2)

Os símbolos **06 Ciência, 07 Agronegócio, 08 Educação, 09 Engenharia, 10 Negócios** do ZIP tinham um disco branco
deslocado atrás do círculo (meia-lua na moldura) e, em 08 e 09, desenho cortado. **Não estão no app.** Foram
redesenhados como SVG minimalistas (`scripts/avatares-svg.py`), junto com dois novos:

| Área | Avatar (id) |
| --- | --- |
| Saúde e ciência | Laboratório (`simbolo-ciencia`) |
| Campo e agronegócio | Broto (`simbolo-agronegocio`) |
| Educação | Formatura (`simbolo-educacao`) |
| Obras e engenharia | Indústria (`simbolo-engenharia`) |
| Negócios, direito e finanças | Maleta (`simbolo-negocios`) |
| **Beleza e Estética** (nova) | Tesoura (`simbolo-beleza`) |
| **Limpeza** (nova) | Borrifador (`simbolo-limpeza`) |

Mesma paleta do pack (disco #d2eded, traço petróleo, detalhes amarelo e verde), quadro 256 × 256 com o disco
centralizado. Conferidos em 40, 64 e 128 px nos dois temas (1× e 3×); centro do desenho a ≤ 0,5 px do centro
do disco. Cada SVG tem menos de 1 KB, sem scripts nem imagens externas (teste em `src/ui/avatarCatalog.test.ts`).
Nomes curtos na galeria ("Gráfico", "Código", "Medicina", "Artista", "Cozinha", "Indústria") para não quebrar no cartão.

## Rodada 3 (beta.3): Personagens e Ícones

A galeria tem duas abas, sem nome embaixo das imagens (o nome vai no rótulo do TalkBack e aparece
na prévia do topo quando escolhido):

- **Personagens**: uma mulher e um homem de cada uma das 12 áreas (`personagem-<área>-<f|m>.svg`,
  24 SVG, gerados por `scripts/avatares-personagens.py`), seguidos dos retratos do pacote anterior
  da mesma área — nenhuma escolha já feita deixa de existir.
- **Ícones**: os símbolos de cada área; novos nesta rodada: Prancheta (Geral), Chapéu de cozinha
  (Alimentação) e Escudo (Segurança), em `scripts/avatares-svg.py` (os anteriores continuam
  idênticos byte a byte).

Revisão individual (40, 64, 128 e 240 px, fundo claro e escuro), com correções antes de integrar:
- olhos "amendoados" pareciam fechados nesse estilo → trocados por olhos abertos nas 5 personagens
  que os usavam (direito-finanças, alimentação, segurança, beleza e tecnologia, mulheres);
- franja lateral cobria a sobrancelha e parte do olho (direito-finanças, mulher) → recortada;
- uniforme de Segurança genérico (escudo amarelo), sem insígnia de nenhuma instituição real.
Teste `src/ui/avatarCatalog.test.ts` confere: mulher e homem em todas as áreas, ids estáveis,
disco centrado 256×256 com recorte circular, nome acessível, sem script nem links.

## Padrão oficial (beta.3, padronização)

O estilo minimalista dos personagens da beta.3 é o **padrão oficial**. A galeria mostra um único conjunto:

| Aba | Conteúdo | Formato |
| --- | --- | --- |
| Personagens | 24: mulher e homem de cada uma das 12 áreas | SVG, `personagem-<área>-<f\|m>.svg` |
| Ícones | 12: um por área (traço petróleo, disco #d2eded, detalhes amarelo/verde) | SVG, `simbolo-*.svg` |

Regras do conjunto (todas no gerador `scripts/avatares-personagens.py`): mesma cabeça, pescoço e ombros, mesmo
enquadramento 256 × 256 com recorte circular, mesmos traços (sobrancelha 4,2; óculos 3,4) e o mesmo nível de detalhe;
a profissão aparece por um único elemento (chapéu, avental, jaleco, colete…). Diversidade por tom de pele (6), cabelo,
idade, barba/bigode, óculos e quatro tipos de olho (redondo, grande, sorrindo, calmo — o "amendoado" foi abolido porque
parecia fechado). Revisão desta rodada: Alimentação (mulher e homem iguais demais), Direito/Educação (dois rostos
claros, grisalhos e de óculos), Obras/Saúde (mesma pele e barba) e Segurança/Limpeza (mesmo rosto de boné) foram
diferenciados; chapéu de cozinha e ícones de Alimentação e Tecnologia recentralizados. Conferido em 40, 64, 128 e
240 px, claro e escuro, com medição automática: todos centrados (x = 127,5) e nada encostando na borda do disco.

**Coleção anterior** (12 retratos e 5 símbolos WebP do pacote, mais o Laboratório): `legacy: true` no catálogo.
Fica fora da galeria, mas o arquivo continua no app e o id continua válido — quem já usa um deles segue vendo a
mesma imagem, com a mesma moldura e selo, e a galeria avisa que é da coleção anterior. Ids desconhecidos caem para
as iniciais. Testes: `src/screens/avatarCompat.ui.test.tsx` (as 18 escolhas antigas, foto, iniciais, id desconhecido
e backup) e `src/ui/avatarCatalog.test.ts` (24 + 12, um ícone por área, tudo vetorial, nomes acessíveis, < 80 KB).

## Observações para próximas versões

- Beleza e Estética e Limpeza ainda só têm símbolo; retratos dessas áreas exigiriam nova arte.
- Pouca variedade de tons de pele e cabelos entre os retratos.
- Segurança e Brigada de incêndio são profissões geralmente não autônomas; manter ou trocar fica a critério do responsável.
- A pessoa sempre pode usar a própria foto ou as iniciais.
