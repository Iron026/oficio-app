# Design system do Ofício (0.4)

Ideia condutora: uma **bancada organizada**. Superfícies calmas, cada cor com um único
significado e os números do negócio em primeiro plano. Serve para qualquer profissão: a
personalidade vem da organização, não de ilustrações de uma área específica.

Tokens em `src/index.css`. Contrastes conferidos em `src/ui/tokens.test.ts`.

## Cores

| Papel | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| Marca | `brand-600` #0f7b71 | `brand-300` #57d4c0 | ação principal, navegação ativa, foco |
| Receita | `--income` #147a3a | #4ade80 | valores de entrada |
| Despesa | `--expense` #b3401a (terracota) | #f4846a | valores de saída |
| Evolução (preenchimento) | `xp-400` #fbbf24 · `xp-500` #f59e0b | iguais | barras, selo de nível, conquista |
| Evolução (texto) | `xp-600` #995800 · `xp-700` #8a4f00 | `xp-400` | "+20 XP", datas de conquista |
| Texto sobre âmbar | `xp-950` #3b2500 | igual | número do nível, ícone de conquista |
| Fundo / cartão / superfície 2 | #f4f7f7 / #ffffff / #eaf0f0 | #0b1316 / #121d21 / #1a282d | neutros com leve tom petróleo |
| Texto / secundário / borda | #0e1a1f / #56676e / #d8e1e3 | #e7eff1 / #9aacb3 / #2a3d43 | |

Regras:
- Nenhuma cor faz dois papéis. Despesa não usa âmbar; receita não usa a cor da marca.
- Âmbar nunca é cor de texto sobre fundo claro (use `xp-600`/`xp-700`) e nunca leva texto branco (use `xp-950`).
- Todo texto com 4,5:1 ou mais nos dois temas, inclusive sobre `surface-2`.
- Não usar `opacity` para indicar estado em textos (reduz o contraste). Use fundo `surface-2`, borda tracejada, risco ou ícone.

## Tipografia

- **Corpo:** fonte do sistema (`font-sans`; Roboto/Samsung no Android). Respeita o tamanho de fonte do aparelho.
- **Títulos, valores e XP:** Manrope variável (`font-display`), empacotada no app.
  - Licença: SIL Open Font License 1.1 (permite empacotar e distribuir com o app).
  - Só o subconjunto latino (cobre o português): 24,8 KB; aumento medido de ~24,5 KB no build (~2%).
  - `h1`–`h3` usam Manrope automaticamente; números usam a classe `num` (Manrope + algarismos de largura fixa).

| Token | Tamanho / altura de linha | Uso |
| --- | --- | --- |
| `text-display` | 34 / 40 | valor de destaque, abertura |
| `text-title-1` | 28 / 34 | título de tela grande |
| `text-title-2` | 22 / 28 | título de seção |
| `text-title-3` | 18 / 24 | título de cartão |
| `text-base` | 16 / 24 | corpo |
| `text-sm` | 14 / 20 | apoio |
| `text-xs` | 12 / 16 | rótulos (maiúsculas com `tracking-wider`) |

Nada abaixo de 12 px. Não use tamanhos avulsos (`text-[13px]`).

## Espaço, forma e elevação

- Espaçamento em múltiplos de 4 px (escala do Tailwind). Margem lateral 16 px no celular.
- Raios: `rounded-lg` 8 (selos), `rounded-xl` 12 (botões, campos), `rounded-2xl` 16 (cartões), `rounded-3xl` 24 (folhas).
- Elevação: cartões de lista sem sombra; sombra só em folhas, avisos e botão flutuante.
- O conteúdo reserva espaço para a barra de navegação e o botão flutuante (nenhum item fica coberto).

## Movimento

- `--ease-standard` para trocas de tela (200 ms) e toques (120 ms); `--ease-emphasized` para folhas (280 ms).
- O "salto" (`animate-pop`) fica só para XP, missão concluída e conquista.
- Barras de progresso: 500 ms. Animar apenas `transform`/`opacity`/largura de barras.
- "Reduzir movimento" do sistema desliga as animações.

## Componentes (etapa 2)

| Componente | Arquivo | Regras |
| --- | --- | --- |
| Botão | `ui/Button.tsx` | `primary` (uma ação principal por contexto), `tonal`, `secondary` (contornado), `ghost`, `danger`, `xp`; alturas 40/48/56 px |
| Valor em dinheiro | `ui/Money.tsx` | receita `+` verde, despesa `−` terracota, saldo com sinal conforme o valor, zero neutro; leitor de tela ouve "mais"/"menos" |
| Status | `ui/Badge.tsx` | ponto colorido + texto (Agendado, Pendente, Concluído, Cancelado) |
| Avatar | `ui/Avatar.tsx` | iniciais com cor estável por nome, em tons discretos |
| Demonstração | `ui/Misc.tsx` (`DemoBadge`) | contorno tracejado violeta, sem preenchimento |
| Avisos | `ui/Toast.tsx` | na base, acima da navegação; até 3 visíveis; toque fecha |
| Controle segmentado | `ui/Misc.tsx` | opções com 40 px de altura |

Cartões de lista (serviços, clientes, lançamentos): título e nomes em até 2–3 linhas, sem reticências
na primeira linha; valores alinhados e sem quebra; ações diretas (WhatsApp) como alvo separado de 44 px.

## Rede de segurança visual

`npm run build && npm run visual` gera capturas em `visual-results/` (360, 412, 820 e 1280 px,
claro e escuro, relógio fixo, dados criados pela interface) e falha com:
transbordo horizontal, erro de JavaScript, violação do axe (WCAG 2.1 AA) e, com `--strict`,
contraste abaixo de 4,5:1; também falha se o botão flutuante cobrir um cartão no fim da lista.
No CI, o job **Capturas visuais e acessibilidade** roda em modo estrito e publica as capturas.
