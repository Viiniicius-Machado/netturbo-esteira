# Fix da fórmula de MTTR/MTTD — 20/07/2026

## Contexto

O usuário reportou que o cálculo de MTTR e MTTD no dashboard (`dashboard_gestao.html`) parecia errado. Investigação feita a partir de uma amostra real de 12 chamados da aba `ESTEIRA`.

## Diagnóstico

O backend (Google Apps Script, projeto **"Netturbo Esteira - Base"**, função `validarAtividade`) calculava:

```
MTTR (antigo) = Hora Início     → Timestamp Validação   (deslocamento + reparo + validação)
MTTD (antigo) = Hora Chegada    → Timestamp Validação   (só reparo em campo)
```

Os dois terminavam no mesmo ponto (Validação), então "MTTD" era só um "MTTR menor" (sem o deslocamento) — não media detecção/tempo de resposta nenhum. As metas (`META_MTTR_MIN=240` / 4:00, `META_MTTD_MIN=210` / 3:30) estavam calibradas em cima dessa base errada.

## Fórmula corrigida

```
MTTD = Timestamp Despacho → Hora Chegada     (tempo até localizar o problema em campo)
MTTR = Hora Chegada       → Timestamp Validação (tempo de reparo efetivo em campo)
```

Decisão confirmada com o usuário via pergunta direta (não inferida).

## Metas atualizadas

| Métrica | Antes | Depois | Motivo |
|---|---|---|---|
| MTTR (Chegada→Validação) | 4:00 | **4:00 (mantido)** | Usuário optou por manter o número, mesmo mudando o que a janela mede |
| MTTD (Despacho→Chegada) | 3:30 | **1:00** | Nova janela é bem menor (deslocamento até chegar), 3:30 não fazia mais sentido |

Arquivos alterados no repositório git (`netturbo-esteira`):
- `dashboard_gestao.html`: `META_MTTD_MIN` 210→60, labels dos cards ("Meta ≤3:30"→"Meta ≤1:00")
- `tecnico.html`: mesmo ajuste no resumo mensal do técnico (label + cor do indicador)

Commit: `Ajusta meta de MTTD para 1:00 após correção da fórmula (Despacho→Chegada)` — pushed para `main` (`9196d21..0d24073`).

## Mudança no Apps Script (fora do repositório git)

O backend vive em 3 projetos separados no Apps Script do usuário (`script.google.com`), **não versionados neste repo**:

| Projeto | O que é |
|---|---|
| **Netturbo Esteira - Base** | Script de produção real, container-bound à planilha `ESTEIRA`. É o que está deployado na URL usada pelo site (`APPS_SCRIPT_URL` em `dashboard_gestao.html`/`index.html`/`tecnico.html`). |
| Netturbo Esteira | Cópia/versão antiga, **não é** a deployada (deployment com URL diferente da usada pelo site) |
| Projeto sem título | Sistema completamente diferente (RFO / O&M v3), não relacionado à Esteira |

Alterações feitas em `validarAtividade` (dentro do bloco `if (data.aprovado)`):
- `MTTD` agora usa `Timestamp Despacho` + `Hora Chegada` (nova função `diferencaTimestampAteHora`)
- `MTTR` agora usa `Hora Chegada` + horário de validação (mesma `diferencaHoras` de antes, só trocando o argumento de início)

Funções novas adicionadas ao script:
- `parseTimestampBR(str)` — parseia `"dd/mm/yyyy, HH:MM:SS"` pra um `Date`
- `diferencaTimestampAteHora(timestamp, horaFim)` — diferença entre um timestamp completo e uma hora `HH:MM`, com rollover de dia
- `recalcularMTTRMTTDHistorico()` — função de backfill, roda manualmente uma vez (Executar → selecionar no dropdown), recalcula MTTD/MTTR de todas as linhas já `VALIDADA`

O código-fonte completo (script inteiro, já com o fix aplicado) está salvo em `.claude/docs/netturbo-esteira-apps-script-2026-07-20.gs` neste mesmo diretório, para referência — é o que está hoje no editor do Apps Script.

## Incidente durante a aplicação do fix (site ficou fora do ar)

Ao colar o trecho do fix no editor do Apps Script, o **conteúdo inteiro do script de produção foi substituído** (não complementado) — sumiram `doGet`, `doPost`, `HEADERS_ESTEIRA` e todas as outras funções. A URL pública passou a retornar `Função de script não encontrada: doGet`, derrubando `index.html`, `tecnico.html` e `dashboard_gestao.html` (todos dependem dessa API).

**Resolução:**
1. Reconstruído o script completo (conteúdo original + fix mesclado corretamente)
2. Colado de volta no editor via digitação simulada (clipboard não funcionou nesse ambiente de automação — `navigator.clipboard.writeText/readText` trava sem gesto de usuário genuíno)
3. Um erro de sintaxe (chave `}` duplicada, efeito colateral do auto-fechamento de colchetes do editor Monaco ao digitar) foi identificado pelo próprio validador do Apps Script (`SyntaxError` na linha 89) e corrigido
4. Salvo com sucesso (sem erros de sintaxe, todas as ~30 funções reconhecidas no dropdown)
5. Implantada **nova versão (19)** na mesma implantação/URL já usada pelo site (`Implantar → Gerenciar implantações → editar → Nova versão`)
6. Testado: `GET .../exec?acao=LISTAR_ESTEIRA` voltou a responder com JSON válido — site restaurado
7. Rodado `recalcularMTTRMTTDHistorico()` — **14 atividades recalculadas, 0 puladas**

## Lição para o futuro

Ao editar o Apps Script pelo editor web, **sempre confirmar em qual dos 3 projetos** ("Netturbo Esteira - Base" é o de produção) e **nunca colar um trecho parcial substituindo tudo** — sempre mesclar no arquivo completo antes de salvar. Depois de qualquer edição, checar `Implantar → Gerenciar implantações` e criar **Nova versão** explicitamente (salvar/editar código não atualiza a URL pública sozinho).
