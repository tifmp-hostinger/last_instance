# Última Instância — game design

## Conceito

O aluno é a defesa em uma jornada de 8 casos fictícios, subindo três instâncias: Foro Central de Porto Alegre (casos 1-3), TJRS (4-6) e STF (7-8, em tema escuro "prestígio"). Não existe barra de vida: existe a **balança da convicção** (0 a 100, começa em 50). Cartas de argumento empurram a balança a favor; a parte adversa empurra contra. É um roguelike de deck-building — a cada caso o baralho cresce e a estratégia muda — com o Direito como matéria-prima, não como enfeite.

A tese didática do produto: ninguém aprende lendo o jogo; aprende jogando. Cada carta é um argumento real (In dubio pro reo, Pacta sunt servanda, Repercussão geral…), rodapeada com a disciplina da grade de onde vem e com uma **fala** — o que aquele argumento "diz ao juiz" — visível no log ao jogar e na ficha da carta (botão "i").

## O coração didático: a tese e a réplica

A cada rodada a **parte adversa sustenta uma tese jurídica** concreta (real, com o tema explícito): *"O contrato foi livremente assinado e deve ser cumprido à risca, ainda que hoje se revele excessivamente oneroso"*, *"A prova dos autos é robusta e não comporta dúvida"*, etc. Vencer **não é jogar a carta de maior número** — é jogar o **argumento que refuta aquela tese**.

- Cada carta argumentativa (Norma, Fato, Retórica) enfrenta um ou mais **temas** (contratos, prova, penal, consumidor, constitucional…). Jogar uma carta cujo tema bate com a tese é uma **réplica certeira**: vale cheio, com bônus (+4), e o log **explica por que** aquele argumento refuta a tese (a chave didática — direito real, uma vez por rodada).
- Jogar um argumento fora do tema é um **argumento lateral**: rende menos da metade (×0,45) — o juiz não vê pertinência.
- Cartas de **Técnica** são procedimentais (contenção, compra, objeção): sempre pertinentes, nunca penalizadas.

É o que separa clicar de advogar: o aluno precisa **ler a tese, reconhecer o tema e escolher o contra-argumento** — e ainda assim pesar o julgador (abaixo). A carta mostra só a sua **força-base**; o valor real (pertinência, julgador, combo) o aluno calcula lendo a mesa, e confirma no log depois de jogar.

## Loop de um caso

1. **Sorteio do caso** (título, partes, área) e do julgador.
2. **A tese da rodada**: a parte adversa levanta a tese (tema visível) e anuncia o movimento que fará ao fim da rodada.
3. **Rodada do aluno**: 5 cartas na mão, 3 de fôlego. Cada carta custa fôlego. Fôlego não acumula entre rodadas — decisão de design: sobrar energia tem que doer, senão a estratégia dominante é poupar. Cartas de custo 0 existem para queimar o resto.
4. **Fim da rodada**: a parte adversa executa o movimento anunciado (informação perfeita — o jogo é de decisão, não de sorte escondida): **sustentação** (dano), **protelação** (contenção), **pressão** (−1 fôlego) ou **questionamento** (próxima carta vale metade). Uma nova tese é levantada.
5. A cada 3 rodadas o julgador **pondera**: a convicção anda 3 pontos em direção ao centro (freio anti-bola-de-neve, dos dois lados).
6. **Vitória**: convicção 100 a qualquer momento ("convicção plena", +50 de bônus) ou >50 quando o prazo de pauta acaba (8-12 rodadas). **Derrota**: 0 a qualquer momento, ou ≤50 no fim do prazo.

## Tipos, julgadores e o triângulo de decisão

Quatro tipos de carta: **Norma** (lei, súmula, princípio), **Fato** (prova, perícia, testemunha), **Retórica** (persuasão) e **Técnica** (processo: contenção, compra, objeção). Cada julgador multiplica tipos: a legalista dá ×1,4 em Norma e ×0,7 em Retórica; o pragmático inverte para Fato; a humanista, para Retórica; o metódico é neutro. No chefe final, o **Plenário do STF** rotaciona a "voga" (tipo favorecido ×1,5) a cada 2 rodadas.

A tensão nasce do cruzamento das duas leituras: a réplica pertinente à tese pode ser de um **tipo que o julgador despreza** (ex.: uma tese de *prova* pede cartas de Fato, mas a julgadora humanista dá ×0,7 em Fato). O aluno decide entre o argumento certeiro mal-recebido e o versátil bem-recebido — é aí que se pensa. **Julgadores reais**: quando o backend está ligado, cada julgador é um professor da FMP vinculado à sua disciplina (foto no avatar), casado com a área do caso.

**Combos**: cartas ganham bônus se outro tipo específico já foi sustentado na rodada. "Ethos, pathos, logos" premia variedade; "Peroração" vale mais com a maré a favor (convicção ≥65); "In dubio pro reo" pesa mais na dúvida (convicção ≤45); "Artigo científico" escala com cartas na mão.

## Fórmula de dano (ordem exata)

base → +combo → **pertinência à tese** (réplica +4 · lateral ×0,45 · técnica sem juízo) → ×multiplicador do julgador (ou voga ×1,5) → +bônus de relíquia por tipo (+2) → ÷2 se a tese foi questionada → ×2 se Repercussão geral ativa → absorção pela contenção adversa (exceto cartas perfurantes) → aplica na balança.

## Meta-jogo da jornada

- Após cada **caso comum**: escolha de 1 carta entre 3 (4 com a relíquia Rede de contatos; raras ~30% de chance de aparecer).
- Após cada **chefe**: escolha de 1 relíquia entre 2 (8 relíquias: Vade Mecum anotado, Café da madrugada, Tese decorada…).
- Entre instâncias, evento **"Intervalo na FMP"**: remover carta (afinar o baralho), carta rara à escolha, ou +4 de convicção inicial permanente.
- Derrota concede **embargos**: uma única repetição do mesmo caso por jornada — o mesmo caso e o mesmo julgador, por coerência narrativa.

**Pontuação**: 100 por caso + margem de convicção + 10 por rodada economizada + 50 por convicção plena + até 50 da sustentação de IA + 500 pela vitória final.

## Acesso e identidade do aluno

O aluno entra com **CPF** (só números, com máscara) e **data de nascimento** — batendo contra a tabela de usuários da FMP no Postgres. A identidade da sessão alimenta o placar (o cliente nunca diz quem é; o servidor decide pela sessão). Quando o backend está ligado, os **julgadores são professores reais** vinculados às suas disciplinas (foto no avatar), casados com a área do caso. Sem banco, o jogo roda em modo de demonstração; solto como arquivo estático, roda em modo local com identificação pelo formulário.

## Modos e retenção

**Jornada livre** (semente aleatória) e **Caso do dia** (semente derivada da data: todos os alunos enfrentam a mesma jornada — combustível do ranking). Placar em três abas: aparelho (local), semestre e hall de campeões (Postgres). A sustentação final com juiz de IA nos casos-chefe (opcional) transforma o clímax mecânico em exercício real de argumentação escrita.

## Balanceamento (estado atual)

Calibrado por simulação (harness com dois bots, n=200): o **jogador casual** que joga ao acaso — ignorando a tese e o julgador — vence **~55%** das jornadas e precisa de embargos na maioria delas; clicar sem pensar não basta, porque metade dos argumentos cai fora do tema (×0,45) e o julgador ainda corta o tipo errado. O **bot tático** — que lê a tese, prefere a réplica certeira, guarda perfurantes e anula sustentações grandes com informação perfeita — vence **~98%** e funciona como teto de habilidade. Curva pensada para o aluno médio vencer com esforço (lendo a tese e o julgador) e o dedicado buscar recorde de pontos, não apenas vitória. Ajustes ficam em poucos lugares: movimentos em `OPONENTES`, `REPLICA_BONUS`/`LATERAL_FATOR` e números das cartas em `CARTAS` (ver CODIGO.md).

## Identidade

Paleta oficial (vermelho `#EE2A42`, preto `#191818`, creme `#EFEEEA`, areia `#BFBAA4`), Noto Serif Italic para títulos e Outfit para interface, símbolo real da FMP vetorizado — a estrela de 4 pontas (título, vitória, relíquias, favicon), linguagem visual liquid glass com fundos em movimento lento. Tom de voz da casa: prestígio sem distância, sentence case, sem emoji.
