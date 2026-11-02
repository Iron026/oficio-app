# Autenticação e sincronização (v0.3)

## Visão geral

```
 Telas (React) ──► AccountController ──► AuthService (Google)
      │                    │                 ├─ Android: login nativo (Credential Manager) → token → Firebase JS SDK
      │                    │                 └─ Web: popup do Firebase Auth
      ▼                    ▼
  AppService ──► TrackedStorage ──► IndexedDB (fonte de trabalho, 100% offline)
                     │ registra pendências
                     ▼
                 SyncEngine ──► RemoteStore ──► Cloud Firestore  users/{uid}/…
```

- **Offline-first:** o aparelho continua sendo onde o app trabalha. Sem internet, tudo funciona;
  as alterações viram **pendências** e são enviadas quando a conexão volta.
- **Opcional:** sem conta (ou sem Firebase configurado no build) o app é idêntico à v0.2.
- **Isolado do Firebase:** `SyncEngine` só conhece a interface `RemoteStore`. Os testes usam
  `MemoryRemote`; produção usa `FirestoreRemote`.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/cloud/config.ts` | Lê `VITE_FIREBASE_*` (injetadas no build). Sem elas → só local |
| `src/cloud/auth.ts` | Interface `AuthService`, `UnavailableAuth`, `FakeAuth` (testes) |
| `src/cloud/firebaseAuth.ts` | Login Google: nativo no Android (`@capacitor-firebase/authentication`, `useCredentialManager: true`, `skipNativeAuth: true` + `signInWithCredential`), popup na web; sessão persistida (IndexedDB) |
| `src/cloud/firestoreRemote.ts` | Firestore: transações condicionadas à revisão |
| `src/sync/tracked.ts` | Envoltório do armazenamento que registra cada alteração local |
| `src/sync/engine.ts` | Associação de conta, envio/recebimento, mesclagem, conflitos, backups |
| `src/sync/merge.ts` | Mesclagem em 3 vias e políticas por coleção |
| `src/state/account.ts` | Orquestra login → assistente → associação; desconectar; excluir conta |
| `src/screens/Account.tsx` | Interface “Conta e sincronização”, assistente, conflitos, indicador |
| `firestore.rules` | Regras de segurança (testadas em `src/cloud/firestore.emulator.test.ts`) |

## Modelo de dados na nuvem

```
users/{uid}                       { schemaVersion, data: { profile, settings }, rev, updatedAt, deviceId }
users/{uid}/records/{col}__{id}   { collection, id, data | null, deleted, rev, updatedAt, deviceId }
users/{uid}/entitlements/{doc}    somente leitura (Premium futuro, gravado apenas por servidor)
```

- Um documento por registro (cliente, serviço, lançamento, evento de XP, conquista), com os
  **mesmos identificadores locais** — relações entre serviço e receita são preservadas.
- Exclusões viram **lápides** (`data: null`) para chegarem aos outros aparelhos.
- `updatedAt` é o **relógio do servidor** (regra exige `request.time`); o app busca só o que
  mudou desde o último cursor (com margem de 5 min para gravações concorrentes).

## Garantias

| Requisito | Como é garantido |
| --- | --- |
| Nada é apagado ao conectar | Cópia de segurança local antes; “Cancelar” não altera nada; falha de rede antes de aplicar = nada muda |
| Sem duplicações | Mesclagem por identificador; migração idempotente (testada 3×); XP com no máximo **um evento por chave** em todos os aparelhos (mantém o mais antigo) |
| XP, níveis e conquistas preservados | São registros sincronizados; conquistas mantêm a data mais antiga |
| “Sincronizado” é verdade | `lastSyncedAt` só muda após o servidor confirmar todas as gravações; erro/offline mantêm as pendências |
| Conflitos financeiros | Gravação condicionada à revisão (`rev`). Se outro aparelho alterou antes: mesclagem em 3 vias por campo. Campo financeiro alterado dos dois lados → **mantém o valor local e registra o conflito** para o usuário escolher. Exclusão × edição → o registro é **mantido** e sinalizado. Nunca “última gravação vence” para serviços e lançamentos |
| Clientes e perfil | Mesclagem por campo; mesmo campo alterado dos dois lados → alteração mais recente (cliente) / versão da conta (perfil) |
| Isolamento | Regras: só `request.auth.uid == uid`; formato e revisão validados no servidor |
| Dados de demonstração | Fictícios: **nunca** são enviados à nuvem |
| “Apagar todos os dados” | Desassocia a conta **sem** apagar a nuvem |
| Excluir conta | Apaga `users/{uid}` e `records`; depois exclui o usuário do Firebase Auth (pede para confirmar a conta se necessário) |

## Estados exibidos

`Sincronizado` (com data/hora da última confirmação) · `Sincronizando…` · `Aguardando conexão`
· `Alterações pendentes` · `Erro na sincronização` · `Somente neste aparelho`.

A sincronização roda: ao abrir o app, ao voltar para ele, ao reconectar à internet e
1,5 s após cada alteração (agrupando alterações próximas).

## Premium (futuro)

`users/{uid}/entitlements` é **somente leitura** para o app. Direitos Premium serão gravados
apenas por um servidor (Cloud Functions, plano Blaze — exige autorização) depois de validar o
token da compra na **Google Play Developer API**. O login Google **não** concede Premium.
A recuperação de compras usará `queryPurchases` do Google Play Billing + revalidação no servidor.

## Testes

- `src/sync/sync.test.ts` (19): migração, cópia de segurança, cancelamento offline, idempotência,
  recuperação em nova instalação (inclusive após reiniciar), multi-aparelho, conflitos de campo,
  financeiro e exclusão×edição, XP sem duplicar, offline → online, erro do servidor, isolamento,
  desconectar, excluir, apagar dados locais, importação de backup, migração IndexedDB v1→v2.
- `src/screens/account.ui.test.tsx` (8): fluxo na interface com autenticação simulada.
- `src/cloud/firestore.emulator.test.ts` (10): **regras reais no emulador oficial** e sincronização
  ponta a ponta com o SDK do Firestore. Rodar: `npm run test:emulator` (requer Java).
- **Não substituem** o teste com conta Google real no aparelho (`docs/TESTES-0.3.md`).
