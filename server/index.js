'use strict';
/* ============================================================
   Última Instância — servidor (Express)
   Serve o jogo estático (public/) e a API REST:
     POST /api/login      { cpf, nascimento }  → cria a sessão
     POST /api/logout                          → encerra a sessão
     GET  /api/session                         → perfil atual / config
     GET  /api/disciplinas                     → juízes reais, filtrados pelo semestre do aluno (auth)
     GET  /api/disciplinas/semana              → juízes reais, pool global (sem filtro de semestre) — caso da semana (auth)
     GET  /api/placar?aba=&sem=                → ranking por pontos
                        aba=merito             → ranking da Ordem do Mérito (temporada)
                        aba=merito_hall        → hall histórico da Ordem do Mérito
     GET  /api/progresso?semana=               → memória entre aparelhos (auth)
     GET  /api/rank                            → divisão/PM atuais do aluno (auth)
     GET  /api/rank/posicao                    → posição do aluno no ranking (auth)
     POST /api/partidas                        → grava a jornada e aplica o PM (auth)
     GET  /api/saude                           → healthcheck
   Sem Postgres configurado, roda em MODO MOCK (ver server/db.js).

   Segurança da Ordem do Mérito (v5): divisao/pm NUNCA são aceitos como
   valor final vindo do corpo da requisição — não existe mais POST
   /api/rank. Toda promoção/rebaixamento é calculada no servidor, dentro
   de POST /api/partidas, a partir do resultado bruto da partida (ver
   db.aplicarResultadoPartida e a função aplicar_resultado_partida em
   db/schema.sql).
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

/* semana ISO calculada pelo SERVIDOR — nunca a do cliente (espelha semanaISO/chaveSemana
   de public/index.html; qualquer mudança lá precisa ser espelhada aqui). É o que fecha o
   "seed forjado": sem isto, o cliente podia escolher a seed de qualquer partida/semana e
   burlar a deduplicação (cpf,modo,seed) enviando uma seed nova a cada requisição. */
function chaveSemanaServidor() {
  var d = new Date();
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  var ano = t.getUTCFullYear();
  var sem = Math.ceil(((t - Date.UTC(ano, 0, 1)) / 86400000 + 1) / 7);
  return ano + '-S' + (sem < 10 ? '0' : '') + sem;
}

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
// pool GLOBAL, sem filtro de semestre: o caso da semana precisa do MESMO julgador para
// todo aluno da FMP, então não pode depender de em quais disciplinas cada um está
// matriculado (ao contrário de /api/disciplinas, usado na jornada do semestre).
app.get('/api/disciplinas/semana', auth.exigir, async function (req, res) {
  var lista = await db.listarDisciplinas();
  res.json({ disciplinas: lista });
});

app.get('/api/placar', auth.exigir, async function (req, res) {
  // a temporada é sempre o SEMESTRE do env (a fonte única). As abas de "semestre" mostram só
  // a temporada corrente; o cliente não escolhe o semestre (senão a aba podia divergir do que
  // foi gravado). As abas "hall" somam tudo, todas as temporadas.
  if (req.query.aba === 'merito') {
    var itensM = await db.listarRankTemporada(SEMESTRE);
    return res.json({ itens: itensM });
  }
  if (req.query.aba === 'merito_hall') {
    var itensH = await db.listarRankHall();
    return res.json({ itens: itensH });
  }
  var aba = req.query.aba === 'semestre' ? 'semestre' : 'hall';
  var itens = await db.listarPlacar(aba, SEMESTRE);
  res.json({ itens: itens });
});

app.get('/api/progresso', auth.exigir, async function (req, res) {
  // a jornada do semestre é única e a pauta da semana é uma só — este endpoint
  // é a memória entre aparelhos (o front funde com o estado local). A temporada é o
  // SEMESTRE do env (mesma fonte que POST /api/partidas usa ao gravar).
  var sem = SEMESTRE;
  var chave = String(req.query.semana || '').slice(0, 12);
  var r = await db.progressoAluno(req.usuario.cpf, sem, chave);
  res.json(r);
});

// NOTA DE SEGURANÇA (v5): não existe mais POST /api/rank. A divisão/PM da Ordem do
// Mérito nunca são aceitos como valor final vindo do cliente — eles só mudam como
// consequência de uma partida real, calculada no servidor dentro de POST /api/partidas
// (ver db.aplicarResultadoPartida). Um cliente não pode mais se autopromover.
app.get('/api/rank', auth.exigir, async function (req, res) {
  var r = await db.lerRank(req.usuario.cpf, SEMESTRE);
  res.json({ rank: r });
});
app.get('/api/rank/posicao', auth.exigir, async function (req, res) {
  var r = await db.posicaoRank(req.usuario.cpf, SEMESTRE);
  res.json({ posicao: r });
});

var TIPO_MERITO_POR_MODO = { semestre: 'jornada', semana: 'semana' };
app.post('/api/partidas', auth.exigir, async function (req, res) {
  var p = req.body || {};
  // a identidade vem da sessão, não do cliente (não confiar no corpo para quem é o aluno)
  p.cpf = req.usuario.cpf;
  p.nome = req.usuario.nome;
  // a TEMPORADA (a "estação" do ranking) é sempre o SEMESTRE do env — a fonte única da verdade.
  // Trocar o env vira a temporada para todos. (O semestre do aluno em `usuarios` só filtra as
  // DISCIPLINAS/professores, não o ranking.) Sem isto, a partida entrava sob o semestre do aluno
  // enquanto o placar/rank consultavam o env: a aba "Semestre" ficava vazia quando divergiam.
  p.semestre = SEMESTRE;

  // a seed dos modos que valem PM/Ordem do Mérito NUNCA vem do cliente: a jornada do
  // semestre tem uma seed fixa por (cpf, temporada) e o caso da semana usa a semana ISO
  // calculada aqui, no servidor. Sem isto, um cliente podia mandar uma seed nova a cada
  // requisição e burlar por completo a deduplicação (cpf,modo,seed) — repetindo a
  // "vitória" quantas vezes quisesse para farmar PM sem limite. O dedup em si (índice
  // único em partidas + idempotência por partida_id em rank_movimentos) já existia; o que
  // faltava era não deixar o cliente escolher a chave que esse dedup usa.
  if (p.modo === 'semestre') p.seed = 'semestre-' + p.semestre;
  else if (p.modo === 'semana') p.seed = 'semana-' + chaveSemanaServidor();

  var salvo = await db.salvarPartida(p);
  if (!salvo.ok) return res.json({ ok: false });

  // a Ordem do Mérito só se move para modos que valem PM (jornada do semestre / caso da
  // semana); o delta é recalculado aqui a partir do resultado bruto (pontos/casos/venceu),
  // nunca a partir de um valor final — e é amarrado ao id da partida para nunca dobrar.
  // db.salvarPartida já garante um id (mesmo em duplicata, devolve o id da linha
  // existente), então aplicarResultadoPartida é sempre chamada — a própria idempotência
  // por partida_id decide se aplica de novo ou só devolve o estado atual.
  var tipo = TIPO_MERITO_POR_MODO[p.modo];
  var rank = null;
  if (tipo) {
    var r = await db.aplicarResultadoPartida(p.cpf, p.nome, p.semestre, tipo, p.pontos, p.casos, !!p.venceu, salvo.id);
    // erro:true = a mutação falhou (banco fora do ar, corrida rara no índice de
    // idempotência) — NUNCA repassar {divisao:0,pm:0} como se fosse o padrão real do
    // aluno; o cliente reconciliaria a Ordem do Mérito local para zero por engano.
    rank = r.erro ? null : { divisao: r.divisao, pm: r.pm, delta: r.delta, aplicado: r.aplicado };
  }
  res.json({ ok: true, duplicado: !!salvo.duplicado, rank: rank });
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
