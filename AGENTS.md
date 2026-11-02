# Ofício — instruções para agentes

Projeto **React 19 + TypeScript + Vite + Tailwind CSS v4** (não é Next.js).

- Leia `docs/ARQUITETURA.md` antes de alterar código.
- Regras de negócio ficam em `src/domain`, `src/gamification` e `src/state/service.ts` — nunca em componentes.
- Persistência só via a interface `StorageAdapter` (`src/storage/types.ts`).
- Textos da interface em português brasileiro; use a terminologia da profissão (`profession.terms`).
- Antes de commitar: `npm run check` (typecheck, lint, testes e build).
- Não implemente cobrança real nem apresente compras fictícias como funcionais.
- Publicação: push na `main` → GitHub Pages em https://iron026.github.io/oficio-app/ (`VITE_BASE=/oficio-app/`).
- Android: Capacitor 8 em `android/` (versionado). Código nativo-dependente só em `src/platform/`. Não altere `appId` nem a origem `https://localhost`.
- Nunca versione chaves (`*.jks`, `*.keystore`). Assinatura de produção só com autorização do responsável.
