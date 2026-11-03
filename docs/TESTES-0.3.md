# Checklist de testes da v0.3 no Galaxy S26

Pré-requisito: Firebase configurado (`docs/FIREBASE-SETUP.md`) e APK gerado com
**“Login Google incluído: true”** no resumo do workflow **Android APK** da branch `v0.3-google-auth`.

## 0. Antes de instalar (proteja seus dados da 0.2)
- [ ] No Ofício 0.2: **Ajustes → Exportar backup → Salvar em Documentos** (na 0.3.1+: **Salvar no aparelho**) (e/ou Compartilhar para o Drive).
- [ ] Instale o APK da 0.3 por cima. Se o Android disser **“conflito de pacote” / “App não instalado”**
      (assinatura diferente da 0.2 que você tinha): desinstale o Ofício, instale a 0.3 e use
      **Ajustes → Importar backup**.
- [ ] Abra o app: seus dados da 0.2 continuam lá (clientes, finanças, XP, conquistas).

## 1. Login com Google
- [ ] Ajustes → **Conta e sincronização → Continuar com Google** abre a **janela nativa de contas do Android** (não uma página dentro do app).
- [ ] Escolha a conta → aparece o assistente “Conectar seus dados à conta”, com o resumo do que será sincronizado.
- [ ] **Enviar e conectar** → status **Sincronizado** e “Último backup confirmado na nuvem: …”.
- [ ] Nome, e-mail e foto da conta aparecem.
- [ ] O ícone de nuvem aparece no topo das telas.

## 2. Cancelamentos
- [ ] Toque em Continuar com Google e feche a janela de contas → “Login cancelado”, nada muda.
- [ ] Faça login e, no assistente, toque **Cancelar** → “Conexão cancelada”, nenhum dado alterado.

## 3. Sessão
- [ ] Feche o app (remova dos recentes) e abra de novo → continua conectado e sincronizado.

## 4. Offline
- [ ] Ative o **modo avião**. Cadastre um cliente, um serviço, conclua-o e registre uma despesa.
- [ ] Status muda para **Aguardando conexão**; tudo funciona normalmente.
- [ ] Desative o modo avião → em segundos, **Sincronizado** com novo horário.

## 5. Recuperação em nova instalação
- [ ] Exporte um backup (por segurança). Desinstale o Ofício. Instale de novo o mesmo APK.
- [ ] Na tela de boas-vindas: **Já uso o Ofício: recuperar com Google** → mesma conta → **Recuperar**.
- [ ] Clientes, serviços, receitas, despesas, saldo, XP, nível, missões e conquistas voltam iguais.

## 6. Versão web e outro aparelho (após integrar a 0.3 na main — a web só é publicada pela main)
- [ ] Em https://iron026.github.io/oficio-app/ → Ajustes → Continuar com Google (mesma conta).
- [ ] Escolha **Juntar os dados** se o navegador tiver dados próprios; nada é duplicado.
- [ ] Altere um cliente no celular → aparece na web após sincronizar (e vice-versa).

## 7. Conflito financeiro (dois aparelhos ou celular + web)
- [ ] Desconecte a internet do celular; altere o valor de uma despesa no celular e o mesmo lançamento na web com outro valor.
- [ ] Reconecte → em Ajustes aparece “registros financeiros com versões diferentes” → **revisar** → escolha uma versão.
- [ ] O valor escolhido aparece nos dois lugares; o saldo fica correto.

## 8. Desconectar e excluir
- [ ] **Desconectar** → a mensagem explica que os dados ficam no aparelho → seus dados continuam no app.
- [ ] Conecte de novo com a mesma conta → **Juntar os dados** → nenhuma duplicação.
- [ ] **Excluir conta e dados na nuvem** → confirmação clara → após excluir, “Continuar com Google” volta a aparecer e os dados do aparelho continuam.

## 9. Regressão (0.1/0.2)
- [ ] Botão Voltar, modo escuro, teclado, aviso de “Data futura”, backup manual e dados de demonstração continuam funcionando.

Anote qualquer mensagem de erro exibida (texto exato) e o horário — isso ajuda a diagnosticar.
