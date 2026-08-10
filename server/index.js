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
/* atrás de UM reverse proxy (EasyPanel/Traefik): req.ip vira o hop confiável do
   X-Forwarded-For, em vez do header cru — que é forjável pelo cliente e permitia
   burlar a trava de login por IP mandando um XFF novo a cada tentativa. */
app.set('trust proxy', 1);
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
  // campos UTC (não locais): a semana vira no MESMO instante em qualquer TZ do servidor,
  // e bate com o cliente (semanaISO também usa campos UTC)
  var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  var dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  var ano = t.getUTCFullYear();
  var sem = Math.ceil(((t - Date.UTC(ano, 0, 1)) / 86400000 + 1) / 7);
  return ano + '-S' + (sem < 10 ? '0' : '') + sem;
}

/* Limitador de login em duas camadas. As credenciais são CPF (semi-público) + data de
   nascimento (~11 mil combinações) — adivinháveis. Sem trava por conta, um atacante varre o
   nascimento de um colega e entra como ele, sabotando o ranking (que vale nota).
   - por IP: freio grosso contra enumeração em massa a partir de uma origem (zera na espera,
     para não travar a turma inteira atrás do NAT da escola por causa de alguns erros);
   - por CONTA (cpf): a proteção real — a partir de 5 erros, espera CRESCENTE (1,2,4,…,30min) e
     o contador só zera com um login CERTO (não com o passar do tempo). Assim adivinhar por
     força bruta fica inviável sem travar quem só errou a própria data uma ou duas vezes. */
const tentativas = new Map();       // ip → {n, ate, t}
const tentContas = new Map();        // cpf (só dígitos) → {n, ate, t}
function normCpf(c) { return String(c || '').replace(/\D/g, ''); }
function podeTentar(ip) {
  var reg = tentativas.get(ip) || { n: 0, ate: 0 };
  return Date.now() >= reg.ate;
}
function registraTentativa(ip, ok) {
  var reg = tentativas.get(ip) || { n: 0, ate: 0 };
  if (ok) { tentativas.delete(ip); return; }
  reg.n++; reg.t = Date.now();
  if (reg.n >= 8) { reg.ate = Date.now() + 60 * 1000; reg.n = 0; } // 1 min de espera após 8 erros do mesmo IP
  tentativas.set(ip, reg);
}
function contaBloqueada(cpf) {
  if (!cpf) return false;
  var reg = tentContas.get(cpf);
  return !!reg && Date.now() < reg.ate;
}
function registraTentativaConta(cpf, ok) {
  if (!cpf) return;
  if (ok) { tentContas.delete(cpf); return; }
  var reg = tentContas.get(cpf) || { n: 0, ate: 0 };
  reg.n++; reg.t = Date.now();
  if (reg.n >= 5) {                                    // espera crescente 1,2,4,…,30min; NÃO zera com o tempo
    var mins = Math.min(30, Math.pow(2, reg.n - 5));
    reg.ate = Date.now() + mins * 60 * 1000;
  }
  tentContas.set(cpf, reg);
}
/* faxina dos limitadores: sem ela, cada IP/CPF inventado numa tentativa errada virava uma
   entrada eterna nos Maps — memória crescendo sem teto sob ataque. A cada 10 min, entradas
   frias (sem atividade há 1h e sem bloqueio vigente) são descartadas; o histórico que importa
   (bloqueio ativo/espera crescente recente) sobrevive à varredura. */
setInterval(function () {
  var agora = Date.now(), corte = agora - 60 * 60 * 1000;
  [tentativas, tentContas].forEach(function (mapa) {
    mapa.forEach(function (reg, k) {
      if ((reg.t || 0) < corte && agora >= (reg.ate || 0)) mapa.delete(k);
    });
  });
}, 10 * 60 * 1000).unref();

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
  // req.ip respeita trust proxy (1 hop): é o IP real do cliente, não o header forjável
  var ip = req.ip || req.socket.remoteAddress || 'local';
  var body = req.body || {};
  var cpfNorm = normCpf(body.cpf);
  if (!podeTentar(ip)) return res.status(429).json({ erro: 'muitas_tentativas', mensagem: 'Muitas tentativas. Aguarde um minuto e tente de novo.' });
  if (contaBloqueada(cpfNorm)) return res.status(429).json({ erro: 'conta_bloqueada', mensagem: 'Muitas tentativas para este CPF. Aguarde alguns minutos e tente de novo.' });
  var r = await db.autenticar(body.cpf, body.nascimento);
  registraTentativa(ip, r.ok);
  registraTentativaConta(cpfNorm, r.ok);
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

/* ---- coordenação (professor): ver e exportar o ranking com identidade ----
   Só quem tem `admin` no perfil (usuarios.admin no banco, ou USUARIO_FIXO_ADMIN sem banco)
   passa por auth.exigirAdmin. É a única superfície que devolve identidade forte (nome + RA +
   CPF) — o ranking do aluno nunca traz CPF. Serve para premiar os top-10. */
function csvCampo(v) {
  var s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
app.get('/api/admin/placar', auth.exigirAdmin, async function (req, res) {
  var aba = req.query.aba === 'hall' ? 'hall' : 'semestre';
  var itens = await db.listarPlacarAdmin(aba, SEMESTRE);
  res.json({ itens: itens, semestre: SEMESTRE, aba: aba });
});
app.get('/api/admin/placar.csv', auth.exigirAdmin, async function (req, res) {
  var aba = req.query.aba === 'hall' ? 'hall' : 'semestre';
  var itens = await db.listarPlacarAdmin(aba, SEMESTRE);
  var linhas = [['posicao', 'nome', 'ra', 'cpf', 'pontos', 'detalhe']];
  itens.forEach(function (it) { linhas.push([it.posicao, it.nome, it.ra, it.cpf, it.pontos, it.detalhe]); });
  var csv = linhas.map(function (l) { return l.map(csvCampo).join(','); }).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ranking-' + aba + '-' + SEMESTRE + '.csv"');
  res.send(String.fromCharCode(0xFEFF) + csv);   // BOM para o Excel abrir os acentos corretamente
});

app.get('/api/progresso', auth.exigir, async function (req, res) {
  // a jornada do semestre é única e a pauta da semana é uma só — este endpoint
  // é a memória entre aparelhos (o front funde com o estado local). A temporada é o
  // SEMESTRE do env (mesma fonte que POST /api/partidas usa ao gravar).
  var sem = SEMESTRE;
  // a chave da semana é SEMPRE a do servidor — a mesma usada na GRAVAÇÃO da partida
  // (POST /api/partidas força seed 'semana-'+chaveSemanaServidor()). Aceitar a do cliente
  // criava janela de divergência (domingo à noite em UTC-3) em que a semana jogada
  // "sumia" da consulta e a UI liberava jogar de novo (o dedup ainda segurava no banco).
  var r = await db.progressoAluno(req.usuario.cpf, sem, chaveSemanaServidor());
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

  // INTEGRIDADE DO RANKING: o jogo é um HTML aberto — um aluno pode abrir o DevTools e forjar
  // o corpo do POST. A Ordem do Mérito (divisão/PM) já é recalculada no servidor, mas a coluna
  // `pontos` (que ORDENA o placar do top-10, e o top-10 vale nota) entrava crua. Duas travas:
  // (1) só os modos que o cliente v6 de fato persiste (semestre/semana) são aceitos — os modos
  //     legados sem seed forçada não deduplicavam e deixavam farmar pontos ilimitados; e
  // (2) pontos/casos são limitados à faixa fisicamente alcançável jogando (derivada de
  //     pontuarCaso no cliente: até ~475/caso; jornada de 8 casos ≈ [-400, 3800], semana 1 caso
  //     ≈ [-50, 475]; derrota conta negativo, por isso o piso é negativo). Assim um POST com
  //     pontos:999999 é limitado ao teto honesto em vez de liderar o ranking. Clampa (não
  //     rejeita) para nunca descartar uma pontuação legítima de borda.
  if (p.modo !== 'semestre' && p.modo !== 'semana') return res.status(400).json({ ok: false, erro: 'modo_invalido' });
  var TETO_PONTOS = p.modo === 'semestre' ? 3900 : 520;
  var PISO_PONTOS = p.modo === 'semestre' ? -450 : -80;
  p.casos = Math.max(0, Math.min(8, Math.round(Number(p.casos) || 0)));
  p.pontos = Math.max(PISO_PONTOS, Math.min(TETO_PONTOS, Math.round(Number(p.pontos) || 0)));
  p.venceu = !!p.venceu;

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

// blindagem de produção: sem SESSION_SECRET, o segredo é efêmero e QUALQUER restart/redeploy
// invalida os cookies de TODOS os alunos de uma vez (a turma inteira cai para o login). Fora de
// produção isso é aceitável; em produção é um incidente de sala garantido — falha rápido para
// não subir quebrado em silêncio.
if (auth.efemero && process.env.NODE_ENV === 'production') {
  console.error('FATAL: SESSION_SECRET não definido em produção. Sem ele, cada restart desloga a turma inteira.');
  console.error('  Gere um: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('  e defina SESSION_SECRET no ambiente (EasyPanel › Environment) antes de subir.');
  process.exit(1);
}

app.listen(PORT, function () {
  console.log('Última Instância v' + VERSAO + ' no ar em http://0.0.0.0:' + PORT);
  console.log('  modo de dados: ' + (db.hasDB ? 'Postgres' : 'MOCK (sem banco)'));
  if (db.FIXO.ativo) console.log('  usuário fixo: CPF ' + db.FIXO.cpf + ' / nascimento ' + db.FIXO.nascimento + ' (' + db.FIXO.nome + ')');
  if (auth.efemero) console.log('  aviso: SESSION_SECRET não definido — usando segredo efêmero (defina em produção).');
});
