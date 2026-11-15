# Entrega — Ofício 0.5.0-rc.1 (candidata interna)

Data: 15/11/2026 · Branch `feat/v0.5-gestao` · Commit da RC: `2b7342f`

Candidata interna para validação no Galaxy S26.

- Sem merge na `main`.
- Sem tag e sem release.
- Sem distribuição pública: o APK fica só como artefato do CI, com acesso restrito ao repositório.
- Regras e dados de produção do Firebase inalterados.

## APK

| Item | Valor |
|---|---|
| Arquivo | `oficio-0.5.0-rc.1-build.127-debug.apk` |
| Download | Artefato `oficio-apk-debug` do run 43759248206: https://github.com/Iron026/oficio-app/actions/runs/43759248206/artifacts/14179662469 (expira em 15/12/2026) |
| SHA-256 do arquivo | `3c876de04e99612d4f8e7acbc4725b5d593cb2c44ccb77c784512396fbde12b9` |
| `versionName` | `0.5.0-rc.1-build.127` |
| `versionCode` | 227 (beta.5 aprovada: 217) |
| `applicationId` | `io.github.iron026.oficio` (inalterado) |
| Assinatura | Chave de depuração estável, a mesma das betas. Uso exclusivo da RC interna. |
| Certificado SHA-256 | `d39f3729217b3e3c59bf3bd43552d0eee13dd1162163e44b32ab3038bdbb67a3` |
| Certificado SHA-1 | `7a36ce3d9d4e8943a3a51aa45c94a7e3ba556bc9` |

O CI conferiu a assinatura ("Assinatura conferida: igual à chave derivada do segredo"). Com o `versionCode` maior e
a mesma chave, o APK atualiza a beta.5 instalada sem desinstalar.

## Commits

Desde a beta.5 (`431ef22`):

| Etapa | Commits | Conteúdo |
|---|---|---|
| Auditoria pré-RC | `de1b34d` … `28d4585` | Ver `docs/AUDITORIA-0.5.md` |
| Estabilização | `e5adca5` … `bc027c7` | Ver `docs/ESTABILIZACAO-0.5.md`. Código validado em `44c9842` |
| RC | `2b7342f` | Versão `0.5.0-rc.1` (`package.json` e `package-lock.json`), notas da versão, README, roteiro e teste da ordem de versões. Sem mudança no código do app |

## Resultados

### CI 43759248168, commit `2b7342f`

| Verificação | Resultado |
|---|---|
| Typecheck, lint, testes e build | Aprovado: 1.298 testes, 100 arquivos |
| Firestore Emulator | Aprovado: regras e sincronização |
| Varredura visual e de acessibilidade, modo estrito | Aprovado |

A varredura cobriu 320, 360 e 412 px, tablet e computador, temas claro e escuro, as 8 paletas, axe WCAG 2.1 AA e a
checagem de controles segmentados.

### Android 43759248206 (emulador API 35): 29/29 etapas

| Área | Resultado |
|---|---|
| Atualização sem perda de dados | Detalhes na tabela abaixo |
| Pagamentos e estornos | Estorno parcial fora de Despesas, saldo de R$ 60,00, relatório do mês coerente, recibo em PDF |
| Backup | Salvar como (JSON íntegro), cancelar (nada salvo), arquivo alterado recusado pela soma, restauração |
| Exportação grande | 1,5 MB gravado inteiro, mesmo processo |
| Exportação com o app encerrado pelo Android | 300 KB gravados em processo novo; temporário apagado |
| Extrato | PDF válido salvo |
| Compartilhamento | Menu do Android (`com.android.intentresolver`) com o FileProvider restrito |
| Notificações | Avisos reais com o app aberto (107 s), em segundo plano (116 s) e fechado (78 s); reabrir não duplica; desligar cancela |
| Navegação e persistência | Voltar do Android, modo escuro, Central de Ajustes, forçar fechamento e reabrir |

Atualização sem perda de dados:

| Salto | Clientes | Atendimentos | Lançamentos | Eventos de XP |
|---|---|---|---|---|
| 0.4.0-beta.7 → 0.5.0-beta.5 | 1 | 1 | 1 | 6 |
| 0.5.0-beta.5 → rc.1 | 1 | 3 | 2 | 9 |

O lembrete agendado na beta.5 chegou depois da atualização (119 s).

## Problemas encontrados nesta etapa

Nenhum defeito novo. Todas as verificações passaram na primeira execução da RC.

Um ponto foi conferido de propósito: a ordem de versões usada na restauração de backups. Um backup da beta.5 aparece
como "anterior" na RC, e um da RC como "anterior" na 0.5.0 final. Agora há teste que fixa essa ordem.

## Riscos residuais

1. **Validação no S26:** exportar um backup real grande, compartilhar recibo e extrato, conferir as abas da Evolução
   e um lembrete com o app fechado. Roteiro em `docs/NOTAS-0.5.0-rc.1.md`.
2. **Uso muito longo:**
   - o estado da sincronização é regravado inteiro a cada alteração;
   - a lista da Agenda não é paginada.

   Recomendado para a 0.6.
3. **`npm audit`:** alertas em dependência de servidor do Firebase (`@grpc/grpc-js`), que não entra no app.
4. **Logs de depuração:** como o APK é de depuração, o Capacitor registra no logcat os parâmetros das chamadas, que
   podem conter dados exportados. Isso desaparece numa compilação de produção. A assinatura de produção depende da
   sua autorização.
5. **Expiração do artefato:** o artefato do CI expira em 15/12/2026. Para guardar o APK por mais tempo, baixe-o
   antes.

## Próximo passo

Validação final no S26. Se aprovada, a criação da 0.5.0 final, o merge na `main`, a tag e a assinatura de produção
dependem de nova autorização.
