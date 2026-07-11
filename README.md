# Última Instância

O jogo de cartas da FMP — Fundação Escola Superior do Ministério Público. O aluno é a defesa em uma jornada de 8 casos fictícios, do Foro Central de Porto Alegre ao STF, empurrando a **balança da convicção** com argumentos jurídicos reais.

A cada rodada a parte adversa **protocola uma tese** (com a palavra-chave sublinhada) e o aluno joga o **argumento que a refuta** — não a carta de maior número. Errar o tema custa **credibilidade**; com ela zerada, o juiz indefere de plano. O caso segue o rito (instrução → sustentação → deliberação), com linha argumentativa, preparo, viradas, missões e acordo. É um roguelike de deck-building com o Direito como matéria-prima — rápido de entender, difícil de dominar (calibrado por simulação: bot aleatório vence 20% das jornadas; tático, 83%). A progressão competitiva é a **Ordem do Mérito** (de Calouro a Catedrático), por semestre letivo. O design completo está em `GAME-DESIGN.md` e o racional do redesign em `REDESIGN.md`.

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

`db/schema.sql` cria três tabelas:

- **`usuarios`** — `cpf`, `data_nascimento`, `nome` (+ `ra`, `curso`, `semestre`, `ativo`). Login.
- **`disciplinas`** — `nome`, `professor` (+ `area_do_direito`, `perfil_julgador`, `foto_professor_url`, `semestre`). Cada disciplina vira um **julgador real**, com o professor no lugar do juiz e a foto no avatar, casado com a área do caso.
- **`partidas`** — o placar persistido (as três abas: aparelho, semestre e hall de campeões).
- **`rank_alunos`** — a Ordem do Mérito (divisão competitiva + pontos de mérito, por temporada/semestre).

## Deploy (Docker / EasyPanel)

O `Dockerfile` empacota o backend Node (que já serve o jogo). No **EasyPanel**: serviço tipo App → fonte GitHub (este repositório e branch) → build **Dockerfile** → porta do container **3000** → configure as variáveis de ambiente acima e aponte para o seu Postgres. O EasyPanel cuida do domínio e do HTTPS.

```bash
docker build -t ultima-instancia .
docker run -d -p 3000:3000 --env-file .env ultima-instancia
```

## Balanceamento

```bash
node outputs/harness.js public/index.html 150 todos
```

Três bots jogam jornadas completas: o **aleatório** (não lê nada) vence ~20%; o **aprendiz** (lê só a pertinência da tese) ~53%; o **tático** (lê tudo) ~83%. O degrau entre eles é a prova de que habilidade decide. Qualquer mudança em `CARTAS`, `TESES` ou `OPONENTES` pede nova rodada do harness.

## Documentação

- `GAME-DESIGN.md` — conceito, a mecânica da tese/réplica, fórmula de dano, meta-jogo, identidade.
- `CODIGO.md` — mapa técnico: backend, estado, onde editar cada coisa.
