# Avatares do Ofício (0.4)

Origem: `Oficio_Pack_Avatares_Minimalistas_Revisado.zip` (enviado pelo responsável). Substitui os avatares anteriores.

## Integrados (17)

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

## Não incluídos (sinalizados)

Símbolos **06 Ciência, 07 Agronegócio, 08 Educação, 09 Engenharia, 10 Negócios**: disco branco deslocado atrás
do círculo (aparece como meia-lua na moldura) e, em 08 e 09, desenho cortado na borda. Recomenda-se reexportar
a partir da arte original, centralizados e sem fundo.

## Observações para próximas versões

- Faltam áreas comuns do público do app: **Beleza** e **Limpeza** (há profissões com esses nomes no Ofício).
- Pouca variedade de tons de pele e cabelos entre os retratos.
- Segurança e Brigada de incêndio são profissões geralmente não autônomas; manter ou trocar fica a critério do responsável.
- A pessoa sempre pode usar a própria foto ou as iniciais.
