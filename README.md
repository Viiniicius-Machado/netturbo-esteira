# Netturbo Esteira

Sistema web para gestão de despacho, acompanhamento de atendimentos técnicos de campo e cobrança de serviços (LPU) da **Netturbo**. É um projeto **front-end estático** (HTML, CSS e JavaScript puros, sem build/framework), que usa uma planilha Google Sheets como banco de dados por trás de um **Google Apps Script** publicado como Web App (API).

## Páginas

O projeto é composto por várias telas independentes, cada uma com login próprio. `painel.html` é o hub de acesso rápido a todas elas. Duas famílias de login coexistem — ver "Autenticação" em Arquitetura.

### `painel.html` — Painel
Hub central de acesso rápido a todas as telas abaixo, com cards agrupados em três seções (Operação, Financeiro/LPU, Liderança) e busca que filtra os cards em tempo real. Sidebar fixa com 4 opções de navegação — Geral (rola pro topo), Operação, Financeiro/LPU e Liderança (rolam até a seção correspondente) — com destaque automático da seção visível ao rolar a página. Usa a mesma barra superior (`.topbar`) compartilhada por todas as outras telas — ver Arquitetura. Exige login (`auth.js`, liberado a qualquer pessoa cadastrada) e esconde os cards das telas em que a pessoa logada não tem permissão (coluna "Telas" de `ACESSOS_LIDERANCA` — ver Autenticação).

### `index.html` — Esteira Despacho - Manutenção
Tela do time de despacho/atendimento.
- Cadastro de novas atividades a partir de um texto colado (parser de máscara) ou formulário manual.
- Suporte a agendamento de visitas e a equipe de apoio (empresa/técnico auxiliar, além do titular).
- Quadro (kanban) com colunas **Aguardando** e **Despachada**, com edição inline dos chamados. Cada card é um `<details>` — vem **compacto por padrão** (protocolo/cliente/prazo ou etapa) e expande ao clicar pra mostrar o formulário completo (selects, botões, edição), pensado pra dias com 20+ atividades sem poluir a tela.
- **Filtro por Tipo de Solicitação** (Todos/Manutenção/Preventiva/Transmissão/Implantação/GTD/Pós Vendas/Medição) acima do quadro — separa as demandas quando várias frentes ficam misturadas na esteira no mesmo dia. Cada coluna também tem um botão próprio (▼/▲) pra minimizar/expandir todo o conteúdo dela de uma vez (diferente do collapse individual de cada card).
- Coluna "Despachada / Em Campo" mostra a etapa do técnico com o horário real (ex.: "Em deslocamento desde 09:10", "Em campo desde 10:32"), já visível no resumo compacto do card, sem precisar abrir — dá pro líder acompanhar a operação ao vivo.
- Cada card em "Aguardando Despacho" tem um bloco (colapsável) "Projeto / Medição (KMZ)": anexar um ou vários arquivos de uma vez (KMZ/KML do projeto, pedido de material, print etc., sobe pro Google Drive), colar um ou mais prints direto na caixa de mensagem (Ctrl+V, junto do texto e dos arquivos anexados — não é um ou outro) e colar o link do Google Maps de onde o técnico deve fazer as medições — tudo isso chega pro técnico direto no card da atividade em `tecnico.html`.
- Fila de validação técnica (NOC). A fila de aprovação de LPU (despacho) migrou pra `aprovacao_lpu.html` e a fila de fusões recusadas pelo GEOGRID migrou pra `geogrid.html` — ver abaixo os dois; nenhuma das duas mora mais aqui, pra concentrar cada fluxo num só lugar.
- **Classificação da Solicitação** (define o SLA/prazo do atendimento): antes de confirmar a atividade, o líder escolhe **Tipo de Solicitação → Categoria 1-4** numa cascata restrita à matriz oficial do setor (`MATRIZ_SLA`, 300 combinações — Manutenção, Preventiva, Transmissão, Implantação, GTD, Pós Vendas, Medição). Cada combinação resolve um **SLA** (4/6/8/24/48h) que vira um **Prazo Limite** fixo (Timestamp Recebido + SLA), calculado uma única vez na criação e nunca recalculado — mostrado em cada card da esteira, com destaque em vermelho se já estourou. O Tipo de Solicitação aparece em maiúsculo ao lado do protocolo em todas as colunas da esteira. A mesma etapa exige também a **Conta Contábil** (mesmas 9 opções de `PREENCHIMENTO_LPU.html`), escolhida já no despacho — não confundir com a Descrição Contábil que o técnico escolhe depois ao preencher a LPU. Existir desde o despacho é o que permite `aprovacao_lpu.html` mostrar quantas obras ainda estão paradas aguardando o técnico preencher, por conta contábil, antes mesmo delas virarem LPU.
- Atualização automática da esteira via polling na API.
- Disponibilidade da mão de obra: card (colapsável) para marcar um técnico como Inativo, Férias, Treinamento, Suspensão Disciplinar, Atestado ou Manutenção de Frota, por um período — técnico com um período cobrindo o dia de hoje some de verdade do seletor de despacho (bloqueio real, não só aviso), com aviso de quantos ficaram ocultos.

### `tecnico.html` — Minhas Atividades
App mobile-first usado pelo técnico em campo (titular ou equipe de apoio).
- Login por empresa/técnico, com opção de recuperação de acesso.
- Lista das atividades atribuídas ao técnico logado, com resumo diário e mensal de atendimentos (C/SLA, S/SLA, eficiência, MTTR/MTTD/TMC médios e IRR pessoal — ver indicador abaixo).
- Quando o despacho anexou projeto/mensagem/link de medição (ver `index.html` acima), a atividade mostra um bloco destaque "Recebido do Despacho" com a mensagem, o link de download do projeto (KMZ) e "ONDE FAZER AS MEDIÇÕES?" (abre o Maps direto no app do celular).
- Fluxo de status do atendimento: iniciar → chegada (com captura de GPS) → validar/concluir.
- Registro de ocorrência (RFO) em dois modelos, conforme a atividade: **atividade nova** (despachada já com Tipo de Solicitação, ver `index.html`) mostra o Tipo fixo e as Categorias 1-4 em chips editáveis, sempre restritas às combinações válidas da `MATRIZ_SLA` — Tipo de Solicitação **Medição** usa um formulário simplificado (sem GPS de falha/CEO/materiais, só Categoria + observação). **Atividade antiga** (criada antes dessa mudança) continua com o formulário anterior — chips de Tipo de Ocorrência (ROMPIMENTO/MASSIVA/AGENDAMENTO/ACOMPANHAMENTO CPFL/PREVENTIVA/IMPLANTAÇÃO/GTD/EXTENSÃO DE FIBRA/TRANSMISSÃO) com causas pré-definidas ou livres. Nos dois modelos: CEO utilizada (com número de identificação de 4 dígitos quando é caixa nova) e observações — o preenchimento fica salvo localmente enquanto não é enviado, sobrevivendo a fechar/recarregar a página.
- O bloco de CEO/fusão aparece pra Tipo de Solicitação Manutenção, Preventiva, Transmissão e Implantação (atividade antiga: ROMPIMENTO/MASSIVA). "Tipo de CEO Utilizado" tem uma 4ª opção, **Nenhuma** (quando não houve troca/instalação de caixa), que já libera as "Perguntas Rápidas de fusão" sem exigir número/GPS de caixa nova. As perguntas rápidas são um editor visual por CEO trabalhada (dá pra adicionar mais de uma, "Fusão — CEO Nº" é obrigatório em toda CEO preenchida — aceita letras além de números, ex.: "12A") — nomenclatura e tipo de cabo (01F/04F/12F/24F/72F) de cada lado (Lado A e Lado B são independentes e opcionais, cobrindo inclusive fusão só entre splitters) e até 2 splitters em cascata (ex.: Lado A entra num 1/2, que alimenta um 1/8, que sai pro Lado B — 1x2 com proporção configurável, os demais tamanhos sempre balanceados). O diagrama de fibras só liga pontos de colunas VIZINHAS na cadeia Lado A — Splitter 1 — Splitter 2 — Lado B (não dá pra pular etapa) — o técnico toca em dois pontos vizinhos pra ligar, desenhando a linha na hora, igual um mapa de fusão. Assim que pelo menos uma ligação é desenhada em algum diagrama, aquela fusão fora do padrão entra na fila de validação do líder em `geogrid.html`, que precisa aprovar (ou corrigir) antes da sala técnica ver o item — ver `geogrid.html` abaixo. Cada Número da CEO A/B (caixa nova) tem ao lado uma **Nomenclatura do cabo** obrigatória (letras e números) — diferente da nomenclatura por Lado A/B de dentro do editor de fusão — que garante que toda caixa nova instalada entra no GEOGRID mesmo quando o técnico não desenha nenhuma ligação de fibra fora do padrão (ex.: Implantação sem fusão).
- Controle de materiais utilizados por atendimento.
- Geração de relatório para envio via WhatsApp (copiar texto formatado) — traz identificação, ocorrência/causa (ou Tipo/Categoria), CEO, materiais, solução e melhoria; não lista o detalhe de cada fusão (pares de fibra, splitters), que fica só na fila do GEOGRID.
- Card da atividade mostra o **Prazo Limite** (SLA da matriz, ver `index.html`), com destaque se já estourou.
- Depois que um chamado de empresa terceira é validado, o técnico (titular e/ou apoio, cada um com sua própria empresa) é levado ao sub-fluxo de LPU — ver seção abaixo.

### `PREENCHIMENTO_LPU.html` — Preenchimento LPU
Formulário de cobrança (LPU) vinculado a um chamado já validado. Acesso de técnicos de prestadoras terceiras (mesma sessão de login de `tecnico.html`) — empresas em `EMPRESAS_SEM_LPU` (hoje NETTURBO e QUALITY, ver seção de LPU abaixo) não entram. Quando a empresa tem um técnico responsável centralizando a LPU (`RESPONSAVEL_LPU_POR_EMPRESA`, ver abaixo), só ele aparece no seletor de técnico — os demais nem conseguem selecionar a própria empresa pra logar aqui.
- Identificação do chamado: campos **Cliente / POP / ID** e **Protocolo** (renomeados de "Cliente / POP" e "ID / Etiqueta").
- Lançamento de itens de serviço (código, descrição, classe, quantidade) com cálculo automático de subtotal por classe e total geral. Descrição Contábil inclui "Consultoria de Regularização" e "Serviços de Melhoria de REDE" (código 0008, adicionadas em 2026-07-22) — a lista de itens disponível pra cada descrição é filtrada por `regrasFiltroCodigos`; descrições sem regra própria ficam sem itens pra escolher. Quando a atividade já tem uma **Conta Contábil** definida no despacho (`index.html`), a Descrição Contábil vem preenchida com esse valor e **travada** (o técnico não pode trocar) — atividade antiga, sem essa coluna preenchida, mantém o campo aberto como sempre.
- CNPJ da empresa prestadora preenchido automaticamente a partir do login (`CNPJ_POR_EMPRESA` — VAL, SOLUTEC, OLIVEIRA, PV, DOIS IRMÃOS, SOUZA TELECOM, FUSION TELECOM, SPEEDY SERVICE, EFM TELECOMUNICAÇÕES LTDA, J.K TELECOM, EAGLE TELECOM, WALTINEY, CAF, FABIEDER, EMCALE, LIMER ON), sem precisar digitar toda vez.
- Assinatura do prestador: nome + data/hora preenchidos automaticamente, mas o envio só libera depois de um clique obrigatório em "Assinar" — esse clique incrementa um contador histórico (vitalício, nunca reseta) de assinaturas daquele técnico, exibido junto no documento ("Assinatura Nº X").
- Gera um relatório em PDF (identificação + itens + fotos) e sobe pro Google Drive — é esse PDF que o aprovador e a Medição revisam depois, em vez de uma lista de fotos solta.
- Também usado pela equipe de apoio (`?tipoLpu=apoio` na URL), quando ela decide que teve cobrança própria — ver seção de LPU abaixo.

### `aprovacao_lpu.html` — Aprovação de LPU
Fila de LPUs aguardando aprovação (`Status LPU`/`Status LPU Apoio === AGUARDANDO_APROVADOR`), organizada por **Descrição Contábil** — migrou de dentro de `index.html` pra uma tela própria. Acesso restrito à liderança via login individual (`auth.js`) — quem está aprovando é o próprio nome logado, não há mais seletor manual.
- **Aguardando Preenchimento do Técnico**: card separado, acima da fila de aprovação, com todas as obras já validadas mas que o técnico ainda não preencheu a LPU (`Status LPU`/`Status LPU Apoio === PENDENTE_PREENCHIMENTO`). Filtra pelo mesmo seletor de Descrição Contábil do topo, só que usando o campo **Conta Contábil** escolhido no despacho (`index.html`), já que a Descrição Contábil de verdade só existe depois que o técnico preenche.
- Filtro por Descrição Contábil (mesmas 9 opções de `PREENCHIMENTO_LPU.html`), com "Todas" como padrão — vale tanto pra fila de aprovação quanto pro card de pendentes de preenchimento acima.
- Antes de aprovar, o gestor precisa **assinar** — mesmo botão/contador de `PREENCHIMENTO_LPU.html` (`REGISTRAR_ASSINATURA_LPU`, contador histórico por nome): o botão "Aprovar" só libera depois do clique em "Assinar", que grava "Assinatura Nº X" também na página extra do PDF. A página extra mostra a **assinatura escaneada de verdade** (imagem, `IMAGENS_ASSINATURA` — Vinicius Machado, Gabriel Milhomens, Emerson Silva, embutida em base64 direto no HTML) logo abaixo do título, com data/hora e "Assinatura Nº X" abaixo da imagem; gestor sem imagem cadastrada cai no carimbo antigo (só nome em texto).
- "Não Validar" continua sem exigir assinatura (motivo obrigatório) — devolve pro técnico corrigir, mesmo fluxo de sempre.
- Depois de aprovada, a LPU segue o mesmo caminho de sempre (`AGUARDANDO_MEDICAO` → aparece em `medicao.html`).

### `medicao.html` — Medição
Aprovação final das LPUs e fechamento financeiro. Acesso restrito à liderança via login individual (`auth.js`) — quem de fato aprovou/confirmou cada ação (aprovar, reprovar, confirmar pagamento, reprovar fechamento) é o próprio nome logado, não há mais seletor manual.
- Fila de LPUs aguardando aprovação da Medição, com link pro relatório PDF. Antes de aprovar, o validador precisa **assinar** — mesmo mecanismo de `aprovacao_lpu.html` (`REGISTRAR_ASSINATURA_LPU`): o botão "Aprovar" só libera depois do clique em "Assinar", que acrescenta MAIS uma página de carimbo no PDF (além da que `aprovacao_lpu.html` já colocou), com a assinatura escaneada (`IMAGENS_ASSINATURA` — Pamela Paulina, Giselle Silva), data/hora e "Assinatura Nº X". "Reprovar" continua sem exigir assinatura.
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

### `dashboard_manutencao.html` — Dashboard Manutenção
Painel gerencial dedicado à frente de **Manutenção** (`Tipo de Solicitação === 'Manutenção'`, cobre Rompimento/Massiva/Acompanhamento-Fiscalização/REDE RF/REDE RF Improdutiva), gestor próprio dessa frente. Acesso restrito à liderança.
- Filtro por mês e KPIs gerais da operação (pipeline de status).
- Eficiência (SLA)/MTTR/MTTD/TMC com abas **Todos / Rompimento / Massiva / Acompanhamento e Fiscalização** — a meta de MTTR muda com a aba: 4h (240min) para Rompimento e Massiva, 8h (480min) para Acompanhamento/Fiscalização (SLA da matriz oficial do setor, ver `MATRIZ_SLA` em `index.html`); "Todos" mistura categorias com SLA diferente e mantém a meta de 4h só como referência geral. Cada card (MTTR/MTTD/TMC) é clicável e abre uma sub-página com as 3 atividades mais rápidas e as 3 mais críticas daquele indicador.
- IRR (Índice de Recursos Repetitivos, meta ≤10%): % de ROMPIMENTOs do mês em que o mesmo cliente já tinha tido outro ROMPIMENTO validado nos 30 dias anteriores (base de cálculo é só ROMPIMENTO). Card clicável abre o detalhe por cliente — quantos atendimentos na cadeia, técnico e causa de cada um, e um alerta quando duas visitas seguidas foram no mesmo local (Endereço, com GPS Falha como desempate). No `tecnico.html`, a mesma lógica aparece como IRR pessoal no resumo mensal — a repetição é creditada a quem atendeu ANTES, não a quem herdou o problema depois: se o cliente ligou de novo dentro de 30 dias, é sinal de que aquele reparo não segurou. O técnico da visita seguinte só é responsabilizado se houver uma nova chamada dentro de 30 dias da visita dele.
- Ocorrências no mês, Cidades com Mais Atividades, Causas Mais Comuns e Produção por Empresa — listas ranqueadas em barra.
- **Mapa de Calor** (Leaflet + OpenStreetMap, sem API key): geolocaliza os chamados concluídos usando o **GPS Falha** (capturado pelo técnico em campo) e, quando ausente, o **GPS Caixa Nova A/B** da mesma atividade — filtro por Semana/Mês/Ano. Abaixo do mapa, lista de **Endereços com Mais Chamados** (candidatos a preventiva), com causa mais comum e exportação Excel.
- Budget do Mês (terceiros): valor registrável pela própria tela a cada mês (histórico, nunca sobrescreve), com saldo de LPU por prestadora (aprovado no mês, pago ou não) logo abaixo — resumo clicável que abre o valor de cada terceiro numa subtela.
- Efetividade da Mão de Obra: um card por empresa (média dos técnicos dela) mostrando o % de dias disponíveis no mês — nunca mostra 100% cheio se algum técnico tiver período de indisponibilidade registrado naquele mês, mesmo que o impacto na média arredonde pra cima. Clique abre o técnico a técnico com o motivo de cada afastamento.
- Tabela detalhada de todas as atividades e exportação dos dados para Excel (via `xlsx.js`).

### `dashboard_implantacao.html`, `dashboard_transmissao.html`, `dashboard_gtd.html`, `dashboard_preventiva.html` — Dashboards por frente
Um painel dedicado por frente (Implantação, Transmissão, GTD e Preventiva — cada `Tipo de Solicitação` filtrado isoladamente, um arquivo por frente, mesma base de código), substituindo o antigo `dashboard_gestao.html` (combinava várias áreas num arquivo só). Pós Vendas e Medição ficaram sem dashboard dedicado (Medição já tem o próprio, ver `dashboard_medicao.html`; Pós Vendas hoje não tem). Acesso restrito à liderança.
- Filtro por mês e KPIs gerais da operação (pipeline de status).
- Eficiência (SLA), MTTR, MTTD e TMC médios do mês — sem abas de tipo (cada dashboard já é uma frente só). C/SLA usa o **SLA Horas** de cada atividade (matriz nova, ver `index.html`); o card de MTTR mostra o tempo médio bruto sem faixa de cor fixa (o SLA varia demais dentro da mesma frente, de 4h a 24h, pra ter uma meta única representativa) — o C/SLA acima é o indicador real de cumprimento.
- Ocorrências no mês, Cidades com Mais Atividades, Causas Mais Comuns e Produção por Empresa — listas ranqueadas em barra.
- **Mapa de Calor** (mesmo mecanismo do `dashboard_manutencao.html`): GPS Falha com fallback pro GPS Caixa Nova A/B, filtro por Semana/Mês/Ano, lista de Endereços com Mais Chamados exportável.
- Budget do Mês **por Conta Contábil**: em vez do GERAL/QUALITY fixo (conceito só de Manutenção), o budget é registrado e comparado por Conta Contábil (mesmas 9 opções do despacho em `index.html`) — só mostra as contas com budget registrado ou gasto aprovado no mês, evitando listar contas sem movimento.
- Efetividade da Mão de Obra: um card por empresa (média dos técnicos dela), igual ao `dashboard_manutencao.html`.
- Tabela detalhada de todas as atividades e exportação dos dados para Excel (via `xlsx.js`).

### `manutencao_preventiva.html` — Manutenção Preventiva
Relatório fotográfico de preventiva em rede externa, com geração de PDF. Acesso do técnico (mesma sessão de login de `tecnico.html`).

### `jornada_excedente.html` — Jornada Excedente
Justificativa de jornada excedente (limite > 40h no mês), com detalhamento dos dias/motivos e assinaturas do líder e colaborador — geração de PDF. Acesso da liderança.

### `fiscal_v2.html` — Fiscalização
Checklist de fiscalização em campo (acompanhamento de obra ou auditoria de ferramental/EPI/EPC), com fotos e assinaturas — geração de PDF. Acesso da liderança.

### `treinamento.html` — Treinamento / Alinhamento
Lista de presença digital para treinamentos e alinhamentos de processo, substituindo o formulário em papel (`Print/Lista de Presença - O&M.docx`) — logo NetTurbo embutida em base64 (extraída do próprio .docx, que já tinha a marca certa dentro). Acesso restrito à liderança (`auth.js`). 100% client-side (sem persistência no backend) — gera PDF e baixa, mesmo padrão de `fiscal_v2.html`/`jornada_excedente.html`.
- Identificação: Tema/Título (digitável), Tipo (Treinamento/Alinhamento de Processo), Objetivo, Data, Horário início/fim, Local e Ministrado por (pré-preenchido com o usuário logado).
- Participantes: nome + setor + assinatura coletada por touch direto no celular (canvas), um por linha, com botão para adicionar/remover participante.
- Registro fotográfico: só destrava depois que pelo menos um participante tiver nome **e** assinatura preenchidos — usa a mesma compressão de imagem de `manutencao_preventiva.html` antes de anexar.
- Gera um PDF multi-página (jsPDF + html2canvas): identificação + tabela de presença com as assinaturas, seguida das páginas de registro fotográfico.

### `geogrid.html` — Controle GEOGRID
Fila para a sala técnica replicar manualmente no GEOGRID as fusões fora do padrão registradas em `tecnico.html` (quando o técnico desenha ao menos uma ligação de fibra nas "Perguntas rápidas de fusão"). Mostra protocolo/cliente/endereço/técnico e, por CEO trabalhada, o mesmo diagrama de fibras (nomenclatura, tipo de cabo por lado, splitter(s) em cascata e pareamento) que o técnico desenhou em campo. Uma caixa nova SEM nenhuma fusão desenhada (Número da CEO + Nomenclatura do cabo preenchidos, mas nenhuma ligação de fibra) também entra aqui — como um card simples (CEO Nº, nomenclatura, localização), sem diagrama nenhum, seguindo o mesmo fluxo de validação do líder → sala técnica; não duplica se a mesma CEO já tiver uma fusão de verdade registrada.
- **Aguardando validação do líder** (etapa nova, antes da sala técnica ver o item): toda fusão nasce aqui (`Status='AGUARDANDO_VALIDACAO_LIDER'`), não em "Pendentes" direto. O líder vê o mesmo diagrama somente-leitura das outras filas, com botão **Editar** (abre o mesmo editor visual Lado A — Splitter 1 — Splitter 2 — Lado B usado em `index.html`/`tecnico.html`, só pra essa etapa) pra corrigir antes de liberar, **Aprovar** (libera pra sala técnica — vira `PENDENTE` — com ou sem edição) e **Excluir** (item claramente errado, nem chega a ir pra sala técnica). Quando a sala técnica recusa um item pendente (motivo obrigatório), ele **volta pra essa mesma etapa** (não é mais uma fila separada nem mora em `index.html`) — o card mostra o motivo da recusa em destaque, e o líder corrige/aprova pelo mesmo fluxo.
- **Pendentes de atualização no GEOGRID**: fila da sala técnica de verdade, só aparece depois da validação do líder acima. Dois desfechos por item: **concluir** (exige o nome de quem atualizou o GEOGRID, fica registrado com data/hora pra responsabilização, e o item passa pro histórico de concluídos) ou **recusar** (dado veio confuso/incompleto — exige um motivo obrigatório; o item sai da fila da sala técnica e volta pra "Aguardando validação do líder" acima).
- **Concluídos (histórico)**: fechado por padrão — tende a acumular muitos itens.
- Todas as três etapas acima têm um botão próprio (▼/▲, clique no cabeçalho também funciona) pra minimizar/expandir todo o conteúdo daquela etapa de uma vez — "Aguardando validação do líder" e "Pendentes" começam abertas (filas acionáveis), "Concluídos" começa fechado.

## Fluxo de LPU (cobrança de prestadoras terceiras)

Quando um chamado de uma empresa que cobra por LPU é validado, ele não some da tela do técnico — entra num sub-processo de cobrança. Empresas em `EMPRESAS_SEM_LPU` (backend) não passam por nada disso — hoje NETTURBO (mão de obra própria) e QUALITY (contrato fixo de 18 atividades/mês, cobrado só por produtividade); pra elas o processo termina na validação técnica mesmo:

```
VALIDADA (chamado)
   │
   ├─ Titular (empresa ≠ NETTURBO) ──► Status LPU: PENDENTE_PREENCHIMENTO
   │                                        │ (preenche em PREENCHIMENTO_LPU.html)
   │                                        ▼
   │                              AGUARDANDO_APROVADOR (aprovacao_lpu.html aprova/reprova)
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

Titular e apoio podem ser empresas diferentes e geram cobranças independentes — por isso o apoio precisa decidir se teve cobrança antes de preencher qualquer coisa, e as filas de aprovação em `aprovacao_lpu.html`/`medicao.html` mostram os dois lado a lado (com uma etiqueta "APOIO" no card).

Reprovação em qualquer etapa (aprovador ou Medição) volta o status pra `PENDENTE_PREENCHIMENTO` com um motivo, e o técnico corrige e reenvia.

Algumas empresas centralizam toda a LPU da equipe num único técnico responsável (`RESPONSAVEL_LPU_POR_EMPRESA` no backend — hoje VAL → Marcos Mendes Merino e SOUZA TELECOM → Klheyton Barbosa de Souza). Nesses casos a atividade continua contando pro técnico que realmente atendeu (MTTR/IRR/resumo pessoal intactos), mas assim que o chamado fica `PENDENTE_PREENCHIMENTO` a etapa de LPU migra pra tela do responsável — os demais técnicos da empresa ficam bloqueados em `PREENCHIMENTO_LPU.html`/`fechamento_lpu.html`.

Quando o gestor aprova uma LPU em `aprovacao_lpu.html`, ele assina antes (mesmo botão/contador do prestador) e o PDF que o técnico já tinha gerado ganha uma página extra com o nome de quem aprovou, a assinatura e a data/hora — carimbo feito no navegador com `pdf-lib` (ações `LPU_OBTER_PDF`/`LPU_ATUALIZAR_PDF`), sem alterar o relatório original (itens, fotos, assinatura do prestador). Se o carimbo falhar por qualquer motivo, a aprovação em si não é desfeita.

Uma prestadora emite uma Nota Fiscal só por mês, não uma por papel — o fechamento em `fechamento_lpu.html` junta pendências de titular e apoio da mesma empresa num arquivo só, e grava a mesma URL (`LPU NF URL`/`LPU Apoio NF URL`) em todas as linhas do lote. É essa URL compartilhada que permite agrupar o "fechamento" na fila de pagamento da Medição sem precisar de uma aba/entidade nova na planilha.

A Medição também pode reprovar o fechamento já com NF anexada (NF errada/ilegível/valor divergente etc.) — isso limpa a NF URL/timestamp daquele lote (titular e/ou apoio) e grava o motivo em `LPU Motivo Reprovação NF`/`LPU Apoio Motivo Reprovação NF`, sem mexer no status (`APROVADO_AGUARDANDO_NF`) nem desfazer a aprovação da Medição em si. O prestador vê o motivo em `fechamento_lpu.html` e reenvia a NF.

## Arquitetura

```
painel.html / index.html / tecnico.html / dashboard_manutencao.html / dashboard_implantacao.html /
dashboard_transmissao.html / dashboard_gtd.html / dashboard_preventiva.html /
PREENCHIMENTO_LPU.html / aprovacao_lpu.html / medicao.html / dashboard_medicao.html /
fechamento_lpu.html / manutencao_preventiva.html / treinamento.html /
jornada_excedente.html / fiscal_v2.html / geogrid.html
              │
              │  fetch (GET/POST) — parâmetro "acao"
              ▼
   Google Apps Script (Web App / exec)
              │
              ▼
        Google Sheets (dados)
```

Todas as páginas consomem o mesmo backend (`APPS_SCRIPT_URL`, definido no `<script>` de cada arquivo), através de ações como `LISTAR_ESTEIRA`, `LISTAR_TECNICOS`, `LISTAR_ATIVIDADES_TECNICO`, `RESUMO_DIARIO_TECNICO`, `RESUMO_MENSAL_TECNICO`, `SALVAR_LPU_ATIVIDADE`, `VALIDAR_LPU_APROVADOR`, `VALIDAR_LPU_MEDICAO`, `DECIDIR_LPU_APOIO`, `FECHAR_LPU_NF`, `LISTAR_LPU_FECHAMENTO`, `LISTAR_LPU_PAGAMENTO`, `MARCAR_LPU_PAGO`, `REPROVAR_LPU_NF`, `LPU_OBTER_PDF`, `LPU_ATUALIZAR_PDF`, `REGISTRAR_ASSINATURA_LPU`, `REGISTRAR_ORCAMENTO_MENSAL`, `LISTAR_ORCAMENTOS_MENSAIS`, `REGISTRAR_DISPONIBILIDADE`, `EXCLUIR_DISPONIBILIDADE`, `LISTAR_DISPONIBILIDADE`, `SALVAR_INFO_DESPACHO`, `LISTAR_GEOGRID`, `CONCLUIR_GEOGRID`, `RECUSAR_GEOGRID`, `REENVIAR_GEOGRID`, `EXCLUIR_GEOGRID`, `APROVAR_GEOGRID_LIDER`, `LOGIN_LIDERANCA`, `RESET_COMPLEMENTO_LIDERANCA`, `LISTAR_USUARIOS_LIDERANCA`, entre outras. Não há backend próprio nem banco de dados neste repositório — a lógica de persistência vive no Apps Script/planilha vinculados.

Todas as telas compartilham o mesmo cabeçalho (`.topbar`): barra verde sólida fixa no topo, com logo e marca/subtítulo — sem elementos funcionais (botões, links, seletores) nela, que ficam numa linha própria (`.page-actions`) logo abaixo, dentro do conteúdo de cada página.

As telas se dividem em dois perfis de layout: **desktop** (`index.html`, `painel.html`, `dashboard_manutencao.html`, `dashboard_implantacao.html`, `dashboard_transmissao.html`, `dashboard_gtd.html`, `dashboard_preventiva.html`, `dashboard_medicao.html`, `medicao.html`, `aprovacao_lpu.html`, `geogrid.html`, `manutencao_preventiva.html`, `jornada_excedente.html`, `treinamento.html` — acessadas por computador pela liderança, largura de conteúdo até 1400px, exceto `treinamento.html`/`jornada_excedente.html`/`fiscal_v2.html` que usam largura estreita mesmo sendo telas de liderança) e **mobile** (`tecnico.html`, `PREENCHIMENTO_LPU.html`, `fechamento_lpu.html`, `fiscal_v2.html` — preenchidas pelo técnico no celular em campo, layout estreito de propósito).

O arquivo `.claude/docs/netturbo-esteira-apps-script-*.gs` é a cópia de referência do código do Apps Script de produção — alterações nele precisam ser coladas manualmente no editor do Apps Script e reimplantadas (Implantar → Gerenciar implantações → Nova versão) pra valerem no `/exec` que os front-ends chamam.

### Autenticação

Duas famílias de login independentes, mesmo mecanismo de base (PIN fornecido pela liderança + Complemento pessoal escolhido no primeiro acesso, cujo hash SHA-256 fica salvo na planilha):

- **Técnicos** (`tecnico.html`, `PREENCHIMENTO_LPU.html`, `fechamento_lpu.html`, `manutencao_preventiva.html`): login por Empresa/Técnico, validado contra a aba `ACESSOS_TECNICOS` (ações `LOGIN_TECNICO`/`RESET_COMPLEMENTO`). Sessão em `sessionStorage`.
- **Liderança/operacional** (`index.html`, `aprovacao_lpu.html`, `medicao.html`, `geogrid.html`, `painel.html`, os 6 dashboards e `treinamento.html`): login por Nome, validado contra a aba `ACESSOS_LIDERANCA` (ações `LOGIN_LIDERANCA`/`RESET_COMPLEMENTO_LIDERANCA`/`LISTAR_USUARIOS_LIDERANCA`), via um arquivo compartilhado `auth.js` (`NetturboAuth.proteger/usuario/temAcesso/sair`) incluído em cada uma dessas telas. Sessão em `localStorage` com validade de 12h, com um chip "Olá, {nome} · Sair" injetado automaticamente no `.topbar`. Substituiu a antiga senha única (`LEADERSHIP_PASSWORD`) + seletores manuais de "quem está mexendo" ("Você é...", "Aprovando como", "Validando como") — agora todo registro sai carimbado com o nome de quem logou de verdade.
  - A coluna **Telas** da aba `ACESSOS_LIDERANCA` (lista separada por vírgula, ou `*` para liberar tudo) é o que define, por pessoa, quais dessas telas ela pode acessar — editável direto na planilha, sem mexer em código. `painel.html` usa essa mesma permissão pra esconder os cards das telas bloqueadas.
  - `fiscal_v2.html` e `jornada_excedente.html` ficaram fora dessa migração (não tinham nenhum gate antes) por decisão explícita, e podem ser cobertas numa rodada futura.

## Como rodar localmente

Por ser um site estático, basta abrir os arquivos `.html` diretamente no navegador (duplo clique ou `file://`), ou servir a pasta com qualquer servidor HTTP estático. Não há dependências para instalar nem processo de build.

> Observação: as telas dependem de conexão com a internet para se comunicar com o Google Apps Script (autenticação, listagem e atualização de atividades).

## Deploy

O projeto é hospedado como site estático (ex.: GitHub Pages) diretamente a partir destes arquivos HTML na branch `main`.
