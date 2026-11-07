# Ofício

**Seu trabalho. Sua evolução.**

Aplicativo freemium para profissionais autônomos (manutenção, beleza, limpeza, alimentação e outros) organizarem clientes, agenda e finanças — e acompanharem a própria evolução profissional com níveis, missões, metas e conquistas.

> Versão **0.5.0-beta.1 (em teste)** · app Android e web · dados no aparelho, com **conta Google opcional** para sincronizar e recuperar dados.
>
> **Acesse:** https://iron026.github.io/oficio-app/

[![CI](https://github.com/Iron026/oficio-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Iron026/oficio-app/actions/workflows/ci.yml)
[![Android APK](https://github.com/Iron026/oficio-app/actions/workflows/android.yml/badge.svg)](https://github.com/Iron026/oficio-app/actions/workflows/android.yml)
[![Deploy](https://github.com/Iron026/oficio-app/actions/workflows/pages.yml/badge.svg)](https://github.com/Iron026/oficio-app/actions/workflows/pages.yml)

## O que tem na 0.5 (beta.1)

Pagamentos (serviço realizado separado do dinheiro recebido: integral, parcial, antecipado, estornos e
valores a receber) e agenda com visões dia, semana e mês, duração e aviso de conflito. Ver
[Plano da 0.5](docs/PLANO-0.5.md). Tudo o que a 0.4 trouxe continua igual:

## O que tem na 0.4 (beta.7)

Identidade visual nova (design system, 8 paletas, temas claro/escuro, animações com opção de reduzir), evolução com
categorias, medalhões e selos permanentes, Central de Ajustes e ferramentas do dia a dia. Tudo funciona sem internet.

### Recursos

| Área | Recursos |
| --- | --- |
| Boas-vindas | Apresentação, escolha da profissão, cadastro do nome/negócio, dados de demonstração opcionais e identificados |
| Painel | Nível, categoria e XP, receitas/despesas/saldo do mês (com botão para **ocultar valores**), meta semanal, próximos serviços, pendências, missões, atalhos |
| Clientes | Cadastrar, editar, excluir (com **Desfazer**), buscar, ligar, WhatsApp, histórico e valor dos serviços concluídos |
| Agenda | **0.5:** visões Lista, Dia (00–24 h), Semana e Mês; duração; aviso de conflito que não bloqueia. Agendar com atalhos de serviço, editar, concluir **escolhendo quanto recebeu** (nada pré-selecionado), cancelar, reabrir, excluir — com **Desfazer** |
| Finanças | **0.5:** pagamentos e estornos por atendimento, “A receber” separado do saldo. Receitas e despesas (categoria obrigatória, descrição opcional), saldo mensal, ocultar valores, gastos por categoria, **extrato do mês em PDF e CSV** |
| Evolução | Níveis, categorias com medalhões e comemoração única, selos permanentes, missões, metas, conquistas, histórico |
| Ajustes | Central por categorias: aparência (tema, **8 paletas**, densidade), perfil e negócio (imagem com **galeria de personagens e ícones**, selo, metas, tipos de serviço), privacidade e acessibilidade, conta e sincronização, backup e dados (exportar, restaurar com resumo e verificação, cópias de segurança automáticas), sobre |

Detalhes e decisões: [Arquitetura](docs/ARQUITETURA.md) · [Design](docs/DESIGN.md) · [Avatares](docs/AVATARES.md) · [Auditoria da 0.4](docs/AUDITORIA-0.4.md) · [Compatibilidade com a 0.5](docs/COMPATIBILIDADE-0.5.md).

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
