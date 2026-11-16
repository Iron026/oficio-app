# Release 0.5.0: assinatura, distribuição e migração

Procedimento técnico da versão estável. Nada aqui publica o app. Publicar (Play Store, GitHub Release, tag ou
`main`) depende de autorização expressa.

## Builds e versões

| Build | Para quê | Assinatura | `versionName` | `versionCode` |
|---|---|---|---|---|
| Depuração (`android.yml`) | Testes internos e e2e | Chave de depuração estável (`d39f3729…bb67a3`) | `0.5.0-build.N` | 100 + N |
| Release de teste (`release.yml`, todo push) | Validar a configuração de release | Chave **efêmera** criada no runner, válida por 7 dias. Os arquivos levam "TESTE-NAO-PUBLICAR" no nome | `0.5.0` | 50099 |
| Release de produção (`release.yml`, manual) | Publicação | Chave de upload definitiva, só no ambiente protegido `producao` | `0.5.0` | 50099 |

- **`versionCode` de release:** vem de `ci/version-code.mjs`: major·1.000.000 + minor·10.000 + patch·100 + estágio
  (final 99, rc.N 50+N).
  - Fica sempre acima da RC.1 (227) e de qualquer build de depuração.
  - Cresce a cada versão: 0.5.1 → 50199, 0.6.0 → 60099.
- **Release:**
  - `debuggable false`;
  - sem R8 ou encolhimento de recursos (mesmo código validado na RC.1);
  - registros do Capacitor e inspeção da WebView só em depuração.
- **Conferência automática** (`ci/verify-release.mjs`), que gera um `release-manifest.json` sem segredos:
  - pacote, `versionCode` e `versionName` do APK e do AAB;
  - nada depurável e `allowBackup=false`;
  - permissões proibidas ausentes;
  - escopo do FileProvider;
  - Firebase incluído;
  - assinatura v2, certificado igual no APK e no AAB, e nunca a chave de depuração;
  - SHA-256 dos arquivos.

## Estratégia de assinatura recomendada

Recomendo publicar pela Play Store com **Play App Signing**:

1. Você gera uma **chave de upload**, que fica só com você e no ambiente protegido do GitHub.
2. O Google guarda a **chave de assinatura do app**.

Vantagens:
- Se a chave de upload for perdida ou vazar, o Google permite trocá-la sem perder o app.
- O AAB gerado pelo fluxo é o formato exigido pela Play Store.

Se a distribuição for só por APK, fora da Play Store, a chave de upload passa a ser a chave definitiva do app. Perdê-la
impede atualizar o app para sempre. Nesse caso a custódia abaixo é ainda mais crítica.

### Gerar a chave de upload (você, no seu computador)

Não é gerada aqui: num ambiente temporário não há como garantir custódia, cópia de segurança e recuperação.

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore oficio-upload.p12 -alias oficio-upload \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Oficio, O=Oficio, C=BR"
keytool -list -v -keystore oficio-upload.p12 -alias oficio-upload   # anote SHA-1 e SHA-256
```

**Custódia:**
- **Senha:** forte e única, guardada num gerenciador de senhas.
- **Arquivo `.p12`:** duas cópias offline (ex.: pendrive criptografado e outro meio), em locais diferentes. Nunca no
  repositório, em e-mail ou em chat.
- **Registro:** anote as impressões SHA-1 e SHA-256. Elas não são segredo e servem para conferir cada build.
- **Recuperação:** com Play App Signing, a chave de upload perdida é trocada pelo suporte do Google Play. Sem a Play
  Store, não há recuperação.

### Configurar no GitHub (você)

1. Em **Settings → Environments → New environment**, crie `producao`. Em *Deployment protection rules*, marque
   **Required reviewers** com você mesmo. Restrinja o ambiente às branches `main` e `feat/v0.5-gestao`.
2. Em **producao → Environment secrets**, crie:
   - `OFICIO_RELEASE_KEYSTORE_BASE64`: conteúdo de `base64 -w0 oficio-upload.p12`;
   - `OFICIO_RELEASE_STORE_PASSWORD`;
   - `OFICIO_RELEASE_KEY_ALIAS`: `oficio-upload`;
   - `OFICIO_RELEASE_KEY_PASSWORD`.
3. Em **Actions → Android release → Run workflow**, escolha a branch e `assinatura = producao`. Depois aprove a
   execução no ambiente.

O resultado é o artefato `oficio-release-producao`, com `.apk`, `.aab` e `release-manifest.json`. Confira no manifesto
que `certificate.sha256` é o da sua chave.

A chave é decodificada em arquivo temporário com permissão 600 e apagada logo após a compilação. As senhas só entram
como segredos mascarados.

## Firebase e login Google (você, com autorização específica)

O login Google no Android só funciona com as impressões do certificado que assina o app instalado. Cadastre em
**Firebase → Configurações do projeto → app Android `io.github.iron026.oficio` → Impressões digitais**:

1. SHA-1 e SHA-256 da **chave de upload**, para testar o APK de release instalado direto.
2. Com Play App Signing: SHA-1 e SHA-256 da **chave de assinatura do app**, em Play Console → Integridade do app →
   Assinatura de apps. É ela que assina o que os usuários instalam pela loja.
3. Mantenha a impressão de depuração (`7A:36:CE:…:6B:C9` / `D3:9F:37:…:67:A3`) enquanto usar APKs de teste.

Depois de cadastrar, atualize o segredo `GOOGLE_SERVICES_JSON`, se o Firebase gerar um arquivo novo. Regras do
Firestore e configurações de produção não mudam na 0.5.0.

## Migração dos APKs de depuração para a instalação de produção

**Não existe atualização direta.** A assinatura é diferente, e o Android recusa a instalação por cima
(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Isso é conferido no teste da release, e os dados do app de depuração
continuam intactos depois da recusa. Também não dá para ter os dois instalados, porque o pacote é o mesmo.

### Caminho principal: backup com verificação de integridade

1. **No app de depuração (0.5.0-rc.1):**
   - em **Ajustes → Backup e dados → Exportar backup → Salvar no aparelho**, escolha **Downloads** ou o **Drive** e
     salve;
   - abra o arquivo salvo e confira que ele existe e tem tamanho maior que zero;
   - de preferência, salve uma segunda cópia fora do aparelho (Drive ou e-mail para você mesmo).
2. **Se usa conta Google no app:** abra a tela Conta e espere "Sincronizado". Assim a nuvem também tem tudo.
3. Desinstale o app de depuração. **Isso apaga os dados do aparelho:** só faça depois dos passos 1 e 2.
4. Instale o app de produção.
5. Faça o cadastro rápido: qualquer nome, porque será substituído. Toque em "Pular" na configuração inicial.
6. Em **Ajustes → Backup e dados → Restaurar backup**, escolha o arquivo. A prévia deve dizer **"Integridade
   verificada"** e mostrar as contagens esperadas. Marque "Entendi" e restaure.
7. **Refazer no aparelho:** lembretes (Ajustes → Lembretes), tema e preferências do aparelho. Eles não fazem parte do
   backup.

O teste Android automatiza exatamente esse caminho (etapa "Migração para a instalação de produção"). Ele exporta pela
janela do sistema, desinstala, instala do zero, restaura e confere estes dados idênticos:
- clientes;
- atendimentos;
- lançamentos;
- tipos de serviço;
- eventos de XP.

### Caminho alternativo: conta Google

Exige o passo do Firebase acima, com as impressões do certificado de produção. Depois de instalar a produção:
**Ajustes → Conta → Entrar com Google → Usar os dados da nuvem**. Recomendo usar como reforço do backup, não sozinho.

### Recuperação, se algo der errado

- **A restauração recusou o arquivo:** o app não altera nada. Tente a outra cópia do backup.
- **Instalou a produção sem exportar o backup:** reinstale o APK de depuração da RC.1, que continua disponível como
  artefato do CI até 15/12/2026. Os dados só voltam se ainda existirem na nuvem (conta Google) ou num backup
  anterior; os dados locais apagados pela desinstalação não voltam.
- **Antes de desinstalar,** confira sempre o arquivo de backup e, se possível, a sincronização.
