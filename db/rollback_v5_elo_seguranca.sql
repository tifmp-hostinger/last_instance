-- ============================================================
-- Última Instância — rollback da v5 (segurança da Ordem do Mérito)
-- ------------------------------------------------------------
-- OPCIONAL. Só rode isto se precisar reverter especificamente a
-- migração v5 (db/schema.sql). Não apaga usuarios/disciplinas/
-- partidas nem os dados de divisao/pm que já estão em rank_alunos
-- — apenas desfaz a estrutura nova (ledger, função, constraints,
-- colunas novas, índice de dedup). Depois de rodar isto, volte a
-- rodar uma versão anterior do backend (a que usava POST /api/rank
-- com divisao/pm livres) se for mesmo necessário — não é o
-- recomendado, é só a via de escape.
--   psql "$DATABASE_URL" -f db/rollback_v5_elo_seguranca.sql
-- ============================================================

DROP FUNCTION IF EXISTS aplicar_resultado_partida(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, BIGINT);

DROP TABLE IF EXISTS rank_movimentos;

DROP INDEX IF EXISTS uq_partidas_dedup;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_divisao_check') THEN
    ALTER TABLE rank_alunos DROP CONSTRAINT rank_alunos_divisao_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_pm_check') THEN
    ALTER TABLE rank_alunos DROP CONSTRAINT rank_alunos_pm_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_maior_divisao_check') THEN
    ALTER TABLE rank_alunos DROP CONSTRAINT rank_alunos_maior_divisao_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_alunos_contadores_check') THEN
    ALTER TABLE rank_alunos DROP CONSTRAINT rank_alunos_contadores_check;
  END IF;
END $$;

-- as colunas novas ficam por último e comentadas de propósito: elas guardam histórico
-- (vitórias, derrotas, maior divisão já alcançada) que pode valer a pena preservar mesmo
-- num rollback. Descomente linha a linha só se tiver certeza de que quer perder esse dado.
-- ALTER TABLE rank_alunos DROP COLUMN IF EXISTS maior_divisao;
-- ALTER TABLE rank_alunos DROP COLUMN IF EXISTS vitorias;
-- ALTER TABLE rank_alunos DROP COLUMN IF EXISTS derrotas;
-- ALTER TABLE rank_alunos DROP COLUMN IF EXISTS jornadas_concluidas;
-- ALTER TABLE rank_alunos DROP COLUMN IF EXISTS casos_semanais_concluidos;
-- ALTER TABLE rank_alunos DROP COLUMN IF EXISTS criado_em;
