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

## Bug no backfill descoberto na verificação pós-fix (mesmo dia)

Ao conferir o dashboard depois do fix, os destaques "MTTD mais críticas" mostravam **24:00** para 3 atividades — impossível pra uma janela de deslocamento. Causa: `Hora Chegada` só guarda `HH:MM` (sem segundos), enquanto `Timestamp Despacho` guarda segundos exatos. Quando a chegada cai no mesmo minuto do despacho (ex: despacho `00:45:24`, chegada `00:45:00`), a chegada "parece" ser alguns segundos *antes* do despacho — e a lógica de rollover de dia (`if (chegada < despacho) chegada += 24h`) disparava por engano, gerando 1439–1440 min de diferença.

**Correção:** em `diferencaTimestampAteHora` e `recalcularMTTRMTTDHistorico`, a comparação que decide se cruzou a meia-noite agora ignora os segundos (compara contra uma cópia do timestamp de início com segundos zerados), e o resultado final é sempre `Math.max(0, ...)` pra nunca ficar negativo.

- Nova versão implantada: **Versão 20**, mesma URL
- Backfill rodado de novo: **11 recalculadas, 0 puladas** (a esteira é usada ao vivo, então o total de `VALIDADA` mudou de 14→11 entre as duas rodadas — não é bug)
- Confirmado nos 3 registros antes quebrados (`ATV-1784519043912`, `ATV-1784521581307`, `ATV-1784522687780`): MTTD agora `00:00`, correto
- Varredura completa das 11 atividades validadas: 0 sem MTTD, 0 valores suspeitos (≥3h)
- `dashboard_gestao.html` e `tecnico.html` testados localmente (servidor HTTP temporário) e confirmados puxando dados da API corrigida

## Problema recorrente ao editar no navegador: chaves duplicadas

Em pelo menos 2 ocasiões, digitar código multi-linha no editor Monaco do Apps Script via automação de teclado gerou **chaves `}` órfãs ou blocos de código embaralhados** (conteúdo antigo e novo se misturando). Causa provável: o autocompletar/autocorreção do Monaco reage a `Enter` logo após `{` inserindo uma chave de fechamento automática que "sobra" quando o conteúdo é digitado em lotes grandes.

**Mitigação que funcionou:** dividir a digitação em blocos pequenos (2-4 linhas) com `Escape` entre cada bloco pra fechar qualquer popup de sugestão aberto, e **sempre salvar + conferir o dropdown de funções / erro de sintaxe imediatamente depois de qualquer edição no Apps Script**, antes de seguir em frente.

## Lição para o futuro

1. Ao editar o Apps Script pelo editor web, **sempre confirmar em qual dos 3 projetos** ("Netturbo Esteira - Base" é o de produção) e **nunca colar um trecho parcial substituindo tudo** — sempre mesclar no arquivo completo antes de salvar.
2. Depois de qualquer edição, checar `Implantar → Gerenciar implantações` e criar **Nova versão** explicitamente (salvar/editar código não atualiza a URL pública sozinho).
3. Depois de editar código no editor Monaco via automação, **sempre salvar e checar erro de sintaxe / dropdown de funções antes de seguir** — chaves duplicadas/órfãs são um risco real e nem sempre óbvio visualmente.
4. Ao calcular diferenças de tempo entre um timestamp com segundos e um horário só `HH:MM`, **ignorar segundos na comparação de rollover de dia** — senão casos "mesmo minuto" disparam falsos positivos de 24h.
