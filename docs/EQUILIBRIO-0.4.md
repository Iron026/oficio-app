# Curva de dificuldade — análise (0.4)

**Somente análise. Nenhuma regra aprovada foi alterada** (fórmula de níveis, títulos, XP por ação,
limites dos selos, conquistas e missões continuam como estão).

## Regras atuais

- Nível: XP total para o nível N = `50 · N · (N − 1)` (o nível N+1 exige 100·N XP a mais).
- XP por ação (uma vez por registro, com limite diário): cliente 10 (5/dia), agendamento 5 (6/dia),
  conclusão 20 (12/dia), lançamento 5 (6/dia). Meta semanal 50, meta mensal 120.
- Missões iniciais 3 × 20 XP; semanais 2 por profissão, 30–40 XP cada.
- 11 conquistas, ~1 490 XP no total (únicas).
- Categorias (derivadas do nível): Bronze 3, Prata 5, Ouro 8, Platina 12, Diamante 16.
- Selos (sem XP): limites I/II/III/IV aprovados.

## Simulação (3 perfis, semana a semana)

| Perfil | XP/semana | Bronze | Prata | Ouro | Platina | Diamante |
| --- | --- | --- | --- | --- | --- | --- |
| Leve (≈4 atendimentos/semana) | ≈180 | 1 sem. | 4 sem. | 13 sem. | 30 sem. | **60 sem.** |
| Típica (≈10/semana) | ≈410 | 1 sem. | 2 sem. | 5 sem. | 14 sem. | **27 sem.** |
| Intensa (≈25/semana) | ≈870 | 1 sem. | 1 sem. | 3 sem. | 7 sem. | **13 sem.** |

Selos — semanas até o estágio IV (— = não alcança em 3 anos):

| Perfil | Experiência | Carteira | Constância | Metas | Saúde financeira |
| --- | --- | --- | --- | --- | --- |
| Leve | 125 | — | 87 | — | ≈56 |
| Típica | 50 | 85 | 38 | 96 | ≈56 |
| Intensa | 20 | 35 | 29 | 60 | ≈56 |

Premissas: metas batidas em 30 % / 70 % / 90 % das semanas; meta mensal em 25 % / 50 % / 80 % dos meses;
clientes novos 1 / 2 / 4 por semana sobre uma base inicial de 15 / 30 / 60; 90 % dos meses no azul.

## Leitura

1. **Início rápido (bom):** as conquistas únicas (~1 490 XP) levam quase todos a Prata no primeiro mês.
2. **Categorias acabam cedo para quem usa muito:** Diamante em ~3 meses (intensa) ou ~6 meses (típica).
   Depois disso o nível continua subindo, mas sem nova moldura — os selos passam a ser o objetivo de longo prazo.
3. **Selos têm horizonte longo (adequado):** estágio IV entre 5 meses e 2 anos para o perfil típico.
4. **Carteira IV (200 clientes) é inalcançável para negócios pequenos** (perfil leve), e Metas IV
   (12 meses com a meta) leva ~2 anos no perfil típico.
5. **Risco de abuso:** a meta semanal mínima é 1 serviço e a mensal R$ 1,00. Quem baixa a meta ganha
   XP de meta e avança Constância/Metas sem esforço real.

## Recomendações (para decisão; não aplicadas)

| # | Recomendação | Impacto | Custo |
| --- | --- | --- | --- |
| R1 | Metas mínimas proporcionais ao histórico (ex.: ≥ 50 % da média dos últimos 4 períodos) para contar XP de meta e selos Constância/Metas | Fecha o abuso (item 5) | Baixo |
| R2 | Limites de Carteira por porte/profissão (ex.: 10/25/50/100 para confeitaria e limpeza) | Torna o selo alcançável | Médio |
| R3 | Manter a fórmula; após o Diamante, mostrar "Diamante II, III…" a cada 5 níveis (só visual) | Dá objetivo a quem usa muito, sem mudar XP | Médio |
| R4 | Alternativa a R3: fórmula mais íngreme a partir do nível 12 | Atrasa Platina/Diamante | Alto (muda progresso de quem já está lá) |
| R5 | Metas IV com 9 meses em vez de 12 | Aproxima o horizonte dos outros selos | Baixo |

Recomendação: **R1** (segurança das regras) e **R3** (sem mexer em XP). R4 não é recomendada agora,
pois alteraria o nível de quem já usa o app.
