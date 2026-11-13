# Auditoria final pré-RC — Ofício 0.5.0

Ponto de partida: `0.5.0-beta.5` (`431ef22`), aprovada no Galaxy S26. Branch: `feat/v0.5-gestao`.
Nenhuma RC foi criada; nada foi para a `main`; regras de produção do Firebase não foram alteradas.

Método por problema: cenário de reprodução → teste que falha → menor correção segura → regressão completa
(`npm run check`) → revisão independente → causa e solução registradas aqui. O que não foi reproduzido aparece
como hipótese ou melhoria opcional, nunca como defeito.

## Resumo

| # | Área | Problema | Severidade | Situação |
|---|------|----------|-----------|----------|
| A1 | Backup | Arquivos malformados aceitos com perda silenciosa (selos, foto, tipos de serviço filtrados sem aviso) | Alta | Corrigido (`de1b34d`) |
| A2 | Backup | Arquivos aceitos que deixavam telas em branco (cliente sem telefone, lançamento sem descrição/categoria) | Alta | Corrigido (`de1b34d`) |
| F1 | Finanças/sincronização | Lançamento financeiro excluído num aparelho voltava sem aviso quando outro aparelho o editava offline | Média | Corrigido (`4654f1e`) |
| S1 | Dados pessoais | Backup completo e PDFs compartilhados ficavam no cache do app para sempre, mesmo após "Apagar todos os dados" | Média | Corrigido (`4835316`) |
| S2 | Estabilidade | Sem limite de erro: qualquer falha ao desenhar uma tela deixava o app em branco, sem navegação | Média | Corrigido (`4835316`) |
| P1 | Desempenho | "A receber" e relatório do mês quadráticos (9 s com 10 anos de dados) | Média | Corrigido (`6dcbfee`) |
| P2 | Desempenho/sincronização | Gravações em lote regravavam o estado da sincronização uma vez por registro | Média | Corrigido (`6dcbfee`) |
| P3 | Desempenho/sincronização | Envio inicial quadrático (149 s com 63 mil registros) | Média | Corrigido (`6dcbfee`) |
| P4 | Sincronização | "Usar dados da nuvem" estourava a pilha acima de ~150 mil registros | Baixa | Corrigido (`6dcbfee`) |
| P5 | Desempenho/Agenda | Cartões reagrupavam todas as séries e recalculavam pagamentos sobre todos os lançamentos; visão Mês percorria os atendimentos 42 vezes | Média | Corrigido (`6dcbfee`) |
| P6 | Desempenho/Finanças | Vínculo de cada linha conferido por busca linear em todos os atendimentos | Baixa | Corrigido (`6dcbfee`) |

## Problemas confirmados

### A1 — Backup: perda silenciosa ao restaurar

- **Evidência:** `src/storage/backupAudit.test.ts` (40 casos), com 36 falhas antes da correção. A sondagem mostrou
  todos os casos malformados aceitos. Selos, foto e tipos de serviço inválidos ou repetidos eram descartados sem
  aviso. Com um selo repetido, podia sobrar o estágio menor.
- **Impacto:** a pessoa restaura um arquivo, vê "restaurado" e perde conquistas, a foto ou tipos de serviço.
- **Causa:** `checkIntegrity` filtrava coleções opcionais em vez de recusar, e não validava o formato de campos que
  as telas assumem.
- **Correção:** o arquivo inteiro é recusado (`BackupError` `estrutura`, mensagem com coleção e item) quando
  houver:
  - item inválido;
  - id repetido;
  - itens acima do limite em `sealAwards`, `profileImages` ou `serviceTypes`;
  - marcador de pagamento ou estorno com tipos errados;
  - regra de recorrência estruturalmente inválida;
  - textos obrigatórios ausentes ou de outro tipo.

  Continuam aceitos:
  - backups antigos válidos, conferidos no histórico do formato desde a v0.1;
  - marcador sem `kind` numa receita vinculada (contrato da 0.4.0-beta.4);
  - estorno de pagamento que não existe mais (vai para revisão);
  - campos e ids desconhecidos de versões mais novas, que são preservados.

  Política completa em `COMPATIBILIDADE-0.5.md`.
- **Testes:** `backupAudit.test.ts`, `restoredData.ui.test.tsx` (casos aceitos abrem as 8 telas sem erro) e testes
  antigos de compatibilidade atualizados para a nova política.
- **Risco residual:** arquivos editados à mão de forma "válida mas sem sentido" (ex.: XP negativo, `isDemo` em
  texto) continuam aceitos; as telas os toleram (verificado).

### A2 — Backup: telas em branco depois de restaurar

- **Evidência:** a sondagem de interface reproduziu três quedas:
  - cliente sem telefone, ou com telefone numérico: `phone.replace` quebra em Painel, Agenda e Clientes;
  - lançamento sem descrição: `trim` quebra em Finanças;
  - lançamento sem categoria: chaves duplicadas em Finanças e Relatórios.
- **Correção:** os mesmos arquivos agora são recusados antes de qualquer gravação (A1). O app também ganhou um
  limite de erro por tela (S2).
- **Testes:** `restoredData.ui.test.tsx`, `backupAudit.test.ts`.

### F1 — Lançamento financeiro excluído reaparecia sem aviso

- **Cenário:** A remove um estorno na revisão. Ao mesmo tempo, B (offline) mexe no mesmo estorno, com "Manter".
  Ao sincronizar, a alteração de B vence a exclusão (regra existente: dinheiro não some), mas A via o estorno
  voltar sem nenhum aviso.
- **Evidência:** `src/sync/financialAudit.test.ts`, 4º cenário.
- **Correção:** em `applyRemote`, um registro financeiro que este aparelho excluiu e que volta alterado da nuvem gera
  o conflito `excluido_aqui`, que aparece na tela Sincronização. É a mesma sinalização que o outro aparelho já
  recebia.
- **Testes:** `financialAudit.test.ts` (4 cenários). Os totais de Finanças, Painel, Relatórios, extrato, recibos e
  histórico do cliente batem nos dois aparelhos depois de:
  - restauração durante edição offline;
  - quitação dupla;
  - estornos e exclusão concorrentes;
  - revisão concorrente.

### S1 — Arquivos compartilhados esquecidos no cache

- **Cenário:** compartilhar um backup completo ou um recibo ou extrato grava o arquivo no cache do app. Nada o
  apagava, nem "Apagar todos os dados".
- **Evidência:** `src/platform/sharedFiles.test.ts` (falhava: `['writeFile','share']` sem limpeza).
- **Correção:** os arquivos vão para `cache/compartilhar`. Essa pasta é limpa antes de cada compartilhamento, ao
  abrir o app (Android) e ao apagar os dados. Não dá para apagar logo depois de compartilhar, porque o app escolhido
  pode ler o arquivo mais tarde.
- **Risco residual:** o último arquivo compartilhado fica no cache privado do app até a próxima abertura ou o
  próximo compartilhamento.

### S2 — Tela em branco em qualquer falha de desenho

- **Evidência:** `src/screens/screenBoundary.ui.test.tsx`. Uma tela que lança erro deixava o app sem nada.
- **Correção:** `ScreenBoundary` envolve só o conteúdo da tela, com chave por página. Mostra "Não foi possível abrir
  esta tela." e mantém cabeçalho e navegação. Trocar de tela tenta de novo. Os dados não são tocados.
- **Risco residual:** falhas no próprio cabeçalho ou na barra de navegação não são cobertas.

### P1 a P6 — Desempenho com volumes crescentes

Medição (`src/perf/volume.perf.test.tsx`, roda com `OFICIO_PERF=1`; jsdom + fake-indexeddb, valores relativos):

| Uso simulado | Clientes | Atendimentos | Lançamentos | Séries |
|---|---|---|---|---|
| 1 ano | 300 | 3.000 | 3.000 | 40 |
| 5 anos | 1.500 | 15.000 | 15.000 | 150 |
| 10 anos | 3.000 | 30.000 | 30.000 | 300 |

| Medida (ms) | 1 ano antes → depois | 5 anos antes → depois | 10 anos antes → depois |
|---|---|---|---|
| A receber (Painel/Finanças) | 35 → 3,5 | 2.009 → 8 | 8.614 → 19 |
| Relatório do mês | 44 → 5 | 2.238 → 18 | 9.026 → 54 |
| Agenda visão Mês (agrupamento) | 90 → 3,4 | 433 → 14 | 1.002 → 27 |
| Agenda visão Semana | 17 → 3,5 | 73 → 14 | 150 → 28 |
| Sincronização: envio inicial | 1.611 → 353 | 35.574 → 1.940 | 148.699 → 4.156 |
| Sincronização: baixar tudo | 476 → 298 | 4.547 → 1.660 | 17.469 → 3.849 |
| Sincronização: 1 alteração | 945 → 361 | 5.374 → 2.266 | 12.834 → 5.349 |
| Abrir Painel (jsdom) | 411 → 341 | 2.705 → 809 | 10.549 → 1.244 |
| Abrir Agenda, lista (jsdom) | 1.435 → 1.255 | 8.054 → 3.645 | 26.260 → 7.601 |
| Abrir Finanças (jsdom) | 629 → 568 | 6.109 → 2.567 | 13.773 → 4.963 |
| Abrir Relatórios (jsdom) | 162 → 137 | 2.684 → 519 | 10.125 → 1.194 |

Sem mudança e já lineares:

| Medida | 10 anos |
|---|---|
| Carregar os dados ao abrir | 270 ms |
| Busca global | ~100 ms |
| Planejar lembretes | 7 ms |
| Exportar backup | 1,2 s (18 MB) |
| Restaurar backup | 3,2 s |
| Memória dos dados | ~106 MB |

Causas e correções, todas com o mesmo resultado anterior:

- **P1** — cada atendimento percorria todos os lançamentos. Agora os lançamentos são agrupados por atendimento uma
  vez (`byAppointment`). Teste: `src/domain/volume.test.ts`.
- **P2** — `TrackedStorage.putMany` marcava um registro por vez, e cada marcação regravava o estado inteiro (que
  guarda a base de todos os registros). Isso afetava as ocorrências de séries geradas ao abrir o app e os serviços
  de um cliente excluído.
  - Agora `touchMany` marca todos e grava uma vez, e `materialize` usa `putMany`.
  - Teste: `src/sync/volume.test.ts`. Antes eram 120 e 61 gravações; agora, 1.
- **P3** — o estado inteiro era regravado após cada lote de 100 (95% do tempo), e cada registro era buscado
  linearmente.
  - Agora há um índice por id, e as gravações intermediárias acontecem no máximo ~1 vez por segundo, sempre no
    último lote.
  - Se o app fechar entre gravações, os lotes já aceitos são reenviados e reconhecidos como iguais.
  - Teste: `interruption.test.ts`, "app fechado no meio de um envio grande", completa sem duplicar nem gerar
    conflito.
- **P4** — `Math.max(0, ...registros)` foi trocado por `reduce`. Teste com 200 mil registros.
- **P5** — dois cálculos foram memorizados pela identidade da lista (as listas do estado nunca são alteradas no
  lugar):
  - `seriesGroupsOf`, que também elimina uma cópia quadrática dentro de cada série;
  - `paymentSummaryIn`.

  `byDay` passou a fazer uma única passada. Há um teste de equivalência aleatório contra a implementação anterior,
  cobrindo meia-noite, atendimentos sem horário ou sem duração e durações longas.
- **P6** — o conjunto de ids dos atendimentos é memorizado em Finanças.

## Revisão independente

Revisão do diff `431ef22..HEAD` por um revisor separado, que leu o código sem executá-lo. Cada achado foi
reproduzido com um teste antes de ser corrigido.

| # | Achado | Verificação | Resultado |
|---|--------|-------------|-----------|
| R1 | Backup sem as metas do perfil era aceito, embora a política dissesse "recusado". A meta virava NaN ("undefined por semana") | As metas são gravadas desde a v0.1 (`c183f02`). 2 casos novos em `backupAudit.test.ts` falhavam | Corrigido: metas obrigatórias e numéricas |
| R2 | Aviso "Excluído neste aparelho" aparecia também no aparelho que só recebeu a exclusão de outro | Cenário novo em `financialAudit.test.ts`: B mostrava conflito falso | Corrigido: o estado guarda `deletedHere` só quando a exclusão deste aparelho é confirmada na nuvem |
| R3 | Queda no meio de um envio grande deixava o disco atrás da memória (progresso dos lotes aceitos só em memória) | Teste novo em `interruption.test.ts`: 360 pendências no disco contra 60 em memória | Corrigido: o progresso é gravado também no caminho de falha |
| R4 | Foto de backup antigo recusada pela validação mais estrita? | `isValidProfileImage` é a mesma desde a v0.4, e o app recusa salvar foto que não passe nela | Sem problema |

O revisor também conferiu, sem achados:
- compatibilidade dos backups antigos;
- equivalência de `byDay`;
- caches por identidade (nenhuma lista do estado é alterada no lugar);
- `touchMany` e `putMany`;
- limpeza do cache restrita a `cache/compartilhar`;
- limite de erro por tela;
- cadeia Android.

## Verificado sem problema

- **Isolamento de contas:**
  - a sincronização só roda quando o usuário autenticado é a conta associada;
  - outra conta é recusada (teste de interface);
  - as regras do Firestore isolam por `uid`.
- **Firestore Emulator:** 30/30 testes de regras (local e CI). Regras de produção sem alteração.
- **Sincronização interrompida** (`src/sync/interruption.test.ts`, 4 cenários): nada duplica, nada some, nenhum
  conflito falso. Os cenários:
  - resposta perdida depois de a nuvem gravar;
  - queda entre lotes;
  - app reaberto com pendências;
  - app fechado no meio do envio.
- **Restauração atômica:** a garantia da beta.5 continua valendo (pushes suspensos e desfazer se o estado não
  gravar).
- **Notificações:** detalhes ocultos por padrão ("Toque para ver os detalhes no Ofício."), sem alarme exato.
- **Logs:** nenhum dado pessoal em `console` (só objetos de erro).
- **Validação de arquivos:** backup com SHA-256 e checagem estrutural (A1). A foto passa por validação de tipo e
  tamanho.
- **Interface:** suíte visual em modo estrito, sem erros de JavaScript, sem barra horizontal e sem violação axe
  WCAG 2.1 AA, cobrindo:
  - 320, 360, 412 px, tablet e computador;
  - temas claro e escuro;
  - 8 paletas.

## Riscos residuais (não bloqueiam a RC)

1. **Dependências (`npm audit`):**
   - 5 altas em `@grpc/grpc-js` < 1.13.6, trazidas por `@firebase/firestore` 4.17.2. Os avisos são de servidor, e
     o pacote não entra no app: o Firestore do navegador usa WebChannel.
   - 16 moderadas em ferramentas de desenvolvimento.
   - Forçar outra versão arrisca quebrar os testes do emulador. Recomendação: atualizar o Firebase quando sair uma
     versão com a dependência corrigida.
2. **Estado da sincronização gravado inteiro a cada alteração:** 0,36 s por alteração com 1 ano e 5,3 s com 10 anos
   no simulador (em segundo plano, sem travar a tela). A solução é guardar o estado por registro, uma mudança de
   arquitetura que não cabe numa RC. Recomendado para a 0.6.
3. **Lista da Agenda desenha todos os atendimentos em aberto** (sem paginação): 1,3 s com 1 ano e 7,6 s com 10 anos
   no jsdom. Recomendado para a 0.6: paginação ou janela de rolagem.
4. **Números de jsdom não são números do aparelho.** Recomenda-se conferir no S26 com um backup grande.
5. PDFs e backups contêm dados pessoais por natureza. Só saem por ação da pessoa e agora não ficam no cache (S1).

## Testes executados

Antes de cada commit, `npm run check` (typecheck, lint, testes e build). Situação atual:

| Verificação | Resultado |
|---|---|
| Testes unitários e de interface | 1.294, 99 arquivos |
| Firestore Emulator | 30/30 |
| Visual e acessibilidade em modo estrito | Ver CI |
| Android | Cadeia de atualização 0.4.0-beta.7 → 0.5.0-beta.5 aprovada (run 43274062889, mesma assinatura) → versão auditada, com notificações reais |
