# Ofício 0.5.0-rc.1 — notas da versão candidata

Candidata **interna**, só para validação no Galaxy S26.

- Branch: `feat/v0.5-gestao`. Não foi para a `main`.
- Sem tag e sem release pública.
- APK de depuração com a mesma chave das betas.
- Regras de produção do Firebase inalteradas.

## Base

- Código validado na estabilização: `44c9842`.
  - CI 43752964009.
  - Android 43752963985, 29/29 etapas.
- Último commit antes da RC: `bc027c7` (documentação).
- A RC só muda a identificação da versão e a documentação. Nenhum código do app foi alterado.

## Escopo congelado da 0.5.0

A 0.5.0 contém exatamente o que está abaixo. Daqui até a versão final entram só correções de defeitos
encontrados na validação.

1. **Pagamentos:**
   - pagamentos integrais, parciais e antecipados;
   - estornos que não apagam o histórico;
   - contratado × recebido × estornado × pendente;
   - "A receber" separado do saldo;
   - reabrir, cancelar ou excluir sem apagar dinheiro;
   - revisão de estornos incoerentes entre aparelhos.
2. **Agenda:**
   - visões dia, semana e mês;
   - duração opcional;
   - aviso de conflito que não bloqueia;
   - atendimentos que atravessam a meia-noite;
   - recorrência diária, semanal, quinzenal e mensal.
3. **Clientes:** histórico completo derivado dos lançamentos.
4. **Busca global** offline.
5. **Relatórios** em Finanças:
   - mês e comparação;
   - evolução de 6 e 12 meses;
   - caixa, pendente e previsto;
   - ticket médio;
   - categorias e serviços.
6. **Recibos em PDF** dos pagamentos registrados.
7. **Lembretes** locais no Android: opcionais, não exatos, com detalhes ocultos por padrão.
8. **Painel personalizável.**
9. **Backup com SHA-256** e restauração com pré-visualização e gravação segura.
10. **Configuração inicial por profissão.**

Tudo da 0.4 continua igual: identidade visual, 8 paletas, evolução, selos, Central de Ajustes e conta Google
opcional.

## O que mudou desde a 0.5.0-beta.5

Só correções. Nada novo para a pessoa usar, nenhuma mudança de identidade.

### Auditoria pré-RC (`docs/AUDITORIA-0.5.md`)

- **Restauração:** recusa o arquivo inteiro quando houver risco de perda silenciosa. Isso cobre:
  - selos, foto ou tipos de serviço inválidos, repetidos ou acima do limite;
  - marcadores de pagamento malformados;
  - recorrência inválida;
  - textos obrigatórios ausentes;
  - metas do perfil ausentes.

  Esses arquivos também deixavam telas em branco. Backups antigos válidos continuam aceitos.
- **Sincronização:**
  - lançamento financeiro excluído num aparelho e alterado em outro volta com aviso;
  - o aviso aparece só no aparelho que excluiu;
  - progresso de envio grande gravado também quando a conexão cai.
- **Privacidade:** backups e PDFs compartilhados não ficam no cache do app.
- **Estabilidade:** uma falha ao desenhar uma tela não deixa o app em branco; a navegação continua.
- **Desempenho com muitos dados:**
  - "A receber" e Relatórios;
  - Agenda: cartões e visões Semana e Mês;
  - envio inicial da sincronização e gravações em lote.

### Estabilização (`docs/ESTABILIZACAO-0.5.md`)

- **Controles segmentados:**
  - abas da Evolução cabem em 320 e 360 px;
  - seletor "6/12 meses" de Relatórios não vaza mais.
- **FileProvider:** expõe só a pasta de compartilhamento e as fotos da câmera do próprio app. Antes, expunha todo o
  armazenamento compartilhado e todo o cache.
- **Barra de status:** a cor dos ícones acompanha a área segura mesmo quando o Capacitor a informa tarde.
- **Exportação pela janela "Salvar como":**
  - não encerra mais o app com arquivos a partir de ~250 KB (TransactionTooLargeException);
  - conclui mesmo se o Android encerrar o app com a janela aberta.

## Compatibilidade

- **Atualização por cima** da 0.4.0-beta.7 e da 0.5.0-beta.5, sem desinstalar e sem perder dados.
  - Mesmo `applicationId` (`io.github.iron026.oficio`) e mesma origem (`https://localhost`).
  - Mesma chave de depuração.
  - `versionCode` maior que o de qualquer build anterior: é o número da execução do CI.
- **Backups:** exportados por qualquer versão desde a v0.1 continuam aceitos, desde que válidos. Arquivos
  corrompidos ou editados de forma inconsistente agora são recusados por inteiro, com mensagem.
- **Firestore:** mesmo formato de dados e mesmas regras.

## Riscos conhecidos

Nenhum bloqueia a RC.

1. **Uso muito longo.**
   - Cada alteração regrava o estado inteiro da sincronização.
   - A lista da Agenda desenha todos os atendimentos em aberto.
   - Recomendado para a 0.6.
2. **`npm audit`:** alertas em dependência de servidor do Firebase (`@grpc/grpc-js`), que não entra no app.
3. **Estilo dos botões:** a regra antiga `button { font: inherit }` foi mantida, para não mudar o tamanho dos
   botões aprovados.
4. **Logs de depuração:** em compilações de depuração, como esta RC, o Capacitor registra no logcat os
   parâmetros das chamadas, inclusive o conteúdo exportado. Em compilações de produção esse registro fica desligado.

## Roteiro sugerido para a validação no S26

1. Instalar por cima da beta.5 aprovada, sem desinstalar. Conferir:
   - clientes, agenda, pagamentos, estornos e lembretes;
   - em Ajustes › Sobre, a versão "0.5.0-rc.1".
2. Exportar backup pela janela "Salvar como". De preferência um backup real, com meses de dados.
3. Compartilhar um recibo e um extrato em PDF.
4. Restaurar um backup e conferir a pré-visualização.
5. Abrir a Evolução e alternar as quatro abas.
6. Com lembretes ligados, deixar um aviso chegar com o app fechado.
