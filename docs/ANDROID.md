# Ofício no Android

## Instalar o APK de teste no Galaxy S26 (sem computador)

1. No celular, abra **https://github.com/Iron026/oficio-app/actions/workflows/android.yml** (logado no GitHub).
2. Toque na execução mais recente com ✅ verde.
3. Role até **Artifacts** e toque em **oficio-apk-debug** (baixa um `.zip`).
4. Abra o app **Meus arquivos → Downloads**, toque no `.zip` e escolha **Extrair**.
5. Toque no arquivo `oficio-0.2.0-build.N-debug.apk`.
6. Se aparecer *“Por segurança, seu telefone não pode instalar apps desconhecidos desta fonte”*: toque em **Configurações** → ative **Permitir desta fonte** → volte.
7. Toque em **Instalar**. Se o *Google Play Protect* avisar sobre app desconhecido, toque em **Mais detalhes → Instalar mesmo assim** (é esperado para APKs de teste fora da Play Store).
8. Abra **Ofício** pela gaveta de apps.

### Atualizar para uma versão mais nova
Repita os passos e toque em **Atualizar**. Os dados são mantidos quando o novo APK tem a **mesma assinatura** do instalado.

### Assinatura estável (configurar uma única vez)
A partir da v0.3, a chave de depuração é **derivada de um segredo** do repositório (`ci/debug_keystore.py`):
mesma chave em todos os builds e branches, sem nenhuma chave privada no código.

1. Gere um texto aleatório longo (30+ caracteres) — ex.: *Gerenciador de senhas do Google → Gerar senha*.
2. Abra **https://github.com/Iron026/oficio-app/settings/secrets/actions** → **New repository secret**.
3. Name: `OFICIO_DEBUG_SEED` · Secret: o texto gerado → **Add secret**.
4. Guarde esse texto em local seguro. Se perdê-lo, uma nova chave será gerada (será preciso reinstalar o app e cadastrar o novo SHA-1 no Firebase).

O resumo de cada build mostra “Assinatura estável: true” e as impressões SHA-1/SHA-256.
**Não é a chave de produção** da Play Store (essa será configurada só com sua autorização).

> Se o Android disser **“App não instalado: conflito de pacote”**, o APK novo tem assinatura diferente
> do instalado (ex.: APKs anteriores à configuração do segredo). Faça **Ajustes → Exportar backup**
> no app antigo → desinstale → instale o novo → **Importar backup** (ou recupere pela conta Google).

## Levar os dados da versão web para o app

1. Na versão web (https://iron026.github.io/oficio-app/): **Ajustes → Exportar backup** (o arquivo vai para *Downloads*).
2. No app Android: **Ajustes → Importar backup** → escolha o arquivo em *Downloads* → **Importar**.

A importação **substitui** os dados do app pelos do arquivo.

## Backup no app Android

**Ajustes → Exportar backup** oferece:
- **Compartilhar**: envia o arquivo para Google Drive, e-mail, WhatsApp etc.
- **Salvar em Documentos**: grava em `Documentos/Oficio/` (app *Meus arquivos*).

O backup automático do Android para a nuvem está **desativado** (`allowBackup=false`): nenhum dado sai do aparelho sem você exportar.

## Detalhes técnicos

| Item | Valor |
| --- | --- |
| Pacote (applicationId) | `io.github.iron026.oficio` — **não alterar** após publicar |
| Origem do WebView | `https://localhost` — **não alterar** (os dados do IndexedDB ficam vinculados a ela) |
| SDK mínimo / alvo | Android 7.0 (API 24) / API 36 |
| Capacitor | 8 (plugins: App, Keyboard, SplashScreen, Filesystem, Share, Haptics; SystemBars do core) |
| Assinatura | Somente **depuração** (CI). Assinatura de produção ainda não configurada — exige sua autorização. |

### Integrações nativas
- **Tela inteira (edge-to-edge)**: `EdgeToEdge.enable` + `SystemBars` com `insetsHandling: css`; o CSS usa `--safe-top/--safe-bottom`.
- **Barras do sistema** acompanham o tema claro/escuro.
- **Botão Voltar**: fecha o painel aberto → volta ao Painel → minimiza o app (`src/platform/backStack.ts`).
- **Teclado**: `adjustResize` + `resizeOnFullScreen`; o campo focado é rolado para o centro.
- **Tela de abertura**: escondida quando os dados terminam de carregar.
- **Vibração** curta ao concluir ações e mais marcada em conquistas/níveis.

### Compilação na nuvem (`.github/workflows/android.yml`)
1. `npm ci` → TypeScript → lint → testes → build web.
2. `cap sync android` → `gradlew assembleDebug` (JDK 21).
3. Verifica a assinatura (`apksigner`) e publica o APK em *Artifacts*.
4. Job **Teste no emulador Android** (API 35): instala o APK e testa abertura, área segura, botão Voltar, cadastro, persistência após forçar o fechamento, modo escuro, exportação e importação de backup. Capturas de tela e logcat ficam em *Artifacts → oficio-e2e-resultados*.

### Compilar localmente (opcional, exige Android SDK)
```bash
npm run android:apk   # build web + cap sync + assembleDebug
```

### Ícone e tela de abertura
Fontes em `assets/` (geradas a partir do logotipo). Para regenerar:
```bash
npx @capacitor/assets generate --android --iconBackgroundColor '#0f7b71' --splashBackgroundColor '#0f7b71' --splashBackgroundColorDark '#0a1215'
```
