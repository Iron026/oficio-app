# Plano técnico — 0.5.0-beta.1

Base: commit `18fd752` (0.4.0-beta.7, aprovada no Galaxy S26). Branch `feat/v0.5-gestao`. Escopo desta beta:
**pagamentos** (prioridade 1) e **agenda** (prioridade 2). Fora: recorrência, lembretes, relatórios, recibos, pesquisa.

## Auditoria (o que já existe)

| Área | Situação na 0.4.0-beta.7 | Consequência para a 0.5 |
| --- | --- | --- |
| Dinheiro | Centavos inteiros (`parseMoney`), sem ponto flutuante | Mantido; somas e diferenças em inteiros |
| Serviço | `price`, `status` (agendado/concluído/cancelado), `transactionId` (receita automática da 0.4) | Sem status novo (a beta.4 recusa desconhecidos) |
| Campos reservados | `appointment.duration`, `series`, `payments`; `transaction.payment`; `serviceType.duration` | Preservados pela 0.4 desde a beta.4 ao editar, sincronizar e restaurar |
| Receita automática | Uma por serviço, removida ao reabrir/cancelar/excluir; limpeza de duplicadas ao sincronizar | Continua reconhecida como pagamento integral (legado); a 0.5 não cria mais |
| Sincronização | Mesclagem em 3 vias por campo, revisão por registro, conflitos financeiros vão para o usuário | Pagamento = registro próprio com id estável → enviado uma vez |
| Regras do Firestore | `transactions`/`appointments` não validados campo a campo | **Nenhuma mudança de regra** nesta beta |
| XP | `transaction_created` só em lançamento avulso novo; `appointment_completed` uma vez por id | Pagamentos e estornos nunca chamam a gamificação |
| Backup | Formato 1; confere o tipo dos campos da 0.5 | Sem mudança de formato |

## Modelo (contrato de COMPATIBILIDADE-0.5.md, sem campos novos)

- **Pagamento:** `receita` com `appointmentId` e `payment: { kind: 'pagamento', method?, key? }`.
- **Estorno:** `despesa` com `appointmentId` e `payment: { kind: 'estorno', of: <id do pagamento>, key? }`.
  O pagamento original nunca é alterado nem apagado.
- **Controle ativo:** `appointment.payments = true` (serviço criado, concluído ou pago na 0.5).
- **Legado:** receita automática da 0.4 (sem marcador) conta como recebida. Concluído antes da 0.5 sem receita
  → **“pagamento não registrado”**: nem pago, nem pendente, fora do “a receber”.

Resumo derivado (`src/domain/payments.ts`, nunca gravado): contratado = `price`; recebido = Σ receitas vinculadas;
estornado = Σ estornos vinculados; líquido = recebido − estornado; pendente = `max(0, contratado − líquido)` só para
serviço com controle ativo e não cancelado; excedente = `max(0, líquido − contratado)`.

## Integridade

| Risco | Mecanismo |
| --- | --- |
| Toque duplo / reenvio | Cada formulário gera um id de operação; o pagamento usa esse id. Repetir é no-op |
| Offline → sincroniza uma vez | Registro com id estável e controle de revisão (já existente) |
| “Recebi tudo” em dois aparelhos offline | Chave `quitacao:<serviço>:<líquido antes>`; ao sincronizar fica o mais antigo (mesmo critério das receitas automáticas). Nunca remove pagamento que tenha estorno |
| Parciais legítimos em dois aparelhos | São registros distintos e somam; a interface avisa “acima do combinado” |
| Reabrir, cancelar, editar, excluir | Nunca apagam pagamentos nem estornos (inclusive a receita automática legada). Excluir avisa que os valores continuam em Finanças |
| Desfazer | Mesmo mecanismo (último, 30 s, registro inalterado). Desfazer um pagamento remove só esse pagamento |
| XP | Pagamentos, estornos, restauração e Desfazer não chamam a gamificação |

## Agenda

`duration` opcional (5–1440 min; padrão 60 quando ausente, sem gravar nos antigos). Horários são **de parede**
(data + hora locais), comparados em minutos absolutos calculados por dia de calendário — sem `Date` local, então
horário de verão e troca de fuso não deslocam nada. Atendimento que atravessa a meia-noite aparece nos dois dias.
Visões dia/semana/mês com navegação por setas e “Hoje”; lista atual vira o filtro. Conflito = intervalos
sobrepostos de atendimentos não cancelados; aviso ao salvar e marcador nas visões, **nunca bloqueia**.

## Entregas (commits separados)

1. Domínio de pagamentos + serviço + testes (sincronização, legado, backup, XP).
2. Interface: concluir sem pré-seleção; folha de pagamentos (histórico, registrar, estornar).
3. Agenda: duração, visões, navegação, conflitos.
4. Versão 0.5.0-beta.1, documentação, CI, varredura visual, Android (instalação por cima da 0.4.0-beta.7).

## 0.5.0-beta.3 (a partir de `9ab2bfe`, beta.2 aprovada)

Decisões da beta.2 que prevalecem sobre o texto antigo da proposta: duração opcional (nada presumido), visão Dia
abrindo no topo sem rolagem automática (“Ir para agora” removido; “Primeiro atendimento” rola só quando tocado),
estornos fora das despesas operacionais.

### Auditoria

| Área | Situação | Consequência |
| --- | --- | --- |
| Estornos | Dois aparelhos offline podem estornar acima do pago; “estornar tudo” repetido era apagado em silêncio pela chave; pagamento excluído num aparelho enquanto o outro estorna deixava estorno órfão sem aviso | Detecção determinística + revisão pela pessoa; sincronização não apaga estornos |
| Exclusões na sincronização | Registro excluído na nuvem e criado aqui com o mesmo id volta e vira conflito “excluído na nuvem” | Ocorrência gerada e intocada (`series.auto`, `updatedAt = createdAt`) aceita a exclusão; nada reaparece |
| Mesmo registro criado nos dois aparelhos | Sem base comum, toda diferença (inclusive `createdAt`) vira conflito | Ocorrências geradas são determinísticas (mesmo id e mesmos campos, `createdAt` da regra) |
| XP | Missão semanal “agendamentos” conta registros criados na semana | Ocorrências geradas não contam; só a criação da série dá XP |
| Backup | `series` precisa ser objeto | Mantido; sem formato novo |
| Clientes | Detalhe mostra dados e lista simples | Histórico derivado (`domain/clientHistory.ts`), sem campos novos |
| Busca | Inexistente | Índice em memória, no aparelho |

### Entregas (commits separados)

1. Integridade dos estornos (domínio, serviço, sincronização, interface, testes).
2. Recorrência: domínio (datas, 29/30/31, limites), gerador sem lacunas, sincronização das ocorrências, escopos de
   edição e cancelamento, XP, interface.
3. Histórico do cliente. 4. Busca global. 5. Versão 0.5.0-beta.3, documentação, varredura visual (360/412) e
   Android com atualização por cima da beta.2.
