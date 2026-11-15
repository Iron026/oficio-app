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
- **A nova checagem encontrou mais dois casos** (CI 43738699572, 32 falhas):
  - a Evolução também passava 9 px do grupo a 360 px, a largura do S26;
  - o seletor "6 meses / 12 meses" de Relatórios passava 9 px da caixa fixa de 176 px em todas as larguras.
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
  - abaixo de 400 px, só o espaçamento lateral diminui (8 → 6 px). No S26 (360 px) as abas cabem sem mudar o
    tamanho da fonte;
  - em Relatórios, a caixa do seletor passou de largura fixa (`w-44`) para largura mínima (`min-w-44`);
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
- **Reprodução no Android:** run 43738699587, com o código anterior à correção. A etapa de 1,5 MB falhou com
  "o app foi encerrado com a janela 'Salvar como' aberta (processo 9806 → nenhum)". No logcat:
  `FATAL EXCEPTION: main … java.lang.RuntimeException: android.os.TransactionTooLargeException: data parcel size
  6006428 bytes`.
  - O conteúdo entra duas vezes e em UTF-16, então o estado fica com cerca de 4 vezes o tamanho do arquivo.
  - Por essa proporção, exportações a partir de ~250 KB (alguns meses de uso) já passam do limite.
- **Testes:**
  - etapa Android que exporta 1,5 MB e confere que o processo continua o mesmo e o arquivo chega inteiro;
  - etapa em que o Android encerra o processo do app com a janela aberta (`am kill`, como acontece com pouca
    memória) e o recria ao voltar: o arquivo de 300 KB ainda é gravado, em outro processo, e o temporário é apagado.
    Uma primeira versão usava "Não manter atividades" (`always_finish_activities`), mas no Android 15 do emulador
    a tela não chegava a ser destruída (sem "App destroyed" no logcat). A etapa foi trocada para não dar falsa
    garantia;
  - teste estático do plugin, que falhava com o código anterior.
- **Correção (`BackupFilePlugin.java`):**
  - antes de abrir a janela, o conteúdo vai para um arquivo privado em `cache/exportacao-pendente` (fora do
    FileProvider), e a chamada guarda só o caminho;
  - a gravação lê desse arquivo, que é apagado ao concluir, cancelar ou falhar;
  - se o arquivo preparado não existir, o documento vazio criado pela janela é removido;
  - se o Android recriar o app e entregar o resultado sem a chamada restaurada, o plugin usa o único arquivo
    preparado da pasta temporária, em vez de deixar um documento vazio.
- **Observação:** em compilações de depuração, o Capacitor registra no logcat os parâmetros de cada chamada,
  inclusive o conteúdo exportado. Em compilações de produção esse registro fica desligado (`loggingBehavior` padrão
  `debug`).

## Evidências finais (commit `44c9842`)

### CI 43752964009

| Verificação | Resultado |
|---|---|
| `check` | Aprovado: typecheck, lint, 1.297 testes e build |
| Regras e sincronização no Firestore Emulator | Aprovado. Regras de produção inalteradas |
| Varredura visual e de acessibilidade, modo estrito | Aprovado, sem falhas e sem violação axe WCAG 2.1 AA |

A varredura cobriu 320, 360 e 412 px, tablet e computador, temas claro e escuro e as 8 paletas. Ela inclui a nova
checagem de controles segmentados, que falhava em 32 capturas no CI 43738699572.

### Android 43752963985 (emulador API 35): 29/29 etapas

**Cadeia de atualização**, sem perda de dados:

| Salto | Clientes | Atendimentos | Lançamentos |
|---|---|---|---|
| 0.4.0-beta.7 → 0.5.0-beta.5 | 1 | 1 | 1 |
| 0.5.0-beta.5 → atual | 1 | 3 | 2 |

O lembrete agendado na beta.5 chegou depois da atualização.

**Exportação (E4):**

| Cenário | Resultado |
|---|---|
| 1,5 MB | 1.500.012 bytes, mesmo processo. Antes da correção: app encerrado, `TransactionTooLargeException` (run 43738699587) |
| Android encerra o app com a janela aberta | 300.012 bytes gravados depois de recriar o app (processo 10237 → 11804) e temporário apagado |

**Compartilhamento (E2):** com o FileProvider restrito, o menu `com.android.intentresolver` abriu e o arquivo estava
em `cache/compartilhar`, sem erro de caminho.

**Demais etapas:**
- backup salvo, cancelado, alterado (recusado) e restaurado;
- extrato e recibo em PDF;
- lembretes reais com o app aberto, em segundo plano e fechado.

### Rodadas que falharam no caminho

As falhas abaixo foram todas do próprio teste novo; os registros ficam aqui como evidência.

| Run | O que aconteceu | Ajuste |
|---|---|---|
| 43744240008 | "Não manter atividades" não destruía a tela no Android 15 | Etapa trocada para o encerramento do processo |
| 43741610977 | Aspas perdidas no `adb` | Comando num único texto |
| 43747095697 | Tamanho conferido com o app ainda abrindo | Espera pela gravação |
| 43750095043 | Processo novo conferido cedo demais | Espera pelo processo |

Também entrou uma salvaguarda no plugin: se o resultado chegar sem a chamada restaurada, grava o arquivo preparado.
O teste não distingue qual dos dois caminhos gravou o arquivo no run final; o resultado esperado foi conferido.

## Avaliação de prontidão para a 0.5.0-rc.1

**Pronta para a RC.1, com uma ressalva de validação no aparelho.**

**Por que está pronta:**
- todos os defeitos desta etapa foram reproduzidos, corrigidos com teste de regressão e validados no CI e no
  emulador;
- o defeito mais grave, a perda da exportação de backups a partir de ~250 KB, foi reproduzido com o código anterior
  e não ocorre mais;
- não houve nova funcionalidade nem mudança de identidade. A única alteração visual é o controle segmentado mais
  compacto abaixo de 400 px (espaçamento) e de 360 px (fonte).

**Ressalvas:**
1. Confirmar no S26:
   - exportar um backup real de tamanho grande pela janela "Salvar como";
   - compartilhar um recibo ou extrato (FileProvider restrito);
   - conferir as abas da Evolução.
2. Continuam valendo as ressalvas de desempenho em uso muito longo e de dependências (`AUDITORIA-0.5.md`).
3. A regra `button { font: inherit }` foi mantida de propósito, para não mudar o tamanho de todos os botões
   aprovados.
