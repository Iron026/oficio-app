# Ofício

**Seu trabalho. Sua evolução.**

Aplicativo freemium para profissionais autônomos (manutenção, beleza, limpeza, alimentação e outros) organizarem clientes, agenda e finanças — e acompanharem a própria evolução profissional com níveis, missões, metas e conquistas.

> Versão **0.3 (em desenvolvimento)** · app Android e web · dados no aparelho, com **conta Google opcional** para sincronizar e recuperar dados.
>
> **Acesse:** https://iron026.github.io/oficio-app/

[![CI](https://github.com/Iron026/oficio-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Iron026/oficio-app/actions/workflows/ci.yml)
[![Android APK](https://github.com/Iron026/oficio-app/actions/workflows/android.yml/badge.svg)](https://github.com/Iron026/oficio-app/actions/workflows/android.yml)
[![Deploy](https://github.com/Iron026/oficio-app/actions/workflows/pages.yml/badge.svg)](https://github.com/Iron026/oficio-app/actions/workflows/pages.yml)

## O que tem na 0.2

Tudo da 0.1, agora também como **app Android**: ícone e tela de abertura próprios, tela inteira com barras do sistema no tema, botão Voltar nativo, teclado ajustado, vibração de confirmação e backup para Documentos ou compartilhamento.

### Recursos

| Área | Recursos |
| --- | --- |
| Boas-vindas | Apresentação, escolha da profissão, cadastro do nome/negócio, dados de demonstração opcionais |
| Painel | Nível e XP, receitas/despesas/saldo do mês, meta semanal, próximos serviços, pendências, missões, dica da profissão, atalhos |
| Clientes | Cadastrar, editar, excluir, buscar, ligar, WhatsApp, histórico e total faturado |
| Agenda | Agendar, editar, concluir (com lançamento automático da receita), cancelar, reabrir, excluir |
| Finanças | Receitas e despesas separadas, saldo mensal, navegação por mês, gastos por categoria |
| Evolução | Níveis, XP, missões iniciais e semanais por profissão, metas semanal/mensal, 11 conquistas, crescimento mês a mês, histórico de 6 meses, linha do tempo de XP |
| Ajustes | Perfil, profissão, tema claro/escuro/sistema, plano (Premium “em breve”), backup exportar/importar, dados demo, apagar tudo, privacidade |

## Como usar no celular

- **App Android (APK):** [docs/ANDROID.md](docs/ANDROID.md)
- **Versão web:** [docs/COMO-VISUALIZAR.md](docs/COMO-VISUALIZAR.md)

## Comandos

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm run check        # typecheck + lint + testes + build
npm test             # testes automatizados (Vitest)
npm run test:emulator # regras do Firestore e sincronização no emulador (requer Java)
npm run build        # build de produção em dist/
npm run build:single # app inteiro em um único HTML (dist-single/)
npm run android:apk  # APK de depuração (requer Android SDK; no CI é automático)
```

## Documentação

- [Arquitetura e decisões técnicas](docs/ARQUITETURA.md)
- [Android](docs/ANDROID.md)
- [Conta Google e sincronização](docs/SINCRONIZACAO.md)
- [Configurar o Firebase pelo celular](docs/FIREBASE-SETUP.md)
- [Testes da 0.3 no aparelho](docs/TESTES-0.3.md)
- [Política de privacidade](docs/PRIVACIDADE.md)
- [Gamificação](docs/GAMIFICACAO.md)
- [Como visualizar no celular](docs/COMO-VISUALIZAR.md)
- [Roteiro](docs/ROTEIRO.md)
