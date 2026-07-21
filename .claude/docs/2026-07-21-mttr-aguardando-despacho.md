# MTTR passa a contar da entrada em Aguardando Despacho — 21/07/2026

## Contexto

O usuário concluiu, analisando o indicador, que o MTTR (meta ≤4:00) deveria contar o tempo desde
que a atividade entra na esteira (coluna **Aguardando Despacho**) até a validação — não só o tempo
de reparo em campo (Chegada → Validação, fórmula vigente desde o fix de 20/07/2026, documentado em
`2026-07-20-fix-mttr-mttd.md`).

## Fórmula alterada

```
MTTR (antes) = Hora Chegada       → Timestamp Validação  (só reparo em campo)
MTTR (agora) = Timestamp Recebido → Timestamp Validação   (despacho + deslocamento + reparo)
```

MTTD (Despacho → Chegada) **não mudou**.

`Timestamp Recebido` é gravado em `criarAtividade` no exato momento em que a atividade entra em
`AGUARDANDO_DESPACHO` — é o carimbo de "entrada na esteira" que o usuário pediu.

## Consequência esperada

O MTTR agora é bem maior que antes (passa a incluir o tempo de espera por despacho e o
deslocamento). A meta de 4:00 no front-end (`META_MTTR_MIN` em `dashboard_gestao.html` e
`tecnico.html`) **não foi recalibrada nesta mudança** — o usuário só pediu a mudança de fórmula, não
de meta. Como o MTTR agora mede uma janela bem maior, é provável que a maioria das atividades passe
a estourar a meta de 4:00; recomendar ao usuário que reavalie essa meta depois de ver alguns dias de
dados reais com a fórmula nova.

## Bug descoberto durante a implementação: `Timestamp Recebido` não tem `@STRING@`

Diferente de `Timestamp Despacho` e `Timestamp Validação` (que sempre levam
`setNumberFormat('@STRING@')` antes do `setValue`), a coluna `Timestamp Recebido` nunca recebeu esse
tratamento em `criarAtividade`. Resultado: o Google Sheets detecta o texto
`new Date().toLocaleString('pt-BR')` como uma data e converte a célula sozinho para o tipo Date —
então `parseTimestampBR` (que esperava sempre uma string `"dd/mm/yyyy, HH:MM:SS"`) recebia um objeto
Date e devolvia `null` pra tudo.

**Correção:** `parseTimestampBR` agora detecta um valor que já é Date e devolve direto, sem tentar
parsear como string:

```js
function parseTimestampBR(str) {
  if (Object.prototype.toString.call(str) === '[object Date]') return str;
  // ...resto do parse por regex, inalterado
}
```

### Por que `Object.prototype.toString.call(x) === '[object Date]'` e não `x instanceof Date`

Primeira tentativa usou `str instanceof Date`, que funcionou na função `validarAtividade` (lê célula
por célula com `getRange().getValue()`) mas **falhou silenciosamente** no backfill
`recalcularMTTRMTTDHistorico` (lê tudo de uma vez com `getDataRange().getValues()`): o backfill
rodou e disse "11 puladas (dados incompletos), 0 recalculadas" — nenhuma linha foi atualizada.
Um log de depuração temporário mostrou o motivo: o valor lido era um Date de verdade
(`typeof === 'object'`, serializava certinho pra ISO), mas `instanceof Date` retornava `false` — um
Date "de outro realm" dentro do runtime do Apps Script. A checagem via `Object.prototype.toString`
não depende de qual `Date` "realm" criou o objeto, então funciona nos dois casos.

**Lição:** ao checar se um valor lido do Sheets é uma instância de `Date`, sempre usar
`Object.prototype.toString.call(x) === '[object Date]'`, nunca `instanceof Date` — vale tanto para
leitura célula-a-célula quanto em lote.

## Arquivos alterados

**Fora do repositório git** (Apps Script, projeto **"Netturbo Esteira - Base"**, mesmo que o fix
anterior — não versionado neste repo):
- `parseTimestampBR`: adicionado o desvio para valores já-Date (com a checagem correta acima)
- `validarAtividade`: MTTR agora calculado como `Timestamp Recebido` → agora (`new Date()`), em vez
  de `Hora Chegada` → hora de término
- `recalcularMTTRMTTDHistorico` (backfill): mesma mudança, usando `Timestamp Recebido` e
  `Timestamp Validação` diretamente (dois timestamps completos — não precisa mais da lógica de
  ancoragem/rollover de meia-noite que a janela Chegada→Validação exigia)

Implantado como **Versão 23** da implantação em produção (mesma URL usada pelo site). O código-fonte
atualizado está em `.claude/docs/netturbo-esteira-apps-script-2026-07-20.gs`, para referência.

**Backfill rodado uma vez** via `recalcularMTTRMTTDHistorico()`: 11 atividades recalculadas, 0
puladas. Conferido manualmente o cálculo de uma linha (ATV-1784470364552: Recebido 19/07 11:12:44 →
Validação 19/07 18:18:06 = 07:05, batendo com o valor gravado).

Neste repositório git, nenhum arquivo `.html` precisou mudar — a fórmula vive inteira no backend;
`META_MTTR_MIN` foi mantido como estava (ver seção "Consequência esperada" acima).

## Incidente durante a implantação: seletor de versão não reflete a seleção

Ao trocar a implantação ativa pela versão nova no editor do Apps Script (`Implantar → Gerenciar
implantações → editar (lápis) → dropdown "Versão" → "Nova versão" → Implantar`), o campo "Versão"
às vezes **volta a mostrar a versão antiga visualmente** depois de clicar em "Nova versão", mesmo com
o clique certo — aparentemente uma corrida entre o clique e um refresh assíncrono do estado do
diálogo. Duas vezes a implantação seguinte saiu incorreta:
- Uma vez redeployou a mesma versão antiga sem nenhuma mudança (inofensivo, só não aplicou o fix)
- Uma vez **reverteu a implantação ativa para uma versão anterior sem o fix nenhum** (a Versão 21,
  anterior às duas correções desta sessão) — corrigido imediatamente redeployando a versão certa
  como Versão 23, com o app já testado e confirmado no ar depois

**Mitigação que funcionou:** depois de abrir o dropdown "Versão", tirar um screenshot pra confirmar
a posição exata de "Nova versão" na lista (a posição muda dependendo de quantas versões existem)
*antes* de clicar — clicar às cegas em coordenadas fixas reaproveitadas de uma tentativa anterior foi
a causa dos dois erros. Depois de clicar em "Nova versão" e ver o campo mostrar "Nova versão"
corretamente, clicar em "Implantar" imediatamente, e **sempre conferir o número de versão exibido na
tela de confirmação** ("Implantação atualizada. Versão N em ...") antes de considerar concluído.

## Lição para o futuro

1. Ao adicionar qualquer timestamp novo em `criarAtividade`, sempre forçar
   `setNumberFormat('@STRING@')` **antes** do `setValue`, do mesmo jeito que já é feito pra
   `Timestamp Despacho` e `Timestamp Validação` — evita esse mesmo bug em colunas futuras.
2. Nunca usar `x instanceof Date` pra checar um valor lido do Sheets; usar
   `Object.prototype.toString.call(x) === '[object Date]'`.
3. No dropdown "Versão" do diálogo "Gerenciar implantações", **sempre screenshot depois de abrir o
   dropdown pra confirmar a posição de "Nova versão" antes de clicar** — nunca reusar coordenadas de
   uma tentativa anterior. E sempre conferir o número de versão na tela de confirmação do deploy.
