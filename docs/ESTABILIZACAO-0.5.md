# Estabilização final — Ofício 0.5.0

Base: código auditado em `a0f6486` (`feat/v0.5-gestao`). Sem novas funcionalidades e sem mudança de identidade
visual. Sem merge na `main`, sem release, regras do Firebase inalteradas e RC.1 não criada.

Método: cada defeito foi reproduzido, ganhou um teste que falhava, recebeu a menor correção segura e passou pela
regressão completa.

## Resumo

| # | Item | Situação | Gravidade |
|---|------|----------|-----------|
| E1 | Abas da Evolução transbordam em 320 px | Confirmado e corrigido | Média (visual) |
| E2 | FileProvider expunha todo o armazenamento compartilhado e todo o cache | Confirmado e restringido | Média (segurança) |
| E3 | Avisos "Error injecting safe area CSS" no logcat | Investigado: origem no Capacitor, inofensivo. Dependência de tempo no app corrigida | Baixa |
| E4 | Exportação perdida quando a tela do app muda de estado com a janela "Salvar como" aberta | Confirmado e corrigido | Alta (perda da exportação) |

## E1 — Abas da Evolução em 320 px

- **Reprodução:** varredura visual a 320 px. A aba "Histórico" saía 37 px do grupo e ficava cortada na borda da
  tela, nos dois temas.
- **Teste:** a varredura (`e2e/visual.mjs`, no CI com `--strict`) passou a falhar quando, em qualquer controle
  segmentado ou lista de abas:
  - um botão sai do grupo;
  - um rótulo fica cortado;
  - o grupo precisa rolar.

  Antes da correção: 8 falhas, todas na Evolução. Depois: 0.
- **Causa:** quatro rótulos com espaçamento fixo não cabem em 280 px. Além disso, desde a v0.1 a regra
  `button { font: inherit }` fica fora de camada e vence os utilitários do Tailwind v4. O `text-sm` dos botões não
  vale, e eles herdam 16 px do grupo.
- **Correção (`src/ui/Misc.tsx`, `Segmented`):**
  - abaixo de 360 px, o grupo usa 13 px e os botões, espaçamento lateral de 6 px;
  - o tamanho fica no grupo, porque os botões herdam a fonte;
  - se ainda não couber (fonte ampliada do Android), o grupo rola por dentro em vez de vazar.

  De 360 px para cima nada muda.
- **Observação:** a regra `font: inherit` não foi alterada. Corrigi-la mudaria o tamanho de todos os botões do app
  em relação ao que foi aprovado no S26.

## E2 — Escopo do FileProvider

- **Antes:** `external-path "."`, todo o armazenamento compartilhado, e `cache-path "."`, todo o cache do app.
- **Quem usa o FileProvider:**
  - o plugin de compartilhar, com arquivos em `cache/compartilhar`;
  - a captura de foto do Capacitor (`<input capture>`, que grava em `getExternalFilesDir(Pictures)`). Hoje o app
    não usa essa captura; a entrada foi mantida restrita à pasta do próprio app.
- **Depois:** `cache-path compartilhar/` e `external-files-path Pictures/`. O provedor continua não exportado, com
  permissão concedida só por arquivo.
- **Testes:**
  - `android-manifest.test.ts` falhava com o escopo antigo;
  - nova etapa Android "Compartilhar extrato em PDF": o menu do Android abre, o arquivo está em
    `cache/compartilhar` e não há erro de caminho não configurado no logcat.

## E3 — Avisos de área segura no logcat

- **Evidência:** `E/Capacitor/Console: Error injecting safe area CSS: TypeError: Cannot read properties of null
  (reading 'style')`.
  - Aparece em 2 de 8 aberturas a frio, sempre logo após o pedido de `https://localhost/`.
  - Logcat do run Android 43458051692.
- **Causa:** `SystemBars.java` do Capacitor 8 tenta gravar `--safe-area-inset-*` antes de a página existir.
  Depois de `onPageCommitVisible`, o próprio Capacitor pede os insets de novo e grava os valores certos. O erro é
  inofensivo e está no código do Capacitor, que não foi modificado.
- **Problema real no app:** a cor dos ícones da barra de status depende desse valor, e o app só reavaliava uma vez,
  600 ms depois de montar. Uma injeção mais tarde era ignorada.
- **Teste:** `src/state/safeArea.test.tsx` simula a injeção tardia; falhava antes.
- **Correção (`useThemeEffect`):** observa o atributo `style` do elemento raiz e reavalia quando o valor injetado
  muda.

## E4 — Exportação durante mudanças de estado

- **Causa:** ao abrir a janela "Salvar como", a tela do app para e o Android guarda o estado dela. O Capacitor
  guarda ali, duas vezes, todos os parâmetros da chamada, inclusive o conteúdo do arquivo.
  - Um backup de cerca de 1 ano de uso tem ~1,9 MB.
  - O limite do Android para esse estado é ~1 MB (TransactionTooLargeException).
  - Resultado: o app é encerrado com a janela aberta, e a exportação se perde.
  - Arquivos pequenos (os do teste Android até aqui) não chegavam ao limite.
- **Testes:**
  - etapa Android que exporta 1,5 MB e confere que o processo continua o mesmo e o arquivo chega inteiro;
  - etapa com "Não manter atividades": o Android destrói a tela quando a janela abre, e o arquivo de 300 KB ainda
    é gravado e o temporário apagado;
  - teste estático do plugin, que falhava com o código anterior.
- **Correção (`BackupFilePlugin.java`):**
  - antes de abrir a janela, o conteúdo vai para um arquivo privado em `cache/exportacao-pendente` (fora do
    FileProvider), e a chamada guarda só o caminho;
  - a gravação lê desse arquivo, que é apagado ao concluir, cancelar ou falhar;
  - se o arquivo preparado não existir, o documento vazio criado pela janela é removido.
- **Observação:** em compilações de depuração, o Capacitor registra no logcat os parâmetros de cada chamada,
  inclusive o conteúdo exportado. Em compilações de produção esse registro fica desligado (`loggingBehavior` padrão
  `debug`).
