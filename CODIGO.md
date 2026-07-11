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

- **Rotas** (`index.js`): `POST /api/login` `{cpf, nascimento}`, `POST /api/logout`, `GET /api/session` (perfil + modo banco/mock), `GET /api/disciplinas` (auth), `GET /api/placar?aba=&sem=` (auth), `POST /api/partidas` (auth; a identidade vem da sessão, nunca do corpo), `GET|POST /api/rank` (Ordem do Mérito), `GET /api/saude`. Há um limitador simples de tentativas de login por IP.
- **Dados** (`db.js`): a conexão sai de `DATABASE_URL` ou `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`. Sem nada disso, `hasDB=false` e todas as funções caem no mock. `autenticar()` compara CPF (só números) e `data_nascimento`. **É o único ponto de verificação de senha** — para trocar por hash no futuro, mexe-se só aqui. Nomes de tabela vêm de env (`TABELA_*`) e passam por um validador de identificador (anti-injeção).
- **Sessão** (`auth.js`): JWT assinado por `SESSION_SECRET`/`JWT_SECRET` (ou efêmero em dev), cookie httpOnly `ui_sessao`, `secure` quando `NODE_ENV=production`.

## Estado global do jogo (JS)

| Variável | Papel |
|---|---|
| `CONFIG` | versão, semestre, `API_BASE` (`/api`), `PORTAL_URL`. |
| `SERVIDOR` | `{online, modo, autenticado}` — preenchido por `GET /api/session` no boot. `online:false` = modo local (arquivo estático). |
| `S` | a jornada (run): deck, relíquias, caso atual (0-7), pontos, embargos, modo diário, bônus inicial, fase. |
| `B` | a batalha: convicção `p`, **`fase`** (instrução/sustentação/deliberação), **`cred`** (credibilidade 0-10), **`prep`** (preparo 0-5), **`linha`** (bandeja fundamento/prova/arremate), **`tese`/`teseProxima`** (com `chave` e `direta`), `ensaiadas`, `missao`, `stats` (para a pontuação), statuses (`quest/questTipo`, `dobra`, `negate`, `viradaProva`, `acordo*`), julgador, oponente, `vogaIdx`, flag `demo`. |
| `PERFIL` | identidade do aluno: `{nome, ra, sem, cpf}` — vem da sessão (banco) ou do formulário (local). |
| `JUIZES_COMUNS` | ids dos julgadores em rotação. Recebe os **juízes reais** (disciplinas do banco) quando há sessão; senão, os fictícios de `JUIZES_FALLBACK`. |

Chaves de `localStorage`: `ui_fmp_run` (save), `ui_fmp_placar` (top 10 local), `ui_perfil`, `ui_fila` (partidas aguardando API), `ui_demo_vista`, `ui_mudo`, `ui_tema`, `ui_vibra`.

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

Dificuldade → `OPONENTES` → harness. Nova tese → linha em `TESES` (+ tema em `CARTA_TEMAS` se faltar cobertura) → harness. Nova carta → linha em `CARTAS` (com `fala`, `disc` e temas em `CARTA_TEMAS`) → harness. Foto de professor → coluna `foto_professor_url` na tabela `disciplinas`. Novo semestre → env `SEMESTRE`. Ligar banco → `DATABASE_URL`/`PG*` (ver `.env.example`) e rodar `db/schema.sql`.
