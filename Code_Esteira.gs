// ══════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT — Netturbo Esteira de Despacho (NOVO PROJETO)
//  Este script é independente do sistema de RFO já existente.
//  Aba usada: ESTEIRA
// ══════════════════════════════════════════════════════════════

const ABA_ESTEIRA = 'ESTEIRA';

const HEADERS_ESTEIRA = [
  'ID Atividade','Timestamp Recebido','Motivo','Cliente','Endereço','GPS',
  'Data NOC','Período','Protocolo NOC','Protocolo O&M','Porta','Obs',
  'Status','Empresa','Técnico','Timestamp Despacho',
  'Hora Início','Hora Chegada',
  'Ocorrência','Causa','Solução','Materiais',
  'Timestamp Validação','Validado Por','Motivo Não Validado',
  'MTTR','MTTD'
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

// ── POST ─────────────────────────────────────────────────────
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const data = JSON.parse(e.postData.contents);
    const acao = data.acao;

    if (acao === 'CRIAR_ATIVIDADE') return criarAtividade(ss, data);
    if (acao === 'DESPACHAR')       return despacharAtividade(ss, data);

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
  return resposta('ok', { sistema: 'Netturbo Esteira de Despacho' });
}

// ── CRIAR ATIVIDADE (a partir da máscara já processada no front-end) ──
function criarAtividade(ss, data) {
  const sheet = garantirAba(ss, ABA_ESTEIRA, HEADERS_ESTEIRA, '#1a1200', '#ffa000');
  const id = gerarId();
  const row = [
    id,
    new Date().toLocaleString('pt-BR'),
    data.motivo || '',
    data.cliente || '',
    data.endereco || '',
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
    '', ''        // MTTR, MTTD
  ];
  sheet.appendRow(row);
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
  sheet.getRange(rowIndex, HEADERS_ESTEIRA.indexOf('Timestamp Despacho') + 1).setValue(new Date().toLocaleString('pt-BR'));

  return resposta('ok', {});
}

// ── LISTAR ESTEIRA (todas as atividades, qualquer status) ───────
function listarEsteira(ss) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) return resposta('ok', { atividades: [] });

  const data = sheet.getDataRange().getValues();
  data.shift(); // remove cabeçalho
  const atividades = data.map((row, i) => {
    const obj = { rowIndex: i + 2 };
    HEADERS_ESTEIRA.forEach((h, j) => { obj[h] = row[j]; });
    return obj;
  });
  return resposta('ok', { atividades: atividades });
}
