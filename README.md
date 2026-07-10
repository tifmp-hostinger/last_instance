# Última Instância

O jogo de cartas da FMP — Fundação Escola Superior do Ministério Público. O aluno é a defesa em uma jornada de 8 casos fictícios, do Foro Central de Porto Alegre ao STF, empurrando a **balança da convicção** com argumentos jurídicos reais. Roguelike de deck-building com o Direito como matéria-prima: cada carta traz a disciplina da grade de onde vem e a fala que "diz ao juiz".

## Como rodar

É um único arquivo estático, sem build e sem dependências:

```bash
# qualquer servidor estático serve
npx serve .
# ou simplesmente abra index.html no navegador
```

As fontes (Outfit e Noto Serif) vêm do Google Fonts; sem rede o jogo funciona com as fontes de fallback.

## Configuração (TI)

Tudo o que a TI precisa editar está no objeto `CONFIG`, no topo do `<script>` de `index.html`:

| Chave | Papel |
|---|---|
| `VERSAO` | exibida no título e enviada com as partidas |
| `SEMESTRE` | rótulo do semestre corrente no ranking |
| `API_BASE` | URL da API do placar (vazio = só placar local do aparelho) |
| `AI_WEBHOOK` | URL do juiz de IA para a sustentação escrita nos casos-chefe (vazio = recurso oculto) |
| `PORTAL_URL` | link institucional na tela de configurações |

### Contratos da API (quando `API_BASE` estiver definido)

- `POST {API_BASE}/partidas` — corpo: `{nome, ra, sem, pontos, casos, venceu, modo, seed, quando, v}`. Partidas offline ficam numa fila local (`ui_fila`) e sobem sozinhas.
- `GET {API_BASE}/placar?aba=semestre|hall&sem=...` — resposta: `{itens:[{nome, pontos, detalhe}]}`.
- `POST {AI_WEBHOOK}` — corpo: `{texto, caso:{titulo, area, partes}, perfil, v}`; resposta: `{nota: 0-50, comentario}`.

Autenticação: se o aluno chegou por SSO (`index.html?t=TOKEN&nome=...&ra=...&sem=...`), o token vai em `Authorization: Bearer`.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `index.html` | o jogo inteiro (CSS + telas + lógica) |
| `outputs/harness.js` | simulador sem navegador com dois bots, para regressão e calibragem |
| `GAME-DESIGN.md` | o design do jogo — conceito, loop, fórmula de dano, meta-jogo, identidade |
| `CODIGO.md` | mapa técnico do código — onde mexer para cada necessidade |
| `assets/` | símbolo FMP (estrela de 4 pontas) vetorizado, nas cores da paleta |

## Balanceamento

```bash
node outputs/harness.js index.html 200 ambos
```

Dois bots jogam jornadas completas: o **ingênuo** (ignora julgador e combos) vence ~62% — o alvo pedagógico para o aluno médio é 60-65%; o **tático** (informação perfeita, joga de forma ótima) vence ~99% e é o teto de habilidade. Qualquer mudança em `CARTAS` ou `OPONENTES` pede uma nova rodada do harness.
