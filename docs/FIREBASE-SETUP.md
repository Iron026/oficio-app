# Configurar o Firebase pelo celular (Galaxy S26)

Este guia ativa o **login com Google** e a **sincronização na nuvem** do Ofício 0.3.
Tudo é feito no navegador do celular. Nenhuma credencial é colocada no código: os
valores ficam nas **variáveis do repositório** no GitHub.

> Dica: algumas telas do console do Firebase/Google Cloud ficam melhores com
> **Chrome → ⋮ → Versão para computador**.

Tempo estimado: 30 a 40 minutos. Custo: **zero** no plano gratuito (Spark).

---

## 1. Criar o projeto Firebase

1. Abra **https://console.firebase.google.com** com a conta Google que será dona do projeto.
2. Toque em **Criar um projeto** → nome: `Oficio` → Continuar.
3. **Google Analytics: desative** (o Ofício não usa rastreamento) → **Criar projeto**.
4. O projeto nasce no plano **Spark (sem custo)**. **Não** faça upgrade para o plano Blaze sem conversarmos (ver seção 10).

## 2. Ativar o login com Google (Authentication)

1. Menu ☰ → **Criação → Authentication** → **Vamos começar**.
2. Aba **Método de login** → **Google** → ative a chave.
3. Escolha o **e-mail de suporte do projeto** (seu e-mail) → **Salvar**.
4. Toque novamente em **Google** e abra **Configuração do SDK da Web**.
   Copie o **ID do cliente da Web** (termina em `.apps.googleusercontent.com`).
   → este é o valor de **`FIREBASE_WEB_CLIENT_ID`** (passo 8).

> Uma mesma conta Google gera sempre o **mesmo identificador** no Firebase — não há
> contas duplicadas. Mantenha a opção padrão **“Vincular contas que usam o mesmo e-mail”**.

## 3. Criar o banco de dados (Cloud Firestore)

1. Menu ☰ → **Criação → Firestore Database** → **Criar banco de dados**.
2. Edição **Standard**.
3. Local: **`southamerica-east1 (São Paulo)`**. ⚠️ Não pode ser alterado depois.
4. Escolha **Iniciar no modo de produção** (tudo bloqueado até aplicar as regras) → **Criar**.

## 4. Aplicar as regras de segurança

As regras garantem que **cada conta acesse somente os próprios dados**.

1. Abra o arquivo de regras do Ofício:
   **https://raw.githubusercontent.com/Iron026/oficio-app/v0.3-google-auth/firestore.rules**
2. Toque e segure no texto → **Selecionar tudo** → **Copiar**.
3. No Firebase: **Firestore Database → aba Regras** → apague o conteúdo atual → cole → **Publicar**.

Essas regras são testadas automaticamente no emulador oficial do Firestore a cada
alteração do código (workflow **CI → Regras e sincronização**).

## 5. Registrar o app **Web**

1. Engrenagem ⚙️ → **Configurações do projeto** → **Seus apps** → ícone **`</>`** (Web).
2. Apelido: `Oficio Web`. **Não** marque Firebase Hosting → **Registrar app**.
3. Aparece um bloco `firebaseConfig` com: `apiKey`, `authDomain`, `projectId`,
   `storageBucket`, `messagingSenderId` e `appId`. Deixe essa tela aberta (passo 8).

> Esses valores **não são senhas**: identificam o projeto e são públicos em qualquer app web.
> A proteção dos dados vem das **regras de segurança** (passo 4) e do login.

## 6. Domínios autorizados (versão web)

1. **Authentication → Configurações → Domínios autorizados → Adicionar domínio**.
2. Digite `iron026.github.io` → **Adicionar**.

## 7. Registrar o app **Android** e as impressões digitais (SHA-1 e SHA-256)

1. Obtenha as impressões digitais da assinatura do APK:
   - Abra **https://github.com/Iron026/oficio-app/actions/workflows/android.yml**
   - Toque na execução mais recente da branch **v0.3-google-auth** com ✅.
   - No **resumo** (Summary), seção *Impressões digitais da assinatura*, copie **SHA-1** e **SHA-256**.
2. No Firebase: ⚙️ **Configurações do projeto → Seus apps → Adicionar app → Android**.
   - Nome do pacote: **`io.github.iron026.oficio`** (exatamente assim)
   - Apelido: `Oficio Android`
   - **Certificado de assinatura SHA-1**: cole o SHA-1 → **Registrar app**.
   - Pule o download do `google-services.json` (não é necessário — ver passo 8) → **Próximo → Continuar no console**.
3. Ainda em **Seus apps → Oficio Android** → **Adicionar impressão digital** → cole o **SHA-256** → Salvar.
4. Copie o **ID do app** do Android (`1:…:android:…`) → valor de **`FIREBASE_ANDROID_APP_ID`**.

**Identificadores OAuth:** ao ativar o Google (passo 2) e registrar o SHA-1, o Firebase cria
automaticamente os clientes OAuth “Web client” e “Android client”. Para conferir (opcional):
**https://console.cloud.google.com/apis/credentials** (selecione o projeto `Oficio`).

**Tela de consentimento:** em **https://console.cloud.google.com/auth/branding** confira o
nome do app `Ofício` e o e-mail de suporte. Em **Público-alvo**, o status deve ser
**Em produção** (para escopos básicos — nome, e-mail, foto — não há verificação do Google).
Se estiver **Em teste**, apenas os e-mails cadastrados como testadores conseguem entrar.

> ⚠️ Se a impressão digital do APK mudar (o resumo do GitHub Actions sempre mostra a atual),
> cadastre a nova no mesmo lugar. Sem isso, o login no Android falha com erro de configuração.

## 8. Colocar os valores no GitHub (variáveis do repositório)

1. Abra **https://github.com/Iron026/oficio-app/settings/variables/actions**
   (Settings → Secrets and variables → Actions → aba **Variables**).
2. Para cada linha abaixo: **New repository variable** → *Name* e *Value* → **Add variable**.

| Name | Valor (de onde copiar) |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` (passo 5) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` (passo 5) |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` (passo 5) |
| `VITE_FIREBASE_APP_ID` | `appId` do app **Web** (passo 5) |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` (passo 5) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` (passo 5) |
| `FIREBASE_ANDROID_APP_ID` | ID do app **Android** (passo 7) |
| `FIREBASE_WEB_CLIENT_ID` | ID do cliente da Web (passo 2) |

Copie sem espaços extras. **Não** use a aba *Secrets* para esses valores (não são segredos).

*Alternativa:* se preferir, crie o **segredo** `GOOGLE_SERVICES_JSON` (aba *Secrets*) com o
conteúdo inteiro do arquivo `google-services.json` baixado no passo 7. Se o login no Android
acusar problema de chave de API, crie também a variável `FIREBASE_ANDROID_API_KEY` com o
`current_key` desse arquivo.

## 9. Gerar o APK com login Google

1. Abra **https://github.com/Iron026/oficio-app/actions/workflows/android.yml**
2. **Run workflow** → branch **`v0.3-google-auth`** → **Run workflow**.
3. Ao terminar (✅), o resumo deve mostrar **“Login Google incluído: true”**.
4. Baixe em **Artifacts → oficio-apk-debug** e siga `docs/TESTES-0.3.md`.

## 10. Custos, cotas e alertas

O Ofício foi desenhado para caber no **plano Spark (gratuito)**:

| Recurso | Uso no Ofício | Limite gratuito (confira os valores atuais em https://firebase.google.com/pricing) |
| --- | --- | --- |
| Authentication (Google) | 1 login por aparelho | sem custo para login social |
| Firestore — armazenamento | ~1 KB por registro | 1 GiB |
| Firestore — leituras | só registros alterados desde a última sincronização | 50 mil/dia |
| Firestore — gravações | 1 por alteração | 20 mil/dia |
| Firestore — exclusões | exclusões e exclusão de conta | 20 mil/dia |

- No plano Spark **não há cartão cadastrado e não há cobrança**. Se uma cota diária acabar,
  a sincronização pausa até o dia seguinte; o app continua funcionando offline e envia depois.
- Estimativa: um profissional ativo gera dezenas a poucas centenas de operações por dia —
  o plano gratuito comporta muitos usuários. **Não suponha que continuará gratuito em qualquer escala.**
- Acompanhe em **Firebase → Uso e faturamento**.
- **Plano Blaze (pago por uso)** só será necessário com muitos usuários ou para funções no
  servidor (ex.: validar compras do Google Play). Antes de qualquer upgrade, vou pedir sua
  autorização e configurar **alertas de orçamento** em
  *Google Cloud → Faturamento → Orçamentos e alertas* (ex.: alerta em R$ 10, R$ 50).

## Checklist rápido

- [ ] Projeto `Oficio` criado no plano Spark, sem Analytics
- [ ] Login Google ativado + ID do cliente da Web copiado
- [ ] Firestore em `southamerica-east1`, modo produção
- [ ] Regras do Ofício publicadas
- [ ] App Web registrado
- [ ] Domínio `iron026.github.io` autorizado
- [ ] App Android `io.github.iron026.oficio` com SHA-1 e SHA-256
- [ ] 8 variáveis no GitHub
- [ ] Workflow **Android APK** executado na branch `v0.3-google-auth` com “Login Google incluído: true”
