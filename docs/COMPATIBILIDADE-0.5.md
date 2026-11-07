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
  Reduz o saldo como qualquer despesa e é descontado do pago.
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
| `appointment.duration` | Gravado só quando escolhido; antigos usam 60 min na exibição |
| Regras do Firestore | Sem mudança (lançamentos e serviços não são validados campo a campo) |

## Riscos que continuam

- **Aparelho ainda na beta.3 ou anterior.** Ele não tem estas proteções. Antes de usar a 0.5, todos os
  aparelhos da conta precisam estar na beta.4 ou mais nova. A 0.5 vai lembrar isso ao ativar pagamentos.
- **Concluir na beta.4 com “Lançar receita” marcado** lança o que falta como recebido (comportamento da 0.4).
  Na 0.5 a conclusão exige escolher explicitamente quanto foi recebido.
- **Serviço excluído na beta.4** deixa os pagamentos com `appointmentId` de um serviço que não existe mais. A 0.5
  mostra esses lançamentos como receitas avulsas (“serviço excluído”); nenhum valor se perde.
