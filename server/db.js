'use strict';
/* ============================================================
   Última Instância — camada de dados (Postgres self-hosted)
   ------------------------------------------------------------
   Lê a conexão de variáveis de ambiente. Se não houver banco
   configurado, entra em MODO MOCK: o jogo continua jogável e
   testável (login de demonstração, juízes fictícios, placar em
   memória). Nada aqui derruba a UI se o banco cair.
   ============================================================ */
const { Pool } = require('pg');

/* ---- descobre a configuração de conexão a partir do ambiente ---- */
function configDoAmbiente() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: sslDoAmbiente() };
  }
  if (process.env.PGHOST || process.env.PGUSER || process.env.PGDATABASE) {
    return {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: sslDoAmbiente()
    };
  }
  return null;
}
function sslDoAmbiente() {
  // PGSSL=require|true liga o TLS; por padrão, desligado (Postgres self-hosted em rede interna)
  var v = (process.env.PGSSL || '').toLowerCase();
  if (v === 'require' || v === 'true' || v === '1') return { rejectUnauthorized: false };
  return false;
}

const cfg = configDoAmbiente();
const hasDB = !!cfg;
let pool = null;
if (hasDB) {
  pool = new Pool(Object.assign({ max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 6000 }, cfg));
  pool.on('error', function (e) { console.error('[db] erro no pool:', e.message); });
}

/* nomes de tabela configuráveis (a TI pode já ter tabelas com outro nome) */
const T_USUARIOS = process.env.TABELA_USUARIOS || 'usuarios';
const T_DISCIPLINAS = process.env.TABELA_DISCIPLINAS || 'disciplinas';
const T_PARTIDAS = process.env.TABELA_PARTIDAS || 'partidas';

/* ---- USUÁRIO FIXO (login por env, sem banco) ----
   Configurado por USUARIO_FIXO_CPF / USUARIO_FIXO_NASCIMENTO. Quando
   definido, entra em qualquer modo (funciona já, sem banco; e continua
   como conta de teste "break-glass" mesmo depois que o Postgres entrar —
   basta remover as variáveis para desligá-lo).
   Sem nada configurado e sem banco, cai num demo padrão (00000000000 /
   2000-01-01) para o jogo subir jogável de imediato. */
const FIXO = {
  cpf: soNumeros(process.env.USUARIO_FIXO_CPF || ''),
  nascimento: normalizarData(process.env.USUARIO_FIXO_NASCIMENTO || '') || '',
  nome: process.env.USUARIO_FIXO_NOME || 'Aluno FMP',
  semestre: process.env.USUARIO_FIXO_SEMESTRE || process.env.SEMESTRE || '',
  ra: process.env.USUARIO_FIXO_RA || '',
  ativo: false
};
FIXO.ativo = FIXO.cpf.length === 11 && !!FIXO.nascimento;
if (!FIXO.ativo && !hasDB) {
  FIXO.cpf = '00000000000'; FIXO.nascimento = '2000-01-01';
  FIXO.nome = process.env.USUARIO_FIXO_NOME || 'Aluno de demonstração';
  FIXO.ativo = true;
}
let placarMemoria = []; // usado só no modo mock

/* ---- helpers ---- */
function soNumeros(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function normalizarData(s) {
  // aceita 'YYYY-MM-DD' (input date) ou 'DD/MM/YYYY'; devolve 'YYYY-MM-DD' ou null
  var t = String(s == null ? '' : s).trim();
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return null;
}

/* ============================================================
   Autenticação — login = CPF (só números), senha = nascimento.
   ATENÇÃO: senha = data de nascimento é autenticação FRACA (dado
   público e adivinhável). Foi a escolha atual do produto para a
   carga inicial. O ponto de verificação está isolado aqui: para
   endurecer no futuro, troque a comparação por um hash (bcrypt/
   argon2) numa coluna senha_hash, sem tocar no resto do sistema.
   ============================================================ */
async function autenticar(cpfBruto, nascimentoBruto) {
  var cpf = soNumeros(cpfBruto);
  var nasc = normalizarData(nascimentoBruto);
  if (cpf.length !== 11 || !nasc) return { ok: false, motivo: 'formato' };

  // usuário fixo do env — vale em qualquer modo (funciona já, sem banco)
  if (FIXO.ativo && cpf === FIXO.cpf && nasc === FIXO.nascimento) {
    return { ok: true, usuario: perfilPublico({ cpf: cpf, nome: FIXO.nome, ra: FIXO.ra, semestre: FIXO.semestre, curso: '' }) };
  }

  if (!hasDB) return { ok: false, motivo: 'credenciais', mock: true };

  try {
    var sql = 'SELECT cpf, nome, ra, curso, semestre, ativo FROM ' + ident(T_USUARIOS) +
      ' WHERE regexp_replace(cpf, \'[^0-9]\', \'\', \'g\') = $1 AND data_nascimento = $2::date LIMIT 1';
    var r = await pool.query(sql, [cpf, nasc]);
    if (!r.rows.length) return { ok: false, motivo: 'credenciais' };
    var u = r.rows[0];
    if (u.ativo === false) return { ok: false, motivo: 'inativo' };
    return { ok: true, usuario: perfilPublico(u) };
  } catch (e) {
    console.error('[db] autenticar falhou:', e.message);
    return { ok: false, motivo: 'erro' };
  }
}
function perfilPublico(u) {
  return {
    cpf: soNumeros(u.cpf),
    nome: u.nome || 'Estudante',
    ra: u.ra || '',
    curso: u.curso || '',
    semestre: u.semestre || (process.env.SEMESTRE || '')
  };
}

/* ============================================================
   Disciplinas → juízes. Cada disciplina vira um julgador ligado
   ao seu professor. Sem banco, devolve [] e o jogo usa os juízes
   fictícios de fallback.
   ============================================================ */
const PERFIS_VALIDOS = ['legalista', 'pragmatico', 'humanista', 'metodico'];
async function listarDisciplinas(semestre) {
  if (!hasDB) return [];
  try {
    var params = [];
    var sql = 'SELECT nome, professor, area_do_direito, perfil_julgador, foto_professor_url, semestre FROM ' + ident(T_DISCIPLINAS);
    var cond = [];
    // só filtra por semestre se a coluna existir e um valor foi pedido — tolerante a schema mínimo
    if (semestre) { params.push(semestre); cond.push('(semestre IS NULL OR semestre = $' + params.length + ')'); }
    cond.push('(ativo IS NULL OR ativo = true)');
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY nome';
    var r = await pool.query(sql, params);
    return r.rows.map(function (d) {
      var perfil = (d.perfil_julgador || '').toLowerCase();
      if (PERFIS_VALIDOS.indexOf(perfil) < 0) perfil = '';
      return {
        nome: d.nome || 'Disciplina',
        professor: d.professor || '',
        area: d.area_do_direito || '',
        perfil: perfil,
        foto: d.foto_professor_url || ''
      };
    });
  } catch (e) {
    console.error('[db] listarDisciplinas falhou:', e.message);
    return [];
  }
}

/* ============================================================
   Partidas / placar.
   ============================================================ */
const MODOS = ['semestre', 'semana', 'livre', 'diario'];
async function salvarPartida(p) {
  var reg = {
    cpf: soNumeros(p.cpf), nome: p.nome || 'Estudante', semestre: p.semestre || (process.env.SEMESTRE || ''),
    pontos: parseInt(p.pontos, 10) || 0, casos: parseInt(p.casos, 10) || 0,
    venceu: !!p.venceu, modo: MODOS.indexOf(p.modo) >= 0 ? p.modo : 'livre', seed: String(p.seed || '')
  };
  if (!hasDB) { placarMemoria.push(Object.assign({ criado_em: new Date().toISOString() }, reg)); return { ok: true, mock: true }; }
  try {
    await pool.query(
      'INSERT INTO ' + ident(T_PARTIDAS) + ' (cpf, nome, semestre, pontos, casos, venceu, modo, seed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [reg.cpf, reg.nome, reg.semestre, reg.pontos, reg.casos, reg.venceu, reg.modo, reg.seed]
    );
    return { ok: true };
  } catch (e) {
    console.error('[db] salvarPartida falhou:', e.message);
    return { ok: false };
  }
}

async function listarPlacar(aba, semestre) {
  // aba 'semestre' → melhores do semestre corrente; 'hall' → melhores de sempre (campeões)
  var sem = semestre || process.env.SEMESTRE || '';
  if (!hasDB) {
    var lista = placarMemoria.slice();
    if (aba === 'semestre' && sem) lista = lista.filter(function (p) { return p.semestre === sem; });
    lista.sort(function (a, b) { return b.pontos - a.pontos; });
    return lista.slice(0, 50).map(mapPublicoPlacar);
  }
  try {
    var params = [];
    var sql = 'SELECT nome, semestre, pontos, casos, venceu, modo FROM ' + ident(T_PARTIDAS);
    if (aba === 'semestre' && sem) { params.push(sem); sql += ' WHERE semestre = $1'; }
    sql += ' ORDER BY pontos DESC, criado_em ASC LIMIT 50';
    var r = await pool.query(sql, params);
    return r.rows.map(mapPublicoPlacar);
  } catch (e) {
    console.error('[db] listarPlacar falhou:', e.message);
    return [];
  }
}
function mapPublicoPlacar(p) {
  if (p.modo === 'semana') {
    return { nome: p.nome || 'Estudante', pontos: p.pontos || 0, detalhe: (p.venceu ? 'pauta vencida' : 'pauta perdida') + ' · caso da semana' };
  }
  var m = p.modo === 'diario' ? 'caso do dia' : p.modo === 'livre' ? 'jornada livre' : 'jornada do semestre';
  return {
    nome: p.nome || 'Estudante',
    pontos: p.pontos || 0,
    detalhe: (p.venceu ? 'jornada vencida' : ((p.casos || 0) + ' de 8 casos')) + ' · ' + m
  };
}

/* ============================================================
   Progresso do aluno — a memória entre aparelhos:
   a jornada do semestre é única e a pauta da semana é uma só.
   Ambas saem da própria tabela de partidas (sem tabela nova).
   ============================================================ */
async function progressoAluno(cpf, semestre, chaveSemana) {
  var c = soNumeros(cpf);
  var seedSemana = 'semana-' + String(chaveSemana || '');
  function resumo(p) {
    return p ? { feita: true, venceu: !!p.venceu, pontos: p.pontos || 0, casos: p.casos || 0, quando: p.criado_em || '' } : null;
  }
  if (!hasDB) {
    var js = null, ss = null;
    placarMemoria.forEach(function (p) {
      if (p.cpf !== c) return;
      if (p.modo === 'semestre' && p.semestre === semestre && !js) js = p;
      if (p.modo === 'semana' && p.seed === seedSemana && !ss) ss = p;
    });
    return { jornada: resumo(js), semana: resumo(ss) };
  }
  try {
    var rj = await pool.query(
      'SELECT venceu, pontos, casos, criado_em FROM ' + ident(T_PARTIDAS) +
      ' WHERE cpf=$1 AND semestre=$2 AND modo=$3 ORDER BY criado_em ASC LIMIT 1',
      [c, semestre || '', 'semestre']
    );
    var rs = await pool.query(
      'SELECT venceu, pontos, casos, criado_em FROM ' + ident(T_PARTIDAS) +
      ' WHERE cpf=$1 AND modo=$2 AND seed=$3 ORDER BY criado_em ASC LIMIT 1',
      [c, 'semana', seedSemana]
    );
    return { jornada: resumo(rj.rows[0]), semana: resumo(rs.rows[0]) };
  } catch (e) {
    console.error('[db] progressoAluno falhou:', e.message);
    return { jornada: null, semana: null };
  }
}

/* ============================================================
   Ordem do Mérito (divisão competitiva por temporada/semestre).
   ============================================================ */
const T_RANK = process.env.TABELA_RANK || 'rank_alunos';
let rankMemoria = new Map();  // modo mock
async function salvarRank(cpf, nome, divisao, pm, temporada) {
  var reg = { cpf: soNumeros(cpf), nome: nome || 'Estudante', divisao: clampInt(divisao, 0, 12), pm: clampInt(pm, 0, 99), temporada: temporada || '' };
  if (!hasDB) { rankMemoria.set(reg.cpf + ':' + reg.temporada, reg); return { ok: true, mock: true }; }
  try {
    await pool.query(
      'INSERT INTO ' + ident(T_RANK) + ' (cpf, nome, temporada, divisao, pm, atualizado_em) VALUES ($1,$2,$3,$4,$5,now()) ' +
      'ON CONFLICT (cpf, temporada) DO UPDATE SET nome=$2, divisao=$4, pm=$5, atualizado_em=now()',
      [reg.cpf, reg.nome, reg.temporada, reg.divisao, reg.pm]
    );
    return { ok: true };
  } catch (e) { console.error('[db] salvarRank falhou:', e.message); return { ok: false }; }
}
async function lerRank(cpf, temporada) {
  var c = soNumeros(cpf);
  if (!hasDB) return rankMemoria.get(c + ':' + (temporada || '')) || null;
  try {
    var r = await pool.query('SELECT divisao, pm FROM ' + ident(T_RANK) + ' WHERE cpf=$1 AND temporada=$2 LIMIT 1', [c, temporada || '']);
    return r.rows[0] || null;
  } catch (e) { return null; }
}
function clampInt(v, a, b) { v = parseInt(v, 10); if (isNaN(v)) return a; return Math.max(a, Math.min(b, v)); }

/* impede injeção de nome de tabela vindo de env (identificador seguro) */
function ident(nome) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nome)) throw new Error('nome de tabela inválido: ' + nome);
  return nome;
}

async function ping() {
  if (!hasDB) return { db: false };
  try { await pool.query('SELECT 1'); return { db: true, ok: true }; }
  catch (e) { return { db: true, ok: false, erro: e.message }; }
}

module.exports = {
  hasDB: hasDB,
  autenticar: autenticar,
  listarDisciplinas: listarDisciplinas,
  salvarPartida: salvarPartida,
  listarPlacar: listarPlacar,
  progressoAluno: progressoAluno,
  salvarRank: salvarRank,
  lerRank: lerRank,
  ping: ping,
  FIXO: FIXO
};
