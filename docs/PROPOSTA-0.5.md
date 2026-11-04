# Proposta da 0.5.0 — gestão profissional

Situação: **proposta para aprovação**. Nada desta página está implementado. Base: 0.4.0-beta.3 auditada
([AUDITORIA-0.4.md](AUDITORIA-0.4.md)). Identidade visual, paletas, medalhões, animações e avatares não mudam.

## 1. Princípios

1. **Caixa é caixa.** O que entrou no caixa é sempre a soma das receitas lançadas (como hoje). O valor combinado de
   um serviço é *previsto* até ser pago. Nenhum indicador soma os dois.
2. **Nada novo sem necessidade.** Pagamentos, histórico, relatórios e pesquisa são derivados dos registros que já
   existem. Nenhuma coleção nova no Firestore; nenhuma regra nova precisa ser publicada para a 0.5 funcionar.
3. **Offline primeiro.** Tudo é calculado e gravado no aparelho; a sincronização continua campo a campo.
4. **Sem XP novo.** Nenhuma ação nova dá XP. Os pontos existentes não mudam (R1 e R2 seguem pendentes).
5. **Etapas pequenas**, cada uma com testes, commit e, a cada conjunto, um APK beta instalável por cima.

## 2. Arquitetura por funcionalidade

### 2.1 Controle de pagamentos (núcleo)

**Hoje:** concluir um serviço pode lançar uma receita com o preço inteiro, vinculada nos dois sentidos
(`appointment.transactionId` ↔ `transaction.appointmentId`), datada no dia do serviço. Reabrir, cancelar ou excluir
apaga essa receita.

**Proposta:** um pagamento é uma **receita vinculada ao serviço** (`appointmentId`). Pode haver várias.

| Termo | Fórmula | Onde aparece |
| --- | --- | --- |
| Valor combinado | `appointment.price` | Serviço |
| Pago | Σ `amount` das receitas com `appointmentId = serviço` | Serviço, cliente, relatórios |
| A receber | `max(0, combinado − pago)` para serviços **concluídos** com controle de pagamento | Finanças, Painel, cliente |
| Previsto | Σ `price` dos serviços **agendados** (ainda não concluídos), menos o já pago antecipado | Agenda, relatórios (separado) |

Situação do pagamento (derivada, nunca gravada): *sem valor* (preço 0) · *pendente* (nada pago) · *parcial* ·
*integral* · *antecipado* (algum pagamento com data anterior à data do serviço) · *acima do combinado* (aviso).

- **Concluir** passa a perguntar quanto foi recebido agora: “Recebi o total” (padrão, igual ao comportamento atual),
  “Recebi parte” (valor) ou “Ainda não recebi”. Só cria receita para o que foi recebido.
- **Registrar pagamento** a qualquer momento (antes = antecipado, depois = quitação), com data e forma
  (dinheiro, Pix, cartão, transferência, outra — opcional).
- **Reabrir, cancelar ou excluir** um serviço com pagamentos **pergunta**: manter os pagamentos como receitas
  (padrão) ou excluí-los. Nunca apaga dinheiro sem confirmação.
- **Migração: nenhuma alteração nos dados.** Receitas automáticas antigas continuam sendo o pagamento integral
  do serviço. Para não criar pendências fantasmas, serviços concluídos **antes** da 0.5 sem receita vinculada
  aparecem como “pagamento não registrado” e ficam fora do “a receber” (o profissional pode registrar se quiser).
  A partir da 0.5, todo serviço concluído recebe `payments: true` (controle de pagamento ativo).
- **XP:** receitas vinculadas a serviço **não** dão o XP de lançamento (`transaction_created`); o serviço continua
  dando o XP de conclusão uma única vez (chave por id, como hoje). Parcelas, pagamentos antecipados e edições não
  geram XP. Receitas avulsas mantêm a regra atual. Missões e selos já usam o caixa: um pagamento antecipado conta no
  mês em que entrou (regime de caixa, documentado).

### 2.2 Agenda inteligente

- **Visões dia, semana e mês** sobre os agendamentos existentes, com “Hoje” em destaque e setas/gestos para trocar de
  período. A lista atual (abertos, concluídos, cancelados) continua como filtro.
- **Duração:** campo opcional `duration` (minutos) no agendamento e no tipo de serviço. Agendamentos antigos usam a
  duração padrão da agenda (60 min, ajustável) — nada é gravado neles.
- **Conflitos:** dois agendamentos não cancelados no mesmo dia cujos intervalos se sobrepõem. Ao salvar, aviso com os
  atendimentos envolvidos e as opções “Salvar mesmo assim” e “Mudar horário”. **Nunca bloqueia.** Na visão de dia, os
  sobrepostos aparecem lado a lado com um marcador.
- **Filtros** por situação do atendimento e do pagamento; **busca** por cliente ou serviço dentro da agenda.
- **Reagendar:** ação rápida de data/hora; pagamentos e histórico continuam vinculados.

### 2.3 Recorrência

- Frequência diária, semanal (dias da semana) ou mensal (mesmo dia; dia 31 vira o último dia do mês), intervalo
  (a cada N), término opcional (data ou nº de ocorrências).
- **Ocorrências materializadas** como agendamentos comuns, até um horizonte (90 dias à frente, completado ao abrir
  a agenda) e no máximo 120 por série. Assim pagamentos, histórico, XP, lembretes e sincronização funcionam sem
  nenhuma lógica nova.
- **Ids determinísticos** (`<série>-<aaaammdd>`): dois aparelhos que geram a mesma ocorrência produzem o mesmo
  registro — a sincronização mescla em vez de duplicar.
- A regra fica **dentro de cada ocorrência** (`series: { id, freq, interval, days, until, count }`) — sem coleção nova.
- Editar: **só esta** (a ocorrência vira exceção, `series.detached`), **esta e as próximas** (atualiza as futuras não
  concluídas e não destacadas; as passadas ficam como estão) ou **toda a série** (idem, desde a primeira não
  concluída). Cancelar uma ocorrência deixa a exceção registrada (o gerador não a recria).
- **XP:** só a criação da série dá o XP de agendamento (uma vez); ocorrências geradas não.

### 2.4 Histórico do cliente

Derivado (`src/domain/clientHistory.ts`): dados cadastrais, serviços realizados e futuros, último atendimento,
quantidade, **total efetivamente pago** (receitas vinculadas aos serviços do cliente), **valores pendentes**, serviços
mais usados, frequência média (dias entre atendimentos concluídos) e observações. Nenhum dado duplicado. Respeita
“Ocultar valores”. Isolamento entre contas: inalterado (dados por conta, regras atuais).

### 2.5 Relatórios gerenciais

Derivados (`src/domain/reports.ts`), com gráficos em SVG próprio (sem biblioteca), cores das paletas e textos/tabelas
equivalentes para leitores de tela. Fórmulas:

| Indicador | Fórmula | Fonte |
| --- | --- | --- |
| Receitas do mês | Σ receitas com data no mês | Caixa |
| Despesas do mês | Σ despesas com data no mês | Caixa |
| Saldo | receitas − despesas; evolução = saldo de cada um dos últimos 6–12 meses | Caixa |
| Receita por tipo de serviço | Σ pagamentos vinculados agrupados pelo nome do serviço; receitas avulsas em “Outras receitas” | Caixa |
| Despesas por categoria | Σ despesas por categoria | Caixa |
| Atendimentos concluídos | nº de serviços com situação concluído e `completedAt` no mês | Agenda |
| Ticket médio | Σ pagos ÷ nº de serviços concluídos **com pagamento integral** no período | Caixa + agenda |
| Clientes recorrentes | clientes com ≥ 2 atendimentos concluídos no período, ordenados pela quantidade | Agenda |
| A receber | Σ (combinado − pago) dos concluídos com controle de pagamento | Pagamentos |
| Previsto | Σ preço dos agendados no período − pagos antecipados | Agenda (separado do caixa) |

Demonstração (`isDemo`) fica fora dos relatórios, como já acontece no XP.

### 2.6 Lembretes de atendimento

- **Android:** plugin oficial `@capacitor/local-notifications` 8.3.1 (compatível com Capacitor 8, gratuito, sem
  servidor). Notificações agendadas no próprio aparelho chegam **com o app fechado** e são reagendadas após
  reiniciar o celular.
- **Permissões:** só `POST_NOTIFICATIONS` (Android 13+), pedida **quando a pessoa liga os lembretes**, nunca na
  abertura. O plugin, por padrão, pede “alarmes exatos” e chega a abrir a tela de configuração do sistema; vamos
  agendar como **não exato** (`isExactNotification: false`, `allowWhileIdle`) e **remover** `SCHEDULE_EXACT_ALARM` do
  manifesto. Consequência: o Android pode atrasar o aviso alguns minutos em economia de bateria (Doze; mais em
  aparelhos Samsung com otimização agressiva). Para lembretes de 15 min a 1 dia, aceitável e documentado.
- **Configuração** por aparelho (não sincroniza): 15 min, 30 min, 1 h, 1 dia — cada um liga/desliga. Agendamos só os
  próximos 30 dias e reagendamos ao abrir o app, ao alterar um serviço e após sincronizar.
- **Privacidade:** a notificação mostra “Atendimento às 14:00” e o serviço; o nome do cliente só aparece se a pessoa
  ativar. Na tela bloqueada, conteúdo privado.
- **Notificações desativadas:** os lembretes ficam marcados como “desativados pelo sistema”, com um atalho para as
  configurações do Android; o app nunca insiste em pedir de novo.
- **Web:** navegadores não agendam avisos com a página fechada sem um servidor de push. Na versão web, os lembretes
  aparecem **dentro do app** (faixa “Próximo atendimento em 30 min”) e a tela explica que avisos com o app fechado
  são do Android.

### 2.7 Painel personalizável

Cartões: saldo do mês, receitas e despesas, a receber, atendimentos da semana, próximos serviços, metas, nível e XP,
missões. Folha “Personalizar Painel” com **mostrar/ocultar** (interruptor) e **subir/descer** (botões com nome, sem
depender de arrastar), mais “Restaurar padrão”. Guardado nas preferências da conta (`settings.dashboard`), que já
preservam chaves desconhecidas e sincronizam.

### 2.8 Recibos em PDF

A partir de um pagamento (receita vinculada ou avulsa): profissional/negócio, cliente (se houver), serviço, data do
serviço, valor recebido, forma de pagamento, identificação `REC-aaaammdd-XXXX` (derivada do id do lançamento — sem
contador global, que conflitaria offline), data de emissão. Rodapé fixo: “Recibo simples. Não é nota fiscal e não
substitui documento fiscal.” Mesmo gerador de PDF do extrato; salvar ou compartilhar no Android e na web, offline.

### 2.9 Pesquisa global

Índice em memória (sem biblioteca) de clientes, tipos de serviço, agendamentos e lançamentos; ignora acentos e
maiúsculas; resultados agrupados por tipo, com atalho que abre o registro (`#/clientes/<id>`, `#/agenda/<id>`, …).
Com “Ocultar valores”, valores aparecem mascarados e a busca não encontra registros pelo valor.

### 2.10 Restauração aprimorada

Já existe: resumo “agora × arquivo”, data, versão do app (desde a auditoria), verificação de integridade e cópia de
segurança automática antes. A 0.5 acrescenta: **compatibilidade** (formato, versão mais antiga/mais nova), **o que
será substituído e o que é preservado** (preferências do aparelho, cópias de segurança, selos — que nunca diminuem —,
conta vinculada) e uma **soma de verificação** (SHA-256 dos dados) gravada no arquivo e conferida quando presente.

### 2.11 Configuração inicial por profissão

Depois de escolher a profissão, uma tela opcional (“Pular” sempre visível) sugere: avatar da área, tipos de serviço
comuns (caixas marcáveis — viram tipos de serviço reais só se a pessoa confirmar), organização inicial do Painel e
preferências da Agenda (início da semana, duração padrão). Nenhum cliente, agendamento ou lançamento é criado.

## 3. Dependências

```
Compatibilidade 0.4.x (pré-requisito)
  └─ Pagamentos ─┬─ Histórico do cliente ─ Relatórios
                 ├─ Recibos
                 └─ Painel (cartão “A receber”)
Agenda (visões, duração, conflitos) ─ Recorrência ─ Lembretes
Pesquisa global (usa todos, mas não depende de nenhum)
Restauração aprimorada e Configuração inicial (independentes)
```

## 4. Sincronização e migração

| Mudança | Onde | Regras do Firestore | Migração |
| --- | --- | --- | --- |
| Pagamentos | receitas já existentes com `appointmentId`; `payment.method` opcional | sem mudança (dados de lançamentos não são validados campo a campo) | nenhuma |
| Controle de pagamento | `appointment.payments: true` | sem mudança | nenhuma (marcado ao concluir na 0.5) |
| Duração e recorrência | `appointment.duration`, `appointment.series` | sem mudança | nenhuma |
| Duração no tipo de serviço | `serviceType.duration` | **mudança** (`validServiceType` lista os campos) — junto com as regras ainda não publicadas | campo opcional |
| Painel | `settings.dashboard` | sem mudança | nenhuma |
| Lembretes | preferências do aparelho (`kv`) | não sincroniza | nenhuma |
| Backup | `appVersion`, `checksum` | — | formato continua 1 |

**Risco principal — aparelhos com versões diferentes.** As telas da 0.4 reconstroem o registro ao salvar um cliente,
agendamento ou lançamento e descartam campos que não conhecem; como a mesclagem é campo a campo, uma edição feita na
0.4 apagaria `series`, `duration` ou `payments` em todos os aparelhos. **Mitigação (pré-requisito):** 0.4.0-beta.4
passa a preservar campos desconhecidos ao editar, e só depois a 0.5 entra em teste. Testes de sincronização
0.4.x ↔ 0.5 cobrem o caso.

Outros riscos: geração de ocorrências em dois aparelhos (resolvido pelos ids determinísticos); pagamentos parciais
registrados offline em dois aparelhos (são receitas distintas — somam, e o “acima do combinado” avisa); lembretes
duplicados após sincronizar (ids de notificação derivados de serviço + antecedência).

## 5. Ordem recomendada

| Etapa | Conteúdo | Entrega |
| --- | --- | --- |
| 0 | 0.4.0-beta.4: preservar campos desconhecidos ao editar | APK 0.4 (mesma base validada) |
| 1 | Pagamentos: domínio, concluir com valor recebido, registrar pagamento, reabrir/cancelar com pergunta | |
| 2 | Agenda: visões dia/semana/mês, duração, conflitos, filtros, busca, reagendar | |
| 3 | Recorrência | |
| 4 | Histórico do cliente | **0.5.0-beta.1** |
| 5 | Relatórios · 6 Recibos · 7 Pesquisa global · 8 Painel personalizável | **0.5.0-beta.2** |
| 9 | Lembretes (Android) · 10 Restauração aprimorada · 11 Configuração inicial | **0.5.0-beta.3** |

**Branch:** `feat/v0.5-gestao`, criada a partir do commit da 0.4 que você validar no S26 (beta.3 ou beta.4). Correções
da 0.4 continuam na `feat/v0.4-design` e entram na 0.5 por merge dessa branch — nunca o contrário.

## 6. Desempenho e tamanho

- JavaScript principal hoje: 546 KB (163 KB comprimido). Estimativa da 0.5 completa: **+60 a 90 KB** (+20 a 28 KB
  comprimidos). Relatórios, recibos e pesquisa carregados sob demanda, para a abertura do app não ficar mais pesada.
- Gráficos em SVG próprio: nenhuma biblioteca de gráficos (as comuns somam 100–200 KB).
- APK: +100 a 200 KB com o plugin de notificações; o resto é JavaScript.
- Metas: nenhuma tarefa acima de 120 ms com o processador 4× mais lento (mesmo critério da beta.3); visão do mês com
  1 000 agendamentos abaixo de 50 ms (índice por data); geração de série limitada a 120 ocorrências.

## 7. Critérios de aceitação e testes

| Etapa | Aceita quando |
| --- | --- |
| Pagamentos | R$ 300 com R$ 100 pago mostra 100 no caixa e 200 a receber; saldos anteriores idênticos antes/depois (teste com backup veterano); nenhuma receita duplicada ao concluir, reabrir, sincronizar ou restaurar; parcelas e antecipação sem XP; cancelar com pagamento pergunta e preserva por padrão |
| Agenda | visões corretas na virada de mês e horário de verão inexistente (fuso de Brasília); conflito avisa e não bloqueia; reagendar mantém pagamentos; acessível sem gestos |
| Recorrência | semanal/mensal/diária com término; 31 → último dia; “só esta” / “esta e próximas” / “série” conforme a tabela; dois aparelhos não duplicam ocorrências; XP só na criação |
| Histórico | totais pago/pendente batem com Finanças; respeita “Ocultar valores” |
| Relatórios | cada fórmula da tabela com teste; nenhum indicador mistura previsto com caixa |
| Lembretes | permissão só ao ligar; sem `SCHEDULE_EXACT_ALARM` no APK; chega com o app fechado (emulador); reagenda após reiniciar; desativado no sistema é informado |
| Recibo | PDF válido offline; texto “não é nota fiscal”; salvar/compartilhar no Android |
| Pesquisa | encontra sem acento; abre o registro; não encontra por valor com “Ocultar valores” |
| Restauração | mostra data, versão, quantidades, compatibilidade e o que é substituído/preservado; recusa arquivo adulterado (soma de verificação) |
| Configuração inicial | pode ser pulada; nada fictício gravado |

Em todas: `npm run check`, emulador do Firestore, varredura visual estrita (claro/escuro, paletas, axe), e2e Android
com instalação por cima da versão anterior, mesma assinatura e versionCode maior.
