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
const DUR = process.env.SESSION_HORAS ? parseInt(process.env.SESSION_HORAS, 10) : 12; // horas
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
   alcançaria o ranking com identidade/export. */
function exigirAdmin(req, res, next) {
  var u = ler(req);
  if (!u) return res.status(401).json({ erro: 'sessao', mensagem: 'Faça login para continuar.' });
  if (!u.admin) return res.status(403).json({ erro: 'sem_permissao', mensagem: 'Área restrita à coordenação.' });
  req.usuario = u;
  next();
}

module.exports = { emitir: emitir, ler: ler, encerrar: encerrar, exigir: exigir, exigirAdmin: exigirAdmin, efemero: efemero };
