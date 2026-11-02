# Gamificação — princípios e regras

## Princípios

- **Utilidade primeiro.** XP vem de ações que ajudam o negócio: cadastrar clientes, organizar a agenda, concluir serviços, controlar o caixa, bater metas reais.
- **Sem penalidades.** XP nunca diminui; não há sequências (streaks) que “quebram”, nem avisos de culpa por ausência.
- **Sem recompensas falsas.** Nada de caixas-surpresa, moedas virtuais ou prêmios aleatórios.
- **Sem XP repetido.** Cada ação tem uma chave única (`appointment_completed:<id>`, `mission:<id>:<semana>`, `achievement:<id>`); a mesma chave nunca pontua duas vezes.
- **Antifarm.** Limite diário por tipo de ação (ex.: no máximo 5 clientes/dia pontuam). Criar e apagar registros não gera XP infinito.
- **Demonstração não conta.** Registros `isDemo` são ignorados.

## Tabela de XP

| Fonte | XP | Regra |
| --- | --- | --- |
| Cliente cadastrado | 10 | 1× por cliente, até 5/dia |
| Serviço agendado | 5 | 1× por serviço, até 6/dia |
| Serviço concluído | 20 | 1× por serviço, até 12/dia |
| Lançamento financeiro | 5 | 1× por lançamento, até 6/dia |
| Missões iniciais | 20 | 1× na vida |
| Missões semanais | 30–40 | 1× por semana (seg–dom) |
| Meta semanal | 50 | 1× por semana |
| Meta mensal | 120 | 1× por mês |
| Conquistas | 50–300 | 1× na vida |

## Níveis

XP total para o nível *n*: `50 × n × (n − 1)` → 0, 100, 300, 600, 1000…
Títulos: Iniciante (1), Aprendiz (3), Profissional (5), Referência (8), Especialista (12), Mestre do Ofício (16).

## Missões por profissão

Cada módulo de profissão define 3 missões semanais com a sua linguagem — ex.: “Realize 5 atendimentos” (beleza), “Entregue 5 encomendas” (alimentação), “Anote o material gasto” (manutenção).

## Onde está o código

- `src/gamification/engine.ts` — regras de ação, missões, metas e `evaluate()` (função pura).
- `src/gamification/achievements.ts` — conquistas baseadas em marcos reais.
- `src/gamification/levels.ts` — curva de níveis.
