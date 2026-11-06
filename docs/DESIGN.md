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
- "Reduzir movimento" do sistema desliga as animações; Ajustes › Acessibilidade › Animações › Reduzir também.
- 0.4: `press`/`press-soft` (100 ms) no toque; `animate-screen` na troca de tela e de aba; `enter-stagger` em listas;
  `bar-fill`/`bar-rise` animam por `transform` com `@starting-style`; `animate-celebrate` só na transição para concluído;
  halo + moldura (`animate-halo`/`animate-frame`) uma vez quando a categoria muda.

## Identidade 0.4

- Topo petróleo fixo (`hero`, `--hero-1/2`) em todas as telas, com área de conteúdo sobreposta (`HeroSlot overlap`).
- Cor de destaque da conta (`data-accent`: petróleo, oceano, índigo, grafite) muda só a marca; receita, despesa e XP não mudam.
- Molduras por categoria (Inicial ○, Bronze ◆, Prata ◆◆, Ouro ◆◆◆, Platina ◆◆◆◆, Diamante ◈): símbolo + nome, nunca só cor.
- Selos: medalhão hexagonal petróleo; estágio no acabamento (I aro, II aro duplo, III marcas, IV filete dourado) e em losangos.

## Componentes (etapa 2)

| Componente | Arquivo | Regras |
| --- | --- | --- |
| Botão | `ui/Button.tsx` | `primary` (uma ação principal por contexto), `tonal`, `secondary` (contornado), `ghost`, `danger`, `xp`; alturas 40/48/56 px |
| Valor em dinheiro | `ui/Money.tsx` | receita `+` verde, despesa `−` terracota, saldo com sinal conforme o valor, zero neutro; leitor de tela ouve "mais"/"menos" |
| Status | `ui/Badge.tsx` | ponto colorido + texto (Agendado, Pendente, Concluído, Cancelado) |
| Avatar | `ui/Avatar.tsx` | iniciais com cor estável por nome, em tons discretos |
| Demonstração | `ui/Misc.tsx` (`DemoBadge`) | contorno tracejado violeta, sem preenchimento |
| Avisos | `ui/Toast.tsx` | na base, acima da navegação; até 2 visíveis; só o botão de ação recebe toques |
| Controle segmentado | `ui/Misc.tsx` | opções com 40 px de altura |

Cartões de lista (serviços, clientes, lançamentos): título e nomes em até 2–3 linhas, sem reticências
na primeira linha; valores alinhados e sem quebra; ações diretas (WhatsApp) como alvo separado de 44 px.

## Rede de segurança visual

`npm run build && npm run visual` gera capturas em `visual-results/` (360, 412, 820 e 1280 px,
claro e escuro, relógio fixo, dados criados pela interface) e falha com:
transbordo horizontal, erro de JavaScript, violação do axe (WCAG 2.1 AA) e, com `--strict`,
contraste abaixo de 4,5:1; também falha se o botão flutuante cobrir um cartão no fim da lista.
No CI, o job **Capturas visuais e acessibilidade** roda em modo estrito e publica as capturas.

## Identidade (0.4.0-beta.5, aprovada)

- **Logomarca — opção A, "Arco refinado":** squircle, arco com traço 5 e ponto dourado assentado
  entre as pernas. Geometria única em `src/ui/brand.ts`; favicon (`public/icon.svg`) e ícones do
  Android (`mipmap-*`) gerados por `scripts/icone-app.mjs` (`src/ui/brand.test.ts` confere).
- **Conquistas:** medalhas redondas com desenho próprio por conquista (`src/ui/medals.tsx`).
  Bloqueada mostra o mesmo desenho apagado, com cadeado.
- **Selos:** hexágono de cantos arredondados, verde-petróleo fixo. Estágio em três sinais ao mesmo
  tempo: 1 a 4 pontos acesos na base, aro interno a partir do II e aro/pontos dourados no IV. Em
  40 px ou menos o desenho encolhe e os pontos crescem (legível em 32 px). Para o TalkBack, o texto
  ao lado diz "Estágio III de IV"; sozinho, o medalhão aceita `label`.
- **Não mudam:** navegação inferior, círculos de receita e despesa e demais ícones da 0.4.
- **Avisos (beta.5 a 7):** no máximo dois; não capturam toques, só o botão "Desfazer" (44 px, nome
  "Desfazer: <ação>", 8 s, tempo pausa com foco). Novidades de gamificação num único aviso. O aviso
  com "Desfazer" vale só na tela da ação e sai ao trocar de tela; um novo "Desfazer" substitui o
  anterior (só a última ação pode ser desfeita). Têm "Desfazer": concluir, reabrir, cancelar,
  lançar receita, excluir lançamento, excluir cliente e excluir serviço/atendimento.
- **Cabeçalho (beta.7):** a área abaixo da barra fixa continua a barra sem emenda (começa em
  `--hero-1`), desce em oklab só até a metade do caminho para `--hero-2`, não se repete e tem a base
  arredondada (1,75rem). A beta.5/6 deslocava o fundo 3,5rem e ele se repetia, o que criava uma
  faixa clara com borda dura no fim do cabeçalho.
- **Telas de escolha (beta.7):** imagem de perfil e selo em destaque aplicam a escolha na hora e
  continuam abertas, com prévia, "Atualizado" (anunciado ao TalkBack) e o botão "Concluído".
- **Ocultar valores (beta.7):** botão de olho no cabeçalho do Painel e de Finanças; mesma preferência
  de Ajustes › Privacidade, só no aparelho.
- **Tela de abertura (beta.6):** Android 12+ mostra o símbolo da logo A (`drawable/splash_logo.xml`)
  sobre o petróleo `#0F7B71`; Android 11 e anteriores usam `drawable*/splash.png`, gerados por
  `scripts/icone-app.mjs` com o símbolo e o nome.
