# Prontidão — Ofício 0.5.0 (versão estável)

Data: 16/11/2026 · Branch `feat/v0.5-gestao` · Base aprovada: 0.5.0-rc.1 (`2b7342f`)

Preparação técnica da versão estável. **Nada foi publicado:**
- sem merge na `main`, sem tag e sem GitHub Release;
- sem Play Store;
- sem mudança em regras, configurações ou dados de produção do Firebase.

Procedimentos detalhados (assinatura, custódia, Firebase e migração) estão em `docs/RELEASE-0.5.0.md`.

## Veredito

**APTO COM RESSALVAS.** Código, build de release, conferências e migração estão prontos e testados.

A publicação depende de passos só seus:
1. gerar e guardar a chave de upload;
2. criar o ambiente protegido `producao` com os segredos;
3. cadastrar as impressões digitais no Firebase;
4. rodar a build de produção e conferir o certificado.

A build disponível hoje é assinada com chave **de teste** e **não é release definitiva**.

## O que mudou desde a RC.1

**Comportamento do app: idêntico à RC.1.** Nenhum arquivo de `src/` mudou fora dos testes. Fora deles, só
`android/app/build.gradle` (bloco de release) e `capacitor.config.ts` (`loggingBehavior: 'debug'`, que já era o
padrão do Capacitor e agora é explícito).

| Commit | Conteúdo |
|---|---|
| `86c4d49` | Versão `0.5.0` e `versionCode` de release; assinatura de release por variáveis de ambiente; workflow `release.yml` + ação `release-build` (APK e AAB); conferência `ci/verify-release.mjs`; teste da release no emulador `e2e/release-smoke.mjs`; etapa de migração no teste Android; testes estáticos da configuração; `docs/RELEASE-0.5.0.md` |
| `746598b` | Conferência: acha o `file_paths.xml` pelo caminho real (o Gradle encurta os nomes dos recursos na release) |
| `650caad` | Conferência: lê os atributos do FileProvider (sem namespace) e o certificado em qualquer formato do `apksigner` (`V2 Signer: …`); grava as saídas públicas das ferramentas |
| este relatório | `docs/PRONTIDAO-0.5.0.md` |

### Versões

| Build | `versionName` | `versionCode` |
|---|---|---|
| RC.1 aprovada (depuração) | `0.5.0-rc.1-build.127` | 227 |
| Depuração deste commit | `0.5.0-build.128` | 228 |
| **Release 0.5.0** | `0.5.0` | **50099** |

O `versionCode` de release vem de `ci/version-code.mjs`: major·1.000.000 + minor·10.000 + patch·100 + estágio. Ele
fica sempre acima de qualquer build de depuração e cresce a cada versão. `package.json`, `package-lock.json`, APK e AAB
usam a mesma versão; a conferência falha se divergirem.

## Configuração auditada

| Item | Resultado |
|---|---|
| `applicationId` | `io.github.iron026.oficio` (inalterado) |
| Origem da WebView | `https://localhost` (inalterada) |
| Depuração | Release com `debuggable false`; conferido no APK, no AAB e no aparelho (`run-as` recusado, sem `DEBUGGABLE`) |
| Registros | Capacitor só registra em depuração; o teste no emulador confirma zero linhas `Capacitor` no logcat da release |
| Inspeção da WebView | Desligada na release (sem `webview_devtools_remote_<pid>`) |
| `allowBackup` | `false` |
| Permissões | `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, além de duas internas (Google Play Services e receptor dinâmico do AndroidX). Nenhuma de armazenamento, alarme exato, câmera, localização ou contatos |
| FileProvider | Só `cache-path compartilhar/` e `external-files-path Pictures/` |
| Firebase | `google_app_id` presente na release; `google-services.json` só vem do segredo, nunca do repositório |
| Código | Sem R8 nem encolhimento de recursos: o mesmo código validado na RC.1 |
| Chaves | Nenhuma chave, senha ou `google-services.json` versionados. `.gitignore` cobre `*.jks`, `*.keystore`, `*.p12`, `*.pfx` e arquivos de propriedades de assinatura; há teste que confere |

### Fluxo de build

| Build | Gatilho | Assinatura | Uso |
|---|---|---|---|
| Depuração (`android.yml`) | Todo push | Chave de depuração estável | Testes internos e e2e completo |
| Release de teste (`release.yml`, job `teste`) | Todo push ou manual | Chave **efêmera**: criada no runner, válida por 7 dias, senha aleatória mascarada, apagada após a build. CN "Oficio TESTE NAO PUBLICAR" | Validar a configuração. Arquivos `…-TESTE-NAO-PUBLICAR` |
| Release de produção (`release.yml`, job `producao`) | **Só manual**, `assinatura = producao`, ambiente protegido `producao` | Chave de upload definitiva (segredos `OFICIO_RELEASE_*`) | Publicação, após sua autorização |

A build de produção:
- recusa versões não finais;
- exige o Firebase;
- roda typecheck, lint e testes antes;
- falha listando os segredos que faltarem.

Uma build de teste nunca passa na conferência de produção, e vice-versa: o certificado precisa ou não conter "TESTE".

## Resultados

| Verificação | Execução | Commit | Resultado |
|---|---|---|---|
| CI: typecheck, lint, testes, build, Firestore Emulator e varredura visual e de acessibilidade | 43882275057 | `86c4d49` | Aprovado |
| Testes locais (`npm run check`) | — | `650caad` | Aprovado: 1.303 testes (3 ignorados), 101 arquivos |
| Android: depuração + e2e completo | 43882274961 | `86c4d49` | **30/30 etapas** |
| Release de teste: build, conferência e emulador | 43890434478 | `650caad` | Em execução (preenchido ao concluir) |

O e2e Android (30/30) inclui:
- a cadeia de atualização 0.4.0-beta.7 → 0.5.0-rc.1 aprovada → 0.5.0, sem perda de dados;
- pagamentos e estornos, recibo e extrato em PDF, backup (salvar, cancelar, arquivo alterado recusado e restaurar);
- exportação de 1,5 MB e exportação com o app encerrado pelo Android;
- compartilhamento pelo FileProvider restrito;
- avisos reais com o app aberto, em segundo plano e fechado;
- **migração para a instalação de produção:** backup pela janela do sistema, desinstalar, instalar do zero, restaurar
  e conferir clientes, atendimentos, lançamentos, tipos de serviço e eventos de XP idênticos.

O teste da release no emulador confere:
1. a release **não** atualiza por cima do APK da RC.1 (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) e os dados do app de
   depuração continuam intactos;
2. a instalação do zero tem `versionCode` e `versionName` corretos e não é depurável;
3. `run-as` é recusado;
4. o app abre sem queda, sem registros do Capacitor e sem porta de inspeção da WebView.

### Por que a regressão completa roda no APK de depuração

O APK de release não é depurável, de propósito. Por isso a automação que controla a WebView não funciona nele. A
cobertura fica assim:
- **e2e completo:** no APK de depuração do mesmo código;
- **o que só a release mostra:** no artefato de release (assinatura, depuração desligada, registros, inspeção,
  manifesto e recursos).

Entre `86c4d49` e `650caad` só mudaram scripts de CI e documentação.

## Artefatos (privados do CI, nada publicado)

| Artefato | Identificação |
|---|---|
| Depuração `oficio-0.5.0-build.128-debug.apk` | Run 43882274961, artefato 14233766199 (expira em 16/12/2026). SHA-256 do arquivo `70064816dabea84337660cb5b6ae94caf5e6627acbbc80a535f2713fbe8738d0`. Certificado de depuração SHA-256 `d39f3729…bb67a3`, SHA-1 `7a36ce3d…a556bc9` |
| Release de teste (APK + AAB) | Run 43890434478, em execução: identificadores preenchidos ao concluir |

O `release-manifest.json` de cada build de release registra:
- commit, versão e `versionCode`;
- DN e impressões do certificado;
- SHA-256 e tamanho do APK e do AAB;
- permissões, escopo do FileProvider e inclusão do Firebase.

Ele não contém segredos.

## Estratégia recomendada de assinatura e distribuição

1. **Play Store com Play App Signing.** O Google guarda a chave de assinatura do app e você guarda só a chave de
   upload. Se a chave de upload for perdida ou vazar, o Google permite trocá-la. O AAB já é gerado no formato exigido.
2. **Chave de upload gerada por você, no seu computador** (comando em `docs/RELEASE-0.5.0.md`):
   - RSA 4096, PKCS12;
   - senha num gerenciador de senhas;
   - duas cópias offline em locais diferentes;
   - impressões SHA-1 e SHA-256 anotadas.

   Não foi gerada aqui: um ambiente temporário não oferece custódia, backup nem recuperação.
3. **Build de produção só pelo ambiente protegido `producao`,** com revisor obrigatório. Confira no
   `release-manifest.json` que o certificado é o da sua chave.
4. **Se a distribuição for só por APK (fora da loja),** a chave de upload vira a chave definitiva do app. Perdê-la
   impede atualizações para sempre: a custódia é ainda mais crítica.

## Plano de migração dos APKs de depuração

Não existe atualização direta: a assinatura muda. O Android recusa a instalação por cima, e isso foi comprovado no
emulador com os dados preservados. Os dois apps também não podem conviver, porque o pacote é o mesmo.

1. No app da RC.1: **Ajustes → Backup e dados → Exportar backup → Salvar no aparelho** (Downloads ou Drive). Guarde
   uma segunda cópia fora do aparelho.
2. Se usa conta Google: espere "Sincronizado" na tela Conta.
3. Desinstale o app de depuração. **Só depois dos passos 1 e 2.**
4. Instale o app de produção, faça o cadastro rápido e toque em "Pular" na configuração inicial.
5. **Ajustes → Backup e dados → Restaurar backup.** A prévia deve mostrar "Integridade verificada" e as contagens
   esperadas.
6. Refaça os lembretes, o tema e as preferências do aparelho: eles não fazem parte do backup.

**Alternativa ou reforço:** entrar com a conta Google na produção e usar os dados da nuvem. Exige o cadastro das
impressões de produção no Firebase.

**Recuperação:**
- **O arquivo foi recusado:** nada é alterado; use a outra cópia.
- **Desinstalou sem backup:** os dados locais não voltam. Só a nuvem ou um backup anterior recuperam. O APK da RC.1
  continua disponível até 15/12/2026.

## Pendências que dependem de você

| # | Passo | Onde |
|---|---|---|
| 1 | Gerar a chave de upload e guardar senha e cópias (custódia) | Seu computador, comando em `docs/RELEASE-0.5.0.md` |
| 2 | Criar o ambiente `producao`, com revisor obrigatório e restrito às branches `main` e `feat/v0.5-gestao` | GitHub → Settings → Environments |
| 3 | Criar os segredos `OFICIO_RELEASE_KEYSTORE_BASE64`, `OFICIO_RELEASE_STORE_PASSWORD`, `OFICIO_RELEASE_KEY_ALIAS` e `OFICIO_RELEASE_KEY_PASSWORD` | Segredos do ambiente `producao` |
| 4 | Autorizar e cadastrar no Firebase o SHA-1 e o SHA-256 da chave de upload e, com Play App Signing, os da chave de assinatura do app. Manter os de depuração | Firebase → Configurações do projeto → app Android |
| 5 | Rodar **Actions → Android release → Run workflow → `assinatura = producao`**, aprovar no ambiente e conferir o certificado no manifesto | GitHub Actions |
| 6 | Instalar a build de produção num aparelho de teste e conferir o login Google | Aparelho de teste |
| 7 | Decidir a distribuição (Play Store, faixa de teste interno ou APK) e autorizar merge na `main`, tag e release | Você |

## Riscos residuais

1. **Custódia da chave de upload.** É o maior risco operacional, e a mitigação depende de você (passo 1).
   Recomendo fortemente o Play App Signing.
2. **Login Google na produção.** Só funciona depois do passo 4. Até lá, a sincronização na build de produção falha no
   login. O backup local funciona normalmente.
3. **Migração manual.** Depende do usuário exportar antes de desinstalar. O caminho está testado de ponta a ponta,
   mas é um passo humano. Use a conta Google como reforço.
4. **Release testada por amostragem.** O e2e completo roda no APK de depuração do mesmo código. Na release, os
   testes cobrem instalação, abertura, assinatura, depuração e manifesto. A validação manual da build de produção
   (passo 6) fecha essa lacuna.
5. **Pendências já conhecidas da RC.1,** recomendadas para a 0.6:
   - estado da sincronização regravado inteiro;
   - Agenda sem paginação;
   - alerta de `npm audit` em dependência de servidor do Firebase.
