// ══════════════════════════════════════════════════════════════
//  NetturboAuth — login por pessoa (PIN + Complemento) para as telas de
//  liderança/operacional, substituindo a antiga senha única
//  (LEADERSHIP_PASSWORD) + os seletores manuais de "Você é...".
//
//  Backend: ações LOGIN_LIDERANCA / RESET_COMPLEMENTO_LIDERANCA /
//  LISTAR_USUARIOS_LIDERANCA na aba ACESSOS_LIDERANCA (mesmo mecanismo de
//  PIN + Complemento já usado em tecnico.html com ACESSOS_TECNICOS).
//
//  Depende de `APPS_SCRIPT_URL` já estar declarado (const, no <script>
//  inline da própria página) — funciona porque scripts clássicos no mesmo
//  documento compartilham o mesmo escopo léxico de topo, então basta a
//  variável já ter sido inicializada no momento em que a função é chamada,
//  não no momento em que este arquivo é carregado.
//
//  Uso em cada página:
//    <script src="auth.js"></script>
//    ...
//    <script>
//      const APPS_SCRIPT_URL = "...";
//      NetturboAuth.proteger({ tela:'index', aoEntrar: iniciarApp });
//    </script>
// ══════════════════════════════════════════════════════════════

(function () {
  const SESSAO_KEY = 'netturbo_auth_sessao';
  const VALIDADE_MS = 12 * 60 * 60 * 1000; // 12h — evita sessão eterna em máquina compartilhada

  function lerSessao() {
    try {
      const raw = localStorage.getItem(SESSAO_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.expira || Date.now() > s.expira) { localStorage.removeItem(SESSAO_KEY); return null; }
      return s;
    } catch (e) { return null; }
  }

  function salvarSessao(s) {
    s.expira = Date.now() + VALIDADE_MS;
    localStorage.setItem(SESSAO_KEY, JSON.stringify(s));
  }

  // Comparação sem distinguir maiúscula/minúscula nem espaço nas pontas — a coluna
  // "Telas" é preenchida à mão na planilha pelo gestor, com o mesmo nome que aparece
  // nos cards do painel.html (ex.: "Controle GEOGRID", "Dashboard Manutenção"), não
  // um código técnico. Não corrige erro de digitação (ex.: "GEODRID"), só variação
  // de caixa/espaço.
  function normalizar(s) { return String(s || '').trim().toLowerCase(); }

  function temAcessoTela(sessao, tela) {
    if (!sessao) return false;
    if (tela === 'painel') return true; // hub sempre acessível a quem já logou — os cards de dentro é que filtram
    const alvo = normalizar(tela);
    const telas = (sessao.telas || []).map(normalizar);
    return telas.indexOf('*') !== -1 || telas.indexOf(alvo) !== -1;
  }

  const CSS = `
#na-overlay{position:fixed;inset:0;z-index:9999;background:radial-gradient(ellipse at 50% 30%,#0d1a06,#080808);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;font-family:'Inter',sans-serif}
.na-box{width:100%;max-width:360px;background:linear-gradient(160deg,#131a10,#0f0f0f);border:1px solid #1a2a12;border-radius:20px;padding:2.2rem 2rem;display:flex;flex-direction:column;align-items:center;gap:1.1rem}
.na-logo{width:110px;height:auto;background:#fff;border-radius:12px;padding:.5rem}
.na-heading h2{font-family:'Rajdhani',sans-serif;font-size:1.4rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a8c93c;text-align:center;margin:0}
#naBrandTitle{font-weight:800;letter-spacing:0;display:inline-block;transform:skewX(-10deg);background:linear-gradient(90deg,#a8c93c,#c3e857);-webkit-background-clip:text;background-clip:text;color:transparent}
.na-heading p{font-size:.63rem;color:#505050;letter-spacing:.12em;text-transform:uppercase;margin-top:.3rem;text-align:center}
.na-field{width:100%;display:flex;flex-direction:column;gap:.3rem}
.na-field label{font-size:.65rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#888}
.na-field select,.na-field input{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#e8e8e8;font-size:.92rem;padding:.7rem .9rem;width:100%;font-family:inherit}
.na-field select:focus,.na-field input:focus{outline:none;border-color:#a8c93c}
.na-btn{width:100%;padding:.8rem;background:linear-gradient(135deg,#6b8a1f,#a8c93c);border:none;border-radius:8px;color:#050505;font-family:'Rajdhani',sans-serif;font-size:1rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.na-error{font-size:.75rem;color:#e53935;background:rgba(229,57,53,.08);border:1px solid rgba(229,57,53,.3);border-radius:6px;padding:.5rem .75rem;width:100%;text-align:center;display:none}
.na-error.visible{display:block}
.na-info{font-size:.7rem;color:#888;background:rgba(168,201,60,.08);border:1px solid rgba(168,201,60,.2);border-radius:6px;padding:.5rem .75rem;width:100%;text-align:center;display:none}
.na-info.visible{display:block}
.na-link{font-size:.72rem;color:#a8c93c;cursor:pointer;text-align:center;text-decoration:underline}
#na-chip{display:flex;align-items:center;gap:.5rem;font-size:.72rem;color:#0a0a0a;font-weight:600;font-family:'Inter',sans-serif}
#na-chip button{-webkit-appearance:none;appearance:none;box-sizing:border-box;font-family:inherit;line-height:1;background:rgba(0,0,0,.12);border:1px solid rgba(0,0,0,.22);border-radius:20px;color:#0a0a0a;font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:.35rem .75rem;cursor:pointer;transition:background .15s ease}
#na-chip button:hover{background:rgba(0,0,0,.2)}
`;

  function injetarEstilo() {
    if (document.getElementById('na-style')) return;
    const style = document.createElement('style');
    style.id = 'na-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function montarOverlay() {
    let overlay = document.getElementById('na-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'na-overlay';
    overlay.innerHTML = `
      <div class="na-box" id="naBoxLogin">
        <img class="na-logo" alt="Netturbo" src="https://netturbo.com.br/wp-content/uploads/2021/04/LOGO-1-768x230.png.webp" onerror="this.style.display='none'"/>
        <div class="na-heading"><h2 id="naBrandTitle">SIGONET</h2><p>Acesso da Liderança</p></div>
        <div class="na-field"><label>Nome</label><select id="naSelNome"><option value="">Carregando...</option></select></div>
        <div class="na-field"><label>PIN (fornecido pela liderança)</label><input type="password" inputmode="numeric" maxlength="6" id="naInputPin" placeholder="0000"/></div>
        <div class="na-field"><label>Complemento (sua senha pessoal)</label><input type="password" id="naInputComplemento" placeholder="Sua senha"/></div>
        <div class="na-info" id="naInfo">Primeiro acesso: o complemento que você digitar agora vai virar sua senha pessoal daqui pra frente.</div>
        <div class="na-error" id="naErro"></div>
        <button class="na-btn" id="naBtnEntrar">Entrar</button>
        <div class="na-link" id="naLinkReset">Esqueci meu complemento</div>
      </div>
      <div class="na-box" id="naBoxReset" style="display:none">
        <div class="na-heading"><h2>Redefinir Complemento</h2><p>Informe seu PIN pra criar uma senha nova</p></div>
        <div class="na-field"><label>Nome</label><select id="naSelNomeReset"></select></div>
        <div class="na-field"><label>PIN</label><input type="password" inputmode="numeric" maxlength="6" id="naInputPinReset" placeholder="0000"/></div>
        <div class="na-field"><label>Novo Complemento</label><input type="password" id="naInputNovoComplemento" placeholder="Sua nova senha"/></div>
        <div class="na-error" id="naErroReset"></div>
        <button class="na-btn" id="naBtnReset">Salvar</button>
        <div class="na-link" id="naLinkVoltar">Voltar</div>
      </div>
      <div class="na-box" id="naBoxBloqueado" style="display:none">
        <div class="na-heading"><h2>Sem Acesso</h2><p id="naMsgBloqueado">Você não tem acesso a esta tela — fale com a liderança.</p></div>
        <a class="na-btn" href="painel.html" style="text-decoration:none;display:block;text-align:center;box-sizing:border-box">Voltar ao Painel</a>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function mostrarErro(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 4000);
  }

  async function carregarUsuarios(selects) {
    try {
      const resp = await fetch(APPS_SCRIPT_URL + '?acao=LISTAR_USUARIOS_LIDERANCA');
      const result = await resp.json();
      const usuarios = (result.usuarios || []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const opcoes = '<option value="">Selecione...</option>' +
        usuarios.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
      selects.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opcoes; });
    } catch (e) {
      selects.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<option value="">Erro ao carregar</option>'; });
    }
  }

  function injetarChip(sessao) {
    if (document.getElementById('na-chip')) return;
    const spacer = document.querySelector('.topbar-spacer');
    if (!spacer) return;
    spacer.insertAdjacentHTML('afterend', `<div id="na-chip">Olá, ${sessao.nome}<button id="naBtnSair">Sair</button></div>`);
    const btn = document.getElementById('naBtnSair');
    if (btn) btn.onclick = sair;
  }

  function mostrarBloqueado(tela) {
    injetarEstilo();
    const overlay = montarOverlay();
    overlay.style.display = 'flex';
    document.getElementById('naBoxLogin').style.display = 'none';
    document.getElementById('naBoxReset').style.display = 'none';
    document.getElementById('naBoxBloqueado').style.display = 'flex';
  }

  function mostrarLogin(tela, aoEntrar) {
    injetarEstilo();
    const overlay = montarOverlay();
    overlay.style.display = 'flex';
    document.getElementById('naBoxLogin').style.display = 'flex';
    document.getElementById('naBoxReset').style.display = 'none';
    document.getElementById('naBoxBloqueado').style.display = 'none';

    carregarUsuarios(['naSelNome', 'naSelNomeReset']);

    document.getElementById('naLinkReset').onclick = () => {
      document.getElementById('naBoxLogin').style.display = 'none';
      document.getElementById('naBoxReset').style.display = 'flex';
    };
    document.getElementById('naLinkVoltar').onclick = () => {
      document.getElementById('naBoxReset').style.display = 'none';
      document.getElementById('naBoxLogin').style.display = 'flex';
    };

    document.getElementById('naBtnEntrar').onclick = async () => {
      const nome = document.getElementById('naSelNome').value;
      const pin = document.getElementById('naInputPin').value.trim();
      const complemento = document.getElementById('naInputComplemento').value;
      if (!nome || !pin || !complemento) { mostrarErro('naErro', 'Selecione seu nome e preencha PIN e complemento.'); return; }
      try {
        const resp = await fetch(APPS_SCRIPT_URL, {
          method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ acao: 'LOGIN_LIDERANCA', nome, pin, complemento })
        });
        const result = await resp.json();
        if (result.status !== 'ok') { mostrarErro('naErro', result.message || 'Não foi possível entrar.'); return; }

        const sessao = { nome: result.nome || nome, cargo: result.cargo || '', telas: result.telas || [], token: result.token || '' };
        salvarSessao(sessao);

        if (!temAcessoTela(sessao, tela)) { mostrarBloqueado(tela); return; }

        overlay.style.display = 'none';
        injetarChip(sessao);
        aoEntrar();
      } catch (e) {
        mostrarErro('naErro', 'Erro ao conectar com o servidor.');
      }
    };

    document.getElementById('naBtnReset').onclick = async () => {
      const nome = document.getElementById('naSelNomeReset').value;
      const pin = document.getElementById('naInputPinReset').value.trim();
      const novoComplemento = document.getElementById('naInputNovoComplemento').value;
      if (!nome || !pin || !novoComplemento) { mostrarErro('naErroReset', 'Selecione seu nome e preencha PIN e nova senha.'); return; }
      try {
        const resp = await fetch(APPS_SCRIPT_URL, {
          method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ acao: 'RESET_COMPLEMENTO_LIDERANCA', nome, pin, novoComplemento })
        });
        const result = await resp.json();
        if (result.status !== 'ok') { mostrarErro('naErroReset', result.message || 'Não foi possível redefinir.'); return; }
        document.getElementById('naBoxReset').style.display = 'none';
        document.getElementById('naBoxLogin').style.display = 'flex';
        document.getElementById('naInfo').textContent = 'Senha redefinida! Entre com o PIN e a senha nova.';
        document.getElementById('naInfo').classList.add('visible');
      } catch (e) {
        mostrarErro('naErroReset', 'Erro ao conectar com o servidor.');
      }
    };
  }

  function sair() {
    localStorage.removeItem(SESSAO_KEY);
    location.reload();
  }

  function proteger(opts) {
    const tela = opts.tela;
    const aoEntrar = opts.aoEntrar || function () {};
    injetarEstilo(); // sempre, mesmo com sessão já válida — senão o chip "Olá/Sair" nasce sem CSS
    const sessao = lerSessao();
    if (sessao) {
      if (temAcessoTela(sessao, tela)) {
        injetarChip(sessao);
        aoEntrar();
        return;
      }
      mostrarBloqueado(tela);
      return;
    }
    mostrarLogin(tela, aoEntrar);
  }

  function usuario() {
    const sessao = lerSessao();
    return sessao ? { nome: sessao.nome, cargo: sessao.cargo, telas: sessao.telas } : null;
  }

  function temAcesso(tela) {
    return temAcessoTela(lerSessao(), tela);
  }

  // Token de sessão emitido pelo backend no login (ver LOGIN_LIDERANCA) —
  // toda ação de escrita manda isso no corpo pra o backend verificar quem
  // está de fato logado, em vez de confiar só no nome que a tela informa.
  function token() {
    const sessao = lerSessao();
    return sessao ? (sessao.token || '') : '';
  }

  window.NetturboAuth = { proteger, usuario, temAcesso, sair, token };
})();
