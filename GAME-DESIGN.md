# Última Instância — game design

## Conceito

O aluno é a defesa em uma jornada de 8 casos fictícios, subindo três instâncias: Foro Central de Porto Alegre (casos 1-3), TJRS (4-6) e STF (7-8, em tema escuro "prestígio"). Não existe barra de vida: existe a **balança da convicção** (0 a 100, começa em 50). Cartas de argumento empurram a balança a favor; a parte adversa empurra contra. É um roguelike de deck-building — a cada caso o baralho cresce e a estratégia muda — com o Direito como matéria-prima, não como enfeite.

A tese didática do produto: ninguém aprende lendo o jogo; aprende jogando. Cada carta é um argumento real (In dubio pro reo, Pacta sunt servanda, Repercussão geral…), rodapeada com a disciplina da grade de onde vem e com uma **fala** — o que aquele argumento "diz ao juiz" — visível no log ao jogar e na ficha da carta (botão "i").

## Loop de um caso

1. **Sorteio do caso** (título, partes, área) e do julgador.
2. **Rodada do aluno**: 5 cartas na mão, 3 de fôlego. Cada carta custa fôlego. Fôlego não acumula entre rodadas — decisão de design: sobrar energia tem que doer, senão a estratégia dominante é poupar. Cartas de custo 0 existem para queimar o resto.
3. **Fim da rodada**: a parte adversa executa o movimento que havia anunciado (informação perfeita — o jogo é de decisão, não de sorte escondida): **sustentação** (dano), **protelação** (contenção), **pressão** (−1 fôlego) ou **questionamento** (próxima carta vale metade).
4. A cada 3 rodadas o julgador **pondera**: a convicção anda 3 pontos em direção ao centro (freio anti-bola-de-neve, dos dois lados).
5. **Vitória**: convicção 100 a qualquer momento ("convicção plena", +50 de bônus) ou >50 quando o prazo de pauta acaba (8-12 rodadas). **Derrota**: 0 a qualquer momento, ou ≤50 no fim do prazo.

## Tipos, julgadores e o triângulo de decisão

Quatro tipos de carta: **Norma** (lei, súmula, princípio), **Fato** (prova, perícia, testemunha), **Retórica** (persuasão) e **Técnica** (processo: contenção, compra, objeção). Cada julgador multiplica tipos: a legalista dá ×1,4 em Norma e ×0,7 em Retórica; o pragmático inverte para Fato; a humanista, para Retórica; o metódico é neutro. No chefe final, o **Plenário do STF** rotaciona a "voga" (tipo favorecido ×1,5) a cada 2 rodadas — o aluno precisa ler o colegiado e ajustar a ordem das cartas.

**Combos**: cartas ganham bônus se outro tipo específico já foi sustentado na rodada (ex.: Dignidade da pessoa humana +4 se Retórica já apareceu — norma que precisa de narrativa). "Ethos, pathos, logos" premia variedade; "Peroração" vale mais com a maré a favor (convicção ≥65); "Artigo científico" escala com cartas na mão.

## Fórmula de dano (ordem exata)

base → +combo → ×multiplicador do julgador → +bônus de relíquia por tipo (+2) → ÷2 se a tese foi questionada → ×2 se Repercussão geral ativa → absorção pela contenção adversa (exceto cartas perfurantes) → aplica na balança.

## Meta-jogo da jornada

- Após cada **caso comum**: escolha de 1 carta entre 3 (4 com a relíquia Rede de contatos; raras ~30% de chance de aparecer).
- Após cada **chefe**: escolha de 1 relíquia entre 2 (8 relíquias: Vade Mecum anotado, Café da madrugada, Tese decorada…).
- Entre instâncias, evento **"Intervalo na FMP"**: remover carta (afinar o baralho), carta rara à escolha, ou +4 de convicção inicial permanente.
- Derrota concede **embargos**: uma única repetição do mesmo caso por jornada — o mesmo caso e o mesmo julgador, por coerência narrativa.

**Pontuação**: 100 por caso + margem de convicção + 10 por rodada economizada + 50 por convicção plena + até 50 da sustentação de IA + 500 pela vitória final.

## Modos e retenção

**Jornada livre** (semente aleatória) e **Caso do dia** (semente derivada da data: todos os alunos enfrentam a mesma jornada — combustível do ranking). Placar em três abas: aparelho, semestre (API) e hall de campeões dos semestres. A sustentação final com juiz de IA nos casos-chefe transforma o clímax mecânico em exercício real de argumentação escrita.

## Balanceamento (estado atual)

Calibrado por simulação (harness com dois bots): jogador casual que ignora julgador e combos vence ~60-65% das jornadas; o bot tático — que lê julgador, ordena combos, guarda perfurantes e anula sustentações grandes com informação perfeita — vence ~95-99% e funciona como teto de habilidade. Curva pensada para o aluno médio vencer com esforço e o dedicado buscar recorde de pontos, não apenas vitória. O muro do jogador casual é o chefe do TJRS (caso 6). Ajustes ficam em um único lugar: valores dos movimentos em `OPONENTES` e números das cartas em `CARTAS` (ver CODIGO.md).

## Identidade

Paleta oficial (vermelho `#EE2A42`, preto `#191818`, creme `#EFEEEA`, areia `#BFBAA4`), Noto Serif Italic para títulos e Outfit para interface, símbolo real da FMP vetorizado — a estrela de 4 pontas (título, vitória, relíquias, favicon), linguagem visual liquid glass com fundos em movimento lento. Tom de voz da casa: prestígio sem distância, sentence case, sem emoji.
