# Auditoria técnica — Ofício 0.3.0 (branch `v0.3-google-auth`)

Escopo: regras do Firestore, offline e reconexão, conflitos entre instalações,
duplicação/perda de exclusões, atualizações, XP e finanças, autenticação, troca de
conta, recuperação, riscos de sobrescrita e segurança.

Testes reais no Galaxy S26 já aprovados pelo responsável: login Google e recuperação,
importação do backup da 0.2, isolamento entre duas contas, sincronização manual e
automática entre duas instalações, propagação de criação/edição/exclusão, persistência,
reconexão sem duplicar registros ou XP.

## Achados e correções

| # | Achado | Gravidade | Situação |
|---|---|---|---|
| 1 | Mesmo serviço concluído **offline em duas instalações** gerava **duas receitas** (saldo em dobro) | **Crítica** (finanças) | Corrigido: receita automática única por serviço, escolhida de forma determinística (a mais antiga); data de conclusão e vínculo resolvidos sem conflito artificial |
| 2 | Com o aparelho associado à conta A, entrar com a conta B e escolher “Juntar” **copiava os dados de A para B** | **Alta** (privacidade/mistura de contas) | Corrigido: login de outra conta é recusado enquanto o aparelho estiver associado a A; tela mostra a conta associada e permite “Entrar novamente” ou “Desassociar este aparelho” |
| 3 | Após desconectar A e conectar B, nada avisava que os dados locais eram de A | Média | Corrigido: aviso no assistente (“Os dados deste aparelho vieram de outra conta…”) |
| 4 | Desconectar sem internet descartava a fila de pendências sem avisar | Média | Corrigido: tenta enviar antes; se algo ficar pendente, o aviso informa quantas alterações ficarão só no aparelho |
| 5 | Importar backup antigo com conta conectada exclui da nuvem e dos outros aparelhos os registros criados depois do backup — sem aviso específico | Alta (sobrescrita) | Corrigido: aviso explícito quando conectado + **cópia de segurança automática** dos dados atuais antes de qualquer importação |
| 6 | Conta excluída em um aparelho: outro aparelho associado **recriava os dados na nuvem** na próxima edição | Alta (exclusão/LGPD) | Corrigido: ao detectar que os dados da conta sumiram da nuvem, o aparelho para de sincronizar e se desassocia, mantendo os dados locais |
| 7 | “Apagar todos os dados” mantinha as **cópias de segurança locais** automáticas | Média (privacidade) | Corrigido: também são apagadas (a nuvem não é afetada) |
| 8 | Duas cópias de segurança no mesmo milissegundo usavam a mesma chave (a segunda sobrescrevia a primeira) | Baixa | Corrigido: chave única |
| 9 | Com status “Alterações pendentes” ou “Erro”, não havia nova tentativa automática até a próxima edição/reconexão | Baixa | Corrigido: novas tentativas com espera crescente (30 s → 5 min) |

## Verificações sem problemas
- **Regras do Firestore:** somente `request.auth.uid == uid` acessa `users/{uid}` e `records`; outra conta não lê, lista, altera nem exclui; sem login nada é acessível; coleção, id do documento, campos, lápide (`data == null`), horário do servidor e revisão `+1` validados; Premium (`entitlements`) somente leitura; caminhos fora de `users/{uid}` negados.
- **Concorrência:** gravação condicionada à revisão (transação); edição durante o envio não é perdida (número de sequência); mesclagem em 3 vias por campo.
- **Conflitos financeiros:** valor alterado nas duas instalações → mantém o local e pede decisão (nunca “última gravação vence”); exclusão × edição → registro mantido e sinalizado.
- **XP/conquistas:** no máximo um evento por chave em todas as instalações; conquista mantém a data mais antiga.
- **Exclusões:** propagadas por lápides; sem conflito quando o outro lado não alterou.
- **Offline:** tudo funciona; pendências guardadas; “Sincronizado” só após confirmação do servidor.
- **Volume:** 130 registros (envio em lotes de 100) chegam completos; dados de demonstração não sobem.

## Testes executados
- 112 testes automatizados (unidade, integração e interface), TypeScript, lint e build.
- 14 testes no emulador oficial do Firestore (regras reais + sincronização ponta a ponta).
- Workflow Android: APK com assinatura estável conferida, compilação do login Google e teste no emulador Android.

## Riscos restantes (não bloqueantes)
1. **“Salvar em Documentos”** apresenta erro de permissão no Android 17; **Compartilhar** funciona. Pendência registrada, não priorizada.
2. **Conflitos raros sem resolução automática perfeita:** se a receita duplicada (achado 1) tiver sido editada manualmente antes da sincronização, a edição da cópia removida se perde (mantém-se a receita mais antiga).
3. **Cliente excluído em um aparelho e editado em outro** é restaurado, mas os serviços do aparelho que excluiu ficam sem vínculo com ele.
4. **Conta excluída e recriada com os mesmos dados** enquanto outro aparelho estava offline: esse aparelho pode ficar com “Alterações pendentes” até ser desassociado manualmente.
5. **Validação Android com conta real** depende do aparelho; o emulador do CI usa build sem Firebase.
6. Assinatura é de **depuração** (estável). Assinatura de produção e AAB para a Play Store ainda não configurados (exigem autorização).
7. Política de privacidade é um rascunho técnico (revisão jurídica recomendada).
8. Sem limite de taxa no servidor (plano Spark): um usuário só pode consumir a própria cota; uso abusivo afetaria a cota diária do projeto.

## Recomendação
Ver o relatório entregue ao responsável (resumo no PR/conversa).
