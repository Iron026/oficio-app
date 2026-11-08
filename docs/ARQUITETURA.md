# Arquitetura — Ofício 0.1

## Stack

- **React 19 + TypeScript (strict)** — interface.
- **Vite** — build; `base: './'` gera caminhos relativos (funciona no GitHub Pages, em subpastas e no WebView do Capacitor).
- **Tailwind CSS v4** — estilos, com tokens semânticos (`bg-surface`, `text-muted`, `border-line`...) definidos em `src/index.css`. O modo escuro troca apenas as variáveis CSS.
- **IndexedDB** — persistência local (no Android, dentro do WebView do app).
- **Capacitor 8** — empacotamento Android.
- **Vitest + Testing Library + fake-indexeddb** — testes.
- **lucide-react** — ícones.

Não há servidor, chaves de API ou segredos no projeto.

## Estrutura

```
src/
  domain/            Regras e dados puros (sem React)
    types.ts           Entidades: Profile, Client, Appointment, Transaction, XpEvent...
    professions/       Módulos de profissão (terminologia, serviços, categorias, dicas, missões)
    finance.ts         Totais, saldo, categorias, crescimento
    insights.ts        Histórico mensal, próximos/pendentes
    demo.ts            Gerador de dados de demonstração (isDemo: true)
  gamification/      Níveis, conquistas e motor de XP (funções puras)
  monetization/      Catálogo de planos/recursos e entitlements (sem cobrança)
  storage/           Interface StorageAdapter + IndexedDB + memória + backup
  state/
    service.ts         AppService: casos de uso (CRUD + gamificação + persistência)
    AppContext.tsx     Liga o serviço ao React (useSyncExternalStore), feedback e tema
    router.ts          Roteamento por hash (#/painel, #/agenda...)
  ui/                Componentes acessíveis reutilizáveis (Button, Field, Sheet, Toast, Confirm...)
  screens/           Telas e formulários
```

## Decisões

1. **Camadas separadas.** Telas não contêm regra de negócio: chamam `AppService`, que valida, persiste e calcula XP. Isso permite testar tudo sem interface e trocar a interface no futuro.
2. **Armazenamento substituível.** Toda persistência passa por `StorageAdapter` (`src/storage/types.ts`). Para sincronizar com a nuvem, cria-se um novo adapter (ex.: IndexedDB local + fila de sincronização) e troca-se apenas `createStorage()` em `src/storage/index.ts`. As entidades já têm `id` (UUID), `createdAt` e `updatedAt`, necessários para sincronização.
3. **Profissões modulares.** Um único app; cada profissão é um objeto `ProfessionModule` com terminologia (“Atendimento”, “Encomenda”, “Limpeza”…), serviços sugeridos, categorias financeiras, dicas e missões. Para adicionar uma profissão basta criar um módulo em `src/domain/professions/index.ts`.
4. **Dinheiro em centavos (inteiros)** — evita erros de ponto flutuante. Entrada aceita “150”, “150,50”, “1.234,56”.
5. **Datas locais `YYYY-MM-DD`** — evita deslocamentos de fuso horário em agendas e lançamentos.
6. **Roteamento por hash** — funciona sem configuração de servidor (Pages, arquivo único, Capacitor).
7. **Operações serializadas** — `AppService` enfileira gravações para evitar condições de corrida.
8. **Concluir ⇄ financeiro (0.5).** Concluir exige escolher quanto foi recebido; cada recebimento é um pagamento (receita com `appointmentId` e marcador `payment`), e estornos são despesas vinculadas que apontam o pagamento (`payment.of`). Resumo derivado em `domain/payments.ts`. Em Finanças (beta.2), `domain/finance.ts#totals` separa recebimentos brutos, estornos (`refund`) e despesas; saldo = receitas − estornos − despesas. Reabrir, cancelar ou excluir nunca apagam dinheiro. A receita automática da 0.4 (`transactionId`) continua valendo como pagamento integral. Contrato em [COMPATIBILIDADE-0.5.md](COMPATIBILIDADE-0.5.md).
9. **Conclusão antecipada.** Concluir um serviço cuja data (local) ainda não chegou pede confirmação (“Voltar” / “Concluir mesmo assim”); datas de hoje ou anteriores não perguntam nada. A receita gerada mantém a regra atual (data de hoje) e, em Finanças, exibe o selo discreto “Data futura · dd mmm”. O selo é **derivado** (`futureServiceDateFor`): não é gravado, não altera cálculos e some sozinho quando a data chega ou o serviço é reagendado. A receita ainda não distingue previsto × recebido (planejado para versões futuras).
10. **Excluir cliente** mantém o histórico de serviços e o financeiro, apenas desvinculando o cliente.
11. **Dados de demonstração** têm `isDemo: true`, exibem o selo “Demonstração”, geram um aviso global, não contam para XP/conquistas e podem ser removidos de uma vez.
12. **Monetização preparada, não ativa.** `monetization/catalog.ts` descreve recursos gratuitos, Premium (assinatura) e compras únicas; `entitlements.ts` responde “pode usar?”. A interface `BillingProvider` define o contrato para o futuro Google Play Billing. Itens futuros aparecem como “Em breve” e não podem ser adquiridos.
13. **Acessibilidade.** Rótulos associados a campos, mensagens de erro com `role="alert"`, diálogos com `aria-modal` e foco preso, `role="progressbar"`, navegação com `aria-current`, alvos de toque ≥ 44 px, `prefers-reduced-motion` respeitado.
14. **Design system (0.4).** Cores, tipografia (Manrope local em títulos e números; fonte do sistema no corpo), espaçamento e movimento ficam em tokens de `src/index.css`, documentados em [`docs/DESIGN.md`](DESIGN.md). Contrastes são testados (`src/ui/tokens.test.ts`) e a rede de segurança visual (`npm run visual`) gera capturas e verifica acessibilidade em celular, tablet e computador.

## Agenda (0.5)

`src/domain/agenda.ts`: horários de parede (data + hora locais) convertidos em minutos absolutos por dia de calendário (`Date.UTC`), sem `Date` local — fuso e horário de verão não deslocam nada. Duração opcional (`appointment.duration`; sem ela só o início é conhecido e nada é presumido), conflitos por sobreposição (nunca bloqueiam; sem duração, só quando o início cai num intervalo conhecido ou coincide com outro início), grades de dia/semana/mês. Telas em `src/screens/agenda/`.

## Conta e sincronização (v0.3)

Ver [SINCRONIZACAO.md](SINCRONIZACAO.md). Resumo: `TrackedStorage` registra alterações locais; `SyncEngine` envia/recebe pelo `RemoteStore` (Firestore) com controle de revisão e mesclagem em 3 vias; `AccountController` orquestra login e associação. Sem Firebase configurado, o app é 100% local.

## Identidade e progressão (v0.4)

- `src/gamification/tiers.ts`: categorias **derivadas** do nível (faixas dos títulos existentes; não são gravadas).
- `src/gamification/seals.ts`: selos calculados dos registros reais; o maior estágio fica em `sealAwards` e nunca diminui.
- `src/domain/preferences.ts`: preferências da conta (`settings`: destaque, avatar, selo em destaque) e do aparelho
  (`DevicePrefs` em `kv`: tema, densidade, ocultar valores, animações — não vão para a nuvem nem para o backup).
- `src/domain/profileImage.ts` + `src/ui/photoEncode.ts`: limites e preparo da foto no aparelho (recorte, 320 px, ≤ 64 KiB).
- IndexedDB v4 (stores `sealAwards`, `profileImages` e, na rodada 3, `serviceTypes`). Cada versão só cria stores novos;
  nada é apagado. Backup continua na versão 1 (campos novos opcionais).
- `src/domain/serviceTypes.ts`: tipos de serviço personalizados (atalhos de nome e valor na agenda), com ordem,
  fixação e nomes únicos (sem diferenciar acentos). Não dão XP. Regras em `AppService` (`saveServiceType`…).
- `src/domain/statement.ts` + `src/lib/pdf.ts`/`statementPdf.ts`: extrato mensal em CSV (Excel pt-BR) e PDF
  sem dependências (Helvetica/WinAnsi). Só leitura.
- `src/styles/palettes.css` + `src/ui/palettes.ts`: 8 paletas (escala `brand-*` e `--hero-*`); testes de contraste
  em `src/ui/palettes.test.ts`. Central de Ajustes em `src/screens/settings/` (rotas `#/ajustes/<página>`).

## Privacidade e segurança

- Sem conta: nenhum dado sai do aparelho. Com conta Google (opcional): cópia no Firestore, acessível só pela própria conta (ver [PRIVACIDADE.md](PRIVACIDADE.md)). Sem analytics, anúncios ou rastreadores.
- Backup é um arquivo JSON gerado e importado localmente, com validação de formato.
- `.env*` está no `.gitignore`; não há credenciais no código.

## Android (Capacitor 8)

O mesmo código web roda no app Android via Capacitor. Integrações nativas ficam isoladas em `src/platform/`:

- `native.ts` — detecção de plataforma, tela de abertura, barras do sistema, teclado, vibração e botão Voltar. No navegador, todas as funções viram no-op.
- `backStack.ts` — pilha de “voltar”: cada painel (`Sheet`) aberto registra como se fecha.
- `files.ts` — salvar/compartilhar o backup (download no navegador; janela “Salvar como” do Android via plugin `OficioFiles`, ou menu de compartilhar).

Valores que não podem mudar depois de publicado: `appId` e a origem `https://localhost` (ver `capacitor.config.ts`). Detalhes e instalação em [ANDROID.md](ANDROID.md).

O diretório `android/` é versionado (projeto nativo). Arquivos gerados (`assets/public`, `build/`, chaves `*.jks`/`*.keystore`) são ignorados.
