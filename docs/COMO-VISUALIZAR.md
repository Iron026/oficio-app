# Como visualizar o Ofício no celular

**Endereço oficial:** https://iron026.github.io/oficio-app/

Basta abrir no navegador do celular. Para usar como app, toque em ⋮ → **Adicionar à tela inicial** (Chrome) ou ☰ → **Adicionar página a → Tela inicial** (Samsung Internet).

## Como a publicação funciona

- Cada push na branch `main` executa o workflow **Deploy GitHub Pages** (`.github/workflows/pages.yml`): typecheck, lint, testes, build com `VITE_BASE=/oficio-app/` e publicação.
- Se algum teste falhar, nada é publicado.
- Acompanhe em **Actions** no repositório.

### Configuração única (já feita uma vez por repositório)

Repositório → **Settings** → **Pages** → **Build and deployment → Source: GitHub Actions**.

Para republicar manualmente: **Actions → Deploy GitHub Pages → Run workflow**.

## Arquivo único (alternativa)

`npm run build:single` gera `dist-single/index.html` com o app inteiro em um só arquivo.

## Sobre os dados

Os dados ficam salvos no navegador do aparelho (IndexedDB), separados por endereço. Use **Ajustes → Exportar backup** para levar os dados de um endereço/aparelho para outro.
