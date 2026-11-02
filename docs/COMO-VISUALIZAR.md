# Como visualizar o Ofício no celular

Não é preciso instalar nada no celular além do navegador.

## Opção 1 — GitHub Pages (link permanente, recomendado)

1. No GitHub (pelo navegador do celular), faça o *merge* da branch de desenvolvimento na `main` (abrindo/aprovando o Pull Request).
2. Abra o repositório → **Settings** → **Pages**.
3. Em **Build and deployment → Source**, escolha **GitHub Actions**.
4. Vá em **Actions** → **Deploy GitHub Pages** → **Run workflow** (ou faça qualquer push na `main`).
5. Após ~2 minutos o app estará em `https://<seu-usuario>.github.io/<repositorio>/`.

> Em repositórios privados, o GitHub Pages exige plano pago. Se o repositório for privado no plano gratuito, use a opção 2 ou torne o repositório público.

**Dica:** no Chrome/Samsung Internet, toque em ⋮ → **Adicionar à tela inicial** para abrir como app.

## Opção 2 — Arquivo único

`npm run build:single` gera `dist-single/index.html`, que contém o app inteiro em um só arquivo e pode ser hospedado em qualquer lugar (ou aberto como página publicada).

## Sobre os dados

Os dados ficam salvos no navegador do aparelho (IndexedDB), separados por endereço: o app aberto pelo GitHub Pages e por outro link têm dados independentes. Use **Ajustes → Exportar backup** para levar os dados de um para outro.
