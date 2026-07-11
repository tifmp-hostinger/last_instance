# Última Instância — game design (v4 "Audiência viva")

> A proposta completa de redesign, com o diagnóstico e o racional de cada sistema, está em `REDESIGN.md`. Este documento descreve **o jogo como ele é hoje**.

## Conceito

O aluno é a defesa em uma jornada de 8 casos fictícios, subindo três instâncias: Foro Central de Porto Alegre (casos 1-3), TJRS (4-6) e STF (7-8, em tema escuro "prestígio"). Não existe barra de vida: existe a **balança da convicção** (0 a 100, começa em 50). É um roguelike de deck-building com o Direito como matéria-prima — e, na v4, um jogo em que **cada rodada é um embate com começo, tensão e conclusão**: clicar sem pensar perde; ler a mesa vence.

## O coração didático: a tese e a réplica

A cada rodada a parte adversa **protocola uma tese jurídica** (peça carimbada em cena, com o tema e a **palavra-chave sublinhada**). Vencer é jogar o argumento que a refuta:

- **Réplica certeira** (tema certo): +6, e o log explica **por quê** — a chave didática, uma vez por rodada.
- **Réplica direta** (responde à palavra-chave): +3 adicionais. Dois níveis de acerto: tema < termo.
- **Argumento lateral** (fora do tema): ×0,40 — e ×0,25 do terceiro em diante no caso. E custa credibilidade.
- **Técnica** é procedimental: sempre pertinente, nunca penalizada.

A carta mostra só a **força-base**; o valor real (pertinência, julgador, credibilidade, combo) o aluno calcula lendo a mesa e confirma no log.

## Credibilidade — a coerência da defesa (0-10, começa em 6)

O sistema anti-aleatoriedade. Réplica pertinente: +1. Lateral: −1. Faixas: **8-10 tribuna dominada** (tudo ×1,15) · 4-7 neutro · **1-3 defesa advertida** (×0,7) · **0: o juiz indefere de plano** — a rodada termina e a credibilidade volta a 3. Quem erra entra em espiral; quem lê domina a tribuna. Proteções: piso 2 nos casos 1-2 da jornada; **pedido de reconsideração** 1×/caso (volta a 4, custa a rodada). Na entrada da deliberação, a credibilidade **consolida**: (cred − 5) × 2 na balança.

## O rito do caso (fases, sem contagem ansiosa)

Régua na tela: **Distribuição → Instrução → Sustentação → Deliberação → Sentença**.

| Formato | Rodadas | Estrutura |
|---|---|---|
| Caso comum | **5** | 1 instrução + 3 sustentação + 1 deliberação |
| Caso-chefe | **7** | 2 + 4 + 1 |
| Plenário (final) | **8** | 2 + 4 + 2, voga ×1,5 girando a cada 2 |

- **Instrução**: a parte adversa não ataca (organiza os autos). Rodada de preparar: ensaiar cartas, abrir a linha.
- **Sustentação**: o embate. No meio dela, o **momento de virada** (novos documentos mudam o tema; testemunha vacila — próxima prova ÷2, Técnica reabilita; o juiz sinaliza a preferência da deliberação).
- **Deliberação**: contenção adversa **dobra**, credibilidade consolida, e pode surgir **acordo** (balança 55-75): aceitar = vitória com 60% dos pontos; recusar = sustentações adversas +30% até o fim.

Vitória: 100 a qualquer momento (plena), >50 no fim da deliberação, ou acordo. Derrota: 0, ≤50 no fim.

## A rodada em 5 beats

1. **Pauta** — a peça desliza e o carimbo bate; palavra-chave sublinhada; movimento adverso anunciado (informação perfeita); disposição do juiz visível.
2. **Leitura** — sem timer: pressão vem das escolhas, não do relógio.
3. **Construção** — 1-3 cartas; argumentativas preenchem a **bandeja da linha** (fundamento → prova → arremate). **Tese fechada** (na ordem): +8 na balança, +1 credibilidade. Fora da ordem: +3, sem fecho.
4. **Resolução** — pesos caem na balança; o juiz reage (acena/franze/anota); réplica certeira **risca e rasga a peça**; lateral balança a cabeça e desce a credibilidade à vista.
5. **Réplica e gancho** — o movimento adverso executa; a **próxima pauta** aparece (tema; texto completo se espiada). Nunca há vazio entre rodadas.

## Preparo (0-5) — a economia estratégica

Ganha-se +1 ao fim de rodada com réplica pertinente. Gasta-se em: **espiar** a próxima tese (1) · **ensaiar** uma carta (2) · **objeção** — anula o movimento adverso anunciado (3). Cartas raras de impacto entram **em rascunho**: de improviso valem 60%; ensaiadas, o valor pleno. Cartas comuns ensaiadas: ×1,5. Guardar fôlego continua não existindo — mas fechar a rodada tendo acertado a réplica agora rende Preparo: não jogar também é decisão.

## Adversários com arquétipos e memória

Cada oponente tem um arquétipo (agressivo, protelatório, formalista) e um ciclo anunciado: **sustentação** (dano), **protelação** (contenção; dobra na deliberação), **questionamento** (próxima carta ÷2). E todos **reconhecem padrões**: três cartas do mesmo tipo em sequência → aviso claro → **impugnação direcionada** (a próxima carta daquele tipo vale metade). Variedade é obrigatória.

## Fórmula de dano (ordem exata)

base (rascunho ×0,6 / ensaiada ×1,5) → +combo → **pertinência** (réplica +6 · direta +3 · lateral ×0,40/0,25) → ×julgador (ou voga ×1,5) → +relíquia de tipo (+2) → ÷2 impugnada/questionada → ×2 repercussão → **×faixa de credibilidade** (1,15 / 1 / 0,7) → contenção adversa (exceto perfurantes) → balança.

## Missões, tipos e julgadores

Cada caso traz **uma missão opcional** (+25): vencer sem lateral, fechar uma linha na ordem, terminar com credibilidade ≥7, sustentar 3 disciplinas. Tipos e julgadores como antes: Norma/Fato/Retórica/Técnica; legalista (N ×1,4 · R ×0,7), pragmático (F ×1,4 · N ×0,7), humanista (R ×1,4 · F ×0,7), metódico neutro; Plenário com voga rotativa. A tensão central: a réplica certa pode ser do tipo que o julgador corta. **Julgadores reais**: professores das disciplinas (Postgres), com foto, casados com a área do caso.

## Pontuação — qualidade jurídica, com tetos

Resultado (100 + margem + 50 plena) · Pertinência (≤60) · Coerência/credibilidade (≤50) · Leitura do julgador (≤40) · Teses fechadas (≤40) · Rodadas economizadas (≤30) · Missão (+25) · Recuperação após ≤30 (+30) · **Laterais (−5 cada, ≤−60)**. Acordo multiplica o total por 0,6. Jornada: soma + 500 na vitória final + até 50 da sustentação com IA. Componentes crescem com **taxa de acerto**, nunca com volume.

## Ordem do Mérito — progressão competitiva

A divisão é a **trajetória acadêmica** (neutra — nenhuma carreira real acima de outra):
**Calouro → Bacharelando III/II/I → Bacharel → Especialista II/I → Mestre II/I → Doutor II/I → Livre-docente → Catedrático.**

- **Pontos de Mérito**: vitória +15 a +30 (escala pela pontuação); derrota −4 a −14 (amortecida pelos casos vencidos). 100 PM = sobe.
- **Divisões de entrada** (até Bacharelando I) não perdem PM.
- **Temporada = semestre letivo**: na virada, desce 1 divisão e o PM zera.
- Persistida no Postgres (`rank_alunos`) quando há sessão; local sem servidor.

## Meta-jogo (mantido)

Carta 1-de-3 após caso comum (4 com Rede de contatos, raras ~30%) · relíquia 1-de-2 após chefe · Intervalo na FMP entre instâncias · **embargos** (1 repetição do mesmo caso/julgador por jornada) · jornada livre e caso do dia (semente da data) · placar em três abas.

## Balanceamento (estado atual — harness com 3 bots, n=150)

| Bot | O que lê | Jornadas | Casos individuais |
|---|---|---|---|
| Aleatório | nada | **20%** | 71% — precisa de embargos em 93% das jornadas |
| Aprendiz | só a pertinência da tese | **53%** | 84% |
| Tático | tudo (tese, chave, juiz, linha, credibilidade, preparo, acordo) | **83%** | 93% |

Degraus de ~30 pontos entre cada nível de leitura: a habilidade é o que decide. Botões de ajuste: `OPONENTES`, `REPLICA_BONUS`/`DIRETA_BONUS`/`LATERAL_FATOR*`, faixas de credibilidade e `FECHO_LINHA`.

## Identidade

Paleta oficial (vermelho `#EE2A42`, preto `#191818`, creme `#EFEEEA`, areia `#BFBAA4`), Noto Serif Italic para títulos e falas, Outfit na interface, estrela FMP de 4 pontas (título, pesos da balança, preparo, favicon), liquid glass, fundos vivos lentos, tema escuro "prestígio" no STF. A cena da batalha é **a mesa de audiência**: juiz com disposição visível, peça protocolada que se rasga, balança física, bandeja da linha. Tom: prestígio sem distância, sentence case, sem emoji. Animações ≤400 ms e todas puláveis.
