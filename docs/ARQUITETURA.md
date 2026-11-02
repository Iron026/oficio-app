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
8. **Concluir ⇄ financeiro.** Ao concluir um serviço, a receita pode ser lançada automaticamente e fica vinculada (`appointmentId`/`transactionId`). Reabrir, cancelar ou excluir o serviço remove essa receita para não duplicar valores.
9. **Excluir cliente** mantém o histórico de serviços e o financeiro, apenas desvinculando o cliente.
10. **Dados de demonstração** têm `isDemo: true`, exibem o selo “Demonstração”, geram um aviso global, não contam para XP/conquistas e podem ser removidos de uma vez.
11. **Monetização preparada, não ativa.** `monetization/catalog.ts` descreve recursos gratuitos, Premium (assinatura) e compras únicas; `entitlements.ts` responde “pode usar?”. A interface `BillingProvider` define o contrato para o futuro Google Play Billing. Itens futuros aparecem como “Em breve” e não podem ser adquiridos.
12. **Acessibilidade.** Rótulos associados a campos, mensagens de erro com `role="alert"`, diálogos com `aria-modal` e foco preso, `role="progressbar"`, navegação com `aria-current`, alvos de toque ≥ 44 px, `prefers-reduced-motion` respeitado.

## Privacidade e segurança

- Nenhum dado sai do aparelho; não há analytics, anúncios ou chamadas de rede.
- Backup é um arquivo JSON gerado e importado localmente, com validação de formato.
- `.env*` está no `.gitignore`; não há credenciais no código.

## Android (Capacitor 8)

O mesmo código web roda no app Android via Capacitor. Integrações nativas ficam isoladas em `src/platform/`:

- `native.ts` — detecção de plataforma, tela de abertura, barras do sistema, teclado, vibração e botão Voltar. No navegador, todas as funções viram no-op.
- `backStack.ts` — pilha de “voltar”: cada painel (`Sheet`) aberto registra como se fecha.
- `files.ts` — salvar/compartilhar o backup (download no navegador; Documentos ou menu de compartilhar no Android).

Valores que não podem mudar depois de publicado: `appId` e a origem `https://localhost` (ver `capacitor.config.ts`). Detalhes e instalação em [ANDROID.md](ANDROID.md).

O diretório `android/` é versionado (projeto nativo). Arquivos gerados (`assets/public`, `build/`, chaves `*.jks`/`*.keystore`) são ignorados.
