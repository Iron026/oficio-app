# Roteiro

## 0.4 (em desenvolvimento — branch `feat/v0.4-design`)
Design, estética e experiência. Etapas: 0 rede de segurança visual · 1 fundamentos do design
system · 2 componentes · 3 telas do dia a dia · 4 Evolução, Ajustes e Boas-vindas · 5 tablets e
computador · 6 acessibilidade, desempenho e entrega. Ver `docs/DESIGN.md`.
- 0.4.0-beta.1: primeiro APK de teste (etapas 0 a 3: design system, componentes, Painel, Agenda, Clientes e Finanças).
- 0.4.0-beta.2: identidade global, Evolução com categorias e selos permanentes, central de Ajustes, foto de perfil
  (só no aparelho e no backup), avatares (pack + 7 SVGs: Ciência, Agronegócio, Educação, Engenharia, Negócios,
  Beleza e Estética, Limpeza), graus do Diamante (R3, só visual). Selos e foto **não** sincronizam até as
  regras novas do Firestore serem autorizadas e publicadas.
- 0.4.0-beta.3: 8 paletas globais (Petróleo padrão), Central de Ajustes por categorias, descrição
  opcional nos lançamentos (categoria obrigatória), extrato mensal em PDF e CSV, tipos de serviço
  personalizados (só no aparelho e no backup), galeria Personagens (mulher e homem por área) e Ícones.
  Medalhões e comemorações da rodada 4 mantidos; XP, níveis e títulos sem mudança (R1/R2 pendentes).
- 0.4.0-beta.4: compatibilidade com a 0.5 — edições preservam campos desconhecidos; pagamentos e estornos da
  0.5 nunca são removidos ao reabrir, cancelar, excluir ou sincronizar; concluir lança só o que falta; backup
  de versão mais nova é avisado e conferido. Sem mudança visual. Ver `docs/COMPATIBILIDADE-0.5.md`.
- 0.4.0-beta.5: correções do teste no S26 — sugestões de serviço atualizam o valor; receita excluída
  deixa o atendimento concluído "sem receita lançada", com "Lançar receita" (sem duplicar nem XP novo);
  "Desfazer" após concluir, reabrir/cancelar, excluir lançamento e lançar receita; vibração desligada
  por padrão (preferência em Privacidade e acessibilidade, respeita o Android); degradê do cabeçalho
  mais suave; comemorações em etapas com pausa; trilha da Evolução sem sobreposição. Nova identidade
  aprovada: logo A (Arco refinado), medalhas redondas nas conquistas e medalhões hexagonais nos selos;
  avisos sem bloquear controles (no máximo 2, um resumo das novidades).
- 0.4.0-beta.6: tela de abertura nativa do Android com a logo A (Android 12+ e anteriores); o aviso com
  "Desfazer" sai ao trocar de tela (em telas pequenas ele podia ficar sobre controles de outra tela);
  checagem automática de toques através dos avisos em 360×640.
  CI Android: o emulador passou a usar `-gpu swangle` (o `swiftshader_indirect` é obsoleto desde o
  emulador 36.4.9 e congelava o emulador com qualquer APK, inclusive os anteriores à beta.5); o teste
  espera o Android se acalmar após o boot e registra memória/CPU da máquina e logcat contínuo.

## 0.3.1 (manutenção — branch `fix/v0.3.1-maintenance`, aguardando aprovação)
- Exportar backup no Android: “Salvar no aparelho” pela janela “Salvar como” (Storage Access
  Framework), sem permissão de armazenamento; corrige o “Permissão negada” da 0.3.0.
- Botões de Ajustes/Conta sem texto cortado em telas estreitas.
- Tela de Privacidade alinhada à Política revisada, com link para o documento completo.
- Versão lida do `package.json` no workflow Android (APK `oficio-0.3.1-build.N-debug.apk`).

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
