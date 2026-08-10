'use strict';
/* ============================================================
   Última Instância — sessão do aluno (JWT em cookie httpOnly)
   O segredo vem de SESSION_SECRET/JWT_SECRET. Em desenvolvimento,
   sem segredo definido, gera um efêmero (as sessões não sobrevivem
   a um restart, o que é aceitável fora de produção).
   ============================================================ */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
let efemero = false;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  efemero = true;
}
const COOKIE = 'ui_sessao';
// horas de sessão; um valor não-numérico no env viraria NaN e faria jwt.sign lançar em TODO
// login ('NaNh' não é um prazo) — valida e cai no padrão 12
const DUR_RAW = parseInt(process.env.SESSION_HORAS || '12', 10);
const DUR = Number.isFinite(DUR_RAW) && DUR_RAW > 0 ? DUR_RAW : 12;
const PROD = process.env.NODE_ENV === 'production';

function emitir(res, usuario) {
  var token = jwt.sign({ u: usuario }, SECRET, { expiresIn: DUR + 'h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PROD,
    maxAge: DUR * 3600 * 1000,
    path: '/'
  });
}
function ler(req) {
  var token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try { return jwt.verify(token, SECRET).u || null; }
  catch (e) { return null; }
}
function encerrar(res) {
  res.clearCookie(COOKIE, { path: '/' });
}
function exigir(req, res, next) {
  var u = ler(req);
  if (!u) return res.status(401).json({ erro: 'sessao', mensagem: 'Faça login para continuar.' });
  req.usuario = u;
  next();
}
/* rotas do professor/coordenador: exige sessão E o marcador admin no perfil (usuarios.admin
   no banco, ou USUARIO_FIXO_ADMIN no modo sem banco). Sem isto, qualquer aluno logado
   alcançaria o ranking com identidade/export.
   Com banco, o admin é RECONFERIDO a cada request (não só o assado no JWT): revogar
   usuarios.admin passa a valer na hora, não só quando o token de 12h expirar. */
function exigirAdmin(req, res, next) {
  var u = ler(req);
  if (!u) return res.status(401).json({ erro: 'sessao', mensagem: 'Faça login para continuar.' });
  if (!u.admin) return res.status(403).json({ erro: 'sem_permissao', mensagem: 'Área restrita à coordenação.' });
  var db = require('./db');           // require tardio: evita ciclo (db não importa auth)
  if (!db.hasDB) { req.usuario = u; return next(); }
  db.ehAdmin(u.cpf).then(function (ainda) {
    if (!ainda) return res.status(403).json({ erro: 'sem_permissao', mensagem: 'Área restrita à coordenação.' });
    req.usuario = u;
    next();
  }).catch(function () {
    res.status(503).json({ erro: 'erro', mensagem: 'Não foi possível validar o acesso agora.' });
  });
}

module.exports = { emitir: emitir, ler: ler, encerrar: encerrar, exigir: exigir, exigirAdmin: exigirAdmin, efemero: efemero };
