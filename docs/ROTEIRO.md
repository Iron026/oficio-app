# Roteiro

## 0.3 (em desenvolvimento — branch v0.3-google-auth)
Conta Google opcional (Firebase Auth) e sincronização offline-first com o Cloud Firestore: migração segura dos dados locais, recuperação em nova instalação, conflitos financeiros revisados pelo usuário, exclusão de conta.

## 0.2 (estável — tag/ref `release/v0.2.0`)
App Android via Capacitor: APK de depuração compilado no GitHub Actions, teste em emulador, botão Voltar, tela inteira, teclado, backup no Android.

## 0.1
Base funcional offline: cadastro, profissões, clientes, agenda, finanças, evolução, ajustes, backup, tema claro/escuro, testes e CI.

## Repositório
Código em https://github.com/Iron026/oficio-app (a cópia original da 0.1 permanece em `Iron026/teste`, branch `ccr-189116ae-np6ak8`).

## Próximos passos sugeridos
1. ~~**0.2 — App Android:** Capacitor, ícone/splash, APK de teste na nuvem~~ (feito). Pendente: assinatura de produção e AAB para a Play Store (exige autorização).
2. **0.3 — Produtividade:** lembretes/notificações locais, recibos e orçamentos simples, relatório mensal.
3. **0.4 — Conta e nuvem:** login, `StorageAdapter` com sincronização, backup automático (Premium).
4. **0.5 — Monetização:** Google Play Billing via `BillingProvider`, Premium e compras únicas de verdade.
5. **IA:** assistente de preços e mensagens para clientes (com consentimento explícito e chaves apenas no servidor).
