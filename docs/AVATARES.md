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
| Obras e engenharia | Engrenagem (`simbolo-engenharia`) |
| Negócios, direito e finanças | Maleta (`simbolo-negocios`) |
| **Beleza e Estética** (nova) | Tesoura (`simbolo-beleza`) |
| **Limpeza** (nova) | Borrifador (`simbolo-limpeza`) |

Mesma paleta do pack (disco #d2eded, traço petróleo, detalhes amarelo e verde), quadro 256 × 256 com o disco
centralizado. Conferidos em 40, 64 e 128 px nos dois temas (1× e 3×); centro do desenho a ≤ 0,5 px do centro
do disco. Cada SVG tem menos de 1 KB, sem scripts nem imagens externas (teste em `src/ui/avatarCatalog.test.ts`).
Nomes curtos na galeria ("Crescimento", "Programação") para não quebrar no cartão.

## Observações para próximas versões

- Beleza e Estética e Limpeza ainda só têm símbolo; retratos dessas áreas exigiriam nova arte.
- Pouca variedade de tons de pele e cabelos entre os retratos.
- Segurança e Brigada de incêndio são profissões geralmente não autônomas; manter ou trocar fica a critério do responsável.
- A pessoa sempre pode usar a própria foto ou as iniciais.
