# Ofício

**Seu trabalho. Sua evolução.**

Aplicativo freemium para profissionais autônomos (manutenção, beleza, limpeza, alimentação e outros) organizarem clientes, agenda e finanças — e acompanharem a própria evolução profissional com níveis, missões, metas e conquistas.

> Versão **0.1** · funciona no navegador do celular · dados salvos apenas no aparelho (IndexedDB).

## O que tem na 0.1

| Área | Recursos |
| --- | --- |
| Boas-vindas | Apresentação, escolha da profissão, cadastro do nome/negócio, dados de demonstração opcionais |
| Painel | Nível e XP, receitas/despesas/saldo do mês, meta semanal, próximos serviços, pendências, missões, dica da profissão, atalhos |
| Clientes | Cadastrar, editar, excluir, buscar, ligar, WhatsApp, histórico e total faturado |
| Agenda | Agendar, editar, concluir (com lançamento automático da receita), cancelar, reabrir, excluir |
| Finanças | Receitas e despesas separadas, saldo mensal, navegação por mês, gastos por categoria |
| Evolução | Níveis, XP, missões iniciais e semanais por profissão, metas semanal/mensal, 11 conquistas, crescimento mês a mês, histórico de 6 meses, linha do tempo de XP |
| Ajustes | Perfil, profissão, tema claro/escuro/sistema, plano (Premium “em breve”), backup exportar/importar, dados demo, apagar tudo, privacidade |

## Como ver no celular

Veja [docs/COMO-VISUALIZAR.md](docs/COMO-VISUALIZAR.md).

## Comandos

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm run check        # typecheck + lint + testes + build
npm test             # testes automatizados (Vitest)
npm run build        # build de produção em dist/
npm run build:single # app inteiro em um único HTML (dist-single/)
```

## Documentação

- [Arquitetura e decisões técnicas](docs/ARQUITETURA.md)
- [Gamificação](docs/GAMIFICACAO.md)
- [Como visualizar no celular](docs/COMO-VISUALIZAR.md)
- [Roteiro](docs/ROTEIRO.md)
