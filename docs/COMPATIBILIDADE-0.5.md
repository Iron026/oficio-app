# Compatibilidade 0.4.0-beta.4 ↔ 0.5

A partir da **0.4.0-beta.4**, o Ofício preserva os dados que a 0.5 vai gravar, mesmo quando o registro é
editado num aparelho que ainda está na 0.4. Este documento é o contrato entre as duas versões: a 0.5 só pode
usar os campos e marcadores listados aqui sem quebrar um aparelho na beta.4.

## Por que era necessário

A sincronização mescla os registros **campo a campo**. Até a beta.3, salvar um cliente, serviço, lançamento ou
tipo de serviço montava o registro de novo só com os campos conhecidos. Se um aparelho na 0.5 gravasse
`duration` e outro, na beta.3, editasse o mesmo serviço, o campo sumia — e a remoção se espalhava para todos
os aparelhos. Havia ainda dois riscos financeiros:

1. A limpeza de “receita automática duplicada” mantinha **uma** receita por serviço. Com pagamentos parciais
   (várias receitas por serviço), ela apagaria pagamentos reais.
2. Concluir um serviço já pago em parte lançaria o valor cheio de novo (R$ 100 pagos + R$ 300 lançados).

Os testes de `src/sync/compat05.test.ts` falhavam com o código da beta.3 (13 de 17) e passam na beta.4.

## O que a beta.4 garante

| Situação | Comportamento na beta.4 |
| --- | --- |
| Editar cliente, serviço, lançamento ou tipo de serviço | Campos desconhecidos são mantidos (`...existente` antes dos campos do formulário) |
| Preferências da conta | Já eram preservadas (`updateSettings`) |
| Concluir com “Lançar receita” | Lança só o que falta: `preço − pago`. Se já está pago, não lança nada e mostra “Já recebido” |
| Reabrir ou cancelar | Remove apenas a receita automática da própria 0.4 (com a confirmação de sempre). Pagamentos da 0.5 ficam, e a confirmação diz isso |
| Excluir serviço | Idem: pagamentos da 0.5 continuam em Finanças, com aviso antes |
| Limpeza de receitas duplicadas (sincronização) | Ignora pagamentos da 0.5; continua removendo receitas automáticas repetidas da 0.4 |
| Restaurar backup com campos da 0.5 | Mantém os campos; confere o tipo de cada um; arquivo malformado é recusado inteiro, sem alterar nada |
| Backup de versão mais nova do app | Aviso na confirmação. Formato diferente de `1` continua recusado |
| Tipos de serviço na nuvem | `isValidServiceType` e a regra (ainda **não publicada**) aceitam `duration` |
| Dados sem campos da 0.5 | Comportamento idêntico ao da beta.3; nenhum campo novo é gravado pela beta.4 |

## Campos reservados para a 0.5

| Registro | Campo | Tipo | Significado |
| --- | --- | --- | --- |
| Serviço (`appointments`) | `duration` | inteiro 5–1440 ou `null` | Duração em minutos |
| Serviço | `series` | objeto ou `null` | Regra da recorrência (`id`, `freq`, `interval`, `days`, `until`, `count`, `through`) |
| Serviço | `payments` | booleano | Controle de pagamento ativo |
| Lançamento (`transactions`) | `payment` | objeto ou `null` | Marcador de pagamento (ver abaixo) |
| Tipo de serviço | `duration` | inteiro 5–1440 ou `null` | Duração sugerida, editável no agendamento |
| Preferências da conta | `dashboard` | qualquer | Organização do Painel |

## Pagamentos e estornos

- **Pagamento:** `receita` com `appointmentId` do serviço e `payment` não nulo (ex.: `{ "method": "pix" }`).
  Pode haver vários por serviço. Nunca é removido automaticamente.
- **Estorno:** `despesa` com `appointmentId` do serviço e `payment` não nulo (ex.: `{ "kind": "estorno", "of": "<id do pagamento>" }`).
  Desde a beta.2 é uma movimentação própria (fora das despesas operacionais); reduz o saldo uma vez e é
  descontado do pago.
- **Pago** = Σ receitas vinculadas − Σ estornos vinculados (nunca negativo). Receitas automáticas antigas,
  sem marcador, também contam como pagas — os saldos históricos não mudam.
- A 0.5 **não** deve apontar `appointment.transactionId` para um pagamento. Se apontar, a beta.4 trata como
  pagamento (não remove).
- A 0.5 **não** pode criar situações de atendimento novas (`agendado`, `concluido`, `cancelado` continuam as únicas):
  a restauração da beta.4 recusa valores desconhecidos.

## Recorrência e exclusões

A beta.4 não gera ocorrências. Se uma ocorrência for **excluída** num aparelho na 0.4, só fica a exclusão na
sincronização. Por isso o gerador da 0.5 não pode “preencher buracos”: ele só cria datas **depois** do maior
`series.through` já gravado na série. Ocorrência excluída, cancelada ou alterada nunca é recriada.

## O que a 0.5.0-beta.1 implementou (e como conversa com a 0.4)

| Situação | Na 0.5.0-beta.1 |
| --- | --- |
| Pagamento | `payment: { kind: 'pagamento', method?, key? }` em receita vinculada; id `pg-<operação>` (repetir não duplica) |
| Estorno | `payment: { kind: 'estorno', of: <pagamento> }` em despesa vinculada; o pagamento original nunca muda |
| Quitação em dois aparelhos offline | Chave `quitacao:<serviço>:<líquido antes>`; ao sincronizar fica o mais antigo. Parciais (sem chave) nunca são removidos |
| `appointment.payments` | `true` em serviço criado, concluído ou pago na 0.5 |
| `appointment.transactionId` | Não é mais gravado; o que já existe (receita automática da 0.4) conta como pago |
| Reabrir, cancelar, excluir | Nunca apagam pagamentos, estornos **nem a receita automática legada** (diferente da 0.4, que removia esta última) |
| Concluído na 0.4 sem receita | "Pagamento não registrado": nem pago nem pendente, fora do "a receber"; nada é gravado |
| `appointment.duration` | Gravado só quando escolhido; antigos usam 60 min na exibição (até a beta.1; ver abaixo) |
| Regras do Firestore | Sem mudança (lançamentos e serviços não são validados campo a campo) |

## O que a 0.5.0-beta.2 mudou

| Situação | Na 0.5.0-beta.2 |
| --- | --- |
| Duração | Opcional, padrão “Não informar”. Novo sem duração: campo ausente. Apagar a de um existente: `null` (aceito pelo backup, pelas regras e pela 0.4). Edição sem o campo preserva o valor |
| Sem duração | Nada é presumido: só o início é conhecido. Conflito só se esse início cair num intervalo conhecido ou coincidir com outro início sem duração. Antigos sem duração **deixam de usar 60 min** |
| Estornos em Finanças | Movimentação própria (pelo marcador `payment.kind = 'estorno'`): fora de “Despesas” e do “Para onde foi o dinheiro”. Saldo = receitas − estornos − despesas, o mesmo valor da beta.1. Despesa comum com a categoria “Estorno”, sem marcador, continua despesa |
| Registros da beta.1 | Lidos da nova forma sem regravar nada (mesmo marcador); backup e sincronização inalterados |
| Extrato | CSV e PDF com o tipo “Estorno”; o PDF ganha o quadro “Estornos” quando houver |
| Regras do Firestore | Sem mudança |

## O que a 0.5.0-beta.3 mudou

| Situação | Na 0.5.0-beta.3 |
| --- | --- |
| Estornos incoerentes entre aparelhos | Detectados de forma determinística (`domain/refundReview.ts`): Σ estornos de um pagamento > pagamento, ou estorno cujo pagamento não existe. Nada é apagado; o serviço fica “Revisar estornos” e Finanças avisa |
| Decisão da pessoa | “Manter”: `payment.review = { ack: <assinatura do conjunto>, at }` em cada estorno do grupo (um estorno novo ou valor diferente reabre a revisão). “Remover”: exclui o estorno escolhido e anota no pagamento `reviews: [{ at, decision: 'removido', refund }]` (campo próprio do lançamento, fora de `payment`: uma receita da 0.4 continua sendo legado) |
| Limpeza automática de estornos | **Removida.** A chave `estorno:<pagamento>:<estornado antes>` deixou de ser gravada e de ser usada pela sincronização. Só a quitação de pagamentos continua deduplicada, agora com a chave `quitacao:<serviço>:<recebido>:<estornado>` (antes `…:<líquido>`, que colidia depois de um estorno total e removia o segundo recebimento) |
| Aparelho na beta.2 | Continua removendo estornos antigos com a mesma chave (comportamento dela). Estornos da beta.3 não têm chave, então nenhuma versão os remove |
| Regras do Firestore | Sem mudança (os campos novos ficam dentro de `payment` e `series`, que não são validados campo a campo) |
| Recorrência | `appointment.series = { id, freq, interval, days, start, until, count, through, v, auto, detached }`, sem coleção nova. `freq`: `diaria`, `semanal` (quinzenal = semanal a cada 2), `mensal` (29/30/31 → último dia nos meses curtos). Ids `<série>-<aaaammdd>`; geradas com `createdAt = updatedAt = v` (idênticas nos dois aparelhos); horizonte de 90 dias e 120 por série |
| Nada reaparece | O gerador só cria datas depois do maior `through` da série e nunca antes de hoje. Excluir as últimas ocorrências grava o limite na que sobrou. Regra efetiva = maior `v` (sempre crescente) |
| Sincronização de ocorrências | Gerada e intocada (`auto`, não destacada, agendada, `updatedAt = createdAt`) cede à exclusão feita em outro aparelho e não vira conflito quando os dois aparelhos geram o mesmo registro. Depois de sincronizar, as intocadas e sem pagamento que a regra atual não prevê (série encerrada ou mudada em outro aparelho) saem |
| Mudar a regra | Série nova a partir da data escolhida; ocorrências futuras com pagamento passam para ela como exceções e reservam a data (nada em dobro) |
| XP | Só a criação da série dá XP de agendamento; ocorrências geradas não contam na missão semanal |
| Aparelho na beta.2 | Vê as ocorrências como agendamentos comuns e preserva `series`; não gera nada. Uma ocorrência excluída lá não volta (o `through` continua gravado nas outras) |

## O que a 0.5.0-beta.4 mudou

| Situação | Na 0.5.0-beta.4 |
| --- | --- |
| Dados gravados | **Nenhum campo novo** em clientes, serviços ou lançamentos. Relatórios e recibos são calculados na hora a partir dos lançamentos; emitir recibo não grava nada nem dá XP |
| Número do recibo | Derivado do id e da data do lançamento (`REC-<aaaammdd>-<4>`): o mesmo em todos os aparelhos e em cada reemissão |
| Lembretes | Configuração em `DevicePrefs.reminders` (`kv`, por aparelho): fora do backup, da nuvem e da sincronização. Desligados por padrão, inclusive ao atualizar da beta.3. Os avisos agendados ficam só no Android |
| Android | Plugin `@capacitor/local-notifications`; permissão `POST_NOTIFICATIONS` (pedida só ao ligar). `SCHEDULE_EXACT_ALARM` removida do manifesto final. `applicationId` e assinatura inalterados |
| Aparelho na beta.3 | Não vê relatórios, recibos nem lembretes; os dados continuam idênticos |
| Regras do Firestore | Sem mudança |

## O que a 0.5.0-beta.5 mudou

| Situação | Na 0.5.0-beta.5 |
| --- | --- |
| Painel | `settings.dashboard = { v: 1, order: string[], hidden: string[], orderAt?, hiddenAt? }` (preferências da conta, sincronizadas; sem coleção nova, regras sem mudança). Valor antigo ou inválido = padrão; ids e campos desconhecidos preservados. A beta.4 só preserva o campo |
| Mesclagem do Painel | Visibilidade cartão a cartão (vale quem mexeu no cartão; os dois → mais recente); ordem: mudou de um lado → esse lado; dos dois → `orderAt` mais recente. Base sem `dashboard` = padrão |
| Backup: soma | `checksum = { algorithm: "SHA-256", value }` no topo do arquivo. Cobre **todo o arquivo exceto `checksum`** (`format`, `version`, `appVersion`, `exportedAt`, `data`), em JSON canônico (chaves em ordem crescente, sem espaços, arrays na ordem do arquivo, números e textos como `JSON.stringify`), codificado em UTF-8. Verifica integridade, não autoria. Formato continua 1; a beta.4 ignora o campo e importa normalmente |
| Backup sem soma | Arquivos anteriores à beta.5: aceitos depois da validação estrutural, mostrados como “sem verificação de integridade”. Soma presente e diferente, malformada ou de outro algoritmo: arquivo recusado |
| Validação | Além da anterior: ids vazios ou repetidos numa coleção, `time`/`clientId` que não sejam texto, preferências que não sejam objeto e conquistas sem data recusam o arquivo inteiro |
| Restauração com conta | Marcações de envio/exclusão desfeitas se a gravação local falhar; o envio só é agendado depois de gravar |
| Tipos de serviço sugeridos | Id `sugestao-<profissão>-<nome normalizado>` (mesmo formato de id; continuam fora da nuvem até as regras novas) |
| Preferências do aparelho | `agendaView` (visão inicial da Agenda; padrão Lista) e a marca `setup:offer` (configuração inicial pendente), só no aparelho |

## Política de restauração (auditoria pré-RC da 0.5.0)

Preservar os dados compatíveis; recusar o arquivo **inteiro**, antes de qualquer gravação, quando houver risco de
perda silenciosa ou de dados que as telas não conseguem mostrar. Nada é corrigido em silêncio.

| Situação no arquivo | Resultado |
| --- | --- |
| Selo com estrutura inválida, lista que não é lista, selo repetido | Recusado (antes: descartado em silêncio; repetido podia gravar o estágio menor) |
| Selo de versão mais nova (id desconhecido, estrutura válida) | Preservado; as telas mostram só os selos conhecidos |
| Foto inválida ou mais de uma | Recusado (antes: descartada em silêncio) |
| Tipo de serviço inválido, id repetido, mais de 100 | Recusado (antes: descartado em silêncio); campos extras de versões futuras são preservados |
| Lançamento sem `category`/`description` (texto desde a v0.1) | Recusado (antes: aceito; Finanças e Relatórios quebravam) |
| Cliente sem `phone`/`email`/`address`/`notes` em texto; atendimento sem `notes`; `completedAt`/`transactionId` sem texto; metas do perfil sem número | Recusado (antes: aceito; Painel, Agenda e Clientes quebravam) |
| Estorno sem `of` (ou `of` que não é texto), estorno como receita, pagamento como despesa, `kind` desconhecido ou de outro tipo, `method`/`key`/`review` com tipo errado, `reviews` que não é lista | Recusado (antes: aceito; o estorno sem referência reduzia o saldo sem ir para a revisão) |
| Estorno de um pagamento que não existe no arquivo | Aceito e marcado para revisão (“sem pagamento”), como desde a beta.3 |
| Marcador sem `kind` numa receita vinculada | Aceito como pagamento (contrato da 0.4.0-beta.4) |
| Regra de recorrência incompleta (sem `id`, `freq` conhecida, `start`, `through`), `interval`/`count` < 1, `days` fora de 0–6, `until` inválido | Recusado (antes: aceito; a série deixava de existir em silêncio) |

## Riscos que continuam

- **Aparelho ainda na beta.3 ou anterior.** Ele não tem estas proteções. Antes de usar a 0.5, todos os
  aparelhos da conta precisam estar na beta.4 ou mais nova. A 0.5 vai lembrar isso ao ativar pagamentos.
- **Concluir na beta.4 com “Lançar receita” marcado** lança o que falta como recebido (comportamento da 0.4).
  Na 0.5 a conclusão exige escolher explicitamente quanto foi recebido.
- **Serviço excluído na beta.4** deixa os pagamentos com `appointmentId` de um serviço que não existe mais. A 0.5
  mostra esses lançamentos como receitas avulsas (“serviço excluído”); nenhum valor se perde.
