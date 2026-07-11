# Cartas, recompensas e bônus — como funcionam hoje, e por que não ganharam tabela nova

Este documento responde à segunda parte do pedido de revisão: mapear exatamente como
cartas/recompensas/relíquias/reforços/bônus funcionam hoje e decidir o que — se
algo — deveria passar a morar no Postgres.

## 1. Como funciona hoje

- **`CARTAS`** (`public/index.html`) é um objeto estático com as 38 cartas do jogo
  (nome, tipo, custo, força, raridade, texto, efeito, combo). **`RELIQUIAS`** é o
  mesmo padrão para as 8 relíquias. Nenhuma das duas nunca variou por aluno — são
  as mesmas para todo mundo, sempre, calibradas junto com `TESES`/`OPONENTES` e
  validadas pelo harness (`npm run harness`).
- **`DECK_INICIAL`** (10 cartas) é o baralho de partida — fixo, igual para todos.
- **Durante uma corrida** (`S`, o objeto de jornada): ao vencer um caso comum, o
  aluno escolhe 1 de 3 (ou 4, com a relíquia "Rede de contatos") cartas para entrar
  no baralho daquela corrida (`recompensaCartas`/`escolherRecompensa`); ao vencer um
  caso-chefe, escolhe 1 de 2 relíquias (`recompensaReliquia`/`escolherReliquia`). O
  caso da semana começa com 2 a 4 cartas de reforço já no baralho, sorteadas
  deterministicamente a partir da semana (`reforcosSemana` — a mesma pauta e o
  mesmo reforço para toda a FMP, por desenho).
- **Tudo isso vive só em `S`** (`S.deck`, `S.relics`, `S.bonusIni`), serializado
  inteiro em `localStorage['ui_fmp_run']` (`salvarRun()`) e **apagado ao fim da
  corrida** — vitória, derrota ou virada de semana (`store.del('ui_fmp_run')` em
  `finalizarSemana` e `telaOver`). Nada disso jamais foi enviado ao servidor: o
  `POST /api/partidas` só manda `pontos`, `casos`, `venceu`, `modo`, `seed` — nunca
  o baralho, as relíquias ou os bônus da corrida.

## 2. As duas categorias, sem misturar

**Progressão permanente hoje** (atravessa dispositivo e semestre): só a **Ordem do
Mérito** (divisão, PM, maior divisão, vitórias/derrotas, jornadas e casos semanais
concluídos — endurecida na Parte 1 deste trabalho) e o registro de "já joguei esta
jornada/esta semana" que impede replay em outro aparelho (`partidas` +
`GET /api/progresso`).

**Estado temporário da jornada** (não deveria e não precisa atravessar dispositivo):
o baralho da corrida, as relíquias da corrida, `bonusIni`, os pontos e o detalhe por
caso, os reforços da semana. Isso é, por design, um roguelike — o baralho "zera" a
cada corrida por definição de gênero, exatamente como a energia/relíquias zeram em
Slay the Spire a cada subida. Não é um dado perdido por acidente; é a régua do jogo.

## 3. Decisão

**Não foi criada nenhuma tabela nova para cartas/relíquias/bônus.** As definições de
carta continuam fixas no código, e nenhum desbloqueio permanente foi adicionado.

Motivos:

1. **Não existe hoje nenhum sistema de desbloqueio permanente** — nem com bug, nem
   pela metade. Toda carta e toda relíquia sempre estiveram disponíveis a qualquer
   aluno, em qualquer corrida, desde o primeiro dia. Criar uma tabela de "cartas
   desbloqueadas" seria inventar uma mecânica de progressão de meta-jogo que o
   produto nunca teve — uma mudança de design, não uma correção de um gap.
2. **O pedido do usuário já era manter as definições de carta no código** (para
   facilitar calibragem e os testes do harness) — confirmado como a escolha certa:
   qualquer ajuste de `custo`/`força`/`combo` continua sendo uma linha de código
   revisável por diff, testável em segundos com `npm run harness`, sem depender de
   uma migração de dados ou de sincronizar um "allow-list" no banco com o código.
3. **Não há superfície de ataque aqui para fechar.** A preocupação de segurança do
   pedido ("o backend deve validar identificadores contra uma allow-list; o cliente
   nunca decide o que desbloqueia") já está satisfeita — não porque exista uma
   allow-list, mas porque **o cliente nunca manda um identificador de carta/relíquia
   para o servidor em lugar nenhum**. `POST /api/partidas` só aceita
   `pontos/casos/venceu/modo/seed`; o servidor nunca lê nem grava `deck` ou `relics`.
   Não há canal para o cliente "pedir" um desbloqueio, logo não há o que validar.

## 4. Quando isso deveria mudar

Se um dia o produto decidir ter progressão permanente de verdade (ex.: "vença 3
jornadas e destrave uma carta lendária para sempre", ou uma loja de relíquias
permanentes por temporada), o padrão a seguir é o mesmo desta Parte 1: uma tabela
`aluno_desbloqueios` (cpf, tipo, identificador, origem, partida relacionada,
temporada, data, ativo) com unicidade `(cpf, tipo, identificador)` para impedir
concessão duplicada, e uma rota que só aceita identificadores que batam contra um
allow-list server-side derivado de `Object.keys(CARTAS)`/`Object.keys(RELIQUIAS)` —
nunca um nome/objeto livre vindo do corpo da requisição. Não construído agora porque
não existe a mecânica de jogo que o justifique; construí-lo hoje seria acoplar uma
tabela a um comportamento que não existe, no exato oposto do que a Parte 1 corrigiu.
