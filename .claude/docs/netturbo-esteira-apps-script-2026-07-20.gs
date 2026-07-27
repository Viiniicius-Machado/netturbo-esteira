// ══════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT — Netturbo Esteira de Despacho (NOVO PROJETO)
//  Este script é independente do sistema de RFO já existente.
//  Aba usada: ESTEIRA
// ══════════════════════════════════════════════════════════════

const ABA_ESTEIRA = 'ESTEIRA';

const HEADERS_ESTEIRA = [
  'ID Atividade','Timestamp Recebido','Motivo','Cliente','Endereço','Cidade Falha','GPS',
  'Data NOC','Período','Protocolo NOC','Protocolo O&M','Porta','Obs',
  'Status','Empresa','Técnico','Timestamp Despacho',
  'Hora Início','Hora Chegada',
  'Ocorrência','Causa','Solução','Materiais',
  'Timestamp Validação','Validado Por','Motivo Não Validado',
  'MTTR','MTTD','Melhoria','CEO','GPS Falha','GPS Caixa Nova A','GPS Caixa Nova B',
  'Empresa Apoio','Técnico Apoio','Hora Início Apoio','Hora Chegada Apoio','Materiais Apoio',
  'Agendamento','TMC','Previsão Chegada',
  // ── Sub-processo LPU (cobrança de prestadoras terceiras, após a validação técnica) ──
  'Status LPU','LPU Empresa Prestadora','LPU CNPJ','LPU Técnicos','LPU Descrição Contábil',
  'LPU Itens','LPU Total','LPU Observações','LPU Fotos','LPU Assinatura Prestador',
  'LPU Timestamp Preenchimento','LPU Validado Por Aprovador','LPU Timestamp Aprovador',
  'LPU Aprovador Medição','LPU Timestamp Medição','LPU Motivo Reprovação','LPU Relatório PDF',
  // ── Mesmo sub-processo LPU, espelhado pra equipe de apoio (pode ser de empresa
  // diferente da titular e precisa de cobrança separada). 'Status LPU Apoio' tem um
  // estágio a mais no início: PENDENTE_DECISAO (apoio ainda não disse se teve cobrança)
  // → SEM_COBRANCA (fim, sem LPU) ou PENDENTE_PREENCHIMENTO (segue o mesmo fluxo da titular).
  'Status LPU Apoio','LPU Apoio Empresa Prestadora','LPU Apoio CNPJ','LPU Apoio Técnicos',
  'LPU Apoio Descrição Contábil','LPU Apoio Itens','LPU Apoio Total','LPU Apoio Observações',
  'LPU Apoio Assinatura Prestador','LPU Apoio Timestamp Preenchimento',
  'LPU Apoio Validado Por Aprovador','LPU Apoio Timestamp Aprovador',
  'LPU Apoio Aprovador Medição','LPU Apoio Timestamp Medição','LPU Apoio Motivo Reprovação',
  'LPU Apoio Relatório PDF',
  // ── Número de identificação da CEO (4 dígitos, único por caixa na empresa) — obrigatório
  // sempre que o técnico usa uma caixa NOVA (tipo 'nova' = A e B, ou 'existente' = só A).
  'Número CEO A','Número CEO B',
  // ── LPU Fase 2 (Nota Fiscal + Pagamento) — fecha o ciclo que hoje para em
  // APROVADO_AGUARDANDO_NF. Uma única NF cobre todas as atividades pendentes da
  // prestadora no momento do fechamento (titular e apoio juntos); o status só muda
  // pra 'PAGO' quando a liderança confirma o pagamento (ver medicao.html). Sempre
  // acrescentar campos novos no FINAL do array — a posição física da coluna na
  // planilha é definida por adicionarColunasNovas() na ordem em que já existe, então
  // inserir no meio quebra o mapeamento idx()/HEADERS_ESTEIRA de tudo que vem depois.
  'LPU NF URL','LPU Timestamp NF','LPU Pago Por','LPU Timestamp Pago',
  'LPU Apoio NF URL','LPU Apoio Timestamp NF','LPU Apoio Pago Por','LPU Apoio Timestamp Pago',
  // Reprovação do fechamento pela Medição (NF errada/ilegível/valor divergente etc.) —
  // distinto de 'LPU Motivo Reprovação' (que é sobre o preenchimento original da LPU).
  'LPU Motivo Reprovação NF','LPU Apoio Motivo Reprovação NF',
  // ── Anexo do despacho (KMZ/print do projeto) + mensagem + local de medição —
  // preenchido pela liderança direto no card "Aguardando Despacho", chega pro
  // técnico junto da atividade despachada (ver index.html / tecnico.html).
  // 'Anexo Despacho URL'/'Anexo Despacho Nome' são o formato antigo (um anexo só,
  // preservado por compatibilidade com o que já foi salvo antes de 2026-07-27) —
  // anexos novos (múltiplos: KMZ + pedido de material + prints colados, por
  // exemplo) vão pra 'Anexos Despacho' (JSON, array de {url,nome}), que sempre
  // migra o valor antigo pra dentro de si na primeira vez que alguém salva de
  // novo naquela atividade (ver salvarInfoDespacho).
  'Anexo Despacho URL','Anexo Despacho Nome','Mensagem Despacho','Link Medição','Anexos Despacho',
  // ── Perguntas rápidas de fusão (RFO de ROMPIMENTO/MASSIVA, depois da CEO) —
  // 'Fusão Pareamento' só é preenchido quando 'Cor com Cor' = 'Não' — JSON com um
  // item por CEO trabalhada (numeroCeo, nomenclaturaA/B, pares de fibra ligados),
  // ver renderFusaoDiagramaBloco em tecnico.html. 'Quantidade CEO Trabalhadas' é
  // sempre preenchido junto (não só quando "Não") — quantas caixas o técnico mexeu.
  'Tipo Cabo Fusionado','Fusionou Todas','Cor com Cor','Fusão Pareamento','Quantidade CEO Trabalhadas'
];

function garantirAba(ss, nome, headers, corFundo, corTexto) {
  let sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    sheet.appendRow(headers);
    const hr = sheet.getRange(1, 1, 1, headers.length);
    hr.setBackground(corFundo).setFontColor(corTexto).setFontWeight('bold').setFontSize(10);
    sheet.setFrozenRows(1);
    try { sheet.autoResizeColumns(1, headers.length); } catch(e) {}
  }
  return sheet;
}

function resposta(status, data) {
  const obj = Object.assign({ status: status }, data || {});
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function gerarId() {
  return 'ATV-' + new Date().getTime();
}

// Corrige valores que o Sheets converteu sozinho pra data/hora completa,
// devolvendo de volta um texto simples (o mesmo problema já resolvido no
// sistema de RFO com horários — aqui é a mesma ideia, pra datas curtas
// tipo "17/07" que o Sheets tenta "entender" como data).
function fmtTextoLivre(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    const dia = String(val.getDate()).padStart(2, '0');
    const mes = String(val.getMonth() + 1).padStart(2, '0');
    return dia + '/' + mes;
  }
  return String(val);
}

// ── POST ─────────────────────────────────────────────────────
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const data = JSON.parse(e.postData.contents);
    const acao = data.acao;

    if (acao === 'CRIAR_ATIVIDADE')      return criarAtividade(ss, data);
    if (acao === 'DESPACHAR')            return despacharAtividade(ss, data);
    if (acao === 'EXCLUIR_ATIVIDADE')    return excluirAtividade(ss, data);
    if (acao === 'DESFAZER_DESPACHO')    return desfazerDespacho(ss, data);
    if (acao === 'DEFINIR_APOIO')        return definirApoio(ss, data);
    if (acao === 'MARCAR_INICIO_CHEGADA_APOIO') return marcarInicioOuChegadaApoio(ss, data);
    if (acao === 'SALVAR_MATERIAIS_APOIO') return salvarMateriaisApoio(ss, data);
    if (acao === 'LOGIN_TECNICO')        return loginTecnico(ss, data);
    if (acao === 'RESET_COMPLEMENTO')    return resetComplemento(ss, data);
    if (acao === 'MARCAR_INICIO_CHEGADA')return marcarInicioOuChegada(ss, data);
    if (acao === 'SALVAR_OCORRENCIA')    return salvarOcorrencia(ss, data);
    if (acao === 'INFORMAR_PREVISAO_CHEGADA') return informarPrevisaoChegada(ss, data);
    if (acao === 'VALIDAR')              return validarAtividade(ss, data);
    if (acao === 'SALVAR_LPU_ATIVIDADE') return salvarLpuAtividade(ss, data);
    if (acao === 'VALIDAR_LPU_APROVADOR') return validarLpuAprovador(ss, data);
    if (acao === 'VALIDAR_LPU_MEDICAO')  return validarLpuMedicao(ss, data);
    if (acao === 'DECIDIR_LPU_APOIO')    return decidirLpuApoio(ss, data);
    if (acao === 'FECHAR_LPU_NF')        return fecharLpuNf(ss, data);
    if (acao === 'MARCAR_LPU_PAGO')      return marcarLpuPago(ss, data);
    if (acao === 'REPROVAR_LPU_NF')      return reprovarLpuNf(ss, data);
    if (acao === 'LPU_ATUALIZAR_PDF')    return atualizarLpuPdf(ss, data);
    if (acao === 'REGISTRAR_ORCAMENTO_MENSAL') return registrarOrcamentoMensal(ss, data);
    if (acao === 'REGISTRAR_DISPONIBILIDADE')  return registrarDisponibilidade(ss, data);
    if (acao === 'EXCLUIR_DISPONIBILIDADE')    return excluirDisponibilidade(ss, data);
    if (acao === 'REGISTRAR_ASSINATURA_LPU')   return registrarAssinaturaLpu(ss, data);
    if (acao === 'SALVAR_INFO_DESPACHO') return salvarInfoDespacho(ss, data);
    if (acao === 'CONCLUIR_GEOGRID')     return concluirGeogrid(ss, data);
    if (acao === 'RECUSAR_GEOGRID')      return recusarGeogrid(ss, data);
    if (acao === 'REENVIAR_GEOGRID')     return reenviarGeogrid(ss, data);
    if (acao === 'EXCLUIR_GEOGRID')      return excluirGeogrid(ss, data);

    return resposta('error', { message: 'Ação desconhecida: ' + acao });
  } catch (err) {
    return resposta('error', { message: err.toString() });
  }
}

// ── GET ──────────────────────────────────────────────────────
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = e && e.parameter ? e.parameter : {};
  if (params.acao === 'LISTAR_ESTEIRA') return listarEsteira(ss);
  if (params.acao === 'LISTAR_TECNICOS') return listarTecnicos(ss);
  if (params.acao === 'LISTAR_ATIVIDADES_TECNICO') return listarAtividadesTecnico(ss, params);
  if (params.acao === 'RESUMO_DIARIO_TECNICO') return resumoDiarioTecnico(ss, params);
  if (params.acao === 'RESUMO_MENSAL_TECNICO') return resumoMensalTecnico(ss, params);
  if (params.acao === 'LISTAR_AGUARDANDO_VALIDACAO') return listarAguardandoValidacao(ss);
  if (params.acao === 'LISTAR_LPU_AGUARDANDO_APROVADOR') return listarLpuAguardandoAprovador(ss);
  if (params.acao === 'LISTAR_LPU_MEDICAO') return listarLpuMedicao(ss);
  if (params.acao === 'LISTAR_LPU_FECHAMENTO') return listarLpuFechamento(ss, params);
  if (params.acao === 'LISTAR_LPU_PAGAMENTO') return listarLpuPagamento(ss);
  if (params.acao === 'LPU_OBTER_PDF') return obterLpuPdf(ss, params);
  if (params.acao === 'LISTAR_ORCAMENTOS_MENSAIS') return listarOrcamentosMensais(ss);
  if (params.acao === 'LISTAR_DISPONIBILIDADE') return listarDisponibilidade(ss);
  if (params.acao === 'LISTAR_GEOGRID') return listarGeogrid(ss);
  return resposta('ok', { sistema: 'Netturbo Esteira de Despacho' });
}

// ── CRIAR ATIVIDADE (a partir da máscara já processada no front-end) ──
function criarAtividade(ss, data) {
  const sheet = garantirAba(ss, ABA_ESTEIRA, HEADERS_ESTEIRA, '#1a1200', '#ffa000');
  const row = sheet.getLastRow() + 1;
  const idxDataNoc = HEADERS_ESTEIRA.indexOf('Data NOC') + 1;
  sheet.getRange(row, idxDataNoc, 1, 1).setNumberFormat('@STRING@'); // força texto, evita Sheets converter "17/07" em data

  const id = gerarId();
  const valores = [
    id,
    new Date().toLocaleString('pt-BR'),
    data.motivo || '',
    data.cliente || '',
    data.endereco || '',
    '',           // Cidade Falha — só é preenchida depois, quando o técnico captura o GPS
    data.gps || '',
    data.dataNoc || '',
    data.periodo || '',
    data.protocoloNoc || '',
    data.protocoloOem || '',
    data.porta || '',
    data.obs || '',
    'AGUARDANDO_DESPACHO',
    '', '', '',   // Empresa, Técnico, Timestamp Despacho
    '', '',       // Hora Início, Hora Chegada
    '', '', '', '', // Ocorrência, Causa, Solução, Materiais
    '', '', '',   // Timestamp Validação, Validado Por, Motivo Não Validado
    '', '',       // MTTR, MTTD
    '',           // Melhoria
    '', '', '', '',// CEO, GPS Falha, GPS Caixa Nova A, GPS Caixa Nova B
    '', '', '', '',// Empresa Apoio, Técnico Apoio, Hora Início Apoio, Hora Chegada Apoio
    '',            // Materiais Apoio
    data.agendamento === 'Sim' ? 'Sim' : 'Não'  // Agendamento
  ];
  sheet.getRange(row, 1, 1, valores.length).setValues([valores]);
  return resposta('ok', { id: id });
}

// ── DESPACHAR ──────────────────────────────────────────────────
function despacharAtividade(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });

  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });

  const idxStatus = HEADERS_ESTEIRA.indexOf('Status') + 1;
  const statusAtual = sheet.getRange(rowIndex, idxStatus).getValue();
  if (statusAtual !== 'AGUARDANDO_DESPACHO') {
    return resposta('error', { message: 'Esta atividade já foi despachada ou está em outro estágio.' });
  }

  sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Status') + 1).setValue('DESPACHADA');
  sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Empresa') + 1).setValue(data.empresa || '');
  sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Técnico') + 1).setValue(data.tecnico || '');
  sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Timestamp Despacho') + 1, 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Timestamp Despacho') + 1).setValue(new Date().toLocaleString('pt-BR'));

  // Equipe de apoio é opcional — pode vir junto no despacho ou ser definida depois
  if (data.empresaApoio) sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Empresa Apoio') + 1).setValue(data.empresaApoio);
  if (data.tecnicoApoio) sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Técnico Apoio') + 1).setValue(data.tecnicoApoio);

  return resposta('ok', {});
}

// Cria (uma vez) ou reaproveita a pasta do Drive onde ficam os anexos (KMZ/KML ou
// print do projeto) que a liderança sobe pro técnico direto no card de despacho.
function getOrCriarPastaAnexoDespacho() {
  const NOME_PASTA = 'Netturbo Esteira - Anexos Despacho';
  const pastas = DriveApp.getFoldersByName(NOME_PASTA);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(NOME_PASTA);
}

// ── ANEXOS (KMZ/print/pedido de material, um ou vários) + MENSAGEM + LINK DE
// MEDIÇÃO (liderança → técnico, preenchido no card "Aguardando Despacho" de
// index.html) ────────────────────────────────────────────────────────────────
function salvarInfoDespacho(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  // Lista de anexos já salvos (formato novo) — migra o valor antigo (um anexo só,
  // colunas 'Anexo Despacho URL'/'Nome') pra dentro da lista na primeira vez que
  // alguém salva de novo nessa atividade. Idempotente: só migra se a URL antiga
  // ainda não estiver na lista, então rodar isso de novo não duplica.
  let anexos = [];
  try {
    const bruto = sheet.getRange(rowIndex, idx('Anexos Despacho')).getValue();
    if (bruto) anexos = JSON.parse(bruto);
    if (!Array.isArray(anexos)) anexos = [];
  } catch (e) { anexos = []; }
  const urlAntiga = sheet.getRange(rowIndex, idx('Anexo Despacho URL')).getValue();
  const nomeAntigo = sheet.getRange(rowIndex, idx('Anexo Despacho Nome')).getValue();
  if (urlAntiga && !anexos.some(a => a.url === urlAntiga)) {
    anexos.unshift({ url: urlAntiga, nome: nomeAntigo || '' });
  }

  // Anexos novos são opcionais em cada chamada e podem ser vários de uma vez
  // (ex.: KMZ + pedido de material, ou vários prints colados) — cada um sobe pro
  // Drive e entra na lista, sem apagar os que já tinham sido enviados antes.
  const novosAnexos = Array.isArray(data.anexos) ? data.anexos : [];
  try {
    novosAnexos.forEach(anexo => {
      if (!anexo || !anexo.base64) return;
      const bruto = String(anexo.base64);
      const partes = bruto.split(',');
      const base64Puro = partes.length > 1 ? partes[1] : partes[0];
      const mimeMatch = bruto.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const nomeArquivo = anexo.nome || ('anexo_' + rowIndex);
      const bytes = Utilities.base64Decode(base64Puro);
      const blob = Utilities.newBlob(bytes, mime, nomeArquivo);
      const pasta = getOrCriarPastaAnexoDespacho();
      const arquivo = pasta.createFile(blob);
      arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      anexos.push({ url: arquivo.getUrl(), nome: nomeArquivo });
    });
  } catch (e) {
    return resposta('error', { message: 'Falha ao salvar o anexo: ' + e.toString() });
  }

  if (anexos.length) {
    sheet.getRange(rowIndex, idx('Anexos Despacho'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('Anexos Despacho')).setValue(JSON.stringify(anexos));
  }

  if (data.mensagem !== undefined) sheet.getRange(rowIndex, idx('Mensagem Despacho')).setValue(data.mensagem || '');
  if (data.linkMedicao !== undefined) sheet.getRange(rowIndex, idx('Link Medição')).setValue(data.linkMedicao || '');

  return resposta('ok', {});
}

// ── DEFINIR/TROCAR EQUIPE DE APOIO (pode ser feito a qualquer momento) ──
function definirApoio(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  sheet.getRange(rowIndex, idx('Empresa Apoio')).setValue(data.empresaApoio || '');
  sheet.getRange(rowIndex, idx('Técnico Apoio')).setValue(data.tecnicoApoio || '');
  return resposta('ok', {});
}

// ── MATERIAIS DA EQUIPE DE APOIO (registro pessoal, não entra na validação oficial) ──
function salvarMateriaisApoio(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  sheet.getRange(rowIndex, idx('Materiais Apoio')).setValue(data.materiaisApoio || '');
  return resposta('ok', {});
}

// ── INÍCIO/CHEGADA DA EQUIPE DE APOIO (clock próprio, não mexe no status geral) ──
function marcarInicioOuChegadaApoio(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });

  const idxInicio = HEADERS_ESTEIRA.indexOf('Hora Início Apoio') + 1;
  const idxChegada = HEADERS_ESTEIRA.indexOf('Hora Chegada Apoio') + 1;

  const horaInicioAtual = sheet.getRange(rowIndex, idxInicio).getValue();
  const agora = new Date();
  const horaFormatada = ('0'+agora.getHours()).slice(-2) + ':' + ('0'+agora.getMinutes()).slice(-2);

  if (!horaInicioAtual) {
    sheet.getRange(rowIndex, idxInicio, 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idxInicio).setValue(horaFormatada);
    return resposta('ok', { etapa: 'inicio', hora: horaFormatada });
  } else {
    const horaChegadaAtual = sheet.getRange(rowIndex, idxChegada).getValue();
    if (horaChegadaAtual) {
      return resposta('error', { message: 'A equipe de apoio já registrou início e chegada.' });
    }
    sheet.getRange(rowIndex, idxChegada, 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idxChegada).setValue(horaFormatada);
    return resposta('ok', { etapa: 'chegada', hora: horaFormatada });
  }
}

// ── EXCLUIR (só permitido enquanto ainda não foi despachada) ────
function excluirAtividade(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });

  const status = sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Status') + 1).getValue();
  if (status !== 'AGUARDANDO_DESPACHO') {
    return resposta('error', { message: 'Só é possível excluir atividades que ainda não foram despachadas. Use "Desfazer Despacho" pra essa.' });
  }
  sheet.deleteRow(rowIndex);
  return resposta('ok', {});
}

// ── DESFAZER DESPACHO (recolhe pra fila, limpando o que o técnico já preencheu) ──
function desfazerDespacho(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  const status = sheet.getRange(rowIndex, idx('Status')).getValue();
  if (status === 'AGUARDANDO_DESPACHO' || status === 'VALIDADA') {
    return resposta('error', { message: 'Esta atividade não pode ser recolhida nesse estágio.' });
  }

  sheet.getRange(rowIndex, idx('Status')).setValue('AGUARDANDO_DESPACHO');
  sheet.getRange(rowIndex, idx('Empresa')).setValue('');
  sheet.getRange(rowIndex, idx('Técnico')).setValue('');
  sheet.getRange(rowIndex, idx('Timestamp Despacho')).setValue('');
  sheet.getRange(rowIndex, idx('Hora Início')).setValue('');
  sheet.getRange(rowIndex, idx('Hora Chegada')).setValue('');
  sheet.getRange(rowIndex, idx('Ocorrência')).setValue('');
  sheet.getRange(rowIndex, idx('Causa')).setValue('');
  sheet.getRange(rowIndex, idx('Solução')).setValue('');
  sheet.getRange(rowIndex, idx('Materiais')).setValue('');
  sheet.getRange(rowIndex, idx('Melhoria')).setValue('');
  sheet.getRange(rowIndex, idx('CEO')).setValue('');
  sheet.getRange(rowIndex, idx('GPS Falha')).setValue('');
  sheet.getRange(rowIndex, idx('GPS Caixa Nova A')).setValue('');
  sheet.getRange(rowIndex, idx('GPS Caixa Nova B')).setValue('');
  sheet.getRange(rowIndex, idx('Número CEO A')).setValue('');
  sheet.getRange(rowIndex, idx('Número CEO B')).setValue('');
  sheet.getRange(rowIndex, idx('Cidade Falha')).setValue('');
  sheet.getRange(rowIndex, idx('Motivo Não Validado')).setValue('');

  return resposta('ok', {});
}

// ── ACESSO DE TÉCNICOS (PIN + Complemento) ──────────────────────
const ABA_ACESSOS = 'ACESSOS_TECNICOS';
const HEADERS_ACESSOS = ['Empresa','Técnico','PIN','Complemento Hash','Configurado','Timestamp Configuração'];

// Mesma lista de empresas/técnicos usada nos formulários HTML —
// mantida aqui também pra já criar as linhas de acesso automaticamente.
const TECH_MAP_BACKEND = {
  "NETTURBO": ["Leonardo da Cruz Egidio","Weslley Rodrigues Pinto","Reginaldo Venâncio da Silva","Nicolas Lima de Almeida","Warley Aparecido de Paula","Marco Rodrigo dos Santos","Micael Oliveira dos Santos","Tiago Soares da Silva Calado"],
  "OLIVEIRA": ["Evaneis Silva Oliveira"],
  "PV": ["Petterson Valentim Barreto"],
  "QUALITY": ["Jurandy Luis da Silva Filho","Guilherme dos Santos Reis","Wesley Henrique da Silva Rios"],
  "SOLUTEC": ["Lielder Rogers Miranda","Marcio Aparecido Santiago"],
  "VAL": ["Guilherme de Jesus Arruda","Djalma Aparecido Inocêncio","Marcos Mendes Merino","Altimayer de Araújo Lima","Robson Rodrigues Santos","Felipe Martins Santos Silva","Jonathan Henrique Honorato","Diego Eduardo de Souza Basso"]
};

// Empresas em que UM técnico centraliza toda a LPU da equipe. A atividade
// continua contando pro técnico que atendeu (MTTR/IRR/resumo pessoal); só a
// etapa de LPU (preencher / NF / financeiro) é roteada para o responsável abaixo.
const RESPONSAVEL_LPU_POR_EMPRESA = {
  "VAL": "Marcos Mendes Merino"
};

// Empresas que NÃO cobram por LPU (nada de "Pendente de Preenchimento LPU",
// Fechamento LPU, Nota Fiscal). NETTURBO é mão de obra própria. QUALITY tem
// contrato fixo (18 atividades/mês) cobrado por produtividade — pra essas, o
// processo da tela do técnico termina na validação do NOC, sem sub-processo de LPU.
const EMPRESAS_SEM_LPU = ["NETTURBO", "QUALITY"];

function sha256Hex(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// Garante que a aba de acessos existe e já tem uma linha por técnico
// (PIN começa vazio — o Vinicius preenche direto na planilha).
function garantirAcessos(ss) {
  const sheet = garantirAba(ss, ABA_ACESSOS, HEADERS_ACESSOS, '#1a1a1a', '#5aa9e6');
  const existentes = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().map(r => r[0] + '|' + r[1])
    : [];
  Object.keys(TECH_MAP_BACKEND).forEach(empresa => {
    TECH_MAP_BACKEND[empresa].forEach(tecnico => {
      const chave = empresa + '|' + tecnico;
      if (existentes.indexOf(chave) === -1) {
        sheet.appendRow([empresa, tecnico, '', '', 'não', '']);
      }
    });
  });
  return sheet;
}

// Lê a aba ACESSOS_TECNICOS ao vivo e monta { EMPRESA: [tecnico1, tecnico2, ...] }.
// É isso que os dropdowns das páginas consultam agora — editar essa aba
// (adicionar linha, apagar linha) já reflete direto, sem precisar mexer em código.
function listarTecnicos(ss) {
  const sheet = garantirAcessos(ss);
  if (sheet.getLastRow() < 2) return resposta('ok', { empresas: {} });

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const empresas = {};
  data.forEach(row => {
    const empresa = String(row[0] || '').trim();
    const tecnico = String(row[1] || '').trim();
    if (!empresa || !tecnico) return;
    if (!empresas[empresa]) empresas[empresa] = [];
    empresas[empresa].push(tecnico);
  });
  return resposta('ok', { empresas: empresas, responsaveis: RESPONSAVEL_LPU_POR_EMPRESA, semLpu: EMPRESAS_SEM_LPU });
}

function encontrarLinhaAcesso(sheet, empresa, tecnico) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === empresa && data[i][1] === tecnico) return { linha: i + 1, dados: data[i] };
  }
  return null;
}

// Login normal: PIN + Complemento têm que bater com o que está salvo.
// Se ainda não foi configurado (primeiro acesso), o complemento enviado
// agora vira o complemento definitivo.
function loginTecnico(ss, data) {
  const sheet = garantirAcessos(ss);
  const encontrado = encontrarLinhaAcesso(sheet, data.empresa, data.tecnico);
  if (!encontrado) return resposta('error', { message: 'Técnico não encontrado para essa empresa.' });

  const [ , , pinSalvo, hashSalvo, configurado ] = encontrado.dados;
  if (!pinSalvo || String(pinSalvo).trim() === '') {
    return resposta('error', { message: 'Nenhum PIN cadastrado para este técnico ainda. Fale com a liderança.' });
  }
  if (String(data.pin).trim() !== String(pinSalvo).trim()) {
    return resposta('error', { message: 'PIN incorreto.' });
  }

  if (configurado !== 'sim') {
    // primeiro acesso — grava o complemento escolhido agora
    const hash = sha256Hex(data.complemento || '');
    sheet.getRange(encontrado.linha, 4).setValue(hash);
    sheet.getRange(encontrado.linha, 5).setValue('sim');
    sheet.getRange(encontrado.linha, 6).setValue(new Date().toLocaleString('pt-BR'));
    return resposta('ok', { primeiroAcesso: true });
  }

  const hashEnviado = sha256Hex(data.complemento || '');
  if (hashEnviado !== hashSalvo) {
    return resposta('error', { message: 'Complemento incorreto.' });
  }
  return resposta('ok', { primeiroAcesso: false });
}

// Reset: só precisa do PIN certo pra definir um complemento novo.
function resetComplemento(ss, data) {
  const sheet = garantirAcessos(ss);
  const encontrado = encontrarLinhaAcesso(sheet, data.empresa, data.tecnico);
  if (!encontrado) return resposta('error', { message: 'Técnico não encontrado para essa empresa.' });

  const pinSalvo = encontrado.dados[2];
  if (!pinSalvo || String(data.pin).trim() !== String(pinSalvo).trim()) {
    return resposta('error', { message: 'PIN incorreto.' });
  }

  const hash = sha256Hex(data.novoComplemento || '');
  sheet.getRange(encontrado.linha, 4).setValue(hash);
  sheet.getRange(encontrado.linha, 5).setValue('sim');
  sheet.getRange(encontrado.linha, 6).setValue(new Date().toLocaleString('pt-BR'));
  return resposta('ok', {});
}

// ── ATIVIDADES DESPACHADAS PARA UM TÉCNICO ESPECÍFICO ───────────
function listarAtividadesTecnico(ss, params) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { atividades: [] });

  const data = sheet.getDataRange().getValues();
  data.shift();
  const idxStatus = HEADERS_ESTEIRA.indexOf('Status');
  const idxEmpresa = HEADERS_ESTEIRA.indexOf('Empresa');
  const idxTecnico = HEADERS_ESTEIRA.indexOf('Técnico');
  const idxEmpresaApoio = HEADERS_ESTEIRA.indexOf('Empresa Apoio');
  const idxTecnicoApoio = HEADERS_ESTEIRA.indexOf('Técnico Apoio');
  const idxHoraInicioApoio = HEADERS_ESTEIRA.indexOf('Hora Início Apoio');
  const idxHoraChegadaApoio = HEADERS_ESTEIRA.indexOf('Hora Chegada Apoio');
  const idxStatusLpu = HEADERS_ESTEIRA.indexOf('Status LPU');
  const idxStatusLpuApoio = HEADERS_ESTEIRA.indexOf('Status LPU Apoio');

  const atividades = [];
  data.forEach((row, i) => {
    const empresaLinha = row[idxEmpresa];
    const tecnicoLinha = row[idxTecnico];
    const empresaApoioLinha = row[idxEmpresaApoio];
    const tecnicoApoioLinha = row[idxTecnicoApoio];

    const souTitular = empresaLinha === params.empresa && tecnicoLinha === params.tecnico;
    const souApoio = empresaApoioLinha === params.empresa && tecnicoApoioLinha === params.tecnico;

    // Empresas com RESPONSAVEL_LPU_POR_EMPRESA centralizam a etapa de LPU num só
    // técnico: a atividade continua sendo do titular/apoio pra tudo que é campo,
    // mas quando VALIDADA (chegou a vez da LPU) ela "migra" pra lista do responsável.
    const respTit = RESPONSAVEL_LPU_POR_EMPRESA[empresaLinha];
    const respApo = RESPONSAVEL_LPU_POR_EMPRESA[empresaApoioLinha];
    const souResponsavelTitular = row[idxStatus] === 'VALIDADA' && !souTitular
      && empresaLinha === params.empresa && respTit === params.tecnico;
    const souResponsavelApoio = row[idxStatus] === 'VALIDADA' && !souApoio
      && empresaApoioLinha === params.empresa && respApo === params.tecnico;

    let papel = null, delegadaLpu = false, delegadaLpuApoio = false;
    if (souTitular) papel = 'titular';
    else if (souApoio) papel = 'apoio';
    else if (souResponsavelTitular) { papel = 'titular'; delegadaLpu = true; }
    else if (souResponsavelApoio) { papel = 'apoio'; delegadaLpuApoio = true; }
    if (!papel) return;

    if (row[idxStatus] === 'AGUARDANDO_DESPACHO') return; // não é dele ainda
    if (row[idxStatus] === 'VALIDADA') {
      // Só continua na lista ativa se ainda tiver um sub-processo de LPU em andamento —
      // da titular pra quem é titular, do apoio pra quem é apoio (cada papel segue o
      // próprio Status LPU, já que podem ser empresas diferentes com cobranças distintas).
      // Sem LPU (ex: NETTURBO, ou apoio que disse "sem cobrança") ou já passou de Medição
      // → some, como sempre foi, e entra só no resumo diário/mensal.
      if (papel === 'titular') {
        // Defesa extra: empresa sem LPU (ex: QUALITY) não deveria nunca chegar
        // aqui com um Status LPU pendente, mas se a linha foi validada ANTES da
        // empresa entrar em EMPRESAS_SEM_LPU, o valor antigo ainda está gravado
        // na planilha — trata como se não tivesse LPU nenhuma, sempre.
        if (EMPRESAS_SEM_LPU.indexOf(empresaLinha) !== -1) return;
        const statusLpu = row[idxStatusLpu];
        const lpuAindaAtivo = ['PENDENTE_PREENCHIMENTO','AGUARDANDO_APROVADOR','AGUARDANDO_MEDICAO'].includes(statusLpu);
        if (!lpuAindaAtivo) return;
        // A empresa tem responsável e não sou eu: a LPU não é minha — some daqui
        // (segue contando pro meu resumo diário/mensal, só não entra nesta lista).
        if (souTitular && respTit && respTit !== params.tecnico) return;
      } else {
        if (EMPRESAS_SEM_LPU.indexOf(empresaApoioLinha) !== -1) return;
        const statusLpuApoio = row[idxStatusLpuApoio];
        const lpuApoioAindaAtivo = ['PENDENTE_DECISAO','PENDENTE_PREENCHIMENTO','AGUARDANDO_APROVADOR','AGUARDANDO_MEDICAO'].includes(statusLpuApoio);
        if (!lpuApoioAindaAtivo) return;
        if (statusLpuApoio === 'PENDENTE_DECISAO') {
          // A decisão de "teve cobrança?" é sempre de quem foi apoio de fato,
          // mesmo se a empresa tiver um responsável de LPU — a delegação só
          // começa depois, a partir do preenchimento em si.
          if (delegadaLpuApoio) return;
        } else {
          if (souApoio && respApo && respApo !== params.tecnico) return;
        }
      }
    }

    const obj = { rowIndex: i + 2, papel: papel };
    if (delegadaLpu) obj.delegadaLpu = true;
    if (delegadaLpuApoio) obj.delegadaLpuApoio = true;
    HEADERS_ESTEIRA.forEach((h, j) => {
      if (h === 'Data NOC') obj[h] = fmtTextoLivre(row[j]);
      else if (h === 'Hora Início' || h === 'Hora Chegada' || h === 'Hora Início Apoio' || h === 'Hora Chegada Apoio') obj[h] = fmtHoraLivre(row[j]);
      else obj[h] = row[j];
    });
    atividades.push(obj);
  });
  return resposta('ok', { atividades: atividades });
}

// Mesma ideia do fmtTextoLivre, mas pra horários (HH:MM) em vez de datas curtas.
function fmtHoraLivre(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'string' && /^\d{1,2}:\d{2}$/.test(val.trim())) return val.trim();
  if (val instanceof Date) {
    const h = val.getHours();
    const m = val.getMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  // Caso raro: o Sheets guardou como número puro (fração do dia), sem virar objeto Data nem texto.
  if (typeof val === 'number') {
    const totalMin = Math.round((val % 1) * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  return String(val);
}

// Extrai "YYYY-MM-DD" de um timestamp no formato "17/07/2026, 18:11:43"
function extrairDataBR(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + d;
  }
  const m = String(val).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

// Converte "HH:MM" (mesmo com hora >24) em minutos; null se não reconhecer
function parseHoraParaMinutos(str) {
  const m = String(str || '').trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// ── RESUMO MENSAL DO TÉCNICO (fechamento por mês: C/SLA, S/SLA, eficiência, MTTR/MTTD/TMC médios) ──
function resumoMensalTecnico(ss, params) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) {
    return resposta('ok', { totalConcluidas: 0, cSla: 0, sSla: 0, eficiencia: 0, mttrMedio: '', mttdMedio: '', tmcMedio: '', irrPct: 0, irrRepetidos: 0, irrTotalRompimentos: 0 });
  }
  const data = sheet.getDataRange().getValues();
  data.shift();
  const idxEmpresa = HEADERS_ESTEIRA.indexOf('Empresa');
  const idxTecnico = HEADERS_ESTEIRA.indexOf('Técnico');
  const idxEmpresaApoio = HEADERS_ESTEIRA.indexOf('Empresa Apoio');
  const idxTecnicoApoio = HEADERS_ESTEIRA.indexOf('Técnico Apoio');
  const idxStatus = HEADERS_ESTEIRA.indexOf('Status');
  const idxValidacao = HEADERS_ESTEIRA.indexOf('Timestamp Validação');
  const idxMTTR = HEADERS_ESTEIRA.indexOf('MTTR');
  const idxMTTD = HEADERS_ESTEIRA.indexOf('MTTD');
  const idxTMC = HEADERS_ESTEIRA.indexOf('TMC');
  const idxCliente = HEADERS_ESTEIRA.indexOf('Cliente');
  const idxOcorrencia = HEADERS_ESTEIRA.indexOf('Ocorrência');
  const idxTimestampRecebido = HEADERS_ESTEIRA.indexOf('Timestamp Recebido');

  const mesAlvo = params.mes || ''; // 'YYYY-MM'
  let totalConcluidas = 0, cSla = 0, sSla = 0;
  let somaMTTR = 0, contMTTR = 0, somaMTTD = 0, contMTTD = 0, somaTMC = 0, contTMC = 0;

  // ── IRR (Índice de Recursos Repetitivos) — visão pessoal ────────────────────────
  // Repetição = mesmo Cliente com outro ROMPIMENTO validado nos 30 dias seguintes
  // (varre a planilha TODA, não só as linhas deste técnico, senão não teria como
  // enxergar se o cliente voltou a chamar depois). A culpa é de quem atendeu ANTES,
  // não de quem "herdou" o problema depois — se o cliente ligou de novo dentro de 30
  // dias, é sinal de que o reparo anterior não segurou, então o IRR pesa pra quem fez
  // aquele reparo. O técnico que atendeu a repetição só é responsabilizado se houver
  // uma NOVA chamada dentro de 30 dias da visita dele — cada visita só "causa" a
  // repetição seguinte, nunca herda a culpa da anterior.
  const porCliente = {};
  data.forEach((row, i) => {
    if (row[idxStatus] !== 'VALIDADA' || row[idxOcorrencia] !== 'ROMPIMENTO') return;
    const cliente = String(row[idxCliente] || '').trim().toUpperCase();
    const dataRecebido = parseTimestampBR(row[idxTimestampRecebido]);
    if (!cliente || !dataRecebido) return;
    (porCliente[cliente] = porCliente[cliente] || []).push({ rowIndex: i + 2, data: dataRecebido });
  });
  const causouRepeticao = new Set();
  Object.values(porCliente).forEach(visitas => {
    visitas.sort((a, b) => a.data - b.data);
    for (let i = 1; i < visitas.length; i++) {
      const dias = (visitas[i].data - visitas[i - 1].data) / 86400000;
      if (dias <= 30) causouRepeticao.add(visitas[i - 1].rowIndex);
    }
  });

  let totalRompimentos = 0, totalRepetidos = 0;

  data.forEach((row, i) => {
    const souTitular = row[idxEmpresa] === params.empresa && row[idxTecnico] === params.tecnico;
    const souApoio = row[idxEmpresaApoio] === params.empresa && row[idxTecnicoApoio] === params.tecnico;
    if (!souTitular && !souApoio) return;
    if (row[idxStatus] !== 'VALIDADA') return;

    const dataValidacao = extrairDataBR(row[idxValidacao]);
    if (!dataValidacao || dataValidacao.slice(0, 7) !== mesAlvo) return;

    totalConcluidas++;
    const mttrMin = parseHoraParaMinutos(fmtHoraLivre(row[idxMTTR]));
    const mttdMin = parseHoraParaMinutos(fmtHoraLivre(row[idxMTTD]));
    const tmcMin = parseHoraParaMinutos(fmtHoraLivre(row[idxTMC]));

    if (mttrMin !== null) {
      somaMTTR += mttrMin; contMTTR++;
      if (mttrMin <= 240) cSla++; else sSla++;
    }
    if (mttdMin !== null) { somaMTTD += mttdMin; contMTTD++; }
    if (tmcMin !== null) { somaTMC += tmcMin; contTMC++; }

    if (row[idxOcorrencia] === 'ROMPIMENTO') {
      totalRompimentos++;
      if (causouRepeticao.has(i + 2)) totalRepetidos++;
    }
  });

  const eficiencia = (cSla + sSla) ? Math.round(cSla / (cSla + sSla) * 100) : 0;
  const mttrMedio = contMTTR ? fmtMinParaHora(Math.round(somaMTTR / contMTTR)) : '';
  const mttdMedio = contMTTD ? fmtMinParaHora(Math.round(somaMTTD / contMTTD)) : '';
  const tmcMedio = contTMC ? fmtMinParaHora(Math.round(somaTMC / contTMC)) : '';
  const irrPct = totalRompimentos ? Math.round(totalRepetidos / totalRompimentos * 1000) / 10 : 0;

  return resposta('ok', {
    totalConcluidas, cSla, sSla, eficiencia, mttrMedio, mttdMedio, tmcMedio,
    irrPct, irrRepetidos: totalRepetidos, irrTotalRompimentos: totalRompimentos
  });
}


function resumoDiarioTecnico(ss, params) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) {
    return resposta('ok', { recebidas: 0, concluidas: 0, totalRecebidasGeral: 0, totalConcluidasGeral: 0 });
  }
  const data = sheet.getDataRange().getValues();
  data.shift();
  const idxEmpresa = HEADERS_ESTEIRA.indexOf('Empresa');
  const idxTecnico = HEADERS_ESTEIRA.indexOf('Técnico');
  const idxEmpresaApoio = HEADERS_ESTEIRA.indexOf('Empresa Apoio');
  const idxTecnicoApoio = HEADERS_ESTEIRA.indexOf('Técnico Apoio');
  const idxDespacho = HEADERS_ESTEIRA.indexOf('Timestamp Despacho');
  const idxValidacao = HEADERS_ESTEIRA.indexOf('Timestamp Validação');
  const idxStatus = HEADERS_ESTEIRA.indexOf('Status');

  const dataAlvo = params.data || '';
  let recebidas = 0, concluidas = 0, totalRecebidasGeral = 0, totalConcluidasGeral = 0;

  data.forEach(row => {
    const souTitular = row[idxEmpresa] === params.empresa && row[idxTecnico] === params.tecnico;
    const souApoio = row[idxEmpresaApoio] === params.empresa && row[idxTecnicoApoio] === params.tecnico;
    if (!souTitular && !souApoio) return;
    const despachoVal = row[idxDespacho];
    if (despachoVal) {
      totalRecebidasGeral++;
      if (extrairDataBR(despachoVal) === dataAlvo) recebidas++;
    }
    if (row[idxStatus] === 'VALIDADA') {
      const validacaoVal = row[idxValidacao];
      if (validacaoVal) {
        totalConcluidasGeral++;
        if (extrairDataBR(validacaoVal) === dataAlvo) concluidas++;
      }
    }
  });

  return resposta('ok', { recebidas, concluidas, totalRecebidasGeral, totalConcluidasGeral });
}


function marcarInicioOuChegada(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });

  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });

  const idxInicio = HEADERS_ESTEIRA.indexOf('Hora Início') + 1;
  const idxChegada = HEADERS_ESTEIRA.indexOf('Hora Chegada') + 1;
  const idxStatus = HEADERS_ESTEIRA.indexOf('Status') + 1;

  const horaInicioAtual = sheet.getRange(rowIndex, idxInicio).getValue();
  const agora = new Date();
  const horaFormatada = ('0'+agora.getHours()).slice(-2) + ':' + ('0'+agora.getMinutes()).slice(-2);

  if (!horaInicioAtual) {
    sheet.getRange(rowIndex, idxInicio, 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idxInicio).setValue(horaFormatada);
    sheet.getRange(rowIndex, idxStatus).setValue('INICIADA');
    return resposta('ok', { etapa: 'inicio', hora: horaFormatada });
  } else {
    const horaChegadaAtual = sheet.getRange(rowIndex, idxChegada).getValue();
    if (horaChegadaAtual) {
      return resposta('error', { message: 'Esta atividade já registrou início e chegada.' });
    }
    sheet.getRange(rowIndex, idxChegada, 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idxChegada).setValue(horaFormatada);
    sheet.getRange(rowIndex, idxStatus).setValue('EM_CAMPO');
    return resposta('ok', { etapa: 'chegada', hora: horaFormatada });
  }
}

// Verifica se o JSON de "Fusão Pareamento" (array de diagramas por CEO) tem
// pelo menos um par de fibra desenhado em algum diagrama — usado como gatilho
// da fila do GEOGRID desde que a pergunta "Cor com Cor?" deixou de existir.
function temPareamentoPreenchido(fusaoPareamentoJson) {
  if (!fusaoPareamentoJson) return false;
  try {
    const diagramas = JSON.parse(fusaoPareamentoJson);
    if (!Array.isArray(diagramas)) return false;
    return diagramas.some(function(d) { return Array.isArray(d.pares) && d.pares.length > 0; });
  } catch (e) {
    return false;
  }
}

// ── SALVAR OCORRÊNCIA (técnico preenche e solicita validação) ───
function salvarOcorrencia(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  sheet.getRange(rowIndex, idx('Ocorrência')).setValue(data.ocorrencia || '');
  sheet.getRange(rowIndex, idx('Causa')).setValue(data.causa || '');
  sheet.getRange(rowIndex, idx('Solução')).setValue(data.solucao || '');
  sheet.getRange(rowIndex, idx('Materiais')).setValue(data.materiais || '');
  sheet.getRange(rowIndex, idx('Melhoria')).setValue(data.melhoria || '');
  sheet.getRange(rowIndex, idx('CEO')).setValue(data.ceo || '');
  sheet.getRange(rowIndex, idx('GPS Falha')).setValue(data.gpsFalha || '');
  sheet.getRange(rowIndex, idx('GPS Caixa Nova A')).setValue(data.gpsCeoA || '');
  sheet.getRange(rowIndex, idx('GPS Caixa Nova B')).setValue(data.gpsCeoB || '');
  sheet.getRange(rowIndex, idx('Número CEO A'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Número CEO A')).setValue(data.numeroCeoA || '');
  sheet.getRange(rowIndex, idx('Número CEO B'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Número CEO B')).setValue(data.numeroCeoB || '');
  sheet.getRange(rowIndex, idx('Cidade Falha')).setValue(data.cidadeFalha || '');
  sheet.getRange(rowIndex, idx('Status')).setValue('AGUARDANDO_VALIDACAO');
  sheet.getRange(rowIndex, idx('Motivo Não Validado')).setValue('');

  // Perguntas rápidas de fusão — só existem em ROMPIMENTO/MASSIVA com CEO selecionada;
  // ficam vazias nos outros tipos de ocorrência. "Cor com Cor" não é mais pergunta
  // no front-end (coluna preservada só por histórico de atividades antigas).
  sheet.getRange(rowIndex, idx('Tipo Cabo Fusionado')).setValue(data.tipoCaboFusionado || '');
  sheet.getRange(rowIndex, idx('Fusionou Todas')).setValue(data.fusionouTodas || '');
  sheet.getRange(rowIndex, idx('Cor com Cor')).setValue(data.corComCor || '');
  sheet.getRange(rowIndex, idx('Fusão Pareamento'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Fusão Pareamento')).setValue(data.fusaoPareamento || '');
  sheet.getRange(rowIndex, idx('Quantidade CEO Trabalhadas'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Quantidade CEO Trabalhadas')).setValue(data.quantidadeCeo || '');

  // O diagrama de fusão agora fica sempre disponível (não existe mais pergunta
  // "Cor com Cor?") — o gatilho da fila do GEOGRID passa a ser "o técnico
  // desenhou pelo menos uma ligação de fibra" (fusaoPareamento com algum par
  // preenchido), já que isso indica uma fusão fora do padrão que precisa ser
  // replicada manualmente no GEOGRID por alguém da sala técnica.
  if (temPareamentoPreenchido(data.fusaoPareamento)) {
    registrarGeogridSeNecessario(ss, sheet, rowIndex, data);
  }

  // TMC (Tempo Médio de Campo) = Hora Chegada → agora (momento em que o técnico pede
  // validação) — fecha aqui mesmo, sem esperar a liderança validar depois (diferente do MTTR).
  const horaChegadaTMC = fmtHoraLivre(sheet.getRange(rowIndex, idx('Hora Chegada')).getValue());
  if (horaChegadaTMC) {
    const agoraTMC = new Date();
    const horaAgoraTMC = ('0'+agoraTMC.getHours()).slice(-2) + ':' + ('0'+agoraTMC.getMinutes()).slice(-2);
    sheet.getRange(rowIndex, idx('TMC'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('TMC')).setValue(diferencaHoras(horaChegadaTMC, horaAgoraTMC));
  }

  return resposta('ok', {});
}

// ── INFORMAR PREVISÃO DE CHEGADA (técnico informa uma estimativa de horário antes
// de chegar no local — pra despacho repassar ao cliente mais rápido) ────────────
function informarPrevisaoChegada(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  const horaChegadaAtual = sheet.getRange(rowIndex, idx('Hora Chegada')).getValue();
  if (horaChegadaAtual) {
    return resposta('error', { message: 'Esta atividade já chegou no local.' });
  }

  sheet.getRange(rowIndex, idx('Previsão Chegada'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Previsão Chegada')).setValue(data.previsao || '');
  return resposta('ok', {});
}

// ── CÁLCULOS DE TEMPO (MTTR / MTTD) ──────────────────────────────
// MTTD = Timestamp Despacho → Hora Chegada    (tempo até localizar o problema em campo)
// MTTR = Timestamp Recebido → Timestamp Validação (tempo total: da entrada em
//        Aguardando Despacho até a validação — despacho + deslocamento + reparo)
function toMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function fmtMinParaHora(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function diferencaHoras(inicio, fim) {
  let i = toMinutos(inicio), f = toMinutos(fim);
  if (f < i) f += 1440;
  return fmtMinParaHora(f - i);
}

// Converte "dd/mm/yyyy, HH:MM:SS" (formato salvo em Timestamp Despacho/Validação) num Date.
// "Timestamp Recebido" não tem @STRING@ forçado na coluna (só Despacho/Validação têm),
// então o Sheets converte sozinho pro tipo Date — se já vier como Date, usa direto.
// Usa Object.prototype.toString em vez de "instanceof Date": valores vindos de
// getDataRange().getValues() (leitura em lote) podem ser um Date de outro "realm"
// do V8, que falha em "instanceof Date" mesmo sendo um Date de verdade.
function parseTimestampBR(str) {
  if (Object.prototype.toString.call(str) === '[object Date]') return str;
  const m = String(str || '').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
}

// Diferença entre um Timestamp completo (Despacho) e uma Hora "HH:MM" (Chegada),
// com rollover pro dia seguinte se a chegada for "antes" do horário do despacho.
// A comparação de rollover ignora os segundos do timestamp de início — senão
// uma chegada no mesmo minuto do despacho "parece" anterior por causa dos
// segundos e dispara um rollover de 24h por engano.
function diferencaTimestampAteHora(timestamp, horaFim) {
  const inicio = parseTimestampBR(timestamp);
  if (!inicio || !horaFim) return '';
  const [h, m] = horaFim.split(':').map(Number);
  let fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), h, m, 0);
  const inicioSemSegundos = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), inicio.getHours(), inicio.getMinutes(), 0);
  if (fim < inicioSemSegundos) fim = new Date(fim.getTime() + 24 * 60 * 60 * 1000);
  const diffMin = Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000));
  return fmtMinParaHora(diffMin);
}

// ── VALIDAR (líder confirma com o NOC, ou devolve com motivo) ───
function validarAtividade(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  const statusAtual = sheet.getRange(rowIndex, idx('Status')).getValue();
  if (statusAtual !== 'AGUARDANDO_VALIDACAO') {
    return resposta('error', { message: 'Esta atividade não está mais aguardando validação (alguém já processou).' });
  }

  if (data.aprovado) {
    // Se o líder editou algum campo antes de validar, grava a versão corrigida
    const camposEditaveis = ['Ocorrência','Causa','Solução','Materiais','Melhoria'];
    const chaveJson = { 'Ocorrência':'ocorrencia', 'Causa':'causa', 'Solução':'solucao', 'Materiais':'materiais', 'Melhoria':'melhoria' };
    camposEditaveis.forEach(campo=>{
      const chave = chaveJson[campo];
      if (data[chave] !== undefined) {
        sheet.getRange(rowIndex, idx(campo)).setValue(data[chave]);
      }
    });

    const agora = new Date();
    const timestampRecebido = sheet.getRange(rowIndex, idx('Timestamp Recebido')).getValue();
    const timestampDespacho = sheet.getRange(rowIndex, idx('Timestamp Despacho')).getValue();
    const horaChegada = fmtHoraLivre(sheet.getRange(rowIndex, idx('Hora Chegada')).getValue());

    sheet.getRange(rowIndex, idx('Timestamp Validação'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('Timestamp Validação')).setValue(new Date().toLocaleString('pt-BR'));
    sheet.getRange(rowIndex, idx('Validado Por')).setValue(data.validadoPor || '');
    sheet.getRange(rowIndex, idx('Status')).setValue('VALIDADA');

    // MTTD = Despacho → Chegada (tempo até localizar o problema em campo)
    if (timestampDespacho && horaChegada) {
      sheet.getRange(rowIndex, idx('MTTD'), 1, 1).setNumberFormat('@STRING@');
      sheet.getRange(rowIndex, idx('MTTD')).setValue(diferencaTimestampAteHora(timestampDespacho, horaChegada));
    }
    // MTTR = Aguardando Despacho (Timestamp Recebido) → Validação (tempo total do atendimento,
    // desde a entrada na esteira até a validação — os dois pontos já são timestamps completos
    // com data, então a diferença é direta, sem precisar de ancoragem/rollover de dia)
    const inicioRecebido = parseTimestampBR(timestampRecebido);
    if (inicioRecebido) {
      const mttrMin = Math.max(0, Math.round((agora.getTime() - inicioRecebido.getTime()) / 60000));
      sheet.getRange(rowIndex, idx('MTTR'), 1, 1).setNumberFormat('@STRING@');
      sheet.getRange(rowIndex, idx('MTTR')).setValue(fmtMinParaHora(mttrMin));
    }

    // Empresas terceiras entram no sub-processo de cobrança (LPU) — a atividade volta
    // pra tela do técnico com "Pendente de Preenchimento LPU" em vez de simplesmente
    // sumir. EMPRESAS_SEM_LPU (mão de obra própria, ou contrato fixo cobrado por
    // produtividade) não entra nesse fluxo — termina aqui mesmo, na validação.
    const empresaAtividade = sheet.getRange(rowIndex, idx('Empresa')).getValue();
    if (EMPRESAS_SEM_LPU.indexOf(empresaAtividade) === -1) {
      sheet.getRange(rowIndex, idx('Status LPU')).setValue('PENDENTE_PREENCHIMENTO');
    }

    // Independente da titular: se teve equipe de apoio de empresa terceira, ela também
    // pode ter cobrança própria (empresa de apoio pode ser diferente da titular). Em vez
    // de assumir, pergunta pro apoio se teve cobrança — PENDENTE_DECISAO em vez de já
    // pular pro preenchimento.
    const empresaApoio = sheet.getRange(rowIndex, idx('Empresa Apoio')).getValue();
    if (empresaApoio && EMPRESAS_SEM_LPU.indexOf(empresaApoio) === -1) {
      sheet.getRange(rowIndex, idx('Status LPU Apoio')).setValue('PENDENTE_DECISAO');
    }

    return resposta('ok', {});
  } else {
    sheet.getRange(rowIndex, idx('Status')).setValue('NAO_VALIDADA');
    sheet.getRange(rowIndex, idx('Motivo Não Validado')).setValue(data.motivo || '');
    return resposta('ok', {});
  }
}

// ── LISTAR AGUARDANDO VALIDAÇÃO (painel do líder) ────────────────
function listarAguardandoValidacao(ss) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { atividades: [] });

  const data = sheet.getDataRange().getValues();
  data.shift();
  const idxStatus = HEADERS_ESTEIRA.indexOf('Status');

  const atividades = [];
  data.forEach((row, i) => {
    if (row[idxStatus] !== 'AGUARDANDO_VALIDACAO') return;
    const obj = { rowIndex: i + 2 };
    HEADERS_ESTEIRA.forEach((h, j) => {
      if (h === 'Data NOC') obj[h] = fmtTextoLivre(row[j]);
      else if (h === 'Hora Início' || h === 'Hora Chegada') obj[h] = fmtHoraLivre(row[j]);
      else obj[h] = row[j];
    });
    atividades.push(obj);
  });
  return resposta('ok', { atividades: atividades });
}

// ══════════════════════════════════════════════════════════════
//  LPU — cobrança de prestadoras terceiras após a validação técnica.
//  Fluxo: Status LPU vazio (NETTURBO, sem cobrança por LPU) OU
//  PENDENTE_PREENCHIMENTO → AGUARDANDO_APROVADOR → AGUARDANDO_MEDICAO →
//  APROVADO_AGUARDANDO_NF (Fase 2, ainda não implementada: Nota Fiscal + Pago).
//  Reprovação em qualquer etapa volta pra PENDENTE_PREENCHIMENTO com motivo.
// ══════════════════════════════════════════════════════════════

// Cria (uma vez) ou reaproveita a pasta do Drive onde ficam as fotos anexadas nas LPUs.
function getOrCriarPastaLPU() {
  const NOME_PASTA = 'Netturbo Esteira - Fotos LPU';
  const pastas = DriveApp.getFoldersByName(NOME_PASTA);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(NOME_PASTA);
}

// ── LPU: técnico (titular OU apoio, via data.tipoLpu) preenche a cobrança de uma
// atividade já validada. Os dois papéis passam pela mesma função — só muda o prefixo
// das colunas gravadas ('LPU ' pra titular, 'LPU Apoio ' pro apoio), já que o resto
// do fluxo (itens, PDF, aprovações) é idêntico.
function salvarLpuAtividade(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;
  const ehApoio = data.tipoLpu === 'apoio';
  const prefixo = ehApoio ? 'LPU Apoio ' : 'LPU ';
  const colStatus = ehApoio ? 'Status LPU Apoio' : 'Status LPU';

  const statusLpuAtual = sheet.getRange(rowIndex, idx(colStatus)).getValue();
  if (statusLpuAtual !== 'PENDENTE_PREENCHIMENTO') {
    return resposta('error', { message: 'Esta LPU não está mais pendente de preenchimento (alguém já processou).' });
  }

  // O relatório (identificação + itens + assinatura + fotos, já formatado) vem pronto
  // em PDF do front-end — sobe pro Drive uma vez só. É nele que o aprovador e a Medição
  // olham as fotos, em vez de abrir uma por uma numa lista solta.
  let relatorioPdfUrl = '';
  if (data.relatorioPdfBase64) {
    try {
      const partes = String(data.relatorioPdfBase64).split(',');
      const base64Puro = partes.length > 1 ? partes[1] : partes[0];
      const bytes = Utilities.base64Decode(base64Puro);
      const blob = Utilities.newBlob(bytes, 'application/pdf', 'LPU_' + (ehApoio ? 'APOIO_' : '') + rowIndex + '.pdf');
      const pasta = getOrCriarPastaLPU();
      const arquivo = pasta.createFile(blob);
      arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      relatorioPdfUrl = arquivo.getUrl();
    } catch (e) {
      // Não deixa problema no PDF derrubar o envio inteiro — os dados brutos (itens,
      // total) já ficam salvos mesmo sem o relatório.
    }
  }

  const itens = Array.isArray(data.itens) ? data.itens : [];
  const totalGeral = itens.reduce((soma, item) => soma + (Number(item.total) || 0), 0);

  sheet.getRange(rowIndex, idx(prefixo + 'Empresa Prestadora')).setValue(data.empresaPrestadora || '');
  sheet.getRange(rowIndex, idx(prefixo + 'CNPJ')).setValue(data.cnpj || '');
  sheet.getRange(rowIndex, idx(prefixo + 'Técnicos')).setValue(data.tecnicos || '');
  sheet.getRange(rowIndex, idx(prefixo + 'Descrição Contábil')).setValue(data.descricaoContabil || '');
  sheet.getRange(rowIndex, idx(prefixo + 'Itens'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx(prefixo + 'Itens')).setValue(JSON.stringify(itens));
  sheet.getRange(rowIndex, idx(prefixo + 'Total')).setValue(totalGeral);
  sheet.getRange(rowIndex, idx(prefixo + 'Observações')).setValue(data.observacoes || '');
  sheet.getRange(rowIndex, idx(prefixo + 'Relatório PDF')).setValue(relatorioPdfUrl);
  sheet.getRange(rowIndex, idx(prefixo + 'Assinatura Prestador')).setValue(data.assinaturaPrestador || '');
  sheet.getRange(rowIndex, idx(prefixo + 'Timestamp Preenchimento'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx(prefixo + 'Timestamp Preenchimento')).setValue(new Date().toLocaleString('pt-BR'));
  sheet.getRange(rowIndex, idx(prefixo + 'Motivo Reprovação')).setValue(''); // limpa motivo de uma reprovação anterior, se tinha
  sheet.getRange(rowIndex, idx(colStatus)).setValue('AGUARDANDO_APROVADOR');

  return resposta('ok', {});
}

// ── LPU: despacho aprova/reprova (index.html) — titular e apoio via data.tipoLpu ──
function validarLpuAprovador(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;
  const ehApoio = data.tipoLpu === 'apoio';
  const prefixo = ehApoio ? 'LPU Apoio ' : 'LPU ';
  const colStatus = ehApoio ? 'Status LPU Apoio' : 'Status LPU';

  const statusLpuAtual = sheet.getRange(rowIndex, idx(colStatus)).getValue();
  if (statusLpuAtual !== 'AGUARDANDO_APROVADOR') {
    return resposta('error', { message: 'Esta LPU não está mais aguardando o aprovador (alguém já processou).' });
  }

  if (data.aprovado) {
    sheet.getRange(rowIndex, idx(prefixo + 'Validado Por Aprovador')).setValue(data.validadoPor || '');
    sheet.getRange(rowIndex, idx(prefixo + 'Timestamp Aprovador'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx(prefixo + 'Timestamp Aprovador')).setValue(new Date().toLocaleString('pt-BR'));
    sheet.getRange(rowIndex, idx(colStatus)).setValue('AGUARDANDO_MEDICAO');
  } else {
    sheet.getRange(rowIndex, idx(prefixo + 'Motivo Reprovação')).setValue(data.motivo || '');
    sheet.getRange(rowIndex, idx(colStatus)).setValue('PENDENTE_PREENCHIMENTO'); // volta pro técnico corrigir
  }
  return resposta('ok', {});
}

// Extrai o ID de arquivo do Drive a partir da URL salva por getUrl()
// (formato "https://drive.google.com/file/d/{ID}/view?..."). Usado pelo
// carimbo do aprovador pra buscar/re-subir o PDF já existente da LPU.
function extrairIdArquivoDrive(url) {
  const m = String(url || '').match(/\/file\/d\/([^\/]+)/);
  return m ? m[1] : '';
}

// ── LPU: busca o PDF já gerado (pro carimbo do aprovador, ver atualizarLpuPdf) ──
function obterLpuPdf(ss, params) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(params.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;
  const prefixo = params.tipoLpu === 'apoio' ? 'LPU Apoio ' : 'LPU ';

  const url = sheet.getRange(rowIndex, idx(prefixo + 'Relatório PDF')).getValue();
  const fileId = extrairIdArquivoDrive(url);
  if (!fileId) return resposta('error', { message: 'Esta LPU não tem um Relatório PDF salvo.' });

  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    return resposta('ok', { pdfBase64: Utilities.base64Encode(blob.getBytes()) });
  } catch (e) {
    return resposta('error', { message: 'Não foi possível ler o PDF: ' + e.toString() });
  }
}

// ── LPU: sobe uma versão carimbada do PDF (chamado pelo front depois que o
// aprovador valida na esteira — ver validarLpuAprovador em index.html). Sobe
// como arquivo novo em vez de sobrescrever, mais simples e sem risco de
// corromper o arquivo original se algo der errado no meio do caminho.
function atualizarLpuPdf(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;
  const ehApoio = data.tipoLpu === 'apoio';
  const prefixo = ehApoio ? 'LPU Apoio ' : 'LPU ';

  if (!data.pdfBase64) return resposta('error', { message: 'pdfBase64 ausente' });
  const bytes = Utilities.base64Decode(data.pdfBase64);
  const blob = Utilities.newBlob(bytes, 'application/pdf', 'LPU_' + (ehApoio ? 'APOIO_' : '') + rowIndex + '_aprovado.pdf');
  const pasta = getOrCriarPastaLPU();
  const arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  sheet.getRange(rowIndex, idx(prefixo + 'Relatório PDF')).setValue(arquivo.getUrl());

  return resposta('ok', {});
}

// ── LPU: Medição aprova/reprova (medicao.html) — titular e apoio via data.tipoLpu ──
function validarLpuMedicao(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;
  const ehApoio = data.tipoLpu === 'apoio';
  const prefixo = ehApoio ? 'LPU Apoio ' : 'LPU ';
  const colStatus = ehApoio ? 'Status LPU Apoio' : 'Status LPU';

  const statusLpuAtual = sheet.getRange(rowIndex, idx(colStatus)).getValue();
  if (statusLpuAtual !== 'AGUARDANDO_MEDICAO') {
    return resposta('error', { message: 'Esta LPU não está mais aguardando a Medição (alguém já processou).' });
  }

  if (data.aprovado) {
    sheet.getRange(rowIndex, idx(prefixo + 'Aprovador Medição')).setValue(data.validadoPor || '');
    sheet.getRange(rowIndex, idx(prefixo + 'Timestamp Medição'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx(prefixo + 'Timestamp Medição')).setValue(new Date().toLocaleString('pt-BR'));
    sheet.getRange(rowIndex, idx(colStatus)).setValue('APROVADO_AGUARDANDO_NF');
    // A partir daqui a obra some da tela do técnico daquele papel (listarAtividadesTecnico
    // só mantém ativo até AGUARDANDO_MEDICAO) — o valor passa a contar só no
    // fechamento financeiro (Fase 2, Nota Fiscal + Pago — ainda não implementada).
  } else {
    sheet.getRange(rowIndex, idx(prefixo + 'Motivo Reprovação')).setValue(data.motivo || '');
    sheet.getRange(rowIndex, idx(colStatus)).setValue('PENDENTE_PREENCHIMENTO'); // volta pro técnico corrigir
  }
  return resposta('ok', {});
}

// ── LPU Apoio: decide se teve cobrança própria (empresa de apoio pode ser diferente
// da titular). Se não teve, some da tela sem gerar LPU nenhuma. ─────────────────────
function decidirLpuApoio(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;

  const statusAtual = sheet.getRange(rowIndex, idx('Status LPU Apoio')).getValue();
  if (statusAtual !== 'PENDENTE_DECISAO') {
    return resposta('error', { message: 'Esta decisão de cobrança já foi tomada (alguém já processou).' });
  }

  sheet.getRange(rowIndex, idx('Status LPU Apoio')).setValue(data.temCobranca ? 'PENDENTE_PREENCHIMENTO' : 'SEM_COBRANCA');
  return resposta('ok', {});
}

// ══════════════════════════════════════════════════════════════
//  LPU FASE 2 — Nota Fiscal + Pagamento. Fecha o ciclo que a Fase 1 deixava parado
//  em APROVADO_AGUARDANDO_NF. Uma única NF cobre TODAS as atividades (titular e
//  apoio) que a prestadora tiver acumulado nesse status no momento do fechamento —
//  sem filtro de data, sem status intermediário de "NF recebida": o status só muda
//  de fato quando a liderança confirma que o pagamento saiu (vai direto pra 'PAGO').
// ══════════════════════════════════════════════════════════════

// Pasta separada da de fotos/relatório LPU — aqui só ficam os arquivos de Nota Fiscal.
function getOrCriarPastaNF() {
  const NOME_PASTA = 'Netturbo Esteira - Notas Fiscais LPU';
  const pastas = DriveApp.getFoldersByName(NOME_PASTA);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(NOME_PASTA);
}

// ── LPU Fechamento: prestador anexa a NF (fechamento_lpu.html) ──────────────────
// Acha tudo que está APROVADO_AGUARDANDO_NF sem NF ainda pra essa empresa (titular
// E apoio, já que uma prestadora emite uma NF só por mês, não uma por papel), sobe
// o arquivo uma vez só e grava a mesma URL em cada linha alcançada. É essa URL igual
// em todas as linhas do lote que permite agrupar o "fechamento" na tela da Medição
// sem precisar de uma aba/entidade nova só pra isso.
function fecharLpuNf(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('error', { message: 'Nada pra fechar.' });
  const empresa = data.empresa;
  if (!empresa) return resposta('error', { message: 'Empresa ausente.' });
  if (!data.notaFiscalBase64) return resposta('error', { message: 'Anexe o arquivo da Nota Fiscal.' });

  const col = h => HEADERS_ESTEIRA.indexOf(h);
  const idx = h => col(h) + 1;
  const linhas = sheet.getDataRange().getValues();
  linhas.shift();

  // Localiza as linhas elegíveis ANTES de subir o arquivo, pra não gerar uma NF
  // órfã no Drive se não houver nada pendente pra essa empresa.
  const elegiveisTitular = [];
  const elegiveisApoio = [];
  linhas.forEach((row, i) => {
    const rowIndex = i + 2;
    if (row[col('LPU Empresa Prestadora')] === empresa &&
        row[col('Status LPU')] === 'APROVADO_AGUARDANDO_NF' &&
        !row[col('LPU NF URL')]) {
      elegiveisTitular.push(rowIndex);
    }
    if (row[col('LPU Apoio Empresa Prestadora')] === empresa &&
        row[col('Status LPU Apoio')] === 'APROVADO_AGUARDANDO_NF' &&
        !row[col('LPU Apoio NF URL')]) {
      elegiveisApoio.push(rowIndex);
    }
  });

  if (!elegiveisTitular.length && !elegiveisApoio.length) {
    return resposta('error', { message: 'Nenhuma atividade pendente de Nota Fiscal para esta empresa no momento.' });
  }

  const bruto = String(data.notaFiscalBase64);
  const partes = bruto.split(',');
  const base64Puro = partes.length > 1 ? partes[1] : partes[0];
  const mimeMatch = bruto.match(/^data:([^;]+);base64,/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
  const ext = mime === 'application/pdf' ? 'pdf' : (mime.split('/')[1] || 'dat');
  const bytes = Utilities.base64Decode(base64Puro);
  const nomeArquivo = 'NF_' + empresa.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().getTime() + '.' + ext;
  const blob = Utilities.newBlob(bytes, mime, nomeArquivo);
  const pasta = getOrCriarPastaNF();
  const arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const nfUrl = arquivo.getUrl();
  const agora = new Date().toLocaleString('pt-BR');

  elegiveisTitular.forEach(rowIndex => {
    sheet.getRange(rowIndex, idx('LPU NF URL')).setValue(nfUrl);
    sheet.getRange(rowIndex, idx('LPU Timestamp NF'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('LPU Timestamp NF')).setValue(agora);
    sheet.getRange(rowIndex, idx('LPU Motivo Reprovação NF')).setValue(''); // limpa motivo de uma reprovação anterior, se tinha
  });
  elegiveisApoio.forEach(rowIndex => {
    sheet.getRange(rowIndex, idx('LPU Apoio NF URL')).setValue(nfUrl);
    sheet.getRange(rowIndex, idx('LPU Apoio Timestamp NF'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('LPU Apoio Timestamp NF')).setValue(agora);
    sheet.getRange(rowIndex, idx('LPU Apoio Motivo Reprovação NF')).setValue('');
  });

  return resposta('ok', { nfUrl: nfUrl, quantidade: elegiveisTitular.length + elegiveisApoio.length });
}

// ── LPU Fechamento: fila + histórico da prestadora (fechamento_lpu.html) ────────
// Devolve tudo que está APROVADO_AGUARDANDO_NF (pendente ou já com NF, aguardando
// pagamento) ou PAGO pra essa empresa, titular e/ou apoio — o front separa em três
// blocos (pendente de NF / aguardando pagamento / histórico de pagos) olhando pra
// 'LPU NF URL' e pro status de cada item.
function listarLpuFechamento(ss, params) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { itens: [] });
  const empresa = params.empresa;

  const col = h => HEADERS_ESTEIRA.indexOf(h);
  const data = sheet.getDataRange().getValues();
  data.shift();

  const itens = [];
  data.forEach((row, i) => {
    const statusT = row[col('Status LPU')];
    const statusA = row[col('Status LPU Apoio')];
    const souTitular = row[col('LPU Empresa Prestadora')] === empresa && (statusT === 'APROVADO_AGUARDANDO_NF' || statusT === 'PAGO');
    const souApoio = row[col('LPU Apoio Empresa Prestadora')] === empresa && (statusA === 'APROVADO_AGUARDANDO_NF' || statusA === 'PAGO');
    if (!souTitular && !souApoio) return;

    const base = { rowIndex: i + 2 };
    HEADERS_ESTEIRA.forEach((h, j) => { base[h] = (h === 'Data NOC') ? fmtTextoLivre(row[j]) : row[j]; });
    if (souTitular) itens.push(Object.assign({ tipoLpu: 'titular' }, base));
    if (souApoio) itens.push(Object.assign({ tipoLpu: 'apoio' }, base));
  });
  return resposta('ok', { itens: itens });
}

// ── LPU Fechamento: fila de pagamento pra Medição (medicao.html) ────────────────
// Só entra quem já tem NF anexada e ainda está APROVADO_AGUARDANDO_NF (ou seja,
// passou pelo fechamento do prestador mas a liderança ainda não confirmou o
// pagamento). O front agrupa por 'LPU NF URL' pra mostrar um card por fechamento
// em vez de um por atividade, já que o mesmo arquivo cobre o lote inteiro.
function listarLpuPagamento(ss) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { itens: [] });

  const col = h => HEADERS_ESTEIRA.indexOf(h);
  const data = sheet.getDataRange().getValues();
  data.shift();

  const itens = [];
  data.forEach((row, i) => {
    const prontoTitular = row[col('Status LPU')] === 'APROVADO_AGUARDANDO_NF' && row[col('LPU NF URL')];
    const prontoApoio = row[col('Status LPU Apoio')] === 'APROVADO_AGUARDANDO_NF' && row[col('LPU Apoio NF URL')];
    if (!prontoTitular && !prontoApoio) return;

    const base = { rowIndex: i + 2 };
    HEADERS_ESTEIRA.forEach((h, j) => { base[h] = (h === 'Data NOC') ? fmtTextoLivre(row[j]) : row[j]; });
    if (prontoTitular) itens.push(Object.assign({ tipoLpu: 'titular' }, base));
    if (prontoApoio) itens.push(Object.assign({ tipoLpu: 'apoio' }, base));
  });
  return resposta('ok', { itens: itens });
}

// ── LPU Fechamento: liderança confirma que o pagamento saiu (medicao.html) ──────
// Marca como PAGO toda linha (titular e/ou apoio) cuja NF URL bate com o fechamento
// confirmado — é assim que um clique só resolve o lote inteiro, mesmo sem uma
// entidade "fechamento" separada na planilha.
function marcarLpuPago(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const nfUrl = data.nfUrl;
  if (!nfUrl) return resposta('error', { message: 'nfUrl ausente' });

  const col = h => HEADERS_ESTEIRA.indexOf(h);
  const idx = h => col(h) + 1;
  const linhas = sheet.getDataRange().getValues();
  linhas.shift();
  const agora = new Date().toLocaleString('pt-BR');
  let atualizadas = 0;

  linhas.forEach((row, i) => {
    const rowIndex = i + 2;
    if (row[col('LPU NF URL')] === nfUrl && row[col('Status LPU')] === 'APROVADO_AGUARDANDO_NF') {
      sheet.getRange(rowIndex, idx('Status LPU')).setValue('PAGO');
      sheet.getRange(rowIndex, idx('LPU Pago Por')).setValue(data.pagoPor || '');
      sheet.getRange(rowIndex, idx('LPU Timestamp Pago'), 1, 1).setNumberFormat('@STRING@');
      sheet.getRange(rowIndex, idx('LPU Timestamp Pago')).setValue(agora);
      atualizadas++;
    }
    if (row[col('LPU Apoio NF URL')] === nfUrl && row[col('Status LPU Apoio')] === 'APROVADO_AGUARDANDO_NF') {
      sheet.getRange(rowIndex, idx('Status LPU Apoio')).setValue('PAGO');
      sheet.getRange(rowIndex, idx('LPU Apoio Pago Por')).setValue(data.pagoPor || '');
      sheet.getRange(rowIndex, idx('LPU Apoio Timestamp Pago'), 1, 1).setNumberFormat('@STRING@');
      sheet.getRange(rowIndex, idx('LPU Apoio Timestamp Pago')).setValue(agora);
      atualizadas++;
    }
  });

  if (!atualizadas) return resposta('error', { message: 'Nenhuma atividade encontrada para esse fechamento (pode já ter sido paga).' });
  return resposta('ok', { atualizadas: atualizadas });
}

// ── LPU Fechamento: liderança reprova o fechamento (medicao.html) ───────────────
// NF errada/ilegível/valor divergente etc. Desfaz o fechamento inteiro daquele lote
// (titular e/ou apoio): limpa a NF URL/timestamp pra ele voltar a aparecer como
// "Pendente de Fechamento" em fechamento_lpu.html, e grava o motivo pro prestador
// saber o que corrigir antes de anexar uma NF nova. Não mexe no Status LPU (continua
// APROVADO_AGUARDANDO_NF) — só desfaz o fechamento, a aprovação da Medição continua valendo.
function reprovarLpuNf(ss, data) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('error', { message: 'Aba ESTEIRA não encontrada' });
  const nfUrl = data.nfUrl;
  if (!nfUrl) return resposta('error', { message: 'nfUrl ausente' });
  if (!data.motivo) return resposta('error', { message: 'Informe o motivo da reprovação.' });

  const col = h => HEADERS_ESTEIRA.indexOf(h);
  const idx = h => col(h) + 1;
  const linhas = sheet.getDataRange().getValues();
  linhas.shift();
  let atualizadas = 0;

  linhas.forEach((row, i) => {
    const rowIndex = i + 2;
    if (row[col('LPU NF URL')] === nfUrl && row[col('Status LPU')] === 'APROVADO_AGUARDANDO_NF') {
      sheet.getRange(rowIndex, idx('LPU NF URL')).setValue('');
      sheet.getRange(rowIndex, idx('LPU Timestamp NF')).setValue('');
      sheet.getRange(rowIndex, idx('LPU Motivo Reprovação NF')).setValue(data.motivo);
      atualizadas++;
    }
    if (row[col('LPU Apoio NF URL')] === nfUrl && row[col('Status LPU Apoio')] === 'APROVADO_AGUARDANDO_NF') {
      sheet.getRange(rowIndex, idx('LPU Apoio NF URL')).setValue('');
      sheet.getRange(rowIndex, idx('LPU Apoio Timestamp NF')).setValue('');
      sheet.getRange(rowIndex, idx('LPU Apoio Motivo Reprovação NF')).setValue(data.motivo);
      atualizadas++;
    }
  });

  if (!atualizadas) return resposta('error', { message: 'Nenhuma atividade encontrada para esse fechamento (pode já ter sido processada).' });
  return resposta('ok', { atualizadas: atualizadas });
}

// ── LPU: fila do aprovador (index.html) ─────────────────────────────
// Uma linha da esteira pode gerar até 2 itens na fila (titular e apoio em paralelo,
// cada um com sua própria empresa/cobrança) — por isso cada item leva um `tipoLpu`
// pra o front saber de qual conjunto de colunas ler e pra qual ação de validar mandar.
function listarLpuAguardandoAprovador(ss) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { itens: [] });

  const data = sheet.getDataRange().getValues();
  data.shift();
  const idxStatusLpu = HEADERS_ESTEIRA.indexOf('Status LPU');
  const idxStatusLpuApoio = HEADERS_ESTEIRA.indexOf('Status LPU Apoio');

  const itens = [];
  data.forEach((row, i) => {
    const precisaTitular = row[idxStatusLpu] === 'AGUARDANDO_APROVADOR';
    const precisaApoio = row[idxStatusLpuApoio] === 'AGUARDANDO_APROVADOR';
    if (!precisaTitular && !precisaApoio) return;

    const base = { rowIndex: i + 2 };
    HEADERS_ESTEIRA.forEach((h, j) => {
      if (h === 'Data NOC') base[h] = fmtTextoLivre(row[j]);
      else base[h] = row[j];
    });
    if (precisaTitular) itens.push(Object.assign({ tipoLpu: 'titular' }, base));
    if (precisaApoio) itens.push(Object.assign({ tipoLpu: 'apoio' }, base));
  });
  return resposta('ok', { itens: itens });
}

// ── LPU: fila + histórico pra Medição (medicao.html) ─────────────────
// Devolve um item por sub-processo LPU que já teve algum Status preenchido (titular
// e/ou apoio) — a tela de Medição separa, do lado do cliente, o que é fila acionável
// (AGUARDANDO_MEDICAO) do que é só valor histórico/aprovado pro dashboard financeiro
// (mesmo padrão de dashboard_gestao.html, que já faz toda a agregação client-side em
// cima de LISTAR_ESTEIRA). Cada item leva `tipoLpu` igual à fila do aprovador.
function listarLpuMedicao(ss) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { itens: [] });

  const data = sheet.getDataRange().getValues();
  data.shift();
  const idxStatusLpu = HEADERS_ESTEIRA.indexOf('Status LPU');
  const idxStatusLpuApoio = HEADERS_ESTEIRA.indexOf('Status LPU Apoio');

  const itens = [];
  data.forEach((row, i) => {
    const temTitular = !!row[idxStatusLpu];
    // SEM_COBRANCA e PENDENTE_DECISAO não geram valor nem entram no dashboard — só
    // interessam os que efetivamente entraram no fluxo de preenchimento/aprovação.
    const statusApoio = row[idxStatusLpuApoio];
    const temApoio = !!statusApoio && statusApoio !== 'PENDENTE_DECISAO' && statusApoio !== 'SEM_COBRANCA';
    if (!temTitular && !temApoio) return;

    const base = { rowIndex: i + 2 };
    HEADERS_ESTEIRA.forEach((h, j) => {
      if (h === 'Data NOC') base[h] = fmtTextoLivre(row[j]);
      else base[h] = row[j];
    });
    if (temTitular) itens.push(Object.assign({ tipoLpu: 'titular' }, base));
    if (temApoio) itens.push(Object.assign({ tipoLpu: 'apoio' }, base));
  });
  return resposta('ok', { itens: itens });
}

function listarEsteira(ss) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { atividades: [] });

  const data = sheet.getDataRange().getValues();
  data.shift(); // remove cabeçalho
  const atividades = data.map((row, i) => {
    const obj = { rowIndex: i + 2 };
    HEADERS_ESTEIRA.forEach((h, j) => {
      obj[h] = (h === 'Data NOC') ? fmtTextoLivre(row[j]) : row[j];
    });
    return obj;
  });
  return resposta('ok', { atividades: atividades });
}

// ── ORÇAMENTOS MENSAIS (budget de terceiros, editável mês a mês pela tela —
// não é constante fixa no código, porque o valor muda todo mês) ─────────────
const ABA_ORCAMENTOS = 'ORCAMENTOS_MENSAIS';
const HEADERS_ORCAMENTOS = ['Mês', 'Categoria', 'Valor', 'Registrado Por', 'Timestamp Registro'];

function garantirOrcamentos(ss) {
  return garantirAba(ss, ABA_ORCAMENTOS, HEADERS_ORCAMENTOS, '#1a1a1a', '#5aa9e6');
}

// Cada registro é uma linha nova — nunca sobrescreve (histórico completo). Quem
// consulta pega sempre a linha mais recente pra cada Mês+Categoria (resolvido no
// front, ver dashboard_gestao.html). Categoria 'GERAL' é o budget geral de
// terceiros; outras categorias são nome de empresa (hoje só QUALITY).
function registrarOrcamentoMensal(ss, data) {
  const sheet = garantirOrcamentos(ss);
  if (!data.mes || !data.categoria) return resposta('error', { message: 'Mês e categoria são obrigatórios.' });
  const valor = Number(data.valor);
  if (isNaN(valor) || valor < 0) return resposta('error', { message: 'Valor inválido.' });

  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 1).setNumberFormat('@STRING@'); // Mês ("YYYY-MM") — texto livre
  sheet.getRange(row, 1, 1, HEADERS_ORCAMENTOS.length).setValues([[
    data.mes, data.categoria, valor, data.registradoPor || '', new Date().toLocaleString('pt-BR')
  ]]);
  return resposta('ok', {});
}

function listarOrcamentosMensais(ss) {
  const sheet = garantirOrcamentos(ss);
  if (sheet.getLastRow() < 2) return resposta('ok', { orcamentos: [] });
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_ORCAMENTOS.length).getValues();
  const orcamentos = data.map(row => ({
    mes: row[0], categoria: row[1], valor: Number(row[2]) || 0, registradoPor: row[3], timestamp: row[4]
  }));
  return resposta('ok', { orcamentos: orcamentos });
}

// ── DISPONIBILIDADE DA MÃO DE OBRA (períodos em que um técnico não pode ser
// despachado — férias, treinamento, suspensão, inativo por qualquer motivo) ──
const ABA_DISPONIBILIDADE = 'DISPONIBILIDADE_TECNICOS';
const HEADERS_DISPONIBILIDADE = ['Empresa', 'Técnico', 'Data Início', 'Data Fim', 'Status', 'Observação', 'Registrado Por', 'Timestamp Registro'];

function garantirDisponibilidade(ss) {
  return garantirAba(ss, ABA_DISPONIBILIDADE, HEADERS_DISPONIBILIDADE, '#1a1a1a', '#ffa000');
}

// Só grava EXCEÇÕES — Ativo é o padrão implícito quando nenhum período cobre a
// data (ver index.html, que cruza isso com a data de hoje antes de montar a
// lista de técnicos disponíveis pra despachar).
function registrarDisponibilidade(ss, data) {
  const sheet = garantirDisponibilidade(ss);
  if (!data.empresa || !data.tecnico) return resposta('error', { message: 'Empresa e técnico são obrigatórios.' });
  if (!data.dataInicio || !data.dataFim) return resposta('error', { message: 'Data início e data fim são obrigatórias.' });
  if (String(data.dataInicio) > String(data.dataFim)) return resposta('error', { message: 'Data início não pode ser depois da data fim.' });
  const statusValidos = ['INATIVO', 'FERIAS', 'TREINAMENTO', 'SUSPENSAO', 'ATESTADO', 'MANUTENCAO_FROTA'];
  if (statusValidos.indexOf(data.status) === -1) return resposta('error', { message: 'Status inválido.' });

  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 3, 1, 2).setNumberFormat('@STRING@'); // Data Início / Data Fim ("YYYY-MM-DD") — texto livre
  sheet.getRange(row, 1, 1, HEADERS_DISPONIBILIDADE.length).setValues([[
    data.empresa, data.tecnico, data.dataInicio, data.dataFim, data.status, data.observacao || '', data.registradoPor || '', new Date().toLocaleString('pt-BR')
  ]]);
  return resposta('ok', {});
}

function excluirDisponibilidade(ss, data) {
  const sheet = garantirDisponibilidade(ss);
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  sheet.deleteRow(rowIndex);
  return resposta('ok', {});
}

function listarDisponibilidade(ss) {
  const sheet = garantirDisponibilidade(ss);
  if (sheet.getLastRow() < 2) return resposta('ok', { periodos: [] });
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_DISPONIBILIDADE.length).getValues();
  const periodos = data.map((row, i) => ({
    rowIndex: i + 2, empresa: row[0], tecnico: row[1], dataInicio: row[2], dataFim: row[3],
    status: row[4], observacao: row[5], registradoPor: row[6], timestamp: row[7]
  }));
  return resposta('ok', { periodos: periodos });
}

// ── CONTROLE GEOGRID (fila pra sala técnica replicar manualmente no GEOGRID toda
// fusão fora do padrão — técnico desenhou ao menos uma ligação de fibra na RFO) ─
const ABA_GEOGRID = 'CONTROLE_GEOGRID';
// IMPORTANTE: assim como em HEADERS_ESTEIRA, campo novo SEMPRE no final do array —
// idx()/listarGeogrid mapeiam por POSIÇÃO, não pelo texto da linha 1. 'Técnico' foi
// inserido por engano no meio (posição 5) num commit anterior, o que desalinhava a
// leitura/escrita de toda coluna seguinte pras 2 linhas que já existiam na planilha
// nesse momento (confirmado com debugColunasGeogrid antes de corrigir — por sorte
// nenhuma escrita chegou a rodar com o array errado, então nada foi corrompido).
const HEADERS_GEOGRID = [
  'ID Atividade','Protocolo','Cliente','Endereço','Tipo Cabo Fusionado','Fusionou Todas',
  'Cor com Cor','Fusão Pareamento','Quantidade CEO Trabalhadas','Timestamp Registro','Status','Concluído Por','Timestamp Conclusão',
  // ── Recusa pela sala técnica (dado enviado veio confuso/incompleto) — volta pro
  // líder ajustar na Esteira de Despacho, que reenvia (PENDENTE de novo) ou exclui.
  'Motivo Recusa','Recusado Por','Timestamp Recusa',
  'Técnico'
];

function garantirGeogrid(ss) {
  const sheet = garantirAba(ss, ABA_GEOGRID, HEADERS_GEOGRID, '#1a1a1a', '#ab47bc');
  // A linha 1 é só rótulo pra humano no Sheets — idx()/listarGeogrid nunca leem o
  // texto dela pra decidir coluna, só a posição em HEADERS_GEOGRID. Ainda assim,
  // mantemos sincronizada aqui (sobrescrevendo sempre) pra não ficar com rótulo
  // desatualizado quando o array ganha campo novo — mais simples e mais seguro que
  // tentar "diffar" o que já existe, já que isso não toca em nenhum dado das linhas.
  sheet.getRange(1, 1, 1, HEADERS_GEOGRID.length).setValues([HEADERS_GEOGRID]);
  return sheet;
}

// Chamado de dentro de salvarOcorrencia quando temPareamentoPreenchido(data.fusaoPareamento)
// é true. Recebe a aba ESTEIRA já aberta (evita reabrir) e os mesmos dados já validados/salvos ali.
function registrarGeogridSeNecessario(ss, sheetEsteira, rowIndex, data) {
  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;
  const idAtividade = sheetEsteira.getRange(rowIndex, idx('ID Atividade')).getValue();
  const protocolo = sheetEsteira.getRange(rowIndex, idx('Protocolo O&M')).getValue()
    || sheetEsteira.getRange(rowIndex, idx('Protocolo NOC')).getValue();
  const cliente = sheetEsteira.getRange(rowIndex, idx('Cliente')).getValue();
  const endereco = sheetEsteira.getRange(rowIndex, idx('Endereço')).getValue();
  const tecnico = sheetEsteira.getRange(rowIndex, idx('Técnico')).getValue();

  const sheet = garantirGeogrid(ss);
  const row = sheet.getLastRow() + 1;
  const idx = h => HEADERS_GEOGRID.indexOf(h) + 1;
  sheet.getRange(row, 1, 1, 2).setNumberFormat('@STRING@'); // ID Atividade / Protocolo — texto livre
  sheet.getRange(row, idx('Fusão Pareamento'), 1, 1).setNumberFormat('@STRING@'); // JSON — texto livre
  // Escreve por NOME de coluna (idx), não por posição fixa — evita reintroduzir o
  // mesmo tipo de desalinhamento que aconteceu com 'Técnico' (ver comentário em
  // HEADERS_GEOGRID) se o array ganhar mais campos no futuro.
  sheet.getRange(row, idx('ID Atividade')).setValue(idAtividade);
  sheet.getRange(row, idx('Protocolo')).setValue(protocolo);
  sheet.getRange(row, idx('Cliente')).setValue(cliente);
  sheet.getRange(row, idx('Endereço')).setValue(endereco);
  sheet.getRange(row, idx('Tipo Cabo Fusionado')).setValue(data.tipoCaboFusionado || '');
  sheet.getRange(row, idx('Fusionou Todas')).setValue(data.fusionouTodas || '');
  sheet.getRange(row, idx('Cor com Cor')).setValue(data.corComCor || '');
  sheet.getRange(row, idx('Fusão Pareamento')).setValue(data.fusaoPareamento || '');
  sheet.getRange(row, idx('Quantidade CEO Trabalhadas')).setValue(data.quantidadeCeo || '');
  sheet.getRange(row, idx('Timestamp Registro')).setValue(new Date().toLocaleString('pt-BR'));
  sheet.getRange(row, idx('Status')).setValue('PENDENTE');
  sheet.getRange(row, idx('Técnico')).setValue(tecnico || '');
}

function listarGeogrid(ss) {
  const sheet = garantirGeogrid(ss);
  if (sheet.getLastRow() < 2) return resposta('ok', { itens: [] });
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_GEOGRID.length).getValues();
  const itens = data.map((row, i) => {
    const obj = { rowIndex: i + 2 };
    HEADERS_GEOGRID.forEach((h, j) => obj[h] = row[j]);
    return obj;
  });
  return resposta('ok', { itens: itens });
}

// Sala técnica marca que já replicou a fusão no GEOGRID — nome de quem concluiu
// fica registrado pra responsabilização (pedido da liderança).
function concluirGeogrid(ss, data) {
  const sheet = garantirGeogrid(ss);
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  if (!data.concluidoPor) return resposta('error', { message: 'Informe quem está concluindo.' });

  const idx = h => HEADERS_GEOGRID.indexOf(h) + 1;
  const statusAtual = sheet.getRange(rowIndex, idx('Status')).getValue();
  if (statusAtual !== 'PENDENTE') {
    return resposta('error', { message: 'Este item já foi concluído.' });
  }

  sheet.getRange(rowIndex, idx('Status')).setValue('CONCLUIDO');
  sheet.getRange(rowIndex, idx('Concluído Por')).setValue(data.concluidoPor);
  sheet.getRange(rowIndex, idx('Timestamp Conclusão'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Timestamp Conclusão')).setValue(new Date().toLocaleString('pt-BR'));
  return resposta('ok', {});
}

// Sala técnica recusa um item (dado veio confuso/incompleto) — motivo é obrigatório.
// Item some da fila de pendentes da sala técnica e passa a aparecer pro líder em
// index.html, que decide reenviar (ajustado) ou excluir de vez.
function recusarGeogrid(ss, data) {
  const sheet = garantirGeogrid(ss);
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });
  if (!data.motivo) return resposta('error', { message: 'Informe o motivo da recusa.' });
  if (!data.recusadoPor) return resposta('error', { message: 'Informe quem está recusando.' });

  const idx = h => HEADERS_GEOGRID.indexOf(h) + 1;
  const statusAtual = sheet.getRange(rowIndex, idx('Status')).getValue();
  if (statusAtual !== 'PENDENTE') {
    return resposta('error', { message: 'Este item não está mais pendente.' });
  }

  sheet.getRange(rowIndex, idx('Status')).setValue('RECUSADO');
  sheet.getRange(rowIndex, idx('Motivo Recusa')).setValue(data.motivo);
  sheet.getRange(rowIndex, idx('Recusado Por')).setValue(data.recusadoPor);
  sheet.getRange(rowIndex, idx('Timestamp Recusa'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Timestamp Recusa')).setValue(new Date().toLocaleString('pt-BR'));
  return resposta('ok', {});
}

// Líder ajusta o diagrama/dados na Esteira de Despacho (index.html) e reenvia pro
// GEOGRID — volta pro status PENDENTE (some da visão do líder, reaparece pra sala
// técnica) e limpa o motivo de recusa anterior.
function reenviarGeogrid(ss, data) {
  const sheet = garantirGeogrid(ss);
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });

  const idx = h => HEADERS_GEOGRID.indexOf(h) + 1;
  const statusAtual = sheet.getRange(rowIndex, idx('Status')).getValue();
  if (statusAtual !== 'RECUSADO') {
    return resposta('error', { message: 'Este item não está aguardando ajuste.' });
  }

  sheet.getRange(rowIndex, idx('Fusão Pareamento'), 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(rowIndex, idx('Fusão Pareamento')).setValue(data.fusaoPareamento || '');
  if (data.tipoCaboFusionado !== undefined) sheet.getRange(rowIndex, idx('Tipo Cabo Fusionado')).setValue(data.tipoCaboFusionado || '');
  if (data.quantidadeCeo !== undefined) sheet.getRange(rowIndex, idx('Quantidade CEO Trabalhadas')).setValue(data.quantidadeCeo || '');
  sheet.getRange(rowIndex, idx('Status')).setValue('PENDENTE');
  sheet.getRange(rowIndex, idx('Motivo Recusa')).setValue('');
  sheet.getRange(rowIndex, idx('Recusado Por')).setValue('');
  sheet.getRange(rowIndex, idx('Timestamp Recusa')).setValue('');
  return resposta('ok', {});
}

// Líder decide excluir de vez (ex.: fusão duplicada, ou não precisa mais ir pro
// GEOGRID) — remove a linha inteira da planilha, sem deixar rastro no histórico.
function excluirGeogrid(ss, data) {
  const sheet = garantirGeogrid(ss);
  const rowIndex = parseInt(data.rowIndex);
  if (!rowIndex) return resposta('error', { message: 'rowIndex ausente' });

  const idx = h => HEADERS_GEOGRID.indexOf(h) + 1;
  const statusAtual = sheet.getRange(rowIndex, idx('Status')).getValue();
  if (statusAtual !== 'RECUSADO') {
    return resposta('error', { message: 'Só é possível excluir um item recusado.' });
  }

  sheet.deleteRow(rowIndex);
  return resposta('ok', {});
}

// ── CONTADOR DE ASSINATURAS DA LPU (total histórico por técnico, nunca reseta) ──
// O botão "Assinar" em PREENCHIMENTO_LPU.html chama isso no momento do clique —
// cada clique é uma assinatura de verdade, incrementada e persistida na hora
// (não só um número calculado no front, pra não perder o histórico se a aba
// mudar ou o técnico assinar em dias diferentes).
const ABA_CONTADOR_ASSINATURAS = 'CONTADOR_ASSINATURAS_LPU';
const HEADERS_CONTADOR_ASSINATURAS = ['Técnico', 'Total Assinaturas', 'Última Assinatura'];

function garantirContadorAssinaturas(ss) {
  return garantirAba(ss, ABA_CONTADOR_ASSINATURAS, HEADERS_CONTADOR_ASSINATURAS, '#1a1a1a', '#8bc34a');
}

function registrarAssinaturaLpu(ss, data) {
  const sheet = garantirContadorAssinaturas(ss);
  if (!data.tecnico) return resposta('error', { message: 'Técnico é obrigatório.' });
  const agora = new Date().toLocaleString('pt-BR');
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const tecnicos = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < tecnicos.length; i++) {
      if (tecnicos[i][0] === data.tecnico) {
        const linha = i + 2;
        const total = Number(sheet.getRange(linha, 2).getValue() || 0) + 1;
        sheet.getRange(linha, 2, 1, 2).setValues([[total, agora]]);
        return resposta('ok', { total: total });
      }
    }
  }

  sheet.appendRow([data.tecnico, 1, agora]);
  return resposta('ok', { total: 1 });
}

// ══════════════════════════════════════════════════════════════
//  BACKFILL — roda UMA VEZ pra recalcular MTTR/MTTD de tudo que já
//  está VALIDADA na planilha, usando a fórmula nova.
//  Como rodar: selecione esta função no dropdown "Selecionar função"
//  (ao lado do botão Executar) e clique em Executar. Depois confira
//  o log em Ver > Registros.
// ══════════════════════════════════════════════════════════════
function recalcularMTTRMTTDHistorico() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) { Logger.log('Nada pra recalcular.'); return; }

  const idx = h => HEADERS_ESTEIRA.indexOf(h) + 1;
  const data = sheet.getDataRange().getValues();
  data.shift(); // cabeçalho

  let atualizadas = 0, puladas = 0;

  data.forEach((row, i) => {
    const rowIndex = i + 2;
    const status = row[HEADERS_ESTEIRA.indexOf('Status')];
    if (status !== 'VALIDADA') return;

    const timestampRecebido = row[HEADERS_ESTEIRA.indexOf('Timestamp Recebido')];
    const timestampDespacho = row[HEADERS_ESTEIRA.indexOf('Timestamp Despacho')];
    const horaChegada = fmtHoraLivre(row[HEADERS_ESTEIRA.indexOf('Hora Chegada')]);
    const timestampValidacao = row[HEADERS_ESTEIRA.indexOf('Timestamp Validação')];

    const recebidoDate = parseTimestampBR(timestampRecebido);
    const despachoDate = parseTimestampBR(timestampDespacho);
    const validacaoDate = parseTimestampBR(timestampValidacao);

    if (!recebidoDate || !despachoDate || !validacaoDate || !horaChegada) {
      Logger.log('Linha ' + rowIndex + ' pulada (dados incompletos).');
      puladas++;
      return;
    }

    const [hChegada, mChegada] = horaChegada.split(':').map(Number);

    // MTTD = Despacho → Chegada (ancora a Chegada no dia do Despacho, com rollover se cruzar meia-noite;
    // compara contra o despacho sem segundos pra não disparar rollover por diferença de segundos)
    let chegadaAncoradaDespacho = new Date(despachoDate.getFullYear(), despachoDate.getMonth(), despachoDate.getDate(), hChegada, mChegada, 0);
    const despachoSemSegundos = new Date(despachoDate.getFullYear(), despachoDate.getMonth(), despachoDate.getDate(), despachoDate.getHours(), despachoDate.getMinutes(), 0);
    if (chegadaAncoradaDespacho < despachoSemSegundos) chegadaAncoradaDespacho = new Date(chegadaAncoradaDespacho.getTime() + 86400000);
    const mttdMin = Math.max(0, Math.round((chegadaAncoradaDespacho.getTime() - despachoDate.getTime()) / 60000));

    // MTTR = Recebido (Aguardando Despacho) → Validação — timestamps completos com
    // data, diferença direta sem precisar de ancoragem/rollover de dia
    const mttrMin = Math.max(0, Math.round((validacaoDate.getTime() - recebidoDate.getTime()) / 60000));

    sheet.getRange(rowIndex, idx('MTTD'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('MTTD')).setValue(fmtMinParaHora(mttdMin));
    sheet.getRange(rowIndex, idx('MTTR'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('MTTR')).setValue(fmtMinParaHora(mttrMin));
    atualizadas++;
  });

  Logger.log('Recalculadas: ' + atualizadas + ' | Puladas (dados incompletos): ' + puladas);
}

// ══════════════════════════════════════════════════════════════
//  MIGRAÇÃO — roda UMA VEZ pra criar o cabeçalho de colunas novas
//  que ainda não existem fisicamente na planilha (HEADERS_ESTEIRA
//  ganhou o item mas a aba ESTEIRA não tem a coluna ainda).
//  Sem isso, getDataRange() não inclui a coluna nova pras linhas já
//  existentes, e o valor lido vem "undefined" — que o JSON.stringify
//  descarta silenciosamente (o campo some da resposta da API).
// ══════════════════════════════════════════════════════════════
function adicionarColunasNovas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet) { Logger.log('Aba não encontrada.'); return; }
  const ultimaCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, ultimaCol).getValues()[0];
  const novos = [
    'TMC', 'Previsão Chegada',
    'Status LPU','LPU Empresa Prestadora','LPU CNPJ','LPU Técnicos','LPU Descrição Contábil',
    'LPU Itens','LPU Total','LPU Observações','LPU Fotos','LPU Assinatura Prestador',
    'LPU Timestamp Preenchimento','LPU Validado Por Aprovador','LPU Timestamp Aprovador',
    'LPU Aprovador Medição','LPU Timestamp Medição','LPU Motivo Reprovação','LPU Relatório PDF',
    'Status LPU Apoio','LPU Apoio Empresa Prestadora','LPU Apoio CNPJ','LPU Apoio Técnicos',
    'LPU Apoio Descrição Contábil','LPU Apoio Itens','LPU Apoio Total','LPU Apoio Observações',
    'LPU Apoio Assinatura Prestador','LPU Apoio Timestamp Preenchimento',
    'LPU Apoio Validado Por Aprovador','LPU Apoio Timestamp Aprovador',
    'LPU Apoio Aprovador Medição','LPU Apoio Timestamp Medição','LPU Apoio Motivo Reprovação',
    'LPU Apoio Relatório PDF',
    'Número CEO A','Número CEO B',
    'LPU NF URL','LPU Timestamp NF','LPU Pago Por','LPU Timestamp Pago',
    'LPU Apoio NF URL','LPU Apoio Timestamp NF','LPU Apoio Pago Por','LPU Apoio Timestamp Pago',
    'LPU Motivo Reprovação NF','LPU Apoio Motivo Reprovação NF',
    'Anexo Despacho URL','Anexo Despacho Nome','Mensagem Despacho','Link Medição','Anexos Despacho',
    'Tipo Cabo Fusionado','Fusionou Todas','Cor com Cor','Fusão Pareamento','Quantidade CEO Trabalhadas'
  ];
  novos.forEach(h => {
    if (headerRow.indexOf(h) === -1) {
      const novaCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, novaCol).setValue(h);
      Logger.log('Adicionada coluna "' + h + '" na posicao ' + novaCol);
    } else {
      Logger.log('Coluna "' + h + '" ja existe.');
    }
  });
}
