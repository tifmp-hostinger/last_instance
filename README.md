# Última Instância

O jogo de cartas da FMP — Fundação Escola Superior do Ministério Público. O aluno é a defesa em uma jornada de 8 casos fictícios, do Foro Central de Porto Alegre ao STF, empurrando a **balança da convicção** com argumentos jurídicos reais.

A cada rodada a parte adversa **protocola uma tese** (com a palavra-chave sublinhada) e o aluno joga o **argumento que a refuta** — não a carta de maior número; a carta que também responde à palavra-chave ganha uma marca própria, visível antes de jogar. Errar o tema custa **credibilidade**; com ela zerada, o juiz indefere de plano — com banner e som, como qualquer outra virada de mesa. O caso segue o rito (instrução → sustentação → deliberação), com linha argumentativa, preparo, viradas e acordo dramatizados como a sentença que são, e sete missões possíveis por caso. É um roguelike de deck-building com o Direito como matéria-prima — rápido de entender, difícil de dominar (calibrado por simulação com quatro arquétipos de leitura, do cego ao atento, mais um diagnóstico anti-exploit: nenhuma estratégia de "quebrar o sistema" supera a leitura honesta).

Dois modos, cada um com a sua tela: a **Jornada do semestre** (uma por aluno — os 8 casos, jogados todos: ganha-se ou perde-se cada um e **a pontuação total é o que conta**, sem eliminação; antessala em forma de autos com a trajetória caso a caso) e o **Caso da semana** (uma sustentação por semana, a mesma pauta seeded para toda a FMP, antessala em forma de edital com prazo até domingo). A jornada abre depois que o aluno **vê o tutorial** e **sustenta ao menos um caso da semana** — a introdução à tribuna antes da campanha inteira. A progressão competitiva é a **Ordem do Mérito** (de Calouro a Catedrático, com a escada e os emblemas das 13 divisões em tela própria), por semestre letivo. O design completo está em `GAME-DESIGN.md` e o racional do redesign em `REDESIGN.md`.

## Arquitetura

- **Frontend**: um único `public/index.html`, sem dependências (fontes via Google Fonts).
- **Backend**: `server/` em Node/Express — serve o jogo e a API, autentica o aluno e guarda o placar no **Postgres self-hosted**. Sem banco configurado, sobe em **modo mock** (jogável e testável). O jogo também roda como arquivo estático solto, em **modo local** (sem login, placar só no aparelho).

## Como rodar

```bash
npm install
npm start            # http://localhost:3000  (modo mock, sem banco)
```

Em modo mock, entre com **CPF `000.000.000-00`** e **nascimento `01/01/2000`**.

Com Postgres, configure as variáveis de ambiente (abaixo) e rode o schema uma vez:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Login

- **Usuário = CPF** (só números, com máscara de digitação `000.000.000-00`).
- **Senha = data de nascimento.**
- O login apenas confere contra a tabela `usuarios`. A FMP faz a carga dessa tabela (e da `disciplinas`) — ver `db/schema.sql`.

> **Nota de segurança.** Senha = data de nascimento é autenticação fraca (dado público e adivinhável). Foi a escolha do produto para a carga inicial. O ponto de verificação está isolado em `server/db.js › autenticar` — para endurecer, basta adicionar uma coluna `senha_hash` e trocar a comparação por um hash (bcrypt/argon2), sem tocar no resto.

## Variáveis de ambiente

Copie `.env.example` para `.env` (ou configure no EasyPanel). Principais:

| Variável | Para quê |
|---|---|
| `PORT` | porta do servidor (padrão 3000) |
| `SEMESTRE` | rótulo do semestre no ranking |
| `SESSION_SECRET` | segredo que assina a sessão — **gere um aleatório em produção** |
| `NODE_ENV=production` | faz o cookie de sessão sair como `Secure` (atrás de HTTPS) |
| `DATABASE_URL` | conexão Postgres (ou use `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`) |
| `PGSSL` | `require` liga TLS no Postgres; vazio = desligado |
| `TABELA_USUARIOS` / `TABELA_DISCIPLINAS` / `TABELA_PARTIDAS` | só se os nomes forem diferentes do padrão |
| `DEMO_CPF` / `DEMO_NASCIMENTO` | credencial de demonstração (só no modo mock) |

## Banco de dados

`db/schema.sql` (idempotente — pode ser rodado de novo num banco existente, `IF NOT
EXISTS` em tudo) cria:

- **`usuarios`** — `cpf`, `data_nascimento`, `nome` (+ `ra`, `curso`, `semestre`, `ativo`). Login.
- **`disciplinas`** — `nome`, `professor` (+ `area_do_direito`, `perfil_julgador`, `foto_professor_url`, `semestre`). Cada disciplina vira um **julgador real**, com o professor no lugar do juiz e a foto no avatar, casado com a área do caso.
- **`partidas`** — o placar persistido e também a **memória de progresso**: `modo` distingue `semestre` (a jornada única) de `semana` (a pauta semanal, com `seed` `semana-AAAA-SNN`) — é dela que `GET /api/progresso` deduz o que o aluno já jogou, em qualquer aparelho. As abas **Semestre** e **Hall de campeões** do placar somam `pontos` por aluno (`GROUP BY cpf`), não por partida — jornada + todas as pautas semanais juntas. Um índice único em `(cpf, modo, seed)` impede que a mesma partida seja gravada duas vezes (reenvio por retry de rede, fila offline, duplo clique).
- **`rank_alunos`** — a Ordem do Mérito (divisão competitiva, PM, maior divisão já alcançada, vitórias/derrotas, jornadas e casos semanais concluídos — por temporada/semestre).
- **`rank_movimentos`** — o ledger de auditoria: toda variação de PM, com motivo e a partida relacionada.

> **Segurança da Ordem do Mérito.** O Postgres é a fonte da verdade: divisão/PM só
> mudam dentro da função `aplicar_resultado_partida` (server-side, chamada por
> `POST /api/partidas`), que recalcula o delta a partir do resultado bruto da
> partida — nunca a partir de um valor final vindo do cliente. Não existe mais
> `POST /api/rank`. Cada partida só gera um movimento de PM (idempotência por
> `partida_id`), então reenvio de rede ou fila offline não pontua duas vezes.
> Detalhes e consultas de validação estão comentados em `db/schema.sql`; para
> reverter só a parte nova, `db/rollback_v5_elo_seguranca.sql`.
>
> **Atualização v6 (jornada sem eliminação).** A jornada deixou de eliminar o
> aluno ao perder um caso: joga-se os 8 e a pontuação total é o que conta. Isso
> muda só a fórmula de PM da jornada — aplique `db/migration_v6_jornada_sem_eliminacao.sql`
> (um `CREATE OR REPLACE` da função, sem tocar em tabelas nem dados):
> `psql "$DATABASE_URL" -f db/migration_v6_jornada_sem_eliminacao.sql`

> **Professores não aparecem no jogo (caem nos juízes fictícios)?** É quase sempre o filtro de semestre: `disciplinas.semestre`, se preenchido, precisa bater com o `semestre` do aluno em `usuarios` (ou ficar `NULL`, que vale para qualquer aluno). Confira com `SELECT nome, semestre, ativo FROM disciplinas;` — o mais simples é deixar `semestre` em branco na `disciplinas` enquanto não houver disciplinas de mais de um período cadastradas ao mesmo tempo.

## Início e virada de semestre (runbook)

Passo a passo para a TI da FMP operar o jogo numa turma real.

**1. Criar o esquema** (idempotente — pode rodar de novo sem apagar nada):

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

**2. Carregar alunos e disciplinas.** Há dois modelos de planilha prontos em `db/` — exporte a lista da secretaria no mesmo formato de colunas e carregue com `\copy`:

```bash
# alunos (colunas: cpf,data_nascimento,nome,ra,curso,semestre,admin)
psql "$DATABASE_URL" -c "\copy usuarios(cpf,data_nascimento,nome,ra,curso,semestre,admin) FROM 'db/exemplo_alunos.csv' WITH (FORMAT csv, HEADER true)"

# disciplinas → julgadores (colunas: nome,professor,area_do_direito,perfil_julgador,foto_professor_url,semestre)
psql "$DATABASE_URL" -c "\copy disciplinas(nome,professor,area_do_direito,perfil_julgador,foto_professor_url,semestre) FROM 'db/exemplo_disciplinas.csv' WITH (FORMAT csv, HEADER true)"
```

- `cpf`: só números, 11 dígitos. `data_nascimento`: `AAAA-MM-DD` (é a “senha”). `admin`: `true` só para a coordenação (ver passo 4).
- `disciplinas.area_do_direito` deve bater com uma das áreas dos casos (`Direito Civil`, `Direito Penal`, `Direito Constitucional`, `Direito do Trabalho`, `Direito de Família`, `Direito do Consumidor`, `Responsabilidade Civil`) para casar o julgador com o caso; `perfil_julgador` ∈ `legalista | pragmatico | humanista | metodico`.
- Sem a carga, **ninguém loga** (só o usuário fixo do env, se configurado). Confira: `SELECT count(*) FROM usuarios;`

**3. Definir a temporada.** O ranking corrente é a variável de ambiente `SEMESTRE` (ex.: `2026-2`) — a fonte única. Ela precisa bater com o `semestre` das disciplinas do período.

**4. Acesso da coordenação (ver e exportar o top-10).** O professor entra como um aluno qualquer, mas com `admin = true` na `usuarios` (ou, sem banco, com `USUARIO_FIXO_ADMIN=true`). Aí aparece no título o botão **“Ranking da turma”**, que lista o ranking por pontos **com nome + RA** e um link **Baixar planilha (CSV)** — para premiar os melhores. O ranking dos alunos nunca expõe CPF; a identidade só aparece nas rotas `/api/admin/*`, protegidas por sessão de admin. Promover alguém depois: `UPDATE usuarios SET admin = true WHERE cpf = '...';`

**5. Virar o semestre.** Troque a env `SEMESTRE` (ex.: `2026-2` → `2027-1`) e reinicie o serviço — de preferência **fora do horário de aula**. O que acontece:
- Os **alunos continuam cadastrados** (não são recriados); atualize `usuarios.semestre`/`disciplinas.semestre` para o novo período.
- O ranking antigo **não some**: continua no **Hall de campeões** (todas as temporadas). A aba **Semestre** passa a mostrar a temporada nova, que começa **vazia** até a primeira partida — isso é esperado, não é perda de dado.
- Quem estava no meio de uma jornada da temporada anterior fica com ela congelada lá; a nova temporada começa do zero para todos.

> **Atenção (produção):** com `NODE_ENV=production`, o servidor **não sobe** sem `SESSION_SECRET` definido (falha rápido com instrução). Isso evita o segredo efêmero, que invalidaria a sessão de toda a turma a cada restart. Gere um: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Deploy (Docker / EasyPanel)

O `Dockerfile` empacota o backend Node (que já serve o jogo). No **EasyPanel**: serviço tipo App → fonte GitHub (este repositório e branch) → build **Dockerfile** → porta do container **3000** → configure as variáveis de ambiente acima e aponte para o seu Postgres. O EasyPanel cuida do domínio e do HTTPS.

```bash
docker build -t ultima-instancia .
docker run -d -p 3000:3000 --env-file .env ultima-instancia
```

## Balanceamento

```bash
npm run harness   # = node outputs/harness.js public/index.html 150 todos
```

Quatro arquétipos jogam os 8 casos (na v6 a jornada não elimina, então todos jogam a jornada inteira). A dificuldade sobe em rampa — jogar fora do tema é punido mais forte do TJRS ao STF, e a parte adversa vem com tudo na deliberação — então **da metade em diante o chute não sustenta a balança**. A habilidade se expressa em **quantos casos se vence** e em **quantos pontos** se soma: o **cego** (não lê nada) vence ~67% dos casos (só ~62% na 2ª metade), média ~1470 pontos; o **atento** (lê tudo) ~85% dos casos, ~2105 pontos, e fecha jornadas **impecáveis** (8/8) quase 7× mais que o cego. Caso perdido conta **negativo** (o quanto a convicção ficou abaixo de 50), para o placar (top 10) ser justo. Mais um diagnóstico anti-exploit — três estratégias que tentam quebrar o sistema (lateral-spam, acordo-farm, ensaio-bank) — nenhuma supera o atento (o acordo-farm até fecha o semestre negativo). Qualquer mudança em `CARTAS`, `TESES` ou `OPONENTES` pede nova rodada do harness; `todos` roda cada perfil em um processo separado (o volume de simulação em lote é grande demais para caber num só processo Node sem estourar a memória).

## Documentação

- `GAME-DESIGN.md` — conceito, a mecânica da tese/réplica, fórmula de dano, meta-jogo, identidade.
- `CODIGO.md` — mapa técnico: backend, estado, onde editar cada coisa.
