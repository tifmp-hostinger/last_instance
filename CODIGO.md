# Última Instância — documentação técnica do código

Tudo vive em um único `index.html` (~75 KB, zero dependências, fontes via Google Fonts). Três blocos: CSS, HTML das telas e um `<script>` organizado em seções comentadas. Este documento mapeia onde mexer para cada necessidade.

## Estado global (JS)

| Variável | Papel |
|---|---|
| `CONFIG` | topo do script: versão, semestre, `API_BASE`, `AI_WEBHOOK`, `PORTAL_URL`. É o único ponto que a TI precisa editar. |
| `S` | a jornada (run): deck, relíquias, caso atual (0-7), pontos, embargos, modo diário, bônus inicial, fase. |
| `B` | a batalha corrente: convicção `p`, rodada, prazo, mão/pilhas, fôlego, contenções, statuses (`pressa`, `quest`, `dobra`, `negate`), julgador, oponente, `jogadas` (para a IA), `vogaIdx` (plenário), flag `demo`. |
| `PERFIL` | identidade do aluno: `{nome, ra, sem, token}` — vem da URL (SSO) ou do formulário. |
| `TEMA`, `VIBRA`, `mudo` | preferências do aparelho (tela Configurações). |
| RNG | mulberry32 com semente. O Caso do dia deriva a semente da data; cada propósito usa um sub-gerador `rngDe('caso', i)` etc. (`hashStr`), o que torna a jornada determinística e resistente a salvar/retomar. |

Chaves de `localStorage`: `ui_fmp_run` (save), `ui_fmp_placar` (top 10 local), `ui_perfil`, `ui_fila` (partidas aguardando API), `ui_demo_vista`, `ui_mudo`, `ui_tema`, `ui_vibra`.

## Fluxo de telas

`mostrar(id)` alterna seções: `scr-title` → `scr-battle` → (`modal` de resultado) → `scr-reward` → `scr-event` → … → `scr-over`, além de `scr-placar` e `scr-config`. O `modal()` genérico recebe título, HTML e botões — todo diálogo do jogo passa por ele (`travado:true` impede fechar pelo fundo).

## Fluxo de uma rodada (funções principais)

`iniciarCaso(retry)` monta `B` (retry = embargos: reusa caso e julgador) → `iniciarRodada()` (expira a contenção própria, aplica pressa, compra 5) → `jogarCarta(i)` (fórmula de dano documentada no GAME-DESIGN; efeitos em `fx`: `draw`/`block`/`energy`/`negate`/`cleanse`/`dobra`/`pierce`/`exaust`) → `encerrarRodada()` → `turnoAdversario()` (executa o movimento anunciado, ponderação do julgador a cada 3 rodadas, voga do plenário a cada 2) → volta a `iniciarRodada()` ou `finalizarCaso(venceu, motivo)` → `aposCaso()` → recompensas (`recompensaCartas`/`recompensaReliquia`) e eventos (`evento`).

## Conteúdo (onde editar)

- **Cartas**: objeto `CARTAS` — uma linha por carta: nome, tipo (`N`/`F`/`R`/`T`), custo, base, raridade (`c`/`r`), `texto`, `fala` (frase didática), `disc` (disciplina da grade), `combo` e `fx` (efeito). Adicionar carta = nova linha + nada mais (o pool deriva sozinho).
- **Julgadores**: `JUIZES` — multiplicadores em `mult`, **foto do professor em `foto`** (URL ou data-URI; o avatar recorta em círculo automaticamente).
- **Oponentes**: `OPONENTES` — lista `moves` cíclica; os números aqui são o principal botão de dificuldade.
- **Estrutura da jornada**: `JORNADA` — 8 entradas com instância, oponente, prazo e flags `boss`/`dark`/`plenario`.
- **Casos procedurais**: `SOBRENOMES`, `EMPRESAS`, `ACOES` (título + área + papel da defesa), `TEMAS_STF`.
- **Relíquias**: `RELIQUIAS`; efeitos são checados por código (`S.relics.indexOf('vade')` etc.; tipo→relíquia em `RELIQUIA_TIPO`).

## Subsistemas

- **Balança**: SVG `#balanca`; `setBalanca(p)` define o ângulo-alvo e o loop `rAF` (`loopFX`) anima com easing, posicionando os pratos por trigonometria (a trave gira em torno do pivô; os pratos transladam para as pontas).
- **FX**: canvas `#fx` com partículas (estrela FMP de 4 pontas desenhada em `estrela4`), teto de 700 partículas, DPR limitado a 2.
- **Áudio**: WebAudio puro (`som.*`) — osciladores e rajadas de ruído filtrado; nenhum asset.
- **Demo guiada**: `verDemo()` fabrica um `B` com `demo:true`, roda uma linha do tempo de passos (`demoTimers`), com `#demoShield` bloqueando toques e `#demoBar` narrando. `finalizarCaso` tem guarda para nunca disparar na demo. `pararDemo()` limpa timers e restaura o estado real.
- **Rede**: `fetchJSON` (timeout + Bearer), `enviarPartida` → `enfileirar`/`processarFila` (fila offline em `ui_fila`), `verPlacar(aba)` com as três abas, `abrirSustentacaoIA`/`enviarSustentacao` (juiz de IA; valida e limita a resposta no cliente — 120 a 1200 caracteres, nota 0-50).
- **SSO**: `lerTokenURL()` lê `?t=&nome=&ra=&sem=`, sanitiza, salva o perfil e limpa a URL.
- **Tema**: `setTema(darkDoContexto)` combina o contexto da jornada (STF = escuro) com a preferência (`TEMA` auto/claro/escuro) e atualiza `meta theme-color`.

## Convenções de CSS

Tokens em `:root` (cores FMP, `--spring` para molas, raios); modo escuro via `body.dark`. Estética liquid glass na classe `.glass` (backdrop-filter + borda translúcida + brilho interno) — sem bibliotecas. Fundos vivos: `#fundo::before/::after` com gradientes radiais em animação lenta (só `transform`, barato; respeita `prefers-reduced-motion`). Mobile-first com breakpoints em 900px (desktop), 720px de altura e paisagem baixa; safe areas via `env(safe-area-inset-*)`; `hidden` reforçado com `display:none !important`.

## Testes

`outputs/harness.js` roda o jogo inteiro sem navegador: stub de DOM, timers síncronos e dois bots (ingênuo e tático) jogando dezenas de jornadas. Uso: `node outputs/harness.js index.html 100 [smart|naive|ambos]`. Serve para regressão de lógica e para calibrar dificuldade após qualquer mudança em `CARTAS`/`OPONENTES`. A sintaxe é validada com `node --check` sobre o `<script>` extraído (o próprio harness faz isso antes de rodar).

Estado da calibragem (n=200 por bot): ingênuo **62%** de jornadas vencidas (alvo 60-65%), tático **99%** — o bot tático joga com disciplina perfeita (lê julgador, ordena combos, guarda perfurantes contra contenção, anula sustentações grandes) e funciona como teto de habilidade, não como aluno dedicado típico. O jogo expõe `window.UI_API` para o harness e para depuração no console.

## Checklist para mudanças comuns

Trocar dificuldade: números em `OPONENTES` → rodar harness → conferir taxas. Nova carta: linha em `CARTAS` (com `fala` e `disc`) → harness. Foto de professor: `foto:` no julgador. Novo semestre: `CONFIG.SEMESTRE`. Ativar ranking em rede: `CONFIG.API_BASE`. Ativar juiz de IA: `CONFIG.AI_WEBHOOK`.
