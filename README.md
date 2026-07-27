# Netturbo Esteira

Sistema web para gestão de despacho, acompanhamento de atendimentos técnicos de campo e cobrança de serviços (LPU) da **Netturbo**. É um projeto **front-end estático** (HTML, CSS e JavaScript puros, sem build/framework), que usa uma planilha Google Sheets como banco de dados por trás de um **Google Apps Script** publicado como Web App (API).

## Páginas

O projeto é composto por várias telas independentes, cada uma com login próprio. `painel.html` é o hub de acesso rápido a todas elas.

### `painel.html` — Painel
Hub central de acesso rápido a todas as telas abaixo, com cards agrupados em três seções (Operação, Financeiro/LPU, Liderança) e busca que filtra os cards em tempo real. Sidebar fixa com 4 opções de navegação — Geral (rola pro topo), Operação, Financeiro/LPU e Liderança (rolam até a seção correspondente) — com destaque automático da seção visível ao rolar a página. Usa a mesma barra superior (`.topbar`) compartilhada por todas as outras telas — ver Arquitetura.

### `index.html` — Esteira Despacho - Manutenção
Tela do time de despacho/atendimento.
- Cadastro de novas atividades a partir de um texto colado (parser de máscara) ou formulário manual.
- Suporte a agendamento de visitas e a equipe de apoio (empresa/técnico auxiliar, além do titular).
- Quadro (kanban) com colunas **Aguardando** e **Despachada**, com edição inline dos chamados.
- Cada card em "Aguardando Despacho" tem um bloco (colapsável) "Projeto / Medição (KMZ)": anexar o projeto do cabo (KMZ/KML ou print, sobe pro Google Drive), escrever uma mensagem livre e colar o link do Google Maps de onde o técnico deve fazer as medições — tudo isso chega pro técnico direto no card da atividade em `tecnico.html`.
- Fila de validação técnica (NOC) e fila de aprovação de LPU (despacho), com link direto pro relatório PDF de cada LPU.
- Atualização automática da esteira via polling na API.
- Disponibilidade da mão de obra: card (colapsável) para marcar um técnico como Inativo, Férias, Treinamento, Suspensão Disciplinar, Atestado ou Manutenção de Frota, por um período — técnico com um período cobrindo o dia de hoje some de verdade do seletor de despacho (bloqueio real, não só aviso), com aviso de quantos ficaram ocultos.

### `tecnico.html` — Minhas Atividades
App mobile-first usado pelo técnico em campo (titular ou equipe de apoio).
- Login por empresa/técnico, com opção de recuperação de acesso.
- Lista das atividades atribuídas ao técnico logado, com resumo diário e mensal de atendimentos (C/SLA, S/SLA, eficiência, MTTR/MTTD/TMC médios e IRR pessoal — ver indicador abaixo).
- Quando o despacho anexou projeto/mensagem/link de medição (ver `index.html` acima), a atividade mostra um bloco destaque "Recebido do Despacho" com a mensagem, o link de download do projeto (KMZ) e "ONDE FAZER AS MEDIÇÕES?" (abre o Maps direto no app do celular).
- Fluxo de status do atendimento: iniciar → chegada (com captura de GPS) → validar/concluir.
- Registro de ocorrência (RFO) com tipos ROMPIMENTO/MASSIVA/AGENDAMENTO (causas pré-definidas em chips), ACOMPANHAMENTO CPFL (categoria Acompanhamento/Improdutiva/Preventiva + nº da notificação), PREVENTIVA/IMPLANTAÇÃO/GTD/EXTENSÃO DE FIBRA/TRANSMISSÃO (causa livre, opcional), CEO utilizada (com número de identificação de 4 dígitos quando é caixa nova) e observações — o preenchimento fica salvo localmente enquanto não é enviado, sobrevivendo a fechar/recarregar a página.
- Em ROMPIMENTO/MASSIVA, ao escolher a CEO utilizada abre "Perguntas rápidas de fusão": se fusionou todas as fibras, e um editor visual por CEO trabalhada (dá pra adicionar mais de uma) — nomenclatura e tipo de cabo (01F/04F/12F/24F/72F) de cada lado, que podem ser diferentes entre si, splitter opcional (1x2 com proporção configurável, ou 1x4/1x8/1x16) e o diagrama de fibras em si: o técnico toca em duas fibras (ou numa porta do splitter) pra ligar — desenha a linha na hora, igual um mapa de fusão. Assim que pelo menos uma ligação é desenhada em algum diagrama, aquela fusão fora do padrão entra na fila de `geogrid.html` pra sala técnica replicar manualmente no GEOGRID.
- Controle de materiais utilizados por atendimento.
- Geração de relatório para envio via WhatsApp (copiar texto formatado).
- Depois que um chamado de empresa terceira é validado, o técnico (titular e/ou apoio, cada um com sua própria empresa) é levado ao sub-fluxo de LPU — ver seção abaixo.

### `PREENCHIMENTO_LPU.html` — Preenchimento LPU
Formulário de cobrança (LPU) vinculado a um chamado já validado. Acesso de técnicos de prestadoras terceiras (mesma sessão de login de `tecnico.html`) — empresas em `EMPRESAS_SEM_LPU` (hoje NETTURBO e QUALITY, ver seção de LPU abaixo) não entram. Quando a empresa tem um técnico responsável centralizando a LPU (`RESPONSAVEL_LPU_POR_EMPRESA`, ver abaixo), só ele aparece no seletor de técnico — os demais nem conseguem selecionar a própria empresa pra logar aqui.
- Lançamento de itens de serviço (código, descrição, classe, quantidade) com cálculo automático de subtotal por classe e total geral. Descrição Contábil inclui "Consultoria de Regularização" e "Serviços de Melhoria de REDE" (código 0008, adicionadas em 2026-07-22) — a lista de itens disponível pra cada descrição é filtrada por `regrasFiltroCodigos`; descrições sem regra própria ficam sem itens pra escolher.
- CNPJ da empresa prestadora preenchido automaticamente a partir do login (VAL, SOLUTEC, OLIVEIRA, PV), sem precisar digitar toda vez.
- Assinatura do prestador: nome + data/hora preenchidos automaticamente, mas o envio só libera depois de um clique obrigatório em "Assinar" — esse clique incrementa um contador histórico (vitalício, nunca reseta) de assinaturas daquele técnico, exibido junto no documento ("Assinatura Nº X").
- Gera um relatório em PDF (identificação + itens + fotos) e sobe pro Google Drive — é esse PDF que o aprovador e a Medição revisam depois, em vez de uma lista de fotos solta.
- Também usado pela equipe de apoio (`?tipoLpu=apoio` na URL), quando ela decide que teve cobrança própria — ver seção de LPU abaixo.

### `medicao.html` — Medição
Aprovação final das LPUs e fechamento financeiro. Acesso restrito à liderança, com senha compartilhada + seletor "Validando como" (Pamela Silva, Mariana Cruz, Giselle Silva) pra identificar quem de fato aprovou/confirmou cada ação — obrigatório antes de aprovar, reprovar, confirmar pagamento ou reprovar um fechamento.
- Fila de LPUs aguardando aprovação da Medição, com link pro relatório PDF.
- Fechamentos aguardando pagamento: um card por Nota Fiscal anexada pelo prestador (ver `fechamento_lpu.html`), com o valor total do lote. Dois botões: **Confirmar Pagamento** (marca todas as atividades do lote como `PAGO`) ou **Reprovar** (NF errada/ilegível/valor divergente etc. — desfaz a NF anexada, a atividade volta a aparecer como "Pendente de Fechamento" pro prestador em `fechamento_lpu.html`, com o motivo visível; a aprovação da Medição em si não é desfeita).
- Descritivo das Atividades: tabela do mês filtrado com tudo que já teve LPU gerada, com botão de exportar Excel. A visão financeira completa (orçamento, CAPEX/OPEX, valor por prestadora/descrição contábil) migrou para `dashboard_medicao.html` — ver abaixo.

### `dashboard_medicao.html` — Dashboard Medição
Visão financeira da LPU por prestadora, a pedido da gerência (2026-07-24). Acesso restrito à liderança. Considera só o que já foi aprovado pela Medição (`APROVADO_AGUARDANDO_NF` ou `PAGO`, pago ou não).
- Total aprovado e lançado no mês.
- Mão de Obra Terceiras: ranking por prestadora com valor, quantidade de atividades e ticket médio (valor total ÷ quantidade de obras) — NETTURBO fica de fora (mão de obra própria, não passa por LPU).
- Descrição Contábil: ranking por conta contábil.
- Gasto por Semana: mesmo formato de ranking, mas por semana dentro do mês selecionado (Semana 1 = dias 1-7, etc.), em ordem cronológica.

### `fechamento_lpu.html` — Fechamento LPU
Fase 2 do fluxo de LPU: emissão de Nota Fiscal e pagamento. Acesso de técnicos de prestadoras terceiras (mesma sessão de login de `tecnico.html`) — mesmas restrições de `EMPRESAS_SEM_LPU` e `RESPONSAVEL_LPU_POR_EMPRESA` do Preenchimento LPU acima.
- Mostra tudo que está `APROVADO_AGUARDANDO_NF` sem NF ainda pra empresa logada (titular e apoio juntos, sem filtro de data — é todo o valor acumulado até o momento) e permite anexar UM arquivo de Nota Fiscal (PDF ou foto) cobrindo o lote inteiro.
- Depois de anexada, essas atividades passam pra "Aguardando Pagamento" (mesmo status `APROVADO_AGUARDANDO_NF`, agora com a NF vinculada) até a liderança confirmar o pagamento em `medicao.html` — não existe status intermediário de "NF recebida".
- Histórico de fechamentos já pagos (`PAGO`), com data da confirmação.

### `dashboard_gestao.html` — Dashboard de Gestão
Painel gerencial para acompanhamento de indicadores. Acesso restrito à liderança.
- Filtro por mês e KPIs gerais da operação (pipeline de status).
- Eficiência (SLA), MTTR, MTTD e TMC médios contra a meta — cada card é clicável e abre uma sub-página com as 3 atividades mais rápidas e as 3 mais críticas daquele indicador.
- IRR (Índice de Recursos Repetitivos, meta ≤10%): % de ROMPIMENTOs do mês em que o mesmo cliente já tinha tido outro ROMPIMENTO validado nos 30 dias anteriores (base de cálculo é só ROMPIMENTO). Card clicável abre o detalhe por cliente — quantos atendimentos na cadeia, técnico e causa de cada um, e um alerta quando duas visitas seguidas foram no mesmo local (Endereço, com GPS Falha como desempate). No `tecnico.html`, a mesma lógica aparece como IRR pessoal no resumo mensal — a repetição é creditada a quem atendeu ANTES, não a quem herdou o problema depois: se o cliente ligou de novo dentro de 30 dias, é sinal de que aquele reparo não segurou. O técnico da visita seguinte só é responsabilizado se houver uma nova chamada dentro de 30 dias da visita dele.
- Ocorrências no mês, Cidades com Mais Atividades, Causas Mais Comuns e Produção por Empresa — listas ranqueadas em barra.
- Tabela detalhada de todas as atividades.
- Exportação dos dados para Excel (via `xlsx.js`).
- Budget do Mês (terceiros): valor registrável pela própria tela a cada mês (histórico, nunca sobrescreve), com saldo de LPU por prestadora (aprovado no mês, pago ou não) logo abaixo — resumo clicável que abre o valor de cada terceiro numa subtela.
- Efetividade da Mão de Obra: um card por empresa (média dos técnicos dela) mostrando o % de dias disponíveis no mês — nunca mostra 100% cheio se algum técnico tiver período de indisponibilidade registrado naquele mês, mesmo que o impacto na média arredonde pra cima. Clique abre o técnico a técnico com o motivo de cada afastamento.

### `manutencao_preventiva.html` — Manutenção Preventiva
Relatório fotográfico de preventiva em rede externa, com geração de PDF. Acesso do técnico (mesma sessão de login de `tecnico.html`).

### `jornada_excedente.html` — Jornada Excedente
Justificativa de jornada excedente (limite > 40h no mês), com detalhamento dos dias/motivos e assinaturas do líder e colaborador — geração de PDF. Acesso da liderança.

### `fiscal_v2.html` — Fiscalização
Checklist de fiscalização em campo (acompanhamento de obra ou auditoria de ferramental/EPI/EPC), com fotos e assinaturas — geração de PDF. Acesso da liderança.

### `geogrid.html` — Controle GEOGRID
Fila para a sala técnica replicar manualmente no GEOGRID as fusões fora do padrão registradas em `tecnico.html` (quando o técnico desenha ao menos uma ligação de fibra nas "Perguntas rápidas de fusão"). Mostra protocolo/cliente/endereço e, por CEO trabalhada, o mesmo diagrama de fibras (nomenclatura, tipo de cabo por lado, splitter e pareamento) que o técnico desenhou em campo; ao concluir, exige o nome de quem atualizou o GEOGRID (fica registrado com data/hora, pra responsabilização) e o item passa pro histórico de concluídos.

## Fluxo de LPU (cobrança de prestadoras terceiras)

Quando um chamado de uma empresa que cobra por LPU é validado, ele não some da tela do técnico — entra num sub-processo de cobrança. Empresas em `EMPRESAS_SEM_LPU` (backend) não passam por nada disso — hoje NETTURBO (mão de obra própria) e QUALITY (contrato fixo de 18 atividades/mês, cobrado só por produtividade); pra elas o processo termina na validação técnica mesmo:

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
   │                                        │ (prestador anexa NF em fechamento_lpu.html —
   │                                        │  um único arquivo cobre todo o lote pendente)
   │                                        ▼
   │                              APROVADO_AGUARDANDO_NF + NF anexada
   │                                  (aguardando pagamento, mesmo status — sem etapa
   │                                   intermediária de "NF recebida")
   │                                        │ (liderança confirma em medicao.html)
   │                                        ▼
   │                                      PAGO
   │
   └─ Equipe de apoio (se houver, empresa ≠ NETTURBO) ──► Status LPU Apoio: PENDENTE_DECISAO
                                              │ (apoio diz se teve cobrança própria)
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                            SEM_COBRANCA          PENDENTE_PREENCHIMENTO
                          (some da tela)           (mesmo fluxo acima,
                                                     colunas "LPU Apoio *",
                                                     mesmo ciclo de NF/pagamento)
```

Titular e apoio podem ser empresas diferentes e geram cobranças independentes — por isso o apoio precisa decidir se teve cobrança antes de preencher qualquer coisa, e as filas de aprovação em `index.html`/`medicao.html` mostram os dois lado a lado (com uma etiqueta "APOIO" no card).

Reprovação em qualquer etapa (aprovador ou Medição) volta o status pra `PENDENTE_PREENCHIMENTO` com um motivo, e o técnico corrige e reenvia.

Algumas empresas centralizam toda a LPU da equipe num único técnico responsável (`RESPONSAVEL_LPU_POR_EMPRESA` no backend — hoje só VAL → Marcos Mendes Merino). Nesses casos a atividade continua contando pro técnico que realmente atendeu (MTTR/IRR/resumo pessoal intactos), mas assim que o chamado fica `PENDENTE_PREENCHIMENTO` a etapa de LPU migra pra tela do responsável — os demais técnicos da empresa ficam bloqueados em `PREENCHIMENTO_LPU.html`/`fechamento_lpu.html`.

Quando o aprovador valida uma LPU em `index.html`, o PDF que o técnico já tinha gerado ganha uma página extra com o nome de quem aprovou e a data/hora — carimbo feito no navegador com `pdf-lib` (ações `LPU_OBTER_PDF`/`LPU_ATUALIZAR_PDF`), sem alterar o relatório original (itens, fotos, assinatura do prestador). Se o carimbo falhar por qualquer motivo, a aprovação em si não é desfeita.

Uma prestadora emite uma Nota Fiscal só por mês, não uma por papel — o fechamento em `fechamento_lpu.html` junta pendências de titular e apoio da mesma empresa num arquivo só, e grava a mesma URL (`LPU NF URL`/`LPU Apoio NF URL`) em todas as linhas do lote. É essa URL compartilhada que permite agrupar o "fechamento" na fila de pagamento da Medição sem precisar de uma aba/entidade nova na planilha.

A Medição também pode reprovar o fechamento já com NF anexada (NF errada/ilegível/valor divergente etc.) — isso limpa a NF URL/timestamp daquele lote (titular e/ou apoio) e grava o motivo em `LPU Motivo Reprovação NF`/`LPU Apoio Motivo Reprovação NF`, sem mexer no status (`APROVADO_AGUARDANDO_NF`) nem desfazer a aprovação da Medição em si. O prestador vê o motivo em `fechamento_lpu.html` e reenvia a NF.

## Arquitetura

```
painel.html / index.html / tecnico.html / dashboard_gestao.html /
PREENCHIMENTO_LPU.html / medicao.html / dashboard_medicao.html /
fechamento_lpu.html / manutencao_preventiva.html /
jornada_excedente.html / fiscal_v2.html / geogrid.html
              │
              │  fetch (GET/POST) — parâmetro "acao"
              ▼
   Google Apps Script (Web App / exec)
              │
              ▼
        Google Sheets (dados)
```

Todas as páginas consomem o mesmo backend (`APPS_SCRIPT_URL`, definido no `<script>` de cada arquivo), através de ações como `LISTAR_ESTEIRA`, `LISTAR_TECNICOS`, `LISTAR_ATIVIDADES_TECNICO`, `RESUMO_DIARIO_TECNICO`, `RESUMO_MENSAL_TECNICO`, `SALVAR_LPU_ATIVIDADE`, `VALIDAR_LPU_APROVADOR`, `VALIDAR_LPU_MEDICAO`, `DECIDIR_LPU_APOIO`, `FECHAR_LPU_NF`, `LISTAR_LPU_FECHAMENTO`, `LISTAR_LPU_PAGAMENTO`, `MARCAR_LPU_PAGO`, `REPROVAR_LPU_NF`, `LPU_OBTER_PDF`, `LPU_ATUALIZAR_PDF`, `REGISTRAR_ASSINATURA_LPU`, `REGISTRAR_ORCAMENTO_MENSAL`, `LISTAR_ORCAMENTOS_MENSAIS`, `REGISTRAR_DISPONIBILIDADE`, `EXCLUIR_DISPONIBILIDADE`, `LISTAR_DISPONIBILIDADE`, `SALVAR_INFO_DESPACHO`, `LISTAR_GEOGRID`, `CONCLUIR_GEOGRID`, entre outras. Não há backend próprio nem banco de dados neste repositório — a lógica de persistência vive no Apps Script/planilha vinculados.

Todas as telas compartilham o mesmo cabeçalho (`.topbar`): barra verde sólida fixa no topo, com logo e marca/subtítulo — sem elementos funcionais (botões, links, seletores) nela, que ficam numa linha própria (`.page-actions`) logo abaixo, dentro do conteúdo de cada página.

O arquivo `.claude/docs/netturbo-esteira-apps-script-*.gs` é a cópia de referência do código do Apps Script de produção — alterações nele precisam ser coladas manualmente no editor do Apps Script e reimplantadas (Implantar → Gerenciar implantações → Nova versão) pra valerem no `/exec` que os front-ends chamam.

## Como rodar localmente

Por ser um site estático, basta abrir os arquivos `.html` diretamente no navegador (duplo clique ou `file://`), ou servir a pasta com qualquer servidor HTTP estático. Não há dependências para instalar nem processo de build.

> Observação: as telas dependem de conexão com a internet para se comunicar com o Google Apps Script (autenticação, listagem e atualização de atividades).

## Deploy

O projeto é hospedado como site estático (ex.: GitHub Pages) diretamente a partir destes arquivos HTML na branch `main`.
