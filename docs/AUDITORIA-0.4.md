# Auditoria da 0.4.0 (beta.3) — estado real antes da 0.5.0

Base auditada: branch `feat/v0.4-design`, commit `ac9b7cc` (beta.3 com avatares padronizados), mais os
ajustes desta auditoria. Critério: só conta como **concluído** o que tem código, testes automatizados e
validação (CI, emulador Android ou varredura visual). Nada abaixo foi reimplementado.

## Resumo

| Área | Estado | Evidência |
| --- | --- | --- |
| Extrato mensal PDF e CSV | Concluído | `src/domain/statement.ts`, `src/lib/pdf.ts`; 10 testes (CSV Excel pt-BR, soma = saldo, fórmulas, PDF multipágina com xref válido); exportação na interface; PDF salvo pela janela “Salvar como” no emulador Android (e2e 18/18) |
| Tipos de serviço personalizados e fixáveis | Concluído no aparelho · sincronização **pendente de autorização** | Coleção `serviceTypes` (IndexedDB v4, backup); 14 testes + 3 de regras no emulador. Regras escritas e testadas, **não publicadas**: ficam só no aparelho e no backup |
| Categoria obrigatória, descrição opcional | Concluído | `validateTransaction`, chips de categoria, nome pela categoria quando falta descrição; testes de validação e interface |
| Paletas globais | Concluído | 8 paletas, sem piscar na abertura; 425 testes de contraste em componentes reais; varredura visual estrita com axe |
| Central de Ajustes | Concluído | 6 categorias, Voltar do Android, rolagem preservada, confirmações por digitação; 14 testes de interface + e2e Android |
| Galeria de avatares minimalista | Concluído | 24 personagens + 12 ícones SVG; coleção anterior oculta e válida; 74 testes de catálogo/olhos + 22 de compatibilidade de perfis |
| Sincronização | Concluído para clientes, agenda, finanças, XP e conquistas · selos, foto e tipos de serviço **aguardam publicação das regras** | Testes de sincronização, auditoria e 27 no emulador Firestore |
| Armazenamento | Concluído | IndexedDB v4 (migrações só criam stores; nada é apagado), `TrackedStorage`, testes de migração v2→v3 e v3→v4 |
| Backup e restauração | Concluído, com **2 melhorias nesta auditoria** | Exportar, restaurar com resumo “agora × arquivo”, cópia de segurança automática antes de restaurar, selos nunca diminuem |

## Ajustes feitos nesta auditoria (sem mudança estrutural)

1. **Integridade na restauração.** A importação só conferia se os campos existiam. Agora confere o tipo dos
   campos que entram nos totais (valores inteiros em centavos e não negativos, datas `aaaa-mm-dd`, receita/
   despesa, situação do atendimento, XP numérico). Um arquivo editado à mão ou corrompido é recusado com a
   indicação do item, **antes** de qualquer alteração. Backups reais desde a 0.2 continuam aceitos.
2. **Versão no backup.** O arquivo novo registra a versão do app (`appVersion`); o resumo de restauração mostra
   “Arquivo exportado em … pelo Ofício v…”. O formato continua `1`: versões antigas ignoram o campo.
3. **Rótulo que misturava previsto com recebido.** A ficha do cliente mostrava “Total faturado”, mas o número é a
   soma do preço dos serviços concluídos — que podem ter sido concluídos sem lançar receita. Passou a se chamar
   “Valor de … concluídos” (mesmo cálculo, nome correto). O total efetivamente pago chega com a 0.5.
4. **README** atualizado (ainda descrevia a 0.2).

## Pendências que não dependem de código

| Pendência | Responsável | Observação |
| --- | --- | --- |
| Publicar as regras novas do Firestore (selos, foto, tipos de serviço) | Autorização do responsável | Até lá, esses dados ficam no aparelho e no backup — a interface já diz isso |
| Teste real com TalkBack no Galaxy S26 | Responsável | Validado automaticamente (nomes acessíveis, foco, axe), falta o teste no aparelho |
| R1 (fórmula de XP) e R2 (Carteira IV) | Decisão do responsável | Nada alterado |
| Tela de abertura nativa sempre em Petróleo | Limitação conhecida | O Android mostra a tela de abertura antes do app carregar a paleta |

## Comportamentos atuais que a 0.5.0 precisa tratar (não são defeitos na 0.4)

- **Concluir lança a receita inteira.** `completeAppointment(registerIncome)` cria uma receita com o preço total,
  vinculada nos dois sentidos (`appointment.transactionId` ↔ `transaction.appointmentId`), na data do serviço
  (ou hoje, se o serviço for futuro). Não existe pagamento parcial nem antecipado.
- **Reabrir, cancelar ou excluir o serviço apaga a receita automática vinculada.** Correto enquanto só existe uma
  receita por serviço; com pagamentos parciais isso apagaria dinheiro recebido — a 0.5 precisa perguntar.
- **XP de lançamentos:** `transaction_created` dá 5 XP por lançamento (limite 6/dia). Se cada parcela virar um
  lançamento comum, pagamentos parciais renderiam XP extra — a 0.5 não pode dar XP por parcela vinculada.
- **Agenda** só tem lista (abertos/concluídos/cancelados), sem visão de dia/semana/mês, conflitos ou recorrência.
- **Painel** tem ordem fixa de cartões.

## Validação desta auditoria

- `npm run check`: tipos, lint, **839 testes** e build.
- Regras e sincronização no emulador do Firestore: 27 testes.
- CI do commit anterior (`ac9b7cc`): verificações, emulador, varredura visual estrita em todos os tamanhos, APK com a
  mesma assinatura e teste de ponta a ponta no emulador Android (18/18).
