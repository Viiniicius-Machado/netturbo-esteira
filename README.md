# Netturbo Esteira

Sistema web para gestão de despacho, acompanhamento de atendimentos técnicos de campo e cobrança de serviços (LPU) da **Netturbo**. É um projeto **front-end estático** (HTML, CSS e JavaScript puros, sem build/framework), que usa uma planilha Google Sheets como banco de dados por trás de um **Google Apps Script** publicado como Web App (API).

## Páginas

O projeto é composto por várias telas independentes, cada uma com login próprio. `painel.html` é o hub de acesso rápido a todas elas.

### `painel.html` — Painel
Hub central com um card de acesso pra cada tela abaixo.

### `index.html` — Esteira de Despacho
Tela do time de despacho/atendimento.
- Cadastro de novas atividades a partir de um texto colado (parser de máscara) ou formulário manual.
- Suporte a agendamento de visitas e a equipe de apoio (empresa/técnico auxiliar, além do titular).
- Quadro (kanban) com colunas **Aguardando** e **Despachada**, com edição inline dos chamados.
- Fila de validação técnica (NOC) e fila de aprovação de LPU (despacho), com link direto pro relatório PDF de cada LPU.
- Atualização automática da esteira via polling na API.

### `tecnico.html` — Minhas Atividades
App mobile-first usado pelo técnico em campo (titular ou equipe de apoio).
- Login por empresa/técnico, com opção de recuperação de acesso.
- Lista das atividades atribuídas ao técnico logado, com resumo diário e mensal de atendimentos (C/SLA, S/SLA, eficiência, MTTR/MTTD/TMC médios).
- Fluxo de status do atendimento: iniciar → chegada (com captura de GPS) → validar/concluir.
- Registro de ocorrência (RFO) com causas pré-definidas (chips), CEO utilizada (com número de identificação de 4 dígitos quando é caixa nova) e observações — o preenchimento fica salvo localmente enquanto não é enviado, sobrevivendo a fechar/recarregar a página.
- Controle de materiais utilizados por atendimento.
- Geração de relatório para envio via WhatsApp (copiar texto formatado).
- Depois que um chamado de empresa terceira é validado, o técnico (titular e/ou apoio, cada um com sua própria empresa) é levado ao sub-fluxo de LPU — ver seção abaixo.

### `PREENCHIMENTO_LPU.html` — Preenchimento LPU
Formulário de cobrança (LPU) vinculado a um chamado já validado. Acesso de técnicos de prestadoras terceiras (mesma sessão de login de `tecnico.html`) — contas NETTURBO não entram, já que não há cobrança por LPU pra mão de obra própria.
- Lançamento de itens de serviço (código, descrição, classe, quantidade) com cálculo automático de subtotal por classe e total geral.
- Assinatura do prestador preenchida automaticamente (técnico logado + data/hora).
- Gera um relatório em PDF (identificação + itens + fotos) e sobe pro Google Drive — é esse PDF que o aprovador e a Medição revisam depois, em vez de uma lista de fotos solta.
- Também usado pela equipe de apoio (`?tipoLpu=apoio` na URL), quando ela decide que teve cobrança própria — ver seção de LPU abaixo.

### `medicao.html` — Medição
Aprovação final das LPUs e fechamento financeiro. Acesso restrito à liderança.
- Fila de LPUs aguardando aprovação da Medição, com link pro relatório PDF.
- Dashboard financeiro do mês: total de LPUs geradas, CAPEX/OPEX, valor por prestadora, valor por descrição contábil.
- Orçamento por descrição contábil: acompanha, para as descrições com um teto configurado, quanto já foi comprometido (LPUs preenchidas) e aprovado (Medição) contra o orçamento do mês, com saldo projetado.

### `dashboard_gestao.html` — Dashboard de Gestão
Painel gerencial para acompanhamento de indicadores. Acesso restrito à liderança.
- Filtro por mês e KPIs gerais da operação (pipeline de status).
- Eficiência (SLA), MTTR, MTTD e TMC médios contra a meta — cada card é clicável e abre uma sub-página com as 3 atividades mais rápidas e as 3 mais críticas daquele indicador.
- Produção por empresa e ranking de causas.
- Tabela detalhada de todas as atividades.
- Exportação dos dados para Excel (via `xlsx.js`).

### `manutencao_preventiva.html` — Manutenção Preventiva
Relatório fotográfico de preventiva em rede externa, com geração de PDF. Acesso do técnico (mesma sessão de login de `tecnico.html`).

### `jornada_excedente.html` — Jornada Excedente
Justificativa de jornada excedente (limite > 40h no mês), com detalhamento dos dias/motivos e assinaturas do líder e colaborador — geração de PDF. Acesso da liderança.

### `fiscal_v2.html` — Fiscalização
Checklist de fiscalização em campo (acompanhamento de obra ou auditoria de ferramental/EPI/EPC), com fotos e assinaturas — geração de PDF. Acesso da liderança.

## Fluxo de LPU (cobrança de prestadoras terceiras)

Quando um chamado de empresa terceira (não NETTURBO) é validado, ele não some da tela do técnico — entra num sub-processo de cobrança:

```
VALIDADA (chamado)
   │
   ├─ Titular (empresa ≠ NETTURBO) ──► Status LPU: PENDENTE_PREENCHIMENTO
   │                                        │ (preenche em PREENCHIMENTO_LPU.html)
   │                                        ▼
   │                              AGUARDANDO_APROVADOR (index.html aprova/reprova)
   │                                        ▼
   │                              AGUARDANDO_MEDICAO (medicao.html aprova/reprova)
   │                                        ▼
   │                              APROVADO_AGUARDANDO_NF (some da tela do técnico)
   │
   └─ Equipe de apoio (se houver, empresa ≠ NETTURBO) ──► Status LPU Apoio: PENDENTE_DECISAO
                                              │ (apoio diz se teve cobrança própria)
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                            SEM_COBRANCA          PENDENTE_PREENCHIMENTO
                          (some da tela)           (mesmo fluxo acima,
                                                     colunas "LPU Apoio *")
```

Titular e apoio podem ser empresas diferentes e geram cobranças independentes — por isso o apoio precisa decidir se teve cobrança antes de preencher qualquer coisa, e as filas de aprovação em `index.html`/`medicao.html` mostram os dois lado a lado (com uma etiqueta "APOIO" no card).

Reprovação em qualquer etapa (aprovador ou Medição) volta o status pra `PENDENTE_PREENCHIMENTO` com um motivo, e o técnico corrige e reenvia.

**Não implementado ainda (Fase 2):** emissão/upload de Nota Fiscal pelo prestador e marcação de pagamento. Hoje o ciclo termina em `APROVADO_AGUARDANDO_NF`, sem tela de fechamento mensal por prestadora nem status `PAGO`.

## Arquitetura

```
painel.html / index.html / tecnico.html / dashboard_gestao.html /
PREENCHIMENTO_LPU.html / medicao.html / manutencao_preventiva.html /
jornada_excedente.html / fiscal_v2.html
              │
              │  fetch (GET/POST) — parâmetro "acao"
              ▼
   Google Apps Script (Web App / exec)
              │
              ▼
        Google Sheets (dados)
```

Todas as páginas consomem o mesmo backend (`APPS_SCRIPT_URL`, definido no `<script>` de cada arquivo), através de ações como `LISTAR_ESTEIRA`, `LISTAR_TECNICOS`, `LISTAR_ATIVIDADES_TECNICO`, `RESUMO_DIARIO_TECNICO`, `RESUMO_MENSAL_TECNICO`, `SALVAR_LPU_ATIVIDADE`, `VALIDAR_LPU_APROVADOR`, `VALIDAR_LPU_MEDICAO`, `DECIDIR_LPU_APOIO`, entre outras. Não há backend próprio nem banco de dados neste repositório — a lógica de persistência vive no Apps Script/planilha vinculados.

O arquivo `.claude/docs/netturbo-esteira-apps-script-*.gs` é a cópia de referência do código do Apps Script de produção — alterações nele precisam ser coladas manualmente no editor do Apps Script e reimplantadas (Implantar → Gerenciar implantações → Nova versão) pra valerem no `/exec` que os front-ends chamam.

## Como rodar localmente

Por ser um site estático, basta abrir os arquivos `.html` diretamente no navegador (duplo clique ou `file://`), ou servir a pasta com qualquer servidor HTTP estático. Não há dependências para instalar nem processo de build.

> Observação: as telas dependem de conexão com a internet para se comunicar com o Google Apps Script (autenticação, listagem e atualização de atividades).

## Deploy

O projeto é hospedado como site estático (ex.: GitHub Pages) diretamente a partir destes arquivos HTML na branch `main`.
