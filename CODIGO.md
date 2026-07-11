# Última Instância — documentação técnica do código

A partir da v3 o projeto tem **duas metades**: o jogo (frontend estático, um só `public/index.html`) e um **backend Node/Express** (`server/`) que serve o jogo, autentica o aluno e guarda o placar no Postgres. Sem banco, o backend roda em **modo mock** (jogável e testável). O jogo também funciona como arquivo estático solto — nesse caso entra em **modo local** (sem login, placar só no aparelho).

## Estrutura

| Caminho | Papel |
|---|---|
| `public/index.html` | o jogo inteiro: CSS + telas + lógica (zero dependências no cliente) |
| `public/assets/` | símbolo FMP (estrela de 4 pontas) vetorizado nas cores da paleta |
| `server/index.js` | Express: rotas da API + estático + fallback de rota |
| `server/db.js` | camada de dados (pg Pool por env) com fallback/mock; autenticação, disciplinas, partidas |
| `server/auth.js` | sessão via JWT em cookie httpOnly |
| `db/schema.sql` | as quatro tabelas (usuarios, disciplinas, partidas, rank_alunos) |
| `outputs/harness.js` | simulador sem navegador (três bots) para regressão e calibragem |
| `Dockerfile` · `.env.example` | imagem Node e variáveis de ambiente |

## Backend (`server/`)

- **Rotas** (`index.js`): `POST /api/login` `{cpf, nascimento}`, `POST /api/logout`, `GET /api/session` (perfil + modo banco/mock), `GET /api/disciplinas` (auth), `GET /api/placar?aba=&sem=` (auth), `POST /api/partidas` (auth; a identidade vem da sessão, nunca do corpo; `modo` ∈ semestre/semana/livre/diario), `GET /api/progresso?semana=` (auth; jornada do semestre feita + pauta da semana sustentada — a memória entre aparelhos, lida da própria tabela de partidas), `GET|POST /api/rank` (Ordem do Mérito), `GET /api/saude`. Há um limitador simples de tentativas de login por IP.
- **Disciplinas → julgadores, o filtro de semestre**: `GET /api/disciplinas` busca `req.usuario.semestre` (o campo `semestre` do próprio aluno logado, na tabela `usuarios`) e, se vazio, cai na env `SEMESTRE`. `db.listarDisciplinas()` só devolve uma disciplina se `disciplinas.semestre` for `NULL` **ou** bater com esse valor — comparação tolerante a espaço/maiúscula (`lower(trim(...))`) desde a v4.2, mas ainda exige a mesma string (`"2026-2"` ≠ `"2026/2"`). Se a lista vier vazia, o jogo cai nos juízes fictícios (`JUIZES_FALLBACK`) sem avisar — é o sintoma mais comum de "professores não aparecem". Diagnóstico: `SELECT nome, semestre, ativo FROM disciplinas;` e `SELECT semestre FROM usuarios WHERE cpf='...';` — confirme que os valores batem, ou deixe `disciplinas.semestre` em `NULL` (mais simples: sempre aparece, independente do campo do aluno).
- **Dados** (`db.js`): a conexão sai de `DATABASE_URL` ou `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`. Sem nada disso, `hasDB=false` e todas as funções caem no mock. `autenticar()` compara CPF (só números) e `data_nascimento`. **É o único ponto de verificação de senha** — para trocar por hash no futuro, mexe-se só aqui. Nomes de tabela vêm de env (`TABELA_*`) e passam por um validador de identificador (anti-injeção).
- **Sessão** (`auth.js`): JWT assinado por `SESSION_SECRET`/`JWT_SECRET` (ou efêmero em dev), cookie httpOnly `ui_sessao`, `secure` quando `NODE_ENV=production`.

## Estado global do jogo (JS)

| Variável | Papel |
|---|---|
| `CONFIG` | versão, semestre, `API_BASE` (`/api`), `PORTAL_URL`. |
| `SERVIDOR` | `{online, modo, autenticado}` — preenchido por `GET /api/session` no boot. `online:false` = modo local (arquivo estático). |
| `S` | a run: deck, relíquias, caso atual (0-7), pontos, embargos, bônus inicial, fase e **`modo`** — `semestre` (a jornada única do semestre), `semana` (um caso só, seed da semana ISO, sem embargos, julgadores fictícios para todos) ou `livre`/`diario` (legados; o harness usa `livre`). |
| `B` | a batalha: convicção `p`, **`fase`** (instrução/sustentação/deliberação), **`cred`** (credibilidade 0-10), **`prep`** (preparo 0-5), **`linha`** (bandeja fundamento/prova/arremate), **`tese`/`teseProxima`** (com `chave` e `direta`), `ensaiadas`, `missao`, `stats` (para a pontuação), statuses (`quest/questTipo`, `dobra`, `negate`, `viradaProva`, `acordo*`), julgador, oponente, `vogaIdx`, flag `demo`. |
| `PERFIL` | identidade do aluno: `{nome, ra, sem, cpf}` — vem da sessão (banco) ou do formulário (local). |
| `JUIZES_COMUNS` | ids dos julgadores em rotação. Recebe os **juízes reais** (disciplinas do banco) quando há sessão; senão, os fictícios de `JUIZES_FALLBACK`. |

Chaves de `localStorage`: `ui_fmp_run` (save), `ui_fmp_placar` (top 10 local), `ui_perfil`, `ui_fila` (partidas aguardando API), `ui_merito` (divisão + PM), **`ui_jornada`** (a jornada única do semestre: fim/venceu/detalhe, por aluno+temporada), **`ui_semana`** (a pauta sustentada: por aluno+chave `AAAA-SNN`), `ui_demo_vista`, `ui_mudo`, `ui_tema`, `ui_vibra`. No login, `sincronizarProgresso()` funde o estado local com `GET /api/progresso` e `GET /api/rank` (anti troca de aparelho).

## Modos e telas novas (v4.1)

- **Jornada do semestre** (`novaJornada('semestre')`): única por aluno/temporada — o gate fica na antessala `#scr-jornada` (`mostrarJornada`), que desenha a capa dos autos + trajetória dos 8 casos e só oferece “Abrir os autos” quando não há registro em `ui_jornada`. `encerrarJornadaVitoria/Derrota` chamam `marcarJornadaFim`; “Arquivar a jornada” no menu de batalha = derrota definitiva.
- **Caso da semana** (`novaJornada('semana')`): `infoSemana()` deriva da semana ISO a chave, o índice no `SEMANA_CICLO` (0-5) e a seed; `reforcosSemana()` soma 2-4 cartas seeded ao deck inicial; `sortearCaso` usa `JUIZES_FALLBACK` (a mesma mesa para todos). `finalizarCaso` desvia para `finalizarSemana` (sentença própria, `aplicarMerito('semana',…)`, `marcarSemana`, partida `modo:'semana'` com `seed:'semana-AAAA-SNN'`). Antessala `#scr-semana` (`mostrarSemana`) — o edital com prazo até domingo. Um save de `semana` de outra chave é descartado por `runSalvo()`.
- **Ordem do Mérito** (`#scr-merito`, `mostrarMerito`): emblema atual + barra de PM + escada das 13 divisões (`emblemaSVG(div)` desenha os glifos; `DIV_GRUPOS`/`grupoDe` rotulam os grupos). Economia em `aplicarMerito(tipo, venceu, pontos, casos)`.
- **HUD mobile** (`#hudMini` + `pintarHUD`/`mostrarDelta`/`hudPreparar`): IntersectionObserver na `.painel-balanca`; quando ela sai do viewport em batalha, o HUD fixa no topo e cada variação da balança vira um `.delta-chip` flutuante. Só aparece <900 px.
- **Boas-vindas (o "elo" no login, v4.2)** — `mostrarBoasVindas()`, chamada ao fim de `entrarNoJogo()` (todo boot autenticado/local com `PERFIL.nome` preenchido): chip `#boasVindas` com o emblema SVG da divisão atual (`emblemaSVG`/`emblemaClasse`, reaproveitados da tela de Mérito) + nome + `DIVISOES[div] · PM`. Entra deslizando com glow (`.bvGlow`), some sozinho em ~4,2 s. Nomes >26 caracteres recebem a classe `.nome-longo` (fonte menor).

## Placar — um ranking por aluno, não por partida (v4.2)

Decisão de produto: a aba **"Semestre"** soma **jornada do semestre + todas as pautas semanais** sustentadas na temporada, um único número por aluno (não dois rankings separados — a Ordem do Mérito já cobre a progressão por divisão à parte; dois placares de pontos brutos seria redundante). A aba **"Hall de campeões"** faz a mesma soma, só que **para sempre**, todas as temporadas.

`server/db.js › listarPlacar(aba, semestre)` faz `SELECT ... SUM(pontos) ... GROUP BY cpf` (com `WHERE semestre=$1` só na aba `semestre`) e monta o texto de cada linha (`mapPublicoAgregado`) a partir de colunas agregadas (`jornada_venceu`, `semanas_venceu`/`semanas_jogadas`, `semestres`). O modo mock replica a mesma agregação em memória (`agregarPorAluno`). Índice `idx_partidas_cpf` acelera o `GROUP BY` em bancos grandes.

## Núcleo didático: tese e réplica (onde editar)

- **`TESES`** — array de `{tema, texto, chave, direta, porque}`: o que a parte adversa afirma, a palavra-chave sublinhada, as cartas de réplica direta e a chave didática. Adicionar tese = uma linha.
- **`AREA_TEMAS`** — área do caso → temas de tese prováveis (o resto entra como surpresa, forçando adaptação).
- **`CARTA_TEMAS`** — os temas que cada carta argumentativa refuta (`'*'` = versátil; carta ausente do mapa = Técnica procedimental, sem juízo de pertinência). O pós-processamento anexa `temas` a cada carta.
- **`REPLICA_BONUS`** (+6), **`DIRETA_BONUS`** (+3), **`LATERAL_FATOR`** (×0,40) e **`LATERAL_FATOR_REINCIDENTE`** (×0,25) — os botões da força da mecânica; **`FECHO_LINHA`** (+8) paga a linha na ordem. Credibilidade, preparo, fases, virada, missões e acordo vivem nas funções `jogarCarta`/`iniciarRodada`/`entrarDeliberacao`/`aplicarVirada`/`gastarPreparo`/`oferecerAcordo`.
- `cartaPertinente(carta, tese)` devolve `true` (réplica), `false` (lateral) ou `null` (procedimental). `computarDano` aplica a pertinência **entre o combo e o multiplicador do julgador** (ver GAME-DESIGN, fórmula de dano). `sortearTese` é chamada no início de cada rodada.

## Demais conteúdos (onde editar)

- **Cartas**: `CARTAS` — nome, tipo (`N/F/R/T`), custo, base, raridade, `texto`, `fala`, `disc`, `combo`, `fx`. A carta na mesa mostra a **força-base**; o valor real o aluno calcula.
- **Julgadores fictícios**: `JUIZES` (fallback). Perfis e multiplicadores em `MULT_PERFIL`. Julgador real = disciplina do banco → `carregarDisciplinas()` monta um julgador por disciplina (professor no nome, perfil→multiplicadores, foto no avatar) e substitui `JUIZES_COMUNS`.
- **Oponentes**: `OPONENTES` — lista `moves` cíclica; **os números aqui são o principal botão de dificuldade**.
- **Jornada**: `JORNADA` (8 entradas, flags `boss/dark/plenario`). **Casos**: `SOBRENOMES`, `EMPRESAS`, `ACOES`, `TEMAS_STF`. **Relíquias**: `RELIQUIAS`.

## Fluxo de boot e sessão

`boot()` → `iniciarSessao()` faz `GET /api/session`. Se o backend responde: modo servidor (login exigido; disciplinas e placar vêm da API). Se a requisição falha (arquivo estático): modo local, sem login. `fazerLogin()` posta ao `/api/login`, `carregarDisciplinas()` monta os juízes reais, `entrarNoJogo()` abre o título. Máscara de CPF em `mascaraCPF()`.

## Subsistemas (inalterados da base)

Balança SVG (`setBalanca`/`loopFX`), FX de partículas (estrela FMP em `estrela4`, teto de 700, DPR≤2), áudio WebAudio puro (`som.*`), demo guiada (`verDemo`/`pararDemo`, com tese própria e guarda em `finalizarCaso`), tema claro/escuro (`setTema`, STF em escuro), liquid glass e fundos vivos. Todo dado externo (nome do aluno, resposta da API, título de caso) passa por `esc()` antes de ir a `innerHTML`.

## Testes e calibragem

`outputs/harness.js` roda o jogo inteiro sem navegador (stub de DOM, timers síncronos, três bots). Uso: `node outputs/harness.js public/index.html 150 [naive|aprendiz|smart|todos]`. O **aleatório** joga ao acaso (não lê nada); o **aprendiz** lê só a pertinência da tese; o **tático** lê tudo — tese, palavra-chave, julgador, linha na ordem, credibilidade, preparo e acordo.

Estado da calibragem v4 (n=150, três bots): **aleatório 20%** de jornadas (71% dos casos; embargos em 93% das jornadas), **aprendiz 53%** (lê só a pertinência), **tático 83%** (teto: lê tese, chave, julgador, linha, credibilidade, preparo e acordo). O degrau de ~30 p.p. entre cada bot é a medida de expressão de habilidade. Qualquer mudança em `CARTAS`, `TESES`, constantes de pertinência/credibilidade ou `OPONENTES` pede nova rodada do harness.

## Checklist para mudanças comuns

Dificuldade → `OPONENTES` → harness. Nova tese → linha em `TESES` (+ tema em `CARTA_TEMAS` se faltar cobertura) → harness. Nova carta → linha em `CARTAS` (com `fala`, `disc` e temas em `CARTA_TEMAS`) → harness. Foto de professor → coluna `foto_professor_url` na tabela `disciplinas`. Novo semestre → env `SEMESTRE` **e** confira que `disciplinas.semestre`/`usuarios.semestre` batem com o novo valor (ou deixe ambos em `NULL`). Ligar banco → `DATABASE_URL`/`PG*` (ver `.env.example`) e rodar `db/schema.sql`. Banco já existente (schema aplicado antes da v4.2) → rodar à parte: `CREATE INDEX IF NOT EXISTS idx_partidas_cpf ON partidas (cpf);` (acelera o placar agregado).
