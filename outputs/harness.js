#!/usr/bin/env node
/* ============================================================
   Última Instância — harness de simulação (sem navegador)
   Uso: node outputs/harness.js [public/index.html] [nJornadas] [perfil|todos]
   Stub de DOM + timers síncronos + arquétipos de jogador:
   - cego (alias naive): joga qualquer carta que caiba, sem ler
     nada (nem tese, nem julgador). Alvo: ~20% de jornadas.
   - confuso: lê a pertinência só às vezes (55%); quando não,
     confunde "número grande" com "carta certa" — o erro clássico
     do jogador mediano. Nunca usa preparo. Aceita todo acordo sem
     pensar. Diagnóstico, sem alvo fixo — mede o meio-termo real.
   - aprendiz: lê SÓ a pertinência da tese e prefere réplicas;
     ignora julgador, linha, credibilidade e preparo. Alvo: 45-55%.
   - atento (alias smart/tático): lê tudo — tese, palavra-chave,
     julgador, linha na ordem, credibilidade, preparo, acordo.
     Alvo: 85-90% (teto).
   - otimizador-*: tenta ativamente quebrar o sistema.
       lateral  → ignora pertinência, sempre joga a carta de maior
                  força-base impressa (aposta que número bruto bate
                  a penalidade de tema).
       acordo   → joga honesto até ~55 de convicção, depois SEGURA
                  (só joga cartas de bloqueio/baixo custo) para
                  garantir a janela de acordo e aceita a primeira
                  oferta sempre — testa se "acomodar-se" rende mais
                  que jogar para vencer.
       ensaio   → ensaia (2 de preparo) todo rascunho/raro assim
                  que cai na mão, não importa o momento — testa se
                  bancar o ensaio sem timing bate o uso cirúrgico.
     Nenhum deve superar o bot-atento em pontos ou taxa de vitória;
     se superar, é um exploit real a corrigir.
   O degrau entre cego → confuso → aprendiz → atento é a medida de
   expressão de habilidade.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const arquivo = process.argv[2] || path.join(__dirname, '..', 'public', 'index.html');
const N = parseInt(process.argv[3] || '60', 10);
const quem = (process.argv[4] || 'todos').toLowerCase();
const ALIAS = { cego:'naive', atento:'smart' };
function resolvePerfil(p){ return ALIAS[p] || p; }

/* ---------- stub de DOM ---------- */
function makeClassList(){
  const set = new Set();
  return {
    add(...c){ c.forEach(x=>set.add(x)); },
    remove(...c){ c.forEach(x=>set.delete(x)); },
    toggle(c,f){ if (f===undefined) set.has(c)?set.delete(c):set.add(c); else f?set.add(c):set.delete(c); return set.has(c); },
    contains(c){ return set.has(c); }
  };
}
function makeEl(tag){
  const el = {
    tagName: (tag||'div').toUpperCase(),
    style: {}, dataset: {}, classList: makeClassList(),
    children: [], attributes: {},
    value: '', disabled: false, textContent: '', innerHTML: '',
    get firstChild(){ return el.children[0] || null; },
    get lastChild(){ return el.children[el.children.length-1] || null; },
    appendChild(c){ el.children.push(c); return c; },
    insertBefore(c, ref){ const i = el.children.indexOf(ref); if (i<0) el.children.push(c); else el.children.splice(i,0,c); return c; },
    removeChild(c){ const i = el.children.indexOf(c); if (i>=0) el.children.splice(i,1); return c; },
    remove(){},
    setAttribute(k,v){ el.attributes[k]=v; },
    getAttribute(k){ return el.attributes[k]!==undefined ? el.attributes[k] : null; },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return makeEl(); },
    querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, width:0, height:0 }; },
    getContext(){ return null; },
    focus(){}, click(){},
  };
  return el;
}

function criarSandbox(){
  const porId = new Map();
  const document = {
    readyState: 'complete',
    body: makeEl('body'),
    hidden: false,
    getElementById(id){ if (!porId.has(id)) porId.set(id, makeEl()); return porId.get(id); },
    createElement(tag){ return makeEl(tag); },
    querySelector(){ return makeEl(); },
    querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){},
  };
  const mem = new Map();
  const sandbox = {
    console,
    document,
    navigator: {},
    location: { search: '', pathname: '/' },
    history: { replaceState(){} },
    localStorage: {
      getItem(k){ return mem.has(k) ? mem.get(k) : null; },
      setItem(k,v){ mem.set(k, String(v)); },
      removeItem(k){ mem.delete(k); },
    },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    requestAnimationFrame(){ return 0; },
    cancelAnimationFrame(){},
    setTimeout(fn){ fn(); return 0; },     // timers síncronos: a rodada resolve na hora
    clearTimeout(){},
    setInterval(){ return 0; }, clearInterval(){},
    fetch(){ return Promise.reject(new Error('offline no harness')); },
    URLSearchParams,
    Math, Date, JSON,
    addEventListener(){}, removeEventListener(){},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

/* ---------- carga do jogo ---------- */
const html = fs.readFileSync(arquivo, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m){ console.error('Não encontrei o <script> do jogo em ' + arquivo); process.exit(1); }
const codigo = m[1];
new vm.Script(codigo, { filename: 'jogo.js' });   // valida a sintaxe antes de rodar

/* ---------- orquestração de "todos": um processo do SO por perfil ----------
   Cada jornada cria um vm.createContext novo; em lotes grandes (n=150 × vários
   perfis) o V8 não recicla rápido o bastante sozinho, nem com gc() explícito —
   isolar cada perfil no seu próprio processo devolve a memória ao SO ao final
   de cada um, em vez de acumular contextos vivos ao longo de todo o "todos". */
const MACHINE = process.env.HARNESS_MACHINE === '1';
if (quem === 'todos'){
  const { spawnSync } = require('child_process');
  const PERFIS_TODOS = ['cego', 'confuso', 'aprendiz', 'atento', 'otimizador-lateral', 'otimizador-acordo', 'otimizador-ensaio'];
  console.log('Última Instância · harness v4 — ' + N + ' jornadas por bot — ' + path.basename(arquivo));
  const resultados = {};
  let cabecalhoOtimizadorImpresso = false;
  PERFIS_TODOS.forEach(function(p){
    if (p.indexOf('otimizador') === 0 && !cabecalhoOtimizadorImpresso){
      console.log('— diagnóstico anti-exploit (nenhuma variante deve superar o bot-atento) —');
      cabecalhoOtimizadorImpresso = true;
    }
    const r = spawnSync(process.execPath, [__filename, arquivo, String(N), p], {
      encoding: 'utf8', env: Object.assign({}, process.env, { HARNESS_MACHINE: '1' })
    });
    var resumo = null;
    (r.stdout || '').split('\n').forEach(function(l){
      if (l.indexOf('##RESULT##') === 0) resumo = JSON.parse(l.slice('##RESULT##'.length));
      else if (l.trim()) console.log(l);
    });
    if (r.status !== 0){
      console.error('  (processo do perfil "' + p + '" falhou — status ' + r.status + ')');
      if (r.stderr) process.stderr.write(r.stderr);
    }
    resultados[p] = resumo;
    if (p.indexOf('otimizador') === 0 && resultados.atento && resumo && (resumo.pct > resultados.atento.pct || resumo.pontos > resultados.atento.pontos)){
      console.log('  ⚠ ' + p + ' SUPEROU o bot-atento — possível exploit real.');
    }
  });
  process.exit(0);
}

/* ---------- utilidades dos bots ---------- */
function valorMovimento(mov){
  if (!mov) return 0;
  if (mov.t === 'dano') return mov.v;
  if (mov.t === 'conten') return mov.v * 0.7;
  if (mov.t === 'quest' || mov.t === 'impugna') return 5;
  return 0;
}
function jogaveisDe(api){
  const { S, B } = api.estado();
  return B.mao.map((id, i) => ({ id, i, carta: api.CARTAS[id] }))
    .filter(c => {
      const tese = !B.teseUsada && S.relics.indexOf('tese') >= 0;
      return (tese ? 0 : c.carta.custo) <= B.folego;
    });
}

/* ---------- as três cabeças ---------- */
function botJogaRodada(api, perfil, rnd){
  let { B } = api.estado();
  if (!B || B.fim) return;
  const rodadaInicial = B.rodada;
  const CARTAS = api.CARTAS;
  let guarda = 0;
  while (guarda++ < 30){
    const st = api.estado(); B = st.B;
    if (!B || B.fim || B.rodada !== rodadaInicial) return;  // indeferimento pode ter virado a rodada
    const mov = api.movimentoAtual();
    const jogaveis = jogaveisDe(api);
    if (!jogaveis.length) break;

    let escolha = null;
    if (perfil === 'naive'){
      // aleatório puro: não lê tese, julgador nem credibilidade
      escolha = jogaveis[Math.floor(rnd() * jogaveis.length)];
      const previa = api.computarDano(escolha.carta, B);
      if (previa.dano <= 0 && !escolha.carta.fx && escolha.carta.custo > 0){
        const util = jogaveis.filter(c => api.computarDano(c.carta, B).dano > 0 || c.carta.fx);
        if (!util.length) break;
        escolha = util[Math.floor(rnd() * util.length)];
      }
    } else if (perfil === 'aprendiz'){
      // lê só a pertinência: joga réplicas quando as tem, senão qualquer coisa
      const pertinentes = jogaveis.filter(c => api.cartaPertinente(c.carta, B.tese) === true);
      const pool = pertinentes.length ? pertinentes : jogaveis;
      escolha = pool[Math.floor(rnd() * pool.length)];
    } else if (perfil === 'confuso'){
      // jogador mediano: metade das vezes lê a pertinência corretamente;
      // a outra metade comete o erro clássico — acha que "número maior" é "carta certa".
      // nunca mexe em preparo (o sistema passa despercebido); nunca pede reconsideração.
      const pertinentes = jogaveis.filter(c => api.cartaPertinente(c.carta, B.tese) === true);
      if (pertinentes.length && rnd() < 0.55){
        escolha = pertinentes[Math.floor(rnd() * pertinentes.length)];
      } else {
        escolha = jogaveis.reduce((m, c) => (c.carta.base > m.carta.base ? c : m), jogaveis[0]);
      }
    } else if (perfil === 'otimizador-lateral'){
      // aposta que força-base bruta bate a penalidade de argumento lateral — ignora tudo mais
      escolha = jogaveis.reduce((m, c) => (c.carta.base > m.carta.base ? c : m), jogaveis[0]);
    } else if (perfil === 'otimizador-ensaio'){
      // bancarizador: ensaia todo rascunho/raro assim que cai na mão, sem olhar o momento
      const p = jogaveis.find(c => (c.carta.rascunho || c.carta.rar === 'r') && !B.ensaiadas[c.id] && B.prep >= 2);
      if (p){ api.gastarPreparo('ensaiar', p.i); continue; }
      const pertinentes = jogaveis.filter(c => api.cartaPertinente(c.carta, B.tese) === true);
      const pool = pertinentes.length ? pertinentes : jogaveis;
      escolha = pool[Math.floor(rnd() * pool.length)];
    } else if (perfil === 'otimizador-acordo'){
      // joga honesto até ~55, depois só sustenta o mínimo (bloqueio/custo baixo) pra travar na janela de acordo
      const pertinentes = jogaveis.filter(c => api.cartaPertinente(c.carta, B.tese) === true);
      if (B.p >= 53){
        const seguro = jogaveis.filter(c => (c.carta.fx && c.carta.fx.block) || c.carta.custo === 0);
        if (!seguro.length) break;   // não empurra mais a balança de propósito
        escolha = seguro[Math.floor(rnd() * seguro.length)];
      } else {
        const pool = pertinentes.length ? pertinentes : jogaveis;
        escolha = pool[Math.floor(rnd() * pool.length)];
      }
    } else {
      // tático: pontua cada carta no contexto completo da rodada
      // preparo primeiro: ensaia rascunhos na instrução, arma objeção contra golpes grandes
      if (B.fase === 'instrucao' && B.prep >= 2){
        const rasc = jogaveis.find(c => c.carta.rascunho && !B.ensaiadas[c.id]);
        if (rasc){ api.gastarPreparo('ensaiar', rasc.i); continue; }
      }
      if (B.prep >= 3 && !B.negate && mov && mov.t === 'dano' && mov.v >= 20){
        api.gastarPreparo('objecao'); continue;
      }
      if (B.cred <= 1 && !B.reconsideracaoUsada){ api.reconsiderar(); return; }

      let melhor = null, melhorNota = -1;
      const temPertinente = jogaveis.some(c => api.cartaPertinente(c.carta, B.tese) === true);
      const ult = B.histTipos.slice(-2);
      for (const c of jogaveis){
        const prev = api.computarDano(c.carta, B);
        let nota = prev.dano;
        const pert = api.cartaPertinente(c.carta, B.tese);
        if (pert === true) nota += 3;
        else if (pert === false){ nota -= temPertinente ? 6 : 3; if (B.cred <= 4) nota -= 6; }
        // linha na ordem: fundamento → prova → arremate
        const prox = !B.linha.f ? 'N' : !B.linha.p ? 'F' : !B.linha.a ? 'R' : null;
        if (prox && c.carta.tipo === prox && pert !== false) nota += 3.5;
        // evita o padrão que a parte adversa reconhece (3 do mesmo tipo)
        if (ult.length === 2 && ult[0] === c.carta.tipo && ult[1] === c.carta.tipo) nota -= 5;
        const fx = c.carta.fx || {};
        if (fx.block && mov && mov.t === 'dano') nota += Math.min(fx.block, mov.v) * 0.9;
        if (fx.negate) nota += valorMovimento(mov) > 8 ? valorMovimento(mov) : 0;
        if (fx.draw) nota += fx.draw * 2.2;
        if (fx.energy) nota += 2.5;
        if (fx.cleanse && B.quest) nota += 4;
        if (fx.dobra){
          const forte = jogaveis.some(o => o.id !== c.id && api.computarDano(o.carta, B).dano >= 12);
          nota += forte ? 10 : -2;
        }
        if (c.carta.rascunho && !B.ensaiadas[c.id]) nota -= 4;  // guarda o rascunho para depois do ensaio
        nota -= c.carta.custo * 0.4;
        if (nota > melhorNota){ melhorNota = nota; melhor = c; }
      }
      if (!melhor || melhorNota <= 0) break;
      escolha = melhor;
    }

    const antes = B.mao.length;
    api.jogarCarta(escolha.i);
    const depois = api.estado().B;
    if (!depois || depois.fim || depois.rodada !== rodadaInicial) return;
    if (depois.mao.length === antes && depois.folego === B.folego) break; // jogada recusada
  }
  const fim = api.estado().B;
  if (fim && !fim.fim && !fim.travado && fim.rodada === rodadaInicial) api.encerrarRodada();
}

const RANK_CARTAS_SMART = ['confissao','dna','sumula','sustentacao','pericia','habeas','repercussao','narrativa','consequencias','gravacao','cdc','pacta','tutela','cautelar','embargosdec','documento','reconstituicao','usucapiao','estudosocial','analogia','peroracao','indubio','registro','doutrina','amicus','juntada','questao','preliminar','dignidade','ethos','testemunha','boafe','exordio','pausa','dilacao','objecao','legalidade'];
const RANK_RELIQUIAS_SMART = ['cafe','rede','vade','dossie','anel','tese','tribuna','praxe'];

function botRecompensa(api, perfil, rnd){
  const oferta = api.ofertaCartas();
  const { S } = api.estado();
  if (perfil !== 'smart'){ api.escolherRecompensa(oferta[Math.floor(rnd() * oferta.length)]); return; }
  if (S.deck.length >= 16){ api.pularRecompensa(); return; }
  let melhor = oferta[0];
  for (const id of oferta){ if (RANK_CARTAS_SMART.indexOf(id) < RANK_CARTAS_SMART.indexOf(melhor)) melhor = id; }
  api.escolherRecompensa(melhor);
}
function botReliquia(api, perfil, rnd){
  const oferta = api.ofertaReliquias();
  if (perfil !== 'smart'){ api.escolherReliquia(oferta[Math.floor(rnd() * oferta.length)]); return; }
  let melhor = oferta[0];
  for (const id of oferta){ if (RANK_RELIQUIAS_SMART.indexOf(id) < RANK_RELIQUIAS_SMART.indexOf(melhor)) melhor = id; }
  api.escolherReliquia(melhor);
}
function botEvento(api, perfil, rnd){
  const { S } = api.estado();
  if (perfil !== 'smart'){
    const sorte = rnd();
    if (sorte < 0.34 && S.deck.length > 8){ S.deck.splice(Math.floor(rnd()*S.deck.length), 1); api.proximoCaso(); }
    else if (sorte < 0.67){ const raras = Object.keys(api.CARTAS).filter(id => api.CARTAS[id].rar==='r'); S.deck.push(raras[Math.floor(rnd()*raras.length)]); api.proximoCaso(); }
    else api.eventoConviccao();
    return;
  }
  if (S.deck.length > 13){
    let piorIdx = 0, piorPos = -1;
    S.deck.forEach((id, i) => { const pos = RANK_CARTAS_SMART.indexOf(id); if (pos > piorPos){ piorPos = pos; piorIdx = i; } });
    S.deck.splice(piorIdx, 1);
    api.proximoCaso();
  } else api.eventoConviccao();
}
function botAcordo(api, perfil, rnd){
  const { B } = api.estado();
  if (perfil === 'naive'){ (rnd() < 0.5 ? api.aceitarAcordo : api.recusarAcordo)(); return; }
  if (perfil === 'aprendiz'){ (B.p < 65 ? api.aceitarAcordo : api.recusarAcordo)(); return; }
  if (perfil === 'confuso' || perfil === 'otimizador-acordo'){ api.aceitarAcordo(); return; }  // aceita sem pensar
  (B.p < 62 ? api.aceitarAcordo : api.recusarAcordo)();
}

/* ---------- uma jornada ---------- */
function jogarJornada(seed, perfil){
  const ctx = criarSandbox();
  vm.runInContext(codigo, ctx, { filename: 'jogo.js' });
  const api = ctx.window.UI_API;
  if (!api) throw new Error('UI_API não exposta pelo jogo');
  const SALTS = { smart:7, aprendiz:3, confuso:5, 'otimizador-lateral':11, 'otimizador-ensaio':13, 'otimizador-acordo':17 };
  const salt = SALTS[perfil] || 0;
  const rnd = (function(s){ let a = s>>>0; return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; })(seed*2654435761 + salt);

  api.novaJornada('livre', 'harness-' + seed);
  const perdeuEm = [];
  let guarda = 0;
  while (guarda++ < 6000){
    const { S, B } = api.estado();
    if (!S || S.vivo === false) break;
    if (B && B.acordoPendente && !B.fim){ botAcordo(api, perfil, rnd); continue; }
    if (S.fase === 'recompensa' && (!B || B.fim)){ botRecompensa(api, perfil, rnd); continue; }
    if (S.fase === 'reliquia' && (!B || B.fim)){ botReliquia(api, perfil, rnd); continue; }
    if (S.fase === 'evento' && (!B || B.fim)){ botEvento(api, perfil, rnd); continue; }
    if (B && !B.fim){ botJogaRodada(api, perfil, rnd); continue; }
    if (B && B.fim === 'vitoria'){ api.aposCaso(); continue; }
    if (B && B.fim === 'derrota'){
      // v6: perder um caso não elimina — registra e segue para o próximo (sem embargos)
      perdeuEm.push(B.caso + 1);
      api.aposCasoPerdido();
      continue;
    }
    break;
  }
  const { S } = api.estado();
  if (guarda >= 6000) throw new Error('guarda de loop estourou (seed ' + seed + ', ' + perfil + ')');
  const casosVenc = S.detalhe.filter(d => d.venceu).length;
  return {
    venceu: casosVenc === 8,          // "impecável" = 8/8 (o topo, não mais a condição de sobreviver)
    casos: casosVenc,
    pontos: S.pontos,
    plenas: S.detalhe.filter(d => d.plena).length,
    acordos: S.detalhe.filter(d => d.acordo).length,
    perdeuEm,
  };
}

/* ---------- relatório ---------- */
// cada jornada cria um vm.createContext novo (~3700 linhas de jogo); em lotes grandes (n=150 ×
// vários perfis) o V8 não recicla rápido o bastante sozinho — força a coleta a cada 20 jornadas.
function liberarMemoria(){ if (typeof global.gc === 'function') global.gc(); }
function rodarLote(perfil){
  const r = { vitorias: 0, casos: 0, casosTot: 0, pontos: 0, plenas: 0, acordos: 0, quedas: {}, derrotasCaso: 0, disputasCaso: 0 };
  for (let i = 1; i <= N; i++){
    const j = jogarJornada(i, perfil);
    if (j.venceu) r.vitorias++;
    r.casos += j.casos;
    r.pontos += j.pontos;
    r.plenas += j.plenas;
    r.acordos += j.acordos;
    r.derrotasCaso += j.perdeuEm.length;
    r.disputasCaso += j.casos + j.perdeuEm.length;
    // v6: registra TODAS as posições onde perdeu um caso (não só a última — não há mais "queda" única)
    j.perdeuEm.forEach(function(c){ r.quedas[c] = (r.quedas[c] || 0) + 1; });
    if (i % 20 === 0) liberarMemoria();
  }
  liberarMemoria();
  return r;
}
function imprime(nome, alvo, r){
  // v6: a jornada não elimina — toda jornada joga os 8 casos. A métrica de habilidade passa a ser
  // "% de casos vencidos" (não mais "sobreviver aos 8"). "impecáveis" (8/8) é só o topo.
  const pctCaso = r.disputasCaso ? (100 * (r.disputasCaso - r.derrotasCaso) / r.disputasCaso) : 0;
  const pctCasoTxt = pctCaso.toFixed(0);
  const pctImpec = (100 * r.vitorias / N).toFixed(0);
  console.log('— ' + nome + ' (alvo ' + alvo + ') —');
  console.log('  casos vencidos: ' + pctCasoTxt + '% (' + (r.casos / N).toFixed(1) + ' de 8 por jornada) · impecáveis 8/8: ' + r.vitorias + '/' + N + ' (' + pctImpec + '%)');
  console.log('  pontos médios: ' + Math.round(r.pontos / N) + ' · plenas/jornada: ' + (r.plenas / N).toFixed(1) + ' · acordos/jornada: ' + (r.acordos / N).toFixed(1));
  const quedas = Object.keys(r.quedas).sort((a,b)=>a-b).map(c => 'caso ' + c + ': ' + r.quedas[c]).join(' · ');
  console.log('  casos perdidos por posição: ' + (quedas || '—'));
  const resumo = { pct: Number(pctCaso.toFixed(0)), impecaveis: Number(pctImpec), pontos: Math.round(r.pontos / N) };
  if (MACHINE) console.log('##RESULT##' + JSON.stringify(resumo));   // lido pelo processo-pai em "todos"
  return resumo;
}

if (!MACHINE) console.log('Última Instância · harness v4 — ' + N + ' jornadas por bot — ' + path.basename(arquivo));
const alvo = resolvePerfil(quem);
const resultados = {};
if (alvo === 'naive') resultados.cego = imprime('bot-cego', '~20%', rodarLote('naive'));
if (quem === 'confuso') resultados.confuso = imprime('bot mediano-confuso', 'diagnóstico', rodarLote('confuso'));
if (quem === 'aprendiz') resultados.aprendiz = imprime('bot aprendiz', '45-55%', rodarLote('aprendiz'));
if (alvo === 'smart') resultados.atento = imprime('bot-atento', '~85%', rodarLote('smart'));

const OTIMIZADORES = ['otimizador-lateral', 'otimizador-acordo', 'otimizador-ensaio'];
if (OTIMIZADORES.indexOf(quem) >= 0){
  resultados[quem] = imprime(quem, 'nunca deve superar o bot-atento', rodarLote(quem));
} else if (quem === 'otimizador'){
  console.log('— diagnóstico anti-exploit (nenhuma variante deve superar o bot-atento) —');
  OTIMIZADORES.forEach(function(v){
    const r = imprime(v, 'referência: bot-atento', rodarLote(v));
    resultados[v] = r;
    if (resultados.atento && (r.pct > resultados.atento.pct || r.pontos > resultados.atento.pontos)){
      console.log('  ⚠ ' + v + ' SUPEROU o bot-atento — possível exploit real.');
    }
  });
}
