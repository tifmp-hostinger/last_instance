-- ============================================================
-- Última Instância — esquema do banco (Postgres self-hosted)
-- ------------------------------------------------------------
-- usuarios (login), disciplinas (juízes reais), partidas (placar)
-- e a Ordem do Mérito (rank_alunos + rank_movimentos, o ledger de
-- auditoria). Rode este arquivo no banco da FMP:
--   psql "$DATABASE_URL" -f db/schema.sql
-- Depois faça a carga das duas primeiras (usuarios e disciplinas).
-- Os nomes de tabela podem ser trocados por variáveis de ambiente
-- (TABELA_USUARIOS, TABELA_DISCIPLINAS, TABELA_PARTIDAS).
--
-- ESTE ARQUIVO É IDEMPOTENTE: pode ser rodado de novo em um banco
-- que já existe (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS em tudo) sem apagar ou sobrescrever dado nenhum já
-- gravado. É assim que uma instalação existente recebe as tabelas
-- novas da Ordem do Mérito (v5) sem downtime nem migração à parte.
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
  venceu      BOOLEAN NOT NULL DEFAULT FALSE, -- jornada inteira vencida (ou pauta da semana vencida)
  modo        TEXT NOT NULL DEFAULT 'livre',  -- 'semestre' (jornada única) | 'semana' (pauta semanal) | 'livre' | 'diario' (legados)
  seed        TEXT,                           -- na pauta semanal: 'semana-AAAA-SNN' (uma por semana, por aluno)

  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partidas_semestre_pontos ON partidas (semestre, pontos DESC);
CREATE INDEX IF NOT EXISTS idx_partidas_pontos ON partidas (pontos DESC);
-- o placar agrega por aluno (SUM(pontos) GROUP BY cpf): este índice acelera essa agregação
CREATE INDEX IF NOT EXISTS idx_partidas_cpf ON partidas (cpf);

-- ---- ORDEM DO MÉRITO (divisão competitiva por temporada) ----
-- Divisões (0-12): Calouro, Bacharelando III-I, Bacharel, Especialista II-I,
-- Mestre II-I, Doutor II-I, Livre-docente, Catedrático. Temporada = semestre.
CREATE TABLE IF NOT EXISTS rank_alunos (
  cpf          TEXT NOT NULL,
  temporada    TEXT NOT NULL,                 -- ex.: '2026-2'
  nome         TEXT NOT NULL,
  divisao      INTEGER NOT NULL DEFAULT 0,    -- índice 0-12
  pm           INTEGER NOT NULL DEFAULT 0,    -- pontos de mérito 0-99 dentro da divisão
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cpf, temporada)
);
CREATE INDEX IF NOT EXISTS idx_rank_temporada ON rank_alunos (temporada, divisao DESC, pm DESC);

-- ============================================================
-- v5 — segurança da Ordem do Mérito (elo/PM só muda no servidor)
-- ------------------------------------------------------------
-- Problema corrigido: antes desta versão, o cliente calculava a
-- divisão/PM inteiros e o servidor só gravava o que o navegador
-- mandasse (POST /api/rank com {divisao, pm} livres no corpo) —
-- um cliente malicioso podia se autopromover à vontade. A partir
-- de agora:
--   * Postgres é a fonte da verdade. O navegador só faz uma
--     estimativa local (para a UI não travar esperando rede) e o
--     valor que fica valendo é sempre o que o servidor devolve.
--   * A identidade (cpf) sempre vem da sessão autenticada — nunca
--     do corpo da requisição.
--   * Toda mutação de divisao/pm passa por UMA função atômica
--     (aplicar_resultado_partida, abaixo) que recalcula o delta a
--     partir do resultado bruto da partida (venceu/pontos/casos),
--     não a partir de um valor final que o cliente possa inventar.
--   * Cada partida só gera UM movimento de PM (índice único parcial
--     em rank_movimentos.partida_id) — reenvio por retry de rede,
--     duplo clique ou fila offline não pontua duas vezes.
--   * rank_movimentos é o ledger: toda variação de PM fica
--     auditável (motivo, partida relacionada, antes/depois).
-- ============================================================

-- colunas novas em rank_alunos (histórico e agregados; não mexe no que já existe)
ALTER TABLE rank_alunos ADD COLUMN IF NOT EXISTS maior_divisao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rank_alunos ADD COLUMN IF NOT EXISTS vitorias INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rank_alunos ADD COLUMN IF NOT EXISTS derrotas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rank_alunos ADD COLUMN IF NOT EXISTS jornadas_concluidas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rank_alunos ADD COLUMN IF NOT EXISTS casos_semanais_concluidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rank_alunos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();
-- quem já tinha linha antes desta coluna existir: maior_divisao começa igual à divisão atual
UPDATE rank_alunos SET maior_divisao = divisao WHERE maior_divisao = 0 AND divisao > 0;

-- CHECK constraints (Postgres não tem "ADD CONSTRAINT IF NOT EXISTS" — o bloco abaixo
-- confere pg_constraint antes de tentar, então rodar este arquivo de novo é seguro)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_divisao_check') THEN
    ALTER TABLE rank_alunos ADD CONSTRAINT rank_alunos_divisao_check CHECK (divisao BETWEEN 0 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_pm_check') THEN
    ALTER TABLE rank_alunos ADD CONSTRAINT rank_alunos_pm_check CHECK (pm BETWEEN 0 AND 99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_maior_divisao_check') THEN
    ALTER TABLE rank_alunos ADD CONSTRAINT rank_alunos_maior_divisao_check CHECK (maior_divisao BETWEEN 0 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_contadores_check') THEN
    ALTER TABLE rank_alunos ADD CONSTRAINT rank_alunos_contadores_check
      CHECK (vitorias >= 0 AND derrotas >= 0 AND jornadas_concluidas >= 0 AND casos_semanais_concluidos >= 0);
  END IF;
END $$;

-- ---- dedup de partidas: a mesma partida (cpf+modo+seed) não entra duas vezes ----
-- diagnóstico: se esta consulta devolver linhas, existem duplicatas ANTERIORES a esta
-- versão e o índice único abaixo vai falhar — rode-a antes de aplicar em produção:
--   SELECT cpf, modo, seed, COUNT(*) FROM partidas
--     WHERE seed IS NOT NULL AND seed <> '' GROUP BY cpf, modo, seed HAVING COUNT(*) > 1;
-- o bloco abaixo tenta criar o índice e, se achar duplicata, avisa em vez de
-- derrubar o resto do script (o restante do schema continua sendo aplicado). O
-- IF NOT EXISTS é o que faz um segundo "rode de novo" ficar de fato silencioso quando
-- o índice já foi criado com sucesso — sem ele, toda reaplicação do schema.sql
-- reimprimia o mesmo aviso de "já existe ou há duplicata", mesmo já resolvido.
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_partidas_dedup ON partidas (cpf, modo, seed) WHERE seed IS NOT NULL AND seed <> '';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'uq_partidas_dedup: há duplicatas em partidas (cpf,modo,seed) — resolva com a consulta de diagnóstico no comentário acima e rode de novo';
  END;
END $$;

-- ---- ledger: todo movimento de PM, com motivo e a partida relacionada ----
CREATE TABLE IF NOT EXISTS rank_movimentos (
  id              BIGSERIAL PRIMARY KEY,
  cpf             TEXT NOT NULL,
  temporada       TEXT NOT NULL,
  partida_id      BIGINT REFERENCES partidas(id),   -- NULL para movimentos sem partida (ex.: virada de temporada)
  tipo            TEXT NOT NULL,                    -- 'jornada' | 'semana'
  motivo          TEXT NOT NULL,                    -- texto legível p/ auditoria (ex.: "jornada do semestre vencida")
  delta_pm        INTEGER NOT NULL,
  divisao_antes   INTEGER NOT NULL,
  pm_antes        INTEGER NOT NULL,
  divisao_depois  INTEGER NOT NULL,
  pm_depois       INTEGER NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- a mesma partida nunca gera dois movimentos (o gatilho de idempotência do POST /api/partidas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rank_movimentos_partida ON rank_movimentos (partida_id) WHERE partida_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rank_movimentos_cpf ON rank_movimentos (cpf, criado_em DESC);

-- ---- a função: ÚNICO caminho de escrita para divisao/pm ----
-- Recebe o resultado BRUTO da partida (tipo, pontos, casos, venceu) — nunca uma
-- divisão/PM finais vindos do cliente — e recalcula o delta e a promoção/rebaixamento
-- server-side, com a linha travada (FOR UPDATE) contra corrida entre duas partidas
-- concorrentes do mesmo aluno. Espelha exatamente a fórmula de public/index.html
-- (aplicarMerito): divisões protegidas (< 4) não perdem PM; troca de temporada
-- desce 1 divisão incondicionalmente, com pm=0.
CREATE OR REPLACE FUNCTION aplicar_resultado_partida(
  p_cpf TEXT, p_nome TEXT, p_temporada TEXT, p_tipo TEXT,
  p_pontos INTEGER, p_casos INTEGER, p_venceu BOOLEAN, p_partida_id BIGINT
) RETURNS TABLE(divisao INTEGER, pm INTEGER, delta_pm INTEGER, aplicado BOOLEAN) AS $$
DECLARE
  v_div INTEGER; v_pm INTEGER; v_div0 INTEGER; v_pm0 INTEGER;
  v_delta INTEGER; v_maior INTEGER; v_motivo TEXT; v_prev_div INTEGER; v_existe BOOLEAN;
  v_protegidas CONSTANT INTEGER := 4;   -- DIV_PROTEGIDAS no front — abaixo disso, PM nunca cai
  v_max_div CONSTANT INTEGER := 12;     -- DIVISOES.length - 1 no front (13 divisões, índice 0-12)
BEGIN
  IF p_tipo NOT IN ('jornada', 'semana') THEN
    RAISE EXCEPTION 'aplicar_resultado_partida: tipo inválido: %', p_tipo;
  END IF;

  -- primeira aparição do aluno nesta temporada: herda a "virada de temporada" da última
  -- divisão conhecida (divisão-1, pm=0 — sem gate de proteção, igual ao front)
  SELECT EXISTS(SELECT 1 FROM rank_alunos WHERE cpf = p_cpf AND temporada = p_temporada) INTO v_existe;
  IF NOT v_existe THEN
    -- "r." é obrigatório aqui: um "divisao" cru seria ambíguo entre a coluna de
    -- rank_alunos e o parâmetro de saída "divisao" do RETURNS TABLE desta função
    SELECT r.divisao INTO v_prev_div FROM rank_alunos r WHERE r.cpf = p_cpf AND r.temporada <> p_temporada ORDER BY r.atualizado_em DESC LIMIT 1;
    INSERT INTO rank_alunos (cpf, nome, temporada, divisao, pm, maior_divisao)
      VALUES (p_cpf, p_nome, p_temporada, GREATEST(0, COALESCE(v_prev_div, 0) - 1), 0, GREATEST(0, COALESCE(v_prev_div, 0) - 1))
      ON CONFLICT (cpf, temporada) DO NOTHING;
  END IF;

  -- trava a linha ANTES de checar idempotência (não depois): duas chamadas concorrentes
  -- para o mesmo partida_id serializam aqui — a segunda só é destravada depois que a
  -- primeira já commitou, e só então enxerga o movimento da primeira. Checar a
  -- idempotência antes da trava permitiria as duas passarem pela checagem ao mesmo
  -- tempo (nenhum movimento visto ainda), a segunda recalcular e aplicar o delta em
  -- cima do estado já atualizado pela primeira, e só falhar depois — no INSERT do
  -- ledger, com uma violação de índice único sem tratamento, que o servidor então
  -- devolvia ao cliente como se fosse a divisão/PM reais do aluno (zerados).
  SELECT r.divisao, r.pm INTO v_div, v_pm FROM rank_alunos r WHERE r.cpf = p_cpf AND r.temporada = p_temporada FOR UPDATE;

  -- idempotência: esta partida já gerou um movimento? devolve o estado atual sem aplicar de novo
  IF p_partida_id IS NOT NULL AND EXISTS (SELECT 1 FROM rank_movimentos m WHERE m.partida_id = p_partida_id) THEN
    RETURN QUERY SELECT v_div, v_pm, 0, FALSE;
    RETURN;
  END IF;

  v_div0 := v_div; v_pm0 := v_pm;

  IF p_tipo = 'semana' THEN
    IF p_venceu THEN
      v_delta := 14 + LEAST(8, ROUND(COALESCE(p_pontos, 0) / 60.0));
    ELSE
      v_delta := CASE WHEN v_div < v_protegidas THEN 0 ELSE -6 END;
    END IF;
    v_motivo := CASE WHEN p_venceu THEN 'caso da semana vencido' ELSE 'caso da semana perdido' END;
  ELSE
    IF p_venceu THEN
      v_delta := LEAST(80, 60 + ROUND(COALESCE(p_pontos, 0) / 120.0));
    ELSE
      v_delta := LEAST(24, COALESCE(p_casos, 0) * 3);
    END IF;
    v_motivo := CASE WHEN p_venceu THEN 'jornada do semestre vencida' ELSE 'jornada do semestre encerrada' END;
  END IF;

  v_pm := v_pm + v_delta;
  WHILE v_pm >= 100 AND v_div < v_max_div LOOP
    v_pm := v_pm - 100; v_div := v_div + 1;
  END LOOP;
  WHILE v_pm < 0 LOOP
    IF v_div > v_protegidas THEN
      v_div := v_div - 1; v_pm := v_pm + 100;
    ELSE
      v_pm := 0; EXIT;
    END IF;
  END LOOP;
  IF v_pm > 99 THEN v_pm := 99; END IF;

  SELECT GREATEST(maior_divisao, v_div) INTO v_maior FROM rank_alunos WHERE cpf = p_cpf AND temporada = p_temporada;

  UPDATE rank_alunos SET
    nome = p_nome,
    divisao = v_div,
    pm = v_pm,
    maior_divisao = v_maior,
    vitorias = vitorias + CASE WHEN p_venceu THEN 1 ELSE 0 END,
    derrotas = derrotas + CASE WHEN NOT p_venceu THEN 1 ELSE 0 END,
    jornadas_concluidas = jornadas_concluidas + CASE WHEN p_tipo = 'jornada' THEN 1 ELSE 0 END,
    casos_semanais_concluidos = casos_semanais_concluidos + CASE WHEN p_tipo = 'semana' THEN 1 ELSE 0 END,
    atualizado_em = now()
  WHERE cpf = p_cpf AND temporada = p_temporada;

  INSERT INTO rank_movimentos (cpf, temporada, partida_id, tipo, motivo, delta_pm, divisao_antes, pm_antes, divisao_depois, pm_depois)
    VALUES (p_cpf, p_temporada, p_partida_id, p_tipo, v_motivo, v_delta, v_div0, v_pm0, v_div, v_pm);

  RETURN QUERY SELECT v_div, v_pm, v_delta, TRUE;
END;
$$ LANGUAGE plpgsql;

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

-- ============================================================
-- Consultas de ranking (o backend usa as mesmas, parametrizadas,
-- em server/db.js — reproduzidas aqui cruas para referência/uso
-- direto via psql se a TI quiser conferir algo manualmente)
-- ============================================================

-- ranking da temporada corrente (Ordem do Mérito, por divisão e PM)
-- SELECT cpf, nome, divisao, pm, maior_divisao, vitorias, derrotas,
--        jornadas_concluidas, casos_semanais_concluidos,
--        RANK() OVER (ORDER BY divisao DESC, pm DESC) AS posicao
--   FROM rank_alunos WHERE temporada = '2026-2'
--   ORDER BY divisao DESC, pm DESC LIMIT 50;

-- ranking histórico (hall da Ordem do Mérito — maior divisão já alcançada, todas as temporadas)
-- SELECT cpf, MAX(nome) AS nome, MAX(maior_divisao) AS maior_divisao,
--        SUM(vitorias) AS vitorias, SUM(derrotas) AS derrotas
--   FROM rank_alunos GROUP BY cpf
--   ORDER BY maior_divisao DESC, vitorias DESC LIMIT 50;

-- posição individual do aluno na temporada corrente
-- SELECT posicao, total FROM (
--   SELECT cpf, RANK() OVER (ORDER BY divisao DESC, pm DESC) AS posicao,
--          COUNT(*) OVER () AS total
--   FROM rank_alunos WHERE temporada = '2026-2'
-- ) x WHERE cpf = '01234567890';

-- ============================================================
-- Consultas de validação pós-instalação (rode depois de aplicar
-- este arquivo para conferir que a migração v5 pegou)
-- ============================================================

-- 1) as colunas novas existem?
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'rank_alunos'
--   AND column_name IN ('maior_divisao','vitorias','derrotas','jornadas_concluidas','casos_semanais_concluidos','criado_em');

-- 2) a função atômica existe?
-- SELECT proname FROM pg_proc WHERE proname = 'aplicar_resultado_partida';

-- 3) o ledger existe e está vazio (instalação nova) ou crescendo (instalação existente)?
-- SELECT COUNT(*) FROM rank_movimentos;

-- 4) nenhuma partida com mais de um movimento de PM associado (idempotência intacta)?
--    deve devolver ZERO linhas — se devolver alguma, o índice único falhou silenciosamente
-- SELECT partida_id, COUNT(*) FROM rank_movimentos WHERE partida_id IS NOT NULL GROUP BY partida_id HAVING COUNT(*) > 1;

-- 5) toda divisão/pm dentro dos limites (as CHECK constraints pegam isso na escrita,
--    esta consulta é só para auditar dado que já existisse antes das constraints)?
--    deve devolver ZERO linhas
-- SELECT cpf, temporada, divisao, pm FROM rank_alunos WHERE divisao NOT BETWEEN 0 AND 12 OR pm NOT BETWEEN 0 AND 99;

-- 6) o índice de dedup de partidas pegou? (se a instalação tinha duplicatas antigas,
--    o índice não foi criado — reconfira com a consulta de diagnóstico logo acima do
--    bloco "dedup de partidas" neste arquivo)
-- SELECT indexname FROM pg_indexes WHERE indexname = 'uq_partidas_dedup';

-- 7) teste funcional isolado (roda a função, confere o resultado, DESFAZ com ROLLBACK —
--    não deixa rastro nenhum, seguro para rodar em produção)
-- BEGIN;
--   SELECT * FROM aplicar_resultado_partida('00000000000', 'Teste de validação', '2026-2', 'jornada', 480, 8, true, NULL);
--   -- espera-se: divisao/pm avançando a partir do estado atual desse cpf/temporada, delta_pm = 80, aplicado = true
-- ROLLBACK;
