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
    // só filtra por semestre se um valor foi pedido; comparação tolerante a espaço/maiúscula
    // (um typo aqui não pode fazer a lista inteira sumir e cair nos juízes fictícios)
    if (semestre) { params.push(String(semestre).trim().toLowerCase()); cond.push('(semestre IS NULL OR lower(trim(semestre)) = $' + params.length + ')'); }
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
let placarSeq = 0; // mock: id incremental (equivalente ao BIGSERIAL da tabela partidas)
/* grava a partida com deduplicação por (cpf, modo, seed): reenvio por retry de rede,
   duplo clique ou fila offline não cria uma segunda linha nem pontua duas vezes — a
   linha existente é devolvida com duplicado:true (mesmo padrão nos dois modos). */
async function salvarPartida(p) {
  var reg = {
    cpf: soNumeros(p.cpf), nome: p.nome || 'Estudante', semestre: p.semestre || (process.env.SEMESTRE || ''),
    pontos: parseInt(p.pontos, 10) || 0, casos: parseInt(p.casos, 10) || 0,
    venceu: !!p.venceu, modo: MODOS.indexOf(p.modo) >= 0 ? p.modo : 'livre', seed: String(p.seed || '')
  };
  if (!hasDB) {
    if (reg.seed) {
      var existente = placarMemoria.find(function (x) { return x.cpf === reg.cpf && x.modo === reg.modo && x.seed === reg.seed; });
      if (existente) return { ok: true, mock: true, id: existente.id, duplicado: true };
    }
    reg.id = ++placarSeq;
    placarMemoria.push(Object.assign({ criado_em: new Date().toISOString() }, reg));
    return { ok: true, mock: true, id: reg.id, duplicado: false };
  }
  try {
    // ON CONFLICT exige o índice parcial uq_partidas_dedup (db/schema.sql); se a instalação
    // tinha duplicatas anteriores à migração v5, esse índice pode não existir — ver o
    // diagnóstico no schema.sql. Nesse caso este INSERT lança e cai no catch abaixo.
    // DO UPDATE (em vez de DO NOTHING) devolve o id existente na mesma viagem ao banco —
    // sem isso, toda resubmissão legítima (retry de rede, fila offline) custaria duas
    // consultas em vez de uma. xmax=0 é o idioma padrão do Postgres pra saber se a linha
    // devolvida por um upsert foi inserida agora ou já existia.
    var r = await pool.query(
      'INSERT INTO ' + ident(T_PARTIDAS) + ' (cpf, nome, semestre, pontos, casos, venceu, modo, seed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ' +
      'ON CONFLICT (cpf, modo, seed) WHERE seed IS NOT NULL AND seed <> \'\' DO UPDATE SET seed = EXCLUDED.seed ' +
      'RETURNING id, (xmax = 0) AS inserted',
      [reg.cpf, reg.nome, reg.semestre, reg.pontos, reg.casos, reg.venceu, reg.modo, reg.seed]
    );
    var row = r.rows[0];
    return { ok: true, id: row.id, duplicado: !row.inserted };
  } catch (e) {
    console.error('[db] salvarPartida falhou:', e.message);
    return { ok: false };
  }
}

/* ============================================================
   Placar — um ranking por ALUNO, não por partida.
   'semestre': soma jornada do semestre + todas as pautas semanais
   sustentadas na temporada corrente (um único ranking combinado —
   a Ordem do Mérito já cobre a progressão por divisão separada).
   'hall': a mesma soma, para sempre, todas as temporadas.
   ============================================================ */
async function listarPlacar(aba, semestre) {
  var sem = semestre || process.env.SEMESTRE || '';
  if (!hasDB) {
    // só os modos que valem placar (semestre/semana) somam pontos — barra qualquer modo legado
    // sem seed forçada de contaminar o ranking (defesa em profundidade junto do POST).
    var lista = placarMemoria.filter(function (p) { return p.modo === 'semestre' || p.modo === 'semana'; });
    if (aba === 'semestre' && sem) lista = lista.filter(function (p) { return p.semestre === sem; });
    var ag = agregarPorAluno(lista);
    ag.sort(function (a, b) { return b.pontos - a.pontos; });
    return ag.slice(0, 50).map(mapPublicoAgregado);
  }
  try {
    var params = [];
    var conds = ["modo IN ('semestre','semana')"];   // só modos que valem placar contam pontos
    if (aba === 'semestre' && sem) { params.push(sem); conds.push('semestre = $1'); }
    var where = ' WHERE ' + conds.join(' AND ');
    var sql = 'SELECT cpf, MAX(nome) AS nome, SUM(pontos) AS pontos, '
      + "BOOL_OR(modo = 'semestre' AND venceu) AS jornada_venceu, "
      + "COUNT(*) FILTER (WHERE modo = 'semestre') AS jornada_registrada, "
      + "COALESCE(MAX(casos) FILTER (WHERE modo = 'semestre'), 0) AS jornada_casos, "
      + "COUNT(*) FILTER (WHERE modo = 'semana' AND venceu) AS semanas_venceu, "
      + "COUNT(*) FILTER (WHERE modo = 'semana') AS semanas_jogadas, "
      + 'COUNT(DISTINCT semestre) AS semestres '
      + 'FROM ' + ident(T_PARTIDAS) + where
      + ' GROUP BY cpf ORDER BY pontos DESC LIMIT 50';
    var r = await pool.query(sql, params);
    return r.rows.map(mapPublicoAgregado);
  } catch (e) {
    console.error('[db] listarPlacar falhou:', e.message);
    return [];
  }
}
/* agrega o modo mock (memória) na mesma forma das colunas que vêm do SQL acima */
function agregarPorAluno(lista) {
  var porCpf = new Map();
  lista.forEach(function (p) {
    var g = porCpf.get(p.cpf);
    if (!g) {
      g = { cpf: p.cpf, nome: p.nome, pontos: 0, jornada_venceu: false, jornada_registrada: 0, jornada_casos: 0,
        semanas_venceu: 0, semanas_jogadas: 0, semestresSet: new Set() };
      porCpf.set(p.cpf, g);
    }
    g.nome = p.nome || g.nome;
    g.pontos += p.pontos || 0;
    if (p.semestre) g.semestresSet.add(p.semestre);
    if (p.modo === 'semestre') { g.jornada_registrada++; g.jornada_casos = p.casos || 0; if (p.venceu) g.jornada_venceu = true; }
    else if (p.modo === 'semana') { g.semanas_jogadas++; if (p.venceu) g.semanas_venceu++; }
  });
  return Array.from(porCpf.values()).map(function (g) {
    return { cpf: g.cpf, nome: g.nome, pontos: g.pontos, jornada_venceu: g.jornada_venceu,
      jornada_registrada: g.jornada_registrada, jornada_casos: g.jornada_casos,
      semanas_venceu: g.semanas_venceu, semanas_jogadas: g.semanas_jogadas, semestres: g.semestresSet.size };
  });
}
function mapPublicoAgregado(p) {
  var partes = [];
  var jornadaReg = parseInt(p.jornada_registrada, 10) || 0;
  var semanasJog = parseInt(p.semanas_jogadas, 10) || 0;
  var semanasVenc = parseInt(p.semanas_venceu, 10) || 0;
  var semestres = parseInt(p.semestres, 10) || 0;
  var pontos = parseInt(p.pontos, 10) || 0;
  if (jornadaReg > 0) partes.push(p.jornada_venceu ? 'jornada vencida' : ((parseInt(p.jornada_casos, 10) || 0) + ' de 8 casos'));
  if (semanasJog > 0) {
    partes.push(semanasVenc === semanasJog
      ? (semanasVenc + (semanasVenc === 1 ? ' semana vencida' : ' semanas vencidas'))
      : (semanasVenc + ' de ' + semanasJog + ' semanas vencidas'));
  }
  if (semestres > 1) partes.push(semestres + ' semestres');
  return { nome: p.nome || 'Estudante', pontos: pontos, detalhe: partes.length ? partes.join(' · ') : (pontos + ' pontos') };
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
   ------------------------------------------------------------
   O Postgres é a fonte da verdade: divisao/pm só mudam através de
   aplicarResultadoPartida, que recebe o RESULTADO BRUTO da partida
   (tipo/pontos/casos/venceu) — nunca uma divisão/PM finais vindos
   do cliente — e recalcula o delta e a promoção/rebaixamento no
   servidor (espelha aplicarMerito de public/index.html). Em modo
   banco, isso roda dentro da função atômica aplicar_resultado_
   partida (db/schema.sql), com a linha travada (FOR UPDATE) contra
   corrida entre duas partidas concorrentes do mesmo aluno; em modo
   mock, replicamos exatamente a mesma lógica em memória.
   ============================================================ */
const T_RANK = process.env.TABELA_RANK || 'rank_alunos';
const DIVISOES_LEN = 13;      // igual a DIVISOES.length no front
const DIV_PROTEGIDAS = 4;     // igual a DIV_PROTEGIDAS no front — abaixo disso, PM nunca cai
let rankMemoria = new Map();  // modo mock: chave cpf+':'+temporada
let rankAplicados = new Set(); // modo mock: partida_id já processados (idempotência)

function estadoRankMemoria(cpf, temporada) {
  var chave = cpf + ':' + temporada;
  var r = rankMemoria.get(chave);
  if (!r) {
    // primeira aparição nesta temporada: herda a "virada de temporada" da temporada
    // mais recente já conhecida desse aluno (divisão-1, pm=0 — sem gate de proteção)
    var maisRecente = null;
    rankMemoria.forEach(function (v) {
      if (v.cpf === cpf && v.temporada !== temporada && (!maisRecente || v.atualizado_em > maisRecente.atualizado_em)) maisRecente = v;
    });
    var divInicial = Math.max(0, (maisRecente ? maisRecente.divisao : 0) - 1);
    r = {
      cpf: cpf, nome: '', temporada: temporada, divisao: divInicial, pm: 0, maior_divisao: divInicial,
      vitorias: 0, derrotas: 0, jornadas_concluidas: 0, casos_semanais_concluidos: 0,
      criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString()
    };
    rankMemoria.set(chave, r);
  }
  return r;
}
function calcularDeltaPM(tipo, venceu, pontos, casos, divisaoAtual) {
  if (tipo === 'semana') {
    if (venceu) return { delta: 14 + Math.min(8, Math.round((pontos || 0) / 60)), motivo: 'caso da semana vencido' };
    return { delta: (divisaoAtual < DIV_PROTEGIDAS) ? 0 : -6, motivo: 'caso da semana perdido' };
  }
  // v6: a jornada não elimina — o PM escala com casos vencidos (0..8) + bônus de qualidade; nunca pune.
  // Espelha exatamente aplicar_resultado_partida (db/schema.sql) e aplicarMerito (public/index.html).
  return {
    delta: Math.min(80, Math.round((casos || 0) / 8 * 72) + Math.max(0, Math.min(8, Math.round((pontos || 0) / 200)))),
    motivo: 'jornada do semestre concluída (' + (casos || 0) + ' de 8 casos)'
  };
}

/* único caminho de escrita para divisao/pm. partidaId (quando fornecido) garante que a
   mesma partida nunca gera dois movimentos de PM, mesmo sob reenvio/retry/corrida. */
async function aplicarResultadoPartida(cpf, nome, temporada, tipo, pontos, casos, venceu, partidaId) {
  var c = soNumeros(cpf);
  var sem = temporada || process.env.SEMESTRE || '';
  if (['jornada', 'semana'].indexOf(tipo) < 0) return { divisao: 0, pm: 0, delta: 0, aplicado: false, erro: true };
  // sanitiza uma vez só, antes de ramificar — o modo mock usava (pontos||0) sem parseInt,
  // então um valor não numérico virava NaN e corrompia o PM do aluno pra sempre (nenhum
  // dos clamps de divisão/promoção corrige NaN, já que toda comparação com NaN é falsa)
  pontos = parseInt(pontos, 10) || 0;
  casos = parseInt(casos, 10) || 0;
  if (!hasDB) {
    if (partidaId != null && rankAplicados.has(partidaId)) {
      var atual = rankMemoria.get(c + ':' + sem);
      return { divisao: atual ? atual.divisao : 0, pm: atual ? atual.pm : 0, delta: 0, aplicado: false };
    }
    var r = estadoRankMemoria(c, sem);
    r.nome = nome || r.nome || 'Estudante';
    var calc = calcularDeltaPM(tipo, !!venceu, pontos, casos, r.divisao);
    var div = r.divisao, pm = r.pm + calc.delta;
    while (pm >= 100 && div < DIVISOES_LEN - 1) { pm -= 100; div++; }
    while (pm < 0) {
      if (div > DIV_PROTEGIDAS) { div--; pm += 100; } else { pm = 0; break; }
    }
    if (pm > 99) pm = 99;
    r.divisao = div; r.pm = pm;
    r.maior_divisao = Math.max(r.maior_divisao, div);
    if (venceu) r.vitorias++; else r.derrotas++;
    if (tipo === 'jornada') r.jornadas_concluidas++;
    if (tipo === 'semana') r.casos_semanais_concluidos++;
    r.atualizado_em = new Date().toISOString();
    if (partidaId != null) rankAplicados.add(partidaId);
    return { divisao: div, pm: pm, delta: calc.delta, aplicado: true };
  }
  try {
    var q = await pool.query(
      'SELECT * FROM aplicar_resultado_partida($1,$2,$3,$4,$5,$6,$7,$8)',
      [c, nome || 'Estudante', sem, tipo, pontos, casos, !!venceu, partidaId != null ? partidaId : null]
    );
    var row = q.rows[0];
    return { divisao: row.divisao, pm: row.pm, delta: row.delta_pm, aplicado: row.aplicado };
  } catch (e) {
    console.error('[db] aplicarResultadoPartida falhou:', e.message);
    return { divisao: 0, pm: 0, delta: 0, aplicado: false, erro: true };
  }
}

async function lerRank(cpf, temporada) {
  var c = soNumeros(cpf);
  var sem = temporada || process.env.SEMESTRE || '';
  if (!hasDB) {
    var r = rankMemoria.get(c + ':' + sem);
    if (!r) return null;
    return {
      divisao: r.divisao, pm: r.pm, maior_divisao: r.maior_divisao, vitorias: r.vitorias, derrotas: r.derrotas,
      jornadas_concluidas: r.jornadas_concluidas, casos_semanais_concluidos: r.casos_semanais_concluidos
    };
  }
  try {
    var r2 = await pool.query(
      'SELECT divisao, pm, maior_divisao, vitorias, derrotas, jornadas_concluidas, casos_semanais_concluidos FROM ' +
      ident(T_RANK) + ' WHERE cpf=$1 AND temporada=$2 LIMIT 1',
      [c, sem]
    );
    return r2.rows[0] || null;
  } catch (e) { console.error('[db] lerRank falhou:', e.message); return null; }
}

/* ranking da temporada corrente — a escada da Ordem do Mérito */
async function listarRankTemporada(temporada) {
  var sem = temporada || process.env.SEMESTRE || '';
  if (!hasDB) {
    var lista = Array.from(rankMemoria.values()).filter(function (r) { return r.temporada === sem; });
    lista.sort(function (a, b) { return b.divisao - a.divisao || b.pm - a.pm; });
    // NÃO expor cpf: o ranking é visível a qualquer aluno logado; CPF é PII (LGPD). A identidade
    // do próprio aluno já vem de /api/rank (amarrado à sessão), não desta lista pública.
    return lista.slice(0, 50).map(function (r, i) {
      return { nome: r.nome, divisao: r.divisao, pm: r.pm, maior_divisao: r.maior_divisao, vitorias: r.vitorias, derrotas: r.derrotas, posicao: i + 1 };
    });
  }
  try {
    var r = await pool.query(
      'SELECT nome, divisao, pm, maior_divisao, vitorias, derrotas, ' +   // sem cpf: PII fora do ranking público
      'RANK() OVER (ORDER BY divisao DESC, pm DESC) AS posicao FROM ' + ident(T_RANK) +
      ' WHERE temporada=$1 ORDER BY divisao DESC, pm DESC LIMIT 50',
      [sem]
    );
    return r.rows;
  } catch (e) { console.error('[db] listarRankTemporada falhou:', e.message); return []; }
}

/* hall histórico da Ordem do Mérito — maior divisão já alcançada, todas as temporadas */
async function listarRankHall() {
  if (!hasDB) {
    var porCpf = new Map();
    rankMemoria.forEach(function (r) {
      var g = porCpf.get(r.cpf);
      if (!g) { g = { cpf: r.cpf, nome: r.nome, maior_divisao: 0, vitorias: 0, derrotas: 0 }; porCpf.set(r.cpf, g); }
      g.nome = r.nome || g.nome;
      g.maior_divisao = Math.max(g.maior_divisao, r.maior_divisao);
      g.vitorias += r.vitorias; g.derrotas += r.derrotas;
    });
    var lista = Array.from(porCpf.values());
    lista.sort(function (a, b) { return b.maior_divisao - a.maior_divisao || b.vitorias - a.vitorias; });
    // sem cpf no payload público (LGPD) — a agregação usa cpf só como chave interna
    return lista.slice(0, 50).map(function (g) {
      return { nome: g.nome, maior_divisao: g.maior_divisao, vitorias: g.vitorias, derrotas: g.derrotas };
    });
  }
  try {
    var r = await pool.query(
      'SELECT MAX(nome) AS nome, MAX(maior_divisao) AS maior_divisao, SUM(vitorias) AS vitorias, SUM(derrotas) AS derrotas ' +
      'FROM ' + ident(T_RANK) + ' GROUP BY cpf ORDER BY maior_divisao DESC, vitorias DESC LIMIT 50'   // agrupa por cpf mas não o expõe
    );
    return r.rows;
  } catch (e) { console.error('[db] listarRankHall falhou:', e.message); return []; }
}

/* posição individual do aluno na temporada corrente */
async function posicaoRank(cpf, temporada) {
  var c = soNumeros(cpf);
  var sem = temporada || process.env.SEMESTRE || '';
  if (!hasDB) {
    var lista = Array.from(rankMemoria.values()).filter(function (r) { return r.temporada === sem; });
    lista.sort(function (a, b) { return b.divisao - a.divisao || b.pm - a.pm; });
    var idx = lista.findIndex(function (r) { return r.cpf === c; });
    return idx < 0 ? null : { posicao: idx + 1, total: lista.length };
  }
  try {
    var r = await pool.query(
      'SELECT posicao, total FROM (SELECT cpf, RANK() OVER (ORDER BY divisao DESC, pm DESC) AS posicao, COUNT(*) OVER () AS total ' +
      'FROM ' + ident(T_RANK) + ' WHERE temporada=$1) x WHERE cpf=$2',
      [sem, c]
    );
    return r.rows[0] || null;
  } catch (e) { console.error('[db] posicaoRank falhou:', e.message); return null; }
}

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
  aplicarResultadoPartida: aplicarResultadoPartida,
  lerRank: lerRank,
  listarRankTemporada: listarRankTemporada,
  listarRankHall: listarRankHall,
  posicaoRank: posicaoRank,
  ping: ping,
  FIXO: FIXO
};
