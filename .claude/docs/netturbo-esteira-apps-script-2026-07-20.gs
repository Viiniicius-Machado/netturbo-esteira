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
  'Agendamento'
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
    if (acao === 'VALIDAR')              return validarAtividade(ss, data);

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
  return resposta('ok', { empresas: empresas });
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

  const atividades = [];
  data.forEach((row, i) => {
    const souTitular = row[idxEmpresa] === params.empresa && row[idxTecnico] === params.tecnico;
    const souApoio = row[idxEmpresaApoio] === params.empresa && row[idxTecnicoApoio] === params.tecnico;
    if (!souTitular && !souApoio) return;
    if (row[idxStatus] === 'AGUARDANDO_DESPACHO') return; // não é dele ainda
    if (row[idxStatus] === 'VALIDADA') return; // já concluída — some da lista ativa, entra só no resumo diário

    const obj = { rowIndex: i + 2, papel: souTitular ? 'titular' : 'apoio' };
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

// ── RESUMO MENSAL DO TÉCNICO (fechamento por mês: C/SLA, S/SLA, eficiência, MTTR/MTTD médios) ──
function resumoMensalTecnico(ss, params) {
  const sheet = ss.getSheetByName(ABA_ESTEIRA);
  if (!sheet || sheet.getLastRow() < 2) {
    return resposta('ok', { totalConcluidas: 0, cSla: 0, sSla: 0, eficiencia: 0, mttrMedio: '', mttdMedio: '' });
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

  const mesAlvo = params.mes || ''; // 'YYYY-MM'
  let totalConcluidas = 0, cSla = 0, sSla = 0;
  let somaMTTR = 0, contMTTR = 0, somaMTTD = 0, contMTTD = 0;

  data.forEach(row => {
    const souTitular = row[idxEmpresa] === params.empresa && row[idxTecnico] === params.tecnico;
    const souApoio = row[idxEmpresaApoio] === params.empresa && row[idxTecnicoApoio] === params.tecnico;
    if (!souTitular && !souApoio) return;
    if (row[idxStatus] !== 'VALIDADA') return;

    const dataValidacao = extrairDataBR(row[idxValidacao]);
    if (!dataValidacao || dataValidacao.slice(0, 7) !== mesAlvo) return;

    totalConcluidas++;
    const mttrMin = parseHoraParaMinutos(fmtHoraLivre(row[idxMTTR]));
    const mttdMin = parseHoraParaMinutos(fmtHoraLivre(row[idxMTTD]));

    if (mttrMin !== null) {
      somaMTTR += mttrMin; contMTTR++;
      if (mttrMin <= 240) cSla++; else sSla++;
    }
    if (mttdMin !== null) { somaMTTD += mttdMin; contMTTD++; }
  });

  const eficiencia = (cSla + sSla) ? Math.round(cSla / (cSla + sSla) * 100) : 0;
  const mttrMedio = contMTTR ? fmtMinParaHora(Math.round(somaMTTR / contMTTR)) : '';
  const mttdMedio = contMTTD ? fmtMinParaHora(Math.round(somaMTTD / contMTTD)) : '';

  return resposta('ok', { totalConcluidas, cSla, sSla, eficiencia, mttrMedio, mttdMedio });
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
  sheet.getRange(rowIndex, idx('Cidade Falha')).setValue(data.cidadeFalha || '');
  sheet.getRange(rowIndex, idx('Status')).setValue('AGUARDANDO_VALIDACAO');
  sheet.getRange(rowIndex, idx('Motivo Não Validado')).setValue('');

  return resposta('ok', {});
}

// ── CÁLCULOS DE TEMPO (MTTR / MTTD) ──────────────────────────────
// MTTD = Timestamp Despacho → Hora Chegada  (tempo até localizar o problema em campo)
// MTTR = Hora Chegada → Timestamp Validação (tempo de reparo efetivo em campo)
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

// Converte "dd/mm/yyyy, HH:MM:SS" (formato salvo em Timestamp Despacho/Validação) num Date
function parseTimestampBR(str) {
  const m = String(str || '').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
}

// Diferença entre um Timestamp completo (Despacho) e uma Hora "HH:MM" (Chegada),
// com rollover pro dia seguinte se a chegada for "antes" do horário do despacho.
function diferencaTimestampAteHora(timestamp, horaFim) {
  const inicio = parseTimestampBR(timestamp);
  if (!inicio || !horaFim) return '';
  const [h, m] = horaFim.split(':').map(Number);
  let fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), h, m, 0);
  if (fim < inicio) fim = new Date(fim.getTime() + 24 * 60 * 60 * 1000);
  const diffMin = Math.round((fim.getTime() - inicio.getTime()) / 60000);
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
    const horaTermino = ('0'+agora.getHours()).slice(-2) + ':' + ('0'+agora.getMinutes()).slice(-2);
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
    // MTTR = Chegada → Validação (tempo de reparo efetivo em campo)
    if (horaChegada) {
      sheet.getRange(rowIndex, idx('MTTR'), 1, 1).setNumberFormat('@STRING@');
      sheet.getRange(rowIndex, idx('MTTR')).setValue(diferencaHoras(horaChegada, horaTermino));
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

    const timestampDespacho = row[HEADERS_ESTEIRA.indexOf('Timestamp Despacho')];
    const horaChegada = fmtHoraLivre(row[HEADERS_ESTEIRA.indexOf('Hora Chegada')]);
    const timestampValidacao = row[HEADERS_ESTEIRA.indexOf('Timestamp Validação')];

    const despachoDate = parseTimestampBR(timestampDespacho);
    const validacaoDate = parseTimestampBR(timestampValidacao);

    if (!despachoDate || !validacaoDate || !horaChegada) {
      Logger.log('Linha ' + rowIndex + ' pulada (dados incompletos).');
      puladas++;
      return;
    }

    const [hChegada, mChegada] = horaChegada.split(':').map(Number);

    // MTTD = Despacho → Chegada (ancora a Chegada no dia do Despacho, com rollover se cruzar meia-noite)
    let chegadaAncoradaDespacho = new Date(despachoDate.getFullYear(), despachoDate.getMonth(), despachoDate.getDate(), hChegada, mChegada, 0);
    if (chegadaAncoradaDespacho < despachoDate) chegadaAncoradaDespacho = new Date(chegadaAncoradaDespacho.getTime() + 86400000);
    const mttdMin = Math.round((chegadaAncoradaDespacho.getTime() - despachoDate.getTime()) / 60000);

    // MTTR = Chegada → Validação (ancora a Chegada no dia da Validação, voltando um dia se necessário)
    let chegadaAncoradaValidacao = new Date(validacaoDate.getFullYear(), validacaoDate.getMonth(), validacaoDate.getDate(), hChegada, mChegada, 0);
    if (chegadaAncoradaValidacao > validacaoDate) chegadaAncoradaValidacao = new Date(chegadaAncoradaValidacao.getTime() - 86400000);
    const mttrMin = Math.round((validacaoDate.getTime() - chegadaAncoradaValidacao.getTime()) / 60000);

    sheet.getRange(rowIndex, idx('MTTD'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('MTTD')).setValue(fmtMinParaHora(mttdMin));
    sheet.getRange(rowIndex, idx('MTTR'), 1, 1).setNumberFormat('@STRING@');
    sheet.getRange(rowIndex, idx('MTTR')).setValue(fmtMinParaHora(mttrMin));
    atualizadas++;
  });

  Logger.log('Recalculadas: ' + atualizadas + ' | Puladas (dados incompletos): ' + puladas);
}
