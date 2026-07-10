'use strict';
/* ============================================================
   Última Instância — servidor (Express)
   Serve o jogo estático (public/) e a API REST:
     POST /api/login      { cpf, nascimento }  → cria a sessão
     POST /api/logout                          → encerra a sessão
     GET  /api/session                         → perfil atual / config
     GET  /api/disciplinas                     → juízes reais (auth)
     GET  /api/placar?aba=&sem=                → ranking (auth)
     POST /api/partidas                        → grava a jornada (auth)
     GET  /api/saude                           → healthcheck
   Sem Postgres configurado, roda em MODO MOCK (ver server/db.js).
   ============================================================ */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./db');
const auth = require('./auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = parseInt(process.env.PORT || '3000', 10);
const SEMESTRE = process.env.SEMESTRE || '2026-2';
const VERSAO = require('../package.json').version;

/* pequeno limitador de tentativas de login por IP (defesa básica) */
const tentativas = new Map();
function podeTentar(ip) {
  var agora = Date.now();
  var reg = tentativas.get(ip) || { n: 0, ate: 0 };
  if (agora < reg.ate) return false;
  return true;
}
function registraTentativa(ip, ok) {
  var reg = tentativas.get(ip) || { n: 0, ate: 0 };
  if (ok) { tentativas.delete(ip); return; }
  reg.n++;
  if (reg.n >= 8) { reg.ate = Date.now() + 60 * 1000; reg.n = 0; } // 1 min de espera após 8 erros
  tentativas.set(ip, reg);
}

/* ---- API ---- */
app.get('/api/saude', async function (req, res) {
  var p = await db.ping();
  res.json({ ok: true, versao: VERSAO, semestre: SEMESTRE, db: p.db, dbOk: p.ok !== false });
});

app.get('/api/session', function (req, res) {
  var u = auth.ler(req);
  var resp = {
    autenticado: !!u,
    usuario: u || null,
    modo: db.hasDB ? 'banco' : 'mock',
    semestre: SEMESTRE,
    versao: VERSAO
  };
  // sem banco, o usuário fixo é um acesso de conveniência — a dica pode aparecer na tela
  if (!db.hasDB && db.FIXO.ativo) {
    resp.loginDica = { cpf: db.FIXO.cpf, nascimento: db.FIXO.nascimento };
  }
  res.json(resp);
});

app.post('/api/login', async function (req, res) {
  var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  if (!podeTentar(ip)) return res.status(429).json({ erro: 'muitas_tentativas', mensagem: 'Muitas tentativas. Aguarde um minuto e tente de novo.' });
  var body = req.body || {};
  var r = await db.autenticar(body.cpf, body.nascimento);
  registraTentativa(ip, r.ok);
  if (!r.ok) {
    var msg = r.motivo === 'formato' ? 'Confira o CPF (11 dígitos) e a data de nascimento.'
      : r.motivo === 'inativo' ? 'Este cadastro está inativo. Procure a secretaria.'
      : r.motivo === 'erro' ? 'Não foi possível validar agora. Tente novamente em instantes.'
      : 'CPF ou data de nascimento não conferem.';
    return res.status(r.motivo === 'erro' ? 503 : 401).json({ erro: r.motivo || 'credenciais', mensagem: msg, mock: !!r.mock });
  }
  auth.emitir(res, r.usuario);
  res.json({ ok: true, usuario: r.usuario });
});

app.post('/api/logout', function (req, res) { auth.encerrar(res); res.json({ ok: true }); });

app.get('/api/disciplinas', auth.exigir, async function (req, res) {
  var sem = req.query.sem || req.usuario.semestre || SEMESTRE;
  var lista = await db.listarDisciplinas(sem);
  res.json({ disciplinas: lista });
});

app.get('/api/placar', auth.exigir, async function (req, res) {
  var aba = req.query.aba === 'semestre' ? 'semestre' : 'hall';
  var itens = await db.listarPlacar(aba, req.query.sem || SEMESTRE);
  res.json({ itens: itens });
});

app.post('/api/partidas', auth.exigir, async function (req, res) {
  var p = req.body || {};
  // a identidade vem da sessão, não do cliente (não confiar no corpo para quem é o aluno)
  p.cpf = req.usuario.cpf;
  p.nome = req.usuario.nome;
  p.semestre = req.usuario.semestre || SEMESTRE;
  var r = await db.salvarPartida(p);
  res.json({ ok: !!r.ok });
});

/* ---- estático (o jogo) ---- */
app.use(express.static(PUBLIC, {
  setHeaders: function (res, p) {
    if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (p.indexOf(path.sep + 'assets' + path.sep) >= 0) res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));
// qualquer rota não-API cai no jogo (SSO em qualquer caminho, deep links)
app.get(/^(?!\/api\/).*/, function (req, res) { res.sendFile(path.join(PUBLIC, 'index.html')); });

app.listen(PORT, function () {
  console.log('Última Instância v' + VERSAO + ' no ar em http://0.0.0.0:' + PORT);
  console.log('  modo de dados: ' + (db.hasDB ? 'Postgres' : 'MOCK (sem banco)'));
  if (db.FIXO.ativo) console.log('  usuário fixo: CPF ' + db.FIXO.cpf + ' / nascimento ' + db.FIXO.nascimento + ' (' + db.FIXO.nome + ')');
  if (auth.efemero) console.log('  aviso: SESSION_SECRET não definido — usando segredo efêmero (defina em produção).');
});
