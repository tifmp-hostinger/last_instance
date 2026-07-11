# Última Instância — proposta de redesign v4 "Audiência viva"

Documento de design. Objetivo: transformar o jogo em uma experiência competitiva, rápida de entender e difícil de dominar — com a sensação de leitura, adaptação e ascensão que faz um TFT funcionar, traduzida de forma original para a estratégia jurídica. Pilares intocáveis: estratégia jurídica, réplica à tese, influência do julgador, construção de baralho, jornada por instâncias, conteúdo jurídico real, identidade FMP, competição por habilidade.

---

## 1. Diagnóstico dos problemas atuais

| Problema | Causa raiz | Evidência |
|---|---|---|
| Visual estático | A rodada não tem *beats*: tudo acontece no mesmo plano visual, sem fases, sem reação do juiz, sem consequência encenada. A balança é o único elemento vivo. | Jogador descreve "clicar em cartas e ver números". |
| Fácil demais | A penalidade de pertinência (×0,45) reduz valor mas **não pune estruturalmente**: jogar errado nunca piora o estado do jogador — só rende menos. Com 8-12 rodadas, há tempo de sobra para errar e compensar no volume. | Harness: o bot aleatório vence ~84% dos casos individuais (6,7 de 8 por jornada). |
| Partidas longas | 8-12 rodadas idênticas entre si. O prazo é exibido como contagem ("rodada 3/12"), o que convida a contar o que falta. Dano pequeno repetido muitas vezes. | Percepção de "faltam dez rodadas". |
| Pouca competitividade | Ranking é só uma lista de pontos. Não há elo, temporada, colocação, promoção, nem identidade de carreira. Nada a perder, nada a subir. | Placar existe, progressão não. |
| Aprendizado raso | O feedback didático existe (a "chave" da tese), mas o jogo não mede nem mostra evolução de domínio por área, e o erro não tem custo que obrigue a aprender. | — |

Conclusão do diagnóstico: **os quatro problemas têm a mesma raiz** — a rodada não é um conflito com estrutura própria (preparação → tensão → resolução → consequência), e o erro não altera o estado do jogo. O redesign ataca isso primeiro; visual, ritmo e dificuldade derivam dela.

---

## 2. Nova visão central

> **Cada caso é uma audiência viva. Cada rodada é um embate com começo, tensão e conclusão. Cada carta é uma decisão jurídica com consequência visível — na balança, no juiz e na sua credibilidade.**

Três mudanças estruturais sustentam a visão:

1. **Credibilidade** — um segundo medidor (além da balança) que representa a coerência da defesa perante o juízo. Argumento lateral e contradição custam credibilidade; credibilidade baixa deprecia tudo o que você joga. É o sistema anti-aleatoriedade: quem clica sem ler entra em espiral, quem lê domina a tribuna.
2. **Fases do processo** — o caso deixa de ser N rodadas iguais e vira **Instrução → Sustentação → Deliberação**, com objetivos, visual e regras distintos (o "estágio" do TFT traduzido para o rito processual).
3. **Linha argumentativa** — os argumentos não caem soltos: constroem uma linha (fundamento → prova → arremate) numa bandeja visível. Ordem importa (o "posicionamento" do TFT), completar a linha é o combo central ("tese fechada"), e a parte adversa pode atacá-la.

---

## 3. Novo loop de uma rodada

Cinco beats, todos rápidos (animações ≤ 400 ms, todas puláveis com um toque):

1. **Pauta** (~1,5 s) — a tese adversa entra como **peça protocolada**: papel desliza, carimbo bate (som seco), etiqueta de tema e **palavras-chave sublinhadas**. Ao lado, o movimento anunciado da parte adversa e a disposição atual do juiz. Tudo que o jogador precisa ler está em cena antes de decidir.
2. **Leitura** — sem timer (é um jogo educacional; pressão de relógio pune quem está aprendendo). Um único bônus opcional de **prontidão** (+1 na primeira carta se jogada em até 8 s) recompensa domínio sem punir estudo.
3. **Construção** — o jogador joga 1-3 cartas. Cartas argumentativas vão para a **bandeja da linha** (fundamento N → prova F → arremate R); Técnica resolve à parte. Aqui mora a decisão: réplica certeira × preferência do juiz × completar a linha × guardar resposta para o movimento anunciado. **Não jogar também é jogada** (ver Preparo, §8).
4. **Resolução** (~2 s no total) — cada carta vira um **peso-estrela que cai no prato** da balança; o travessão range e oscila com física de mola; o juiz reage (anota, acena, franze). Réplica certeira: o papel da tese é **riscado em vermelho e rasgado** — o feedback central de acerto. Lateral: o juiz ergue os olhos, o papel permanece intacto, a credibilidade desce visivelmente.
5. **Réplica e gancho** (~1,5 s) — a parte adversa executa o movimento anunciado (impacto visual proporcional) e o **gancho da próxima rodada** aparece de imediato (prévia da próxima tese ou incidente). A rodada seguinte já nasce com contexto — nunca há um "vazio" entre rodadas.

O que resolve: transforma "clicar e ver números" em ciclo dramático legível. O jogador sente: antecipação (carimbo), agência (construção), impacto (peso na balança, papel rasgado), consequência (réplica + gancho). Educacional: as palavras-chave sublinhadas na tese ensinam a **ler peça processual procurando o ponto controvertido**. Implementação: estados de cena no CSS/JS já existentes (a balança, FX e sons são aproveitados); teste: tempo médio de rodada ≤ 45 s e zero cliques de confirmação supérfluos.

---

## 4. Novo loop de um caso

O caso segue o **rito**: uma régua processual substitui o contador de rodadas ("Distribuição → Instrução → Sustentação → Deliberação → Sentença") — o jogador vê onde está no processo, não quantas rodadas faltam.

1. **Distribuição** (tela de entrada, 5 s) — sorteio encenado: capa do processo, partes, área, julgador (foto/perfil/preferências) e **a missão do caso** (objetivo secundário opcional, §8). Um botão: "Ir à audiência".
2. **Instrução** (1 rodada; 2 nos chefes) — rodada de preparação, sem dano adverso pesado: entram provas disponíveis, o jogador pode **ensaiar** cartas (prepará-las para valer mais), ler o julgador, abrir a linha argumentativa. É a rodada "PvE" do TFT: ritmo diferente, recompensa recursos.
3. **Sustentação** (3 rodadas; 4 nos chefes) — o núcleo: teses, réplicas, movimentos adversos, linha em construção. No meio dela, o **momento de virada** (§8): um incidente muda o tabuleiro (nova prova, testemunha que muda, sinalização do juiz).
4. **Deliberação** (1 rodada; 2 nos chefes) — clímax: o juiz "pede a síntese". As regras mudam: a contenção adversa dobra, a credibilidade acumulada converte em multiplicador final, e ofertas de **acordo** podem aparecer (§8). É a rodada de all-in ou de fechar com segurança.
5. **Sentença** — resolução, placar do caso com leitura estratégica (§11), recompensa.

Vitória: 100 a qualquer momento (convicção plena), >50 ao fim da Deliberação, **acordo aceito**, ou **nulidade** (vitória técnica por combo processual, rara e preparada). Derrota: 0 a qualquer momento, ≤50 ao fim, ou credibilidade zerada na Deliberação.

---

## 5. Duração recomendada

| Formato | Hoje | Proposto |
|---|---|---|
| Caso comum | 8-10 rodadas | **5 rodadas** (1 Instrução + 3 Sustentação + 1 Deliberação), ~4-6 min |
| Caso-chefe | 10-12 rodadas | **7 rodadas** (2+4+1), ~7-9 min |
| Chefe final (Plenário) | 12 rodadas | **8 rodadas** (2+4+2), voga girando a cada 2, ~10 min |
| Jornada completa | ~50-70 min | **~35-45 min** |

Menos rodadas com impacto maior por carta (bases sobem ~40%, danos adversos idem): cada decisão pesa, "dano pequeno repetido" desaparece, e a jornada cabe numa sessão de estudo.

---

## 6. Alterações de dificuldade (justas)

Princípio: dificuldade por **exigência de decisão**, não por número inflado.

1. **Credibilidade (0-10, começa em 6)** — o sistema central:
   - Argumento lateral: valor ×0,45 **e −1 de credibilidade**. Terceiro lateral no mesmo caso: ×0,3.
   - Contradição de linha (§7): −2.
   - Réplica certeira: +1 (máx. 10). Tese fechada: +1.
   - Faixas: 8-10 = **tribuna dominada** (todas as cartas ×1,15); 4-7 = neutro; 1-3 = **defesa advertida** (×0,8); 0 = o juiz **indefere de plano**: a rodada termina imediatamente e a credibilidade volta a 3.
   - O que resolve: clicar aleatório agora **piora o estado** (espiral de depreciação), em vez de só render menos. O que o jogador sente: o juiz tem memória; a tribuna se conquista. Educacional: coerência argumentativa é conceito real (preclusão lógica, *venire contra factum proprium*) — e o jogo o encena. Proteção: nos casos 1-2 da jornada a credibilidade não desce de 2 (aprendizado sem espiral), e uma vez por caso o jogador pode **pedir reconsideração** (reset para 4, custa a rodada).
2. **Teses com palavras-chave** — cada tese destaca 1-2 termos (ex.: *onerosidade*, *nexo causal*); cartas cujo texto didático cobre o termo ganham selo de "réplica direta" (+2 além do bônus de pertinência). Ensina a ler o ponto controvertido, e cria dois níveis de acerto (tema certo < termo certo).
3. **Adversário que reconhece padrões** — jogar 3+ cartas do mesmo tipo em rodadas seguidas dispara, com aviso claro ("a parte adversa preparou impugnação contra as suas provas"), um contra específico na rodada seguinte (quest direcionado ao tipo abusado). Variedade deixa de ser opcional.
4. **Prazo apertado** — com 5 rodadas, não há volume para compensar erro. Um caso mal começado exige leitura para virar (e o comeback existe: §8).
5. **Deliberação com regras próprias** — contenção adversa dobrada e conversão de credibilidade: quem chegou "no piloto automático" descobre que o final não se vence sem ter construído o caso.

Alvos de calibragem (harness com **três bots**, ver §17): bot aleatório vence ≤ 15% das jornadas (hoje ~55%) e ≤ 35% dos casos individuais; bot "aprendiz" (lê só a pertinência) ~45-55%; bot tático ~85-90%. O degrau entre os três é a própria medida de que habilidade paga.

---

## 7. Sistemas contra jogadas aleatórias

Além da credibilidade (o pilar), quatro sistemas complementares:

1. **Linhas de defesa incompatíveis** — no início do caso, as cartas argumentativas pertencem a linhas (ex.: no penal, *negativa de autoria* × *tese processual* × *atenuação*). A primeira carta jogada define a linha mestra do caso; jogar carta de linha incompatível = contradição (−2 credibilidade, aviso prévio no hover: "contradiz a sua linha"). O que ensina: a defesa real escolhe estratégia e sustenta — não atira em todas as direções.
2. **Sequência argumentativa** — a bandeja fundamento → prova → arremate só paga o bônus de "tese fechada" (+8 na balança, +1 credibilidade) se preenchida **na ordem**. Preencher fora de ordem funciona, mas sem o fecho. Ordem = posicionamento = habilidade.
3. **Cartas ensaiadas** — cartas raras fortes entram "em rascunho": jogadas direto valem 60%; **ensaiadas na Instrução ou com Preparo** (1 fôlego, viram face para baixo na mesa e ativam na rodada seguinte) valem 100% + selo. Antecipação e timing têm recompensa; impulso tem desconto.
4. **Não jogar é decisão** — encerrar a rodada com fôlego sobrando ainda dói (nada de acumular fôlego), mas gera **+1 Preparo se ao menos uma réplica pertinente foi jogada** (§8). Guardar a resposta certa para a rodada certa vira estratégia legítima, não passividade.

---

## 8. Novos sistemas de habilidade e estratégia

1. **Preparo (0-5)** — a economia estratégica do jogo (o "ouro com juros" do TFT, sem trair o fôlego que não acumula). Ganha-se +1 ao fim de rodada com réplica pertinente jogada; certas cartas e a Instrução geram mais. Gasta-se em: **espiar a próxima tese** (1), **ensaiar carta** (2), **objeção** — cancela o movimento adverso anunciado (3). Dilema constante: gastar agora por tempo ou guardar para a Deliberação.
2. **Sinergias de disciplina** — contador visível (o "rastreador de traits"): 2 cartas da mesma disciplina no mesmo caso = **especialização** (+2 em cada); 3 disciplinas distintas na Sustentação = **formação completa** (+1 credibilidade). Liga o deck-building às disciplinas reais da grade — e ao domínio por área (§11).
3. **Momento de virada** — todo caso tem 1 incidente entre as rodadas 2-4, sorteado do pool da área (ex.: *nova prova juntada* — tese seguinte muda de tema; *testemunha vacila* — sua próxima prova vale 50%, a menos que "reinquirida" com Técnica; *o juiz sinaliza* — revela a preferência que mais pesará na Deliberação). Compreensível, anunciado, adaptável — nunca aleatoriedade punitiva.
4. **Acordo** — se a balança está entre 55-75 ao entrar na Deliberação, a parte adversa pode propor acordo: vitória imediata com pontos ×0,6 (sem bônus de plena). Recusar = a parte adversa faz o all-in final (+30% de dano na Deliberação). Risco × recompensa em estado puro, e uma decisão jurídica real (transigir ou litigar).
5. **Nulidade (vitória técnica)** — combo raro da linha processual: *preliminar ensaiada* + *questão de ordem* + *embargos* na mesma fase = anulação, vitória dominante independente da balança. Difícil, telegráfico, memorável — o "flex" do jogador excelente.
6. **Comeback legível** — abaixo de 30 na balança, a carta *In dubio pro reo* e afins ganham seus bônus de "dúvida" ampliados (+6), e o juiz "reabre a instrução" (1 compra extra). Recuperar partida ruim por mérito, não por borracha de borracha.

---

## 9. Direção visual da tela do caso

Conceito: **a mesa de audiência**. A tela deixa de ser um dashboard e vira um palco com três planos.

- **Plano de fundo (o tribunal)** — ambiente por instância: Foro = creme e madeira clara, luz de dia, poeira em suspensão sutil; TJRS = pedra e bronze, fim de tarde; STF = "prestígio": mármore escuro, luz baixa e quente, reflexos, a estrela FMP em areia-dourado. Fundos vivos atuais mantidos (movimento lento, só transform).
- **Plano médio (os atores)**:
  - **Juiz ao centro-topo**, atrás da balança (foto real do professor no avatar circular, moldura por perfil). Estados de disposição visíveis: cético / neutro / atento / convencido — mudam postura da moldura, cor do aro e micro-reações por jogada (anota ao ver combo; franze ao ver lateral; bate o martelo na mudança de fase).
  - **Balança maior e física**, centro. Cada carta = peso-estrela caindo no prato com som e oscilação de mola; marcas de 25/50/75 acendem; cruzar 65 esquenta a luz do lado da defesa, cair abaixo de 35 acende um rim light vermelho no lado adverso.
  - **Parte adversa à esquerda**: busto/silhueta com ícone de intenção e *tell* animado (embaralha papéis = protelação vem aí; inclina-se = sustentação pesada). O movimento anunciado é legível pelo corpo, não só pelo texto.
  - **A tese como peça física** — papel protocolado sob o juiz, com carimbo, etiqueta de tema e palavras-chave sublinhadas. Riscada/rasgada na réplica certeira; permanece intacta (e acusa) quando só houve laterais.
- **Plano frontal (a sua bancada)**:
  - **Bandeja da linha argumentativa** — três encaixes rotulados (fundamento · prova · arremate) entre a mão e a balança. Cartas voam para o encaixe ao serem jogadas; linha completa = varredura de luz + selo "tese fechada".
  - **Mão embaixo** (leque no desktop, carrossel com snap no mobile), custo e tipo grandes, etiqueta de tema com contraste com a tese atual (a etiqueta da carta **acende** quando bate com o tema da tese em pauta — leitura assistida, decisão ainda do jogador).
  - **Rail esquerdo fino**: credibilidade (barra vertical com o rosto do juiz no topo), Preparo (estrelas), sinergias ativas (chips).
  - **Régua do rito no topo**: Distribuição → Instrução → Sustentação → Deliberação → Sentença, com o ponteiro na fase atual. Sem "rodada 3/12".
- **Hierarquia da informação** (ordem de leitura): 1º tese em pauta, 2º movimento anunciado + juiz, 3º mão, 4º balança (consequência), 5º recursos. Hoje a balança domina e a tese compete com o log; a inversão põe a **decisão** no centro.

Tom: prestígio, tensão e inteligência — sem infantilizar. Nada de personagens caricatos: bustos sóbrios, tipografia serifada em itálico para as falas, FX de estrela contidos e significativos. Sentence case, sem emoji.

## 10. Animação, som e feedback

- **Acertos** (réplica certeira): rasgo do papel + peso maior na balança + aceno do juiz + acorde curto ascendente. Combo/tese fechada: varredura de luz na bandeja + carimbo "acolhido" + arpejo. Nulidade/plena: apagão de meio segundo + estrela FMP em fullscreen + naipe grave.
- **Erros** (lateral/contradição): som seco descendente, papel intacto com balanço de negação, barra de credibilidade pulsando para baixo, e a nota didática de uma linha ("o juiz não vê pertinência: a tese é sobre *prova*").
- **Parte adversa**: cada movimento tem 1 animação de 300 ms + som próprio (sustentação = batida grave; protelação = arrastar de papéis; questionamento = interrogação em selo; pressão = tique de relógio).
- **Transições de fase**: faixa horizontal com o título em serif itálico (como o banner de estágio do TFT), martelo do juiz, mudança de luz do ambiente. ≤ 800 ms.
- **Áudio** permanece 100% WebAudio sintetizado (zero assets, identidade própria): acrescentar 6-8 novos sons (carimbo, rasgo — ruído filtrado com envelope curto —, martelo, mola da balança, pena do juiz).
- **Regras anti-lentidão**: toda animação pulável com toque; modo "audiência direta" nas configurações (corta 70% dos efeitos); nenhuma confirmação modal dentro da rodada; `prefers-reduced-motion` respeitado.

---

## 11. Princípios de TFT traduzidos (originais)

| Princípio TFT | Tradução jurídica | Sistema |
|---|---|---|
| Planejamento → combate automático | Construção da linha → resolução encenada | Beats da rodada (§3) |
| Estágios com ritmo próprio | Rito processual: Instrução/Sustentação/Deliberação | Fases (§4) |
| Traits e sinergias | Disciplinas da grade com limiares | Sinergias (§8.2) |
| Posicionamento | Ordem dos argumentos na bandeja | Linha argumentativa (§7.2) |
| Economia com juros | Preparo acumulável por bom jogo | Preparo (§8.1) |
| Adaptação ao que a loja dá | Mão + teses + viradas forçam pivotar; forçar padrão é punido | Reconhecimento de padrão (§6.3) |
| Scout dos oponentes | Ler o juiz (preferências + disposição) e os *tells* adversos | Juiz vivo + tells (§9) |
| Rodadas PvE com itens | Instrução e incidentes processuais que dão provas/Preparo | Instrução (§4.2) |
| Risco × recompensa (all-in, econ) | Acordo × julgamento; ensaiar × jogar já | Acordo (§8.4), ensaio (§7.3) |
| Composição com identidade | Linha de defesa mestra + trilha de especialização do deck | Linhas (§7.1) |
| Clímax de chefe | Deliberação com regras próprias; Plenário com voga | Deliberação (§4.4) |

O que **não** importamos: PvP simultâneo (fora de escopo e do propósito), loja de unidades (a mão + recompensas cumprem o papel), dano ao "little legend" (a balança já é o placar emocional).

---

## 12. Progressão competitiva jurídica — "Ordem do Mérito"

Decisão de design: **não usar cargos como elo**. Ranquear Promotor acima de Defensor (ou o inverso) criaria hierarquia entre carreiras reais — problema institucional para uma escola do MP que forma para todas. Separamos três eixos:

1. **Divisão competitiva (o elo): a trajetória acadêmica** — neutra, aspiracional e da casa:
   - **Calouro** → **Bacharelando III / II / I** → **Bacharel** → **Especialista II / I** → **Mestre II / I** → **Doutor II / I** → **Livre-docente** → **Catedrático** (topo, ~1%).
   - Progresso por **Pontos de Mérito (PM)**: 0-100 por subdivisão. Vitória de jornada: +15 a +30 (escala pela pontuação relativa à média da divisão). Derrota: −8 a −20 (amortecida por casos vencidos e objetivos cumpridos — perder bem perde menos).
   - **Promoção de divisão** (não subdivisão) exige a **banca**: uma jornada especial de 3 casos-chefe com semente fixa da semana. Aprovado em 2 de 3 = promovido. Reprovado mantém 90 PM (não despenca). Tematiza a defesa de tese.
   - **Rebaixamento**: só de subdivisão, nunca na primeira semana após promoção (escudo de posse).
   - **Proteção de novatos**: Calouro e Bacharelando não perdem PM; os 5 primeiros ranqueados definem a colocação inicial (placement).
2. **Trilha de carreira (identidade, sem poder)** — o aluno escolhe: Ministério Público, Magistratura, Defensoria, Advocacia, Procuradorias ou Academia. Dá moldura, título no placar ("Bacharel I · trilha MP") e **missões de especialização** temáticas da trilha (ex.: trilha MP: "vença 3 casos penais mantendo credibilidade ≥ 8"). Trocável 1× por temporada. Nenhuma trilha é mecanicamente superior — são sabores de missão e cosmético.
3. **Especialização por área (domínio)** — medidor de 0-100 por disciplina (civil, penal, consumidor…), alimentado por réplicas certeiras naquela área (§11 educacional). Público no perfil: "domínio: Penal 74 · Consumidor 58". É o mapa de estudo do aluno — e o dado mais valioso para a FMP.

**Temporadas = semestres letivos** (2026-2, 2027-1…): reset suave (cai 1 divisão inteira, PM zera), placement de 3 jornadas, recompensas de fim de semestre (moldura do semestre, título permanente no hall, "toga" cosmética para Doutor+). **Anti-exploração**: PM integral só nas 3 primeiras jornadas do dia (depois, 25%); caso do dia dá PM 1×/dia; mesma semente repetida não pontua PM; pontuação tem tetos por componente (§13). **Relação com o ranking global**: o placar de pontos continua (recorde bruto por semestre); a divisão mede consistência — os dois convivem em abas.

---

## 13. Pontuação revisada

Nota do caso = soma de componentes **com teto individual** (não explorável por repetição):

| Componente | Máx. | Mede |
|---|---|---|
| Resultado (vitória, margem, plena/acordo/nulidade) | 150 | Fecho |
| Índice de pertinência (% de réplicas certeiras; termos-chave contam dobrado) | 60 | Leitura da tese |
| Coerência (credibilidade média; zero contradições = selo) | 50 | Tese una |
| Leitura do julgador (% de jogadas no tipo favorecido quando havia opção) | 40 | Adaptação |
| Linhas fechadas e sinergias ativadas | 40 | Construção |
| Eficiência (fôlego bem usado, rodadas economizadas) | 30 | Recursos |
| Missão do caso cumprida | 30 | Objetivo secundário |
| Recuperação (vitória após balança ≤ 30) | 30 | Resiliência |
| Erros (laterais, contradições, objeções sofridas) | −60 | Custo do erro |

Jornada: soma dos casos + 300 pela vitória final + até 50 da sustentação escrita (IA) + selo "sem embargos". A nota vira o insumo dos PM e do relatório didático (§14). Anti-farm: componentes não crescem com volume de cartas — crescem com **taxa de acerto**; jogar mais cartas erradas só subtrai.

---

## 14. Aprendizado sem interromper

- **No momento** (1 linha, no log): "réplica certeira — a inversão do ônus responde exatamente à tese de contrato cumprido" / "lateral — a tese é sobre *nexo causal*, não sobre contrato".
- **Sob demanda**: botão "i" já existente vira ficha completa (o que é o instituto, quando se usa, disciplina, base legal); **glossário** pesquisável fora da rodada.
- **Relatório da sentença** (fim do caso, 20 s de leitura): 3 blocos — *o que decidiu o caso* (a jogada de maior impacto), *o que custou caro* (o pior erro, com a alternativa que estava na mão: "na rodada 3 você tinha o Laudo pericial — refutaria a tese por termo-chave"), *domínio por área* (+4 Penal, −1 Consumidor). Comparação decisão × alternativa melhor: automática, pois o motor conhece a mão.
- **Evolução visível**: o medidor de domínio por disciplina (§12.3) no perfil e no fim da jornada.
- Regra de ouro: **nenhum texto obrigatório com mais de 140 caracteres durante a rodada**; profundidade sempre opt-in.

## 15. Retenção sem tarefa artificial

- **Caso do dia** (mantido; agora alimenta PM 1×/dia) e **Pauta da semana**: um modificador global semanal legível ("semana do consumidor: teses consumeristas em dobro; juízes pragmáticos") — muda o meta do deck-building toda semana, como os portais do TFT.
- **Desafio de banca** (semanal): 1 caso autoral difícil, mesma semente para todos, placar próprio, selo cosmético.
- **Codex/coleção**: cada carta jogada 5× desbloqueia a página doutrinária completa; coleção por disciplina com progresso — colecionar = estudar.
- **Comparação com a turma**: aba do placar filtrada pelo semestre/turma do aluno (o campo já existe no banco).
- **Temporada acadêmica** com fecho de semestre (hall, molduras).
- Nada de login diário, moedas, pop-up, barra vazia. A retenção vem de: subir a divisão, fechar o codex, dominar áreas, o caso do dia com os colegas e o desafio da semana.

---

## 16. Dois casos redesenhados (exemplos completos)

### Caso A (comum, TJRS): *Klein vs. Banco Platino* — consumidor
- **Julgadora**: Dra. Feijó, pragmática (Fato ×1,4 · Norma ×0,7) — a foto da professora de Consumidor, vinda do banco.
- **Mecânica da área**: **inversão do ônus** — se o jogador fecha uma linha com prova (F) + CDC (N) até a rodada 3, o ônus inverte: sustentações adversas passam a valer −30%.
- **Missão do caso**: manter credibilidade ≥ 7 até a Deliberação (recompensa: carta rara na escolha).
- **Instrução (r1)**: entram 2 provas no mercado do caso (extrato bancário, gravação do atendimento — cartas temporárias só deste caso); jogador ensaia a gravação e abre a linha com *Boa-fé objetiva*.
- **Sustentação (r2-r4)**: teses de consumidor e contrato; **virada na r3**: "o banco junta a cláusula assinada" — o pool de teses muda para contrato, e a etiqueta das cartas de contrato acende. Adversário arquétipo *formalista* (2 questionamentos no ciclo).
- **Deliberação (r5)**: balança em 68 → **oferta de acordo** (vitória a ×0,6). Recusar e fechar a linha com o extrato = plena possível. A decisão-assinatura do caso.
- **Educacional**: vulnerabilidade, inversão do ônus, cláusula abusiva — vividos como regra, não lidos.

### Caso B (chefe, TJRS): *Apelação criminal — Barcellos* — penal
- **Julgador**: Dr. Metódio (neutro) — chefes testam a construção, não o favor.
- **Mecânica da área**: **cadeia de custódia** — cartas de Fato jogadas sem ensaio sofrem impugnação automática (valem 60%); ensaiadas, valem 100% e não podem ser questionadas.
- **Adversário**: *persecutor* — cicla sustentações pesadas e, se reconhecer padrão de Fato, prepara "quebra de custódia" (anula a próxima prova não ensaiada).
- **Missão**: vencer usando 3 disciplinas distintas (recompensa: relíquia menor extra).
- **Estrutura (7 rodadas)**: Instrução dupla (r1-r2: ensaiar DNA e reconstituição, abrir linha *negativa de autoria*); Sustentação r3-r6 com **virada na r5**: "testemunha muda o depoimento" — a linha de negativa perde 1 encaixe; o jogador decide entre reinquirir (Técnica, 2 fôlego) ou pivotar para a linha processual; **Deliberação r7**: se pivotou, a **nulidade** está viva (preliminar ensaiada + questão de ordem + embargos = vitória técnica).
- **Sensação**: um chefe que se vence de dois jeitos — pela prova blindada ou pelo processo — e pune o meio-termo.

## 17. Exemplo de sequência de rodadas (Caso A, r2-r3)

**R2 — Pauta**: carimbo; tese "*O consumidor leu e aceitou todas as cláusulas*" (tema: consumidor; termo-chave: *dever de informação*). Adverso anuncia *sustentação 14*. Juíza: neutra. **Construção**: jogador tem CDC (N, réplica direta pelo termo), Testemunha (F, pertinente), Peroração (R, lateral aqui). Decisão: CDC no fundamento (réplica direta +2, mas Norma ×0,7 na pragmática…) ou Testemunha primeiro (juíza ×1,4)? Joga Testemunha (prova) → peso forte, juíza anota; CDC (fundamento) → papel rasgado, +1 credibilidade; guarda 1 fôlego → +1 Preparo. **Resolução adversa**: sustentação cai (−14, parcialmente contida pela preliminar da r1). **Gancho**: prévia — "a parte adversa prepara a juntada de um documento…"
**R3 — Virada**: "o banco junta a cláusula" (as etiquetas de contrato acendem na mão). Tese nova de contrato; o jogador gasta 2 Preparo para **ensaiar** a gravação do atendimento e fecha a linha na r4 com arremate de Retórica — tese fechada, inversão do ônus ativa, juíza passa a "atenta". Três decisões relevantes em ~90 segundos.

---

## 18. Métricas de sucesso

**Simulação (harness, 3 bots — aleatório / aprendiz / tático):**
- Jornadas vencidas: ≤ 15% / 45-55% / 85-90% (o degrau entre bots é a métrica de expressão de habilidade).
- Casos individuais do bot aleatório: ≤ 35% (hoje ~84%).

**Telemetria (tabela `partidas` estendida):**
- % de argumentos laterais por jogador: **decrescente** nas 10 primeiras jornadas (alvo: −20 p.p.) — a prova de que o jogo ensina.
- Duração mediana do caso comum: 4-6 min; da rodada: ≤ 45 s; abandono intra-caso: < 8% (e onde).
- Taxa de aceitação de acordo: 40-60% (fora disso, o preço está errado).
- Missões cumpridas: ~50%; uso de Preparo por caso: ≥ 2.
- Retenção: D1 ≥ 40%, D7 ≥ 20% na turma-piloto; jornadas por sessão ≥ 1,3.
- Competitivo: distribuição de divisões em pirâmide saudável (≤ 1% Catedrático); PM médio por jornada estável entre divisões.

**Qualitativa**: teste com 8-12 alunos; a frase-alvo do redesign ("perdi porque construí mal, sei o que melhorar") deve aparecer espontaneamente em ≥ metade das entrevistas.

## 19. Plano de implementação por prioridade

- **P0 — o jogo fica difícil e vivo (1ª leva)**: credibilidade + faixas; penalidade estrutural do lateral; fases do processo com 5/7/8 rodadas; os 5 beats da rodada (carimbo, rasgo, pesos, reações do juiz, gancho); régua do rito no lugar do contador; terceiro bot no harness e recalibragem completa; relatório da sentença v1.
- **P1 — profundidade estratégica (2ª leva)**: linha argumentativa (bandeja + tese fechada); linhas de defesa incompatíveis; Preparo + ensaio; arquétipos adversários + reconhecimento de padrão; momento de virada; missões de caso; acordo; comeback.
- **P2 — competição e meta (3ª leva)**: Ordem do Mérito (PM, subdivisões, banca de promoção, temporadas = semestres) — novas tabelas `rank_alunos` e `temporadas` no Postgres; trilhas de carreira; pauta da semana; pontuação v2 completa; domínio por disciplina.
- **P3 — polimento (contínuo)**: ambientes por instância; identidade sonora expandida; codex/coleção; desafio de banca; nulidade; modo "audiência direta".

Cada leva termina com: harness nos alvos, smoke no navegador (desktop + 390 px), teste com alunos quando possível.

## 20. Remover, manter, reformular — e riscos

**Remover**: ponderação a cada 3 rodadas (freio invisível; o anti-bola-de-neve agora é estrutural: fases, acordo, comeback); contador "rodada X/12"; preview de dano calculado na carta (mantida a força-base — o cálculo é do aluno); movimento *pressão* (redundante com o ritmo novo — fôlego já é apertado).

**Manter**: balança como coração; tese → réplica; 4 tipos; multiplicadores de julgador; voga no Plenário; embargos (1 por jornada); relíquias; caso do dia; jornada 3 instâncias / 8 casos; identidade visual FMP; arquivo único no cliente; harness como guardião do balanceamento; login/backend/Postgres como estão.

**Reformular**: oponentes (números → arquétipos com padrão e tells); pontuação (velocidade → qualidade jurídica); demo guiada (reescrever para o loop novo, com desbloqueio progressivo de regras nos casos 1-3 da primeira jornada); log (vira "autos do caso" com filtro didático).

**Riscos e mitigações**:
1. *Sobrecarga cognitiva no calouro* (credibilidade + linhas + Preparo + sinergias de uma vez) → desbloqueio progressivo: caso 1 só regras-base; credibilidade entra no caso 2; linhas no caso 3; Preparo na 2ª jornada. A demo cobre um sistema por vez.
2. *Espiral de credibilidade frustrante* → piso 2 nos casos 1-2, reconsideração 1×/caso, recuperação clara (+1 por acerto).
3. *Acordo dominante ou inútil* → monitorar taxa de aceitação (40-60%) e ajustar o multiplicador (0,55-0,7).
4. *Animação virando lentidão* → tudo pulável, teto de 400 ms, modo direto, medir tempo de rodada na telemetria.
5. *Elo desmotivador para casual* → divisões baixas sem perda de PM; missões de trilha dão progresso mesmo em derrota.
6. *Exploração de PM/pontos* → tetos por componente, PM decrescente no dia, semente repetida não pontua.
7. *Arquivo único crescendo demais* → aceitável até ~250 KB; se passar, quebrar o JS em módulos servidos pelo backend (sem build).
8. *Conteúdo jurídico raso ou errado* → toda tese/chave nova passa por revisão docente antes de entrar (processo editorial: arquivo `TESES` é conteúdo, não código).

---

*Documento de trabalho — v4 "Audiência viva". A implementação segue as levas do §19; o harness e as métricas do §18 são o critério de aceite de cada leva.*
