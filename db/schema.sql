-- ============================================================
-- Última Instância — esquema do banco (Postgres self-hosted)
-- ------------------------------------------------------------
-- Três tabelas: usuarios (login), disciplinas (juízes reais) e
-- partidas (placar). Rode este arquivo uma vez no banco da FMP:
--   psql "$DATABASE_URL" -f db/schema.sql
-- Depois faça a carga das duas primeiras (usuarios e disciplinas).
-- Os nomes de tabela podem ser trocados por variáveis de ambiente
-- (TABELA_USUARIOS, TABELA_DISCIPLINAS, TABELA_PARTIDAS).
-- ============================================================

-- ---- ALUNOS -------------------------------------------------
-- Login = cpf (só números). Senha = data_nascimento.
-- ATENÇÃO: data de nascimento é senha fraca (dado público). Foi a
-- escolha atual para a carga inicial. Para endurecer no futuro,
-- adicione uma coluna senha_hash e troque a verificação no
-- servidor (server/db.js › autenticar) — nada mais muda.
CREATE TABLE IF NOT EXISTS usuarios (
  cpf              TEXT PRIMARY KEY,          -- só números, 11 dígitos (ex.: '01234567890')
  data_nascimento  DATE NOT NULL,             -- a "senha"
  nome             TEXT NOT NULL,
  ra               TEXT,                      -- matrícula (sugerido)
  curso            TEXT,                      -- curso/graduação (sugerido)
  semestre         TEXT,                      -- turma/semestre, ex.: '2026-2' (sugerido)
  ativo            BOOLEAN NOT NULL DEFAULT TRUE
);
-- o login compara ignorando pontuação do CPF; este índice acelera a busca
CREATE INDEX IF NOT EXISTS idx_usuarios_cpf_num
  ON usuarios ((regexp_replace(cpf, '[^0-9]', '', 'g')));

-- ---- DISCIPLINAS → JUÍZES ----------------------------------
-- Cada disciplina vira um julgador, com o professor no lugar do juiz.
-- perfil_julgador define os multiplicadores por tipo de carta:
--   legalista  → Norma ×1,4 · Retórica ×0,7
--   pragmatico → Fato  ×1,4 · Norma   ×0,7
--   humanista  → Retórica ×1,4 · Fato ×0,7
--   metodico   → tudo ×1,0
-- Se ficar em branco, o jogo escolhe um perfil de forma determinística.
CREATE TABLE IF NOT EXISTS disciplinas (
  id                SERIAL PRIMARY KEY,
  nome              TEXT NOT NULL,            -- nome da disciplina (aparece no cabeçalho do caso)
  professor         TEXT NOT NULL,            -- vira o nome do julgador
  area_do_direito   TEXT,                     -- casa o julgador com a matéria do caso (ver abaixo)
  perfil_julgador   TEXT,                     -- legalista | pragmatico | humanista | metodico
  foto_professor_url TEXT,                    -- avatar circular do julgador (URL http(s) ou data URI)
  semestre          TEXT,                     -- filtra por semestre corrente (sugerido)
  ativo             BOOLEAN NOT NULL DEFAULT TRUE
);
-- area_do_direito, quando informada, deve bater com uma destas para casar com os casos:
--   'Direito Civil','Direito do Consumidor','Responsabilidade Civil','Direito Penal',
--   'Direito de Família','Direito do Trabalho','Direito Constitucional'

-- ---- PARTIDAS → PLACAR -------------------------------------
CREATE TABLE IF NOT EXISTS partidas (
  id          BIGSERIAL PRIMARY KEY,
  cpf         TEXT NOT NULL,                  -- do aluno (vem da sessão, não do cliente)
  nome        TEXT NOT NULL,
  semestre    TEXT,
  pontos      INTEGER NOT NULL DEFAULT 0,
  casos       INTEGER NOT NULL DEFAULT 0,     -- casos vencidos (0..8)
  venceu      BOOLEAN NOT NULL DEFAULT FALSE, -- jornada inteira vencida
  modo        TEXT NOT NULL DEFAULT 'livre',  -- 'livre' | 'diario'
  seed        TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partidas_semestre_pontos ON partidas (semestre, pontos DESC);
CREATE INDEX IF NOT EXISTS idx_partidas_pontos ON partidas (pontos DESC);

-- ============================================================
-- Exemplos de carga (apague/adapte conforme a carga real da FMP)
-- ============================================================
-- INSERT INTO usuarios (cpf, data_nascimento, nome, ra, curso, semestre) VALUES
--   ('01234567890', '2003-05-14', 'Ana Prates',   '2023001', 'Direito', '2026-2'),
--   ('09876543210', '2002-11-02', 'Bruno Osório',  '2023002', 'Direito', '2026-2');

-- INSERT INTO disciplinas (nome, professor, area_do_direito, perfil_julgador, semestre) VALUES
--   ('Direito Civil III',       'Dra. Valência de Almeida', 'Direito Civil',          'legalista',  '2026-2'),
--   ('Direito Penal II',        'Dr. Feijó Sarmento',       'Direito Penal',          'pragmatico', '2026-2'),
--   ('Direito Constitucional',  'Dra. Amparo Guterres',     'Direito Constitucional', 'humanista',  '2026-2'),
--   ('Teoria Geral do Processo','Dr. Metódio Klein',        'Responsabilidade Civil', 'metodico',   '2026-2');
