-- ============================================================
-- Migração v6 — Jornada sem eliminação (pontuação total conta)
-- ============================================================
-- O QUE MUDA: a jornada do semestre não elimina mais o aluno ao perder um caso.
-- Ele joga os 8 casos (ganhando ou perdendo cada um) e o que conta é a pontuação
-- total. Por isso a fórmula de Pontos de Mérito (PM) da jornada muda: em vez de
-- "vitória +60..80 / derrota +3 por caso", passa a escalar com quantos casos
-- foram vencidos (0..8) mais um pequeno bônus de qualidade. Nunca pune.
--
-- SEGURO RODAR: só substitui a função aplicar_resultado_partida (CREATE OR
-- REPLACE). Não altera tabelas nem apaga dados. Idempotente — pode rodar de novo.
-- Não é preciso mexer em usuarios/disciplinas/partidas/rank_alunos.
--
-- COMO APLICAR (uma vez, no seu Postgres de produção):
--   psql "$DATABASE_URL" -f db/migration_v6_jornada_sem_eliminacao.sql
-- (ou cole o conteúdo abaixo no console SQL do seu painel.)
--
-- Nada mais precisa mudar no banco para a v6. O gate da jornada (tutorial +
-- 1 caso da semana) e a tela sem eliminação são só no aplicativo.
-- ============================================================

CREATE OR REPLACE FUNCTION aplicar_resultado_partida(
  p_cpf TEXT, p_nome TEXT, p_temporada TEXT, p_tipo TEXT,
  p_pontos INTEGER, p_casos INTEGER, p_venceu BOOLEAN, p_partida_id BIGINT
) RETURNS TABLE(divisao INTEGER, pm INTEGER, delta_pm INTEGER, aplicado BOOLEAN) AS $$
DECLARE
  v_div INTEGER; v_pm INTEGER; v_div0 INTEGER; v_pm0 INTEGER;
  v_delta INTEGER; v_maior INTEGER; v_motivo TEXT; v_prev_div INTEGER; v_existe BOOLEAN;
  v_protegidas CONSTANT INTEGER := 4;   -- divisões de entrada: abaixo disso, PM nunca cai
  v_max_div CONSTANT INTEGER := 12;     -- 13 divisões, índice 0-12
BEGIN
  IF p_tipo NOT IN ('jornada', 'semana') THEN
    RAISE EXCEPTION 'aplicar_resultado_partida: tipo inválido: %', p_tipo;
  END IF;

  SELECT EXISTS(SELECT 1 FROM rank_alunos WHERE cpf = p_cpf AND temporada = p_temporada) INTO v_existe;
  IF NOT v_existe THEN
    SELECT r.divisao INTO v_prev_div FROM rank_alunos r WHERE r.cpf = p_cpf AND r.temporada <> p_temporada ORDER BY r.atualizado_em DESC LIMIT 1;
    INSERT INTO rank_alunos (cpf, nome, temporada, divisao, pm, maior_divisao)
      VALUES (p_cpf, p_nome, p_temporada, GREATEST(0, COALESCE(v_prev_div, 0) - 1), 0, GREATEST(0, COALESCE(v_prev_div, 0) - 1))
      ON CONFLICT (cpf, temporada) DO NOTHING;
  END IF;

  -- trava a linha ANTES de checar idempotência (serializa partidas concorrentes do mesmo aluno)
  SELECT r.divisao, r.pm INTO v_div, v_pm FROM rank_alunos r WHERE r.cpf = p_cpf AND r.temporada = p_temporada FOR UPDATE;

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
    -- v6: a jornada não elimina. O PM escala com quantos dos 8 casos foram vencidos
    -- (a "nota do semestre") + pequeno bônus de qualidade pela pontuação. Nunca pune:
    -- 0 casos = 0 PM; 8/8 = +80 (o topo). p_venceu = "venceu TODOS os 8" (impecável).
    v_delta := LEAST(80, ROUND(COALESCE(p_casos, 0) / 8.0 * 72) + LEAST(8, ROUND(COALESCE(p_pontos, 0) / 200.0)));
    v_motivo := 'jornada do semestre concluída (' || COALESCE(p_casos, 0) || ' de 8 casos)';
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

-- Validação rápida (opcional): uma jornada com 6 de 8 casos e 1500 pontos deve dar delta ~ +62.
--   SELECT * FROM aplicar_resultado_partida('00000000000','Teste','2026-2','jornada', 1500, 6, false, NULL);
--   -- delta_pm esperado: ROUND(6/8*72)=54  +  LEAST(8, ROUND(1500/200))=8  =  62
