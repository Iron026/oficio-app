# Política de Privacidade — Ofício

*Versão 0.3.1 · aplica-se ao aplicativo Ofício (Android e versão web) a partir da versão 0.3.1.*

> **Aviso:** este texto descreve o funcionamento técnico real do aplicativo. Ele ainda **não foi
> revisado por assessoria jurídica** e não constitui declaração de conformidade com a LGPD ou com
> as políticas da Google Play. Essa revisão é necessária antes da publicação na loja.

## 1. Quem somos e contato
O Ofício é um aplicativo para profissionais autônomos organizarem clientes, serviços,
finanças e acompanharem sua evolução profissional, mantido por um desenvolvedor independente.

**Canal de contato para privacidade:** ainda não definido. Será publicado nesta página antes do
lançamento na Google Play. Até lá, todos os controles descritos na seção 6 estão disponíveis
dentro do próprio aplicativo.

## 2. Uso sem conta (padrão)
- Seus registros (clientes, serviços, finanças, XP e conquistas) ficam **somente no seu aparelho**,
  no armazenamento interno do aplicativo (Android) ou do navegador (versão web).
- Seus registros não são enviados para a internet. Quando o login com Google está disponível na
  versão instalada, o aplicativo pode se comunicar com serviços do Google (Firebase) apenas para
  verificar se há uma sessão iniciada — sem enviar seus registros.
- O backup automático do Android para a nuvem está **desativado** no aplicativo.
- A **versão web** é hospedada no GitHub Pages; como qualquer site, o provedor de hospedagem pode
  registrar dados técnicos de acesso (como endereço IP), conforme as políticas do GitHub.

## 3. Uso com conta Google (opcional)
Ao tocar em **Continuar com Google** e confirmar a conexão:
- **Dados da conta Google usados:** identificador da conta, nome, e-mail e foto de perfil — apenas
  para identificar e exibir quem está conectado. O aplicativo não solicita acesso a contatos,
  agenda, Google Drive, Gmail ou outros dados da conta.
- **Dados sincronizados:** perfil e profissão, clientes (nome, telefone, e-mail, endereço e
  observações que você digitar), serviços e agendamentos, receitas e despesas, metas, XP, níveis,
  missões, conquistas, histórico de evolução e preferências do aplicativo.
- **Finalidade:** guardar uma cópia para você recuperar seus dados ao trocar de celular,
  reinstalar o aplicativo ou usar outro aparelho.
- **Onde:** Google Cloud Firestore e Firebase Authentication, serviços do Google. O banco de dados
  fica na região escolhida na configuração do projeto; o Firebase Authentication e a
  infraestrutura do Google podem processar dados em outros países.
- **Quem acessa:** regras de segurança do banco de dados permitem que cada conta leia e grave
  somente os próprios dados.
- **Dados de demonstração** (fictícios) não são enviados.

## 4. Arquivos de backup
- **Exportar backup** gera um arquivo JSON com todos os seus dados. Ele é salvo no local que você
  escolher (“Salvar no aparelho”) ou enviado ao aplicativo que você escolher (“Compartilhar”).
  A partir daí, a guarda do arquivo é sua: proteja-o como qualquer documento com dados pessoais.
- O aplicativo **não pede permissão ampla de armazenamento**: ao salvar, ele só recebe acesso ao
  arquivo que você criou na janela do Android.
- Antes de conectar uma conta ou importar um backup, o aplicativo guarda automaticamente até
  **5 cópias de segurança locais** dos dados anteriores, somente no aparelho. Elas são apagadas
  com “Apagar todos os dados”.

## 5. O que não fazemos
- Não vendemos dados.
- Não usamos dados pessoais para publicidade, perfilamento ou rastreamento.
- Não incluímos SDKs de anúncios nem de análise de uso (como Google Analytics).

## 6. Seus controles (no aplicativo: Ajustes)
- **Ver e levar seus dados:** Exportar backup (arquivo JSON).
- **Desconectar a conta:** os dados continuam no aparelho; a cópia na nuvem permanece na conta
  até você excluí-la.
- **Excluir conta e dados na nuvem:** apaga os dados do Ofício guardados na nuvem e a conta de
  acesso ao Ofício. Os dados neste aparelho são mantidos até você usar “Apagar todos os dados”.
  Outros aparelhos que estavam conectados mantêm a cópia local deles e deixam de sincronizar.
- **Apagar todos os dados:** remove do aparelho todos os registros e as cópias de segurança locais
  (não altera a nuvem).

## 7. Retenção
- Na nuvem, os dados ficam guardados enquanto a conta existir no Ofício e são apagados quando você
  exclui a conta pelo aplicativo.
- Quando você exclui um registro, a nuvem guarda apenas um marcador técnico **sem o conteúdo**
  (para avisar seus outros aparelhos), que também é apagado ao excluir a conta.

## 8. Segurança
- Comunicação com a nuvem criptografada (HTTPS/TLS).
- Acesso restrito à conta autenticada, por regras de segurança verificadas por testes automáticos.
- Nenhuma credencial privada no código-fonte.
- Nenhum sistema é totalmente imune a falhas; mantenha seu aparelho e sua conta Google protegidos.

## 9. Bases legais (a validar)
Entendimento preliminar, **pendente de validação jurídica**:
- Uso local: execução do serviço que você solicita ao usar o aplicativo.
- Sincronização na nuvem: consentimento, dado ao conectar sua conta e revogável a qualquer
  momento (desconectando ou excluindo a conta).
- Dados de clientes: são inseridos e gerenciados por você, profissional, na gestão do seu negócio.

## 10. Crianças
O Ofício é destinado a profissionais adultos e não é direcionado a menores de 13 anos.

## 11. Alterações
Mudanças nesta política serão publicadas nesta página, com nova versão e data.
