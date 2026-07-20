# Netturbo Esteira

Sistema web para gestão de despacho e acompanhamento de atendimentos técnicos de campo da **Netturbo**. É um projeto **front-end estático** (HTML, CSS e JavaScript puros, sem build/framework), que usa uma planilha Google Sheets como banco de dados por trás de um **Google Apps Script** publicado como Web App (API).

## Páginas

O projeto é composto por 3 telas independentes, cada uma com login próprio:

### `index.html` — Esteira de Despacho
Tela do time de despacho/atendimento.
- Cadastro de novas atividades a partir de um texto colado (parser de máscara) ou formulário manual.
- Suporte a agendamento de visitas.
- Quadro (kanban) com colunas **Aguardando** e **Despachada**, com edição inline dos chamados.
- Atualização automática da esteira via polling na API.

### `tecnico.html` — Minhas Atividades
App mobile-first usado pelo técnico em campo.
- Login por empresa/técnico, com opção de recuperação de acesso.
- Lista das atividades atribuídas ao técnico logado, com resumo diário e mensal de atendimentos.
- Fluxo de status do atendimento: iniciar → chegada (com captura de GPS) → validar/concluir.
- Registro de ocorrência com causas pré-definidas (chips) e observações.
- Controle de materiais utilizados por atendimento.
- Geração de relatório para envio via WhatsApp (copiar texto formatado).

### `dashboard_gestao.html` — Dashboard de Gestão
Painel gerencial para acompanhamento de indicadores.
- Filtro por mês e KPIs gerais da operação (pipeline de status).
- Métricas de tempo de atendimento vs. meta (gap dentro/fora do prazo) e ranking por técnico.
- Tabela detalhada de todas as atividades.
- Exportação dos dados para Excel (via `xlsx.js`).

## Arquitetura

```
index.html / tecnico.html / dashboard_gestao.html
              │
              │  fetch (GET) — parâmetro "acao"
              ▼
   Google Apps Script (Web App / exec)
              │
              ▼
        Google Sheets (dados)
```

Todas as páginas consomem o mesmo backend (`APPS_SCRIPT_URL`, definido no `<script>` de cada arquivo), através de ações como `LISTAR_ESTEIRA`, `LISTAR_TECNICOS`, `LISTAR_ATIVIDADES_TECNICO`, `RESUMO_DIARIO_TECNICO`, `RESUMO_MENSAL_TECNICO`, entre outras. Não há backend próprio nem banco de dados neste repositório — a lógica de persistência vive no Apps Script/planilha vinculados.

## Como rodar localmente

Por ser um site estático, basta abrir os arquivos `.html` diretamente no navegador (duplo clique ou `file://`). Não há dependências para instalar nem processo de build.

> Observação: as telas dependem de conexão com a internet para se comunicar com o Google Apps Script (autenticação, listagem e atualização de atividades).

## Deploy

O projeto é hospedado como site estático (ex.: GitHub Pages) diretamente a partir destes arquivos HTML na branch `main`.
