#!/usr/bin/env node
/* ============================================================
   Última Instância — harness de simulação (sem navegador)
   Uso: node outputs/harness.js [index.html] [nJornadas] [smart|naive|ambos]
   Stub de DOM + timers síncronos + dois bots:
   - ingênuo: joga cartas aleatórias que couberem no fôlego,
     ignora julgador, combos e a jogada anunciada;
   - tático: lê o julgador, ordena combos, guarda perfurantes
     para a contenção e anula sustentações grandes.
   Serve para regressão de lógica e calibragem de dificuldade
   após qualquer mudança em CARTAS/OPONENTES.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const arquivo = process.argv[2] || path.join(__dirname, '..', 'index.html');
const N = parseInt(process.argv[3] || '40', 10);
const quem = (process.argv[4] || 'ambos').toLowerCase();

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

/* ---------- bots ---------- */
function valorMovimento(mov){
  if (mov.t === 'dano') return mov.v;
  if (mov.t === 'conten') return mov.v * 0.7;
  if (mov.t === 'quest') return 4;
  if (mov.t === 'press') return 3;
  return 0;
}

function botJogaRodada(api, smart, rnd){
  const { B } = api.estado();
  if (!B || B.fim) return;
  const CARTAS = api.CARTAS;
  let guarda = 0;
  while (guarda++ < 30){
    const { S, B } = api.estado();
    if (!B || B.fim) return;
    const mov = B.opon.moves[B.movIdx % B.opon.moves.length];
    const jogaveis = B.mao
      .map((id, i) => ({ id, i, carta: CARTAS[id] }))
      .filter(c => {
        const tese = !B.teseUsada && S.relics.indexOf('tese') >= 0;
        return (tese ? 0 : c.carta.custo) <= B.folego;
      });
    if (!jogaveis.length) break;

    let escolha;
    if (!smart){
      // ingênuo: carta aleatória que caiba, sem ler nada
      escolha = jogaveis[Math.floor(rnd() * jogaveis.length)];
      const previa = api.computarDano(escolha.carta, B);
      if (previa.dano <= 0 && !(escolha.carta.fx) && escolha.carta.custo > 0) {
        // até o ingênuo não paga fôlego por zero
        const util = jogaveis.filter(c => api.computarDano(c.carta, B).dano > 0 || c.carta.fx);
        if (!util.length) break;
        escolha = util[Math.floor(rnd() * util.length)];
      }
    } else {
      // tático: pontua cada carta no contexto da rodada
      let melhor = null, melhorNota = -1;
      for (const c of jogaveis){
        const prev = api.computarDano(c.carta, B);
        let nota = prev.dano;
        const fx = c.carta.fx || {};
        if (fx.block && mov.t === 'dano') nota += Math.min(fx.block, mov.v) * 0.9;
        if (fx.negate) nota += valorMovimento(mov) > 6 ? valorMovimento(mov) : 0;
        if (fx.draw) nota += fx.draw * 2.2;
        if (fx.energy) nota += 2.5;
        if (fx.cleanse && B.quest) nota += 3;
        if (fx.dobra){
          // vale se ainda há carta forte para dobrar depois
          const forte = jogaveis.some(o => o.id !== c.id && api.computarDano(o.carta, B).dano >= 8);
          nota += forte ? 9 : -2;
        }
        // habilitar combos: se outra carta na mão pede o tipo desta, adianta jogá-la
        const habilita = B.mao.some(oid => {
          const o = CARTAS[oid];
          return o && o.combo && o.combo.req === c.carta.tipo && oid !== c.id;
        });
        if (habilita) nota += 2.5;
        // custo-eficiência leve
        nota -= c.carta.custo * 0.4;
        if (nota > melhorNota){ melhorNota = nota; melhor = c; }
      }
      if (!melhor || melhorNota <= 0) break;
      escolha = melhor;
    }
    const antes = B.mao.length;
    api.jogarCarta(escolha.i);
    const depois = api.estado().B;
    if (!depois || depois.fim) return;
    if (depois.mao.length === antes && depois.folego === B.folego) break; // jogada recusada
  }
  const fim = api.estado().B;
  if (fim && !fim.fim) api.encerrarRodada();
}

const RANK_CARTAS_SMART = ['confissao','dna','sumula','sustentacao','pericia','habeas','repercussao','narrativa','consequencias','gravacao','cdc','pacta','tutela','cautelar','embargosdec','documento','reconstituicao','analogia','peroracao','indubio','registro','doutrina','amicus','juntada','questao','preliminar','dignidade','ethos','testemunha','boafe','exordio','pausa','dilacao','objecao','legalidade'];
const RANK_RELIQUIAS_SMART = ['cafe','rede','vade','dossie','anel','tese','tribuna','praxe'];

function botRecompensa(api, smart, rnd){
  const oferta = api.ofertaCartas();
  const { S } = api.estado();
  if (!smart){
    api.escolherRecompensa(oferta[Math.floor(rnd() * oferta.length)]);
    return;
  }
  if (S.deck.length >= 16){ api.pularRecompensa(); return; }  // tático evita inchar o baralho
  let melhor = oferta[0];
  for (const id of oferta){
    if (RANK_CARTAS_SMART.indexOf(id) < RANK_CARTAS_SMART.indexOf(melhor)) melhor = id;
  }
  api.escolherRecompensa(melhor);
}

function botReliquia(api, smart, rnd){
  const oferta = api.ofertaReliquias();
  if (!smart){ api.escolherReliquia(oferta[Math.floor(rnd() * oferta.length)]); return; }
  let melhor = oferta[0];
  for (const id of oferta){
    if (RANK_RELIQUIAS_SMART.indexOf(id) < RANK_RELIQUIAS_SMART.indexOf(melhor)) melhor = id;
  }
  api.escolherReliquia(melhor);
}

function botEvento(api, smart, rnd){
  const { S } = api.estado();
  if (!smart){
    const sorte = rnd();
    if (sorte < 0.34 && S.deck.length > 8){ S.deck.splice(Math.floor(rnd()*S.deck.length), 1); api.proximoCaso(); }
    else if (sorte < 0.67){ const raras = Object.keys(api.CARTAS).filter(id => api.CARTAS[id].rar==='r'); S.deck.push(raras[Math.floor(rnd()*raras.length)]); api.proximoCaso(); }
    else api.eventoConviccao();
    return;
  }
  // tático: tira a carta mais fraca se o baralho engordou; senão +4 de convicção
  if (S.deck.length > 13){
    let piorIdx = 0, piorPos = -1;
    S.deck.forEach((id, i) => {
      const pos = RANK_CARTAS_SMART.indexOf(id);
      if (pos > piorPos){ piorPos = pos; piorIdx = i; }
    });
    S.deck.splice(piorIdx, 1);
    api.proximoCaso();
  } else api.eventoConviccao();
}

/* ---------- uma jornada ---------- */
function jogarJornada(seed, smart){
  const ctx = criarSandbox();
  vm.runInContext(codigo, ctx, { filename: 'jogo.js' });
  const api = ctx.window.UI_API;
  if (!api) throw new Error('UI_API não exposta pelo jogo');
  const rnd = (function(s){ let a = s>>>0; return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; })(seed*2654435761 + (smart?7:0));

  api.novaJornada('livre', 'harness-' + seed);
  const perdeuEm = [];
  let guarda = 0;
  while (guarda++ < 4000){
    const { S, B } = api.estado();
    if (!S || S.vivo === false) break;
    if (S.fase === 'recompensa' && (!B || B.fim)){ botRecompensa(api, smart, rnd); continue; }
    if (S.fase === 'reliquia' && (!B || B.fim)){ botReliquia(api, smart, rnd); continue; }
    if (S.fase === 'evento' && (!B || B.fim)){ botEvento(api, smart, rnd); continue; }
    if (B && !B.fim){ botJogaRodada(api, smart, rnd); continue; }
    if (B && B.fim === 'vitoria'){ api.aposCaso(); continue; }
    if (B && B.fim === 'derrota'){
      perdeuEm.push(B.caso + 1);
      if (S.embargos > 0) api.oporEmbargos();
      else api.encerrarJornadaDerrota();
      continue;
    }
    break;
  }
  const { S } = api.estado();
  if (guarda >= 4000) throw new Error('guarda de loop estourou (seed ' + seed + ')');
  return {
    venceu: S.detalhe.length === JORNADA_LEN,
    casos: S.detalhe.length,
    pontos: S.pontos,
    plenas: S.detalhe.filter(d => d.plena).length,
    perdeuEm,
  };
}
const JORNADA_LEN = 8;

/* ---------- relatório ---------- */
function rodarLote(smart){
  const r = { vitorias: 0, casos: 0, pontos: 0, plenas: 0, quedas: {}, embargosUsados: 0 };
  for (let i = 1; i <= N; i++){
    const j = jogarJornada(i, smart);
    if (j.venceu) r.vitorias++;
    r.casos += j.casos;
    r.pontos += j.pontos;
    r.plenas += j.plenas;
    r.embargosUsados += j.perdeuEm.length ? 1 : 0;
    const queda = j.venceu ? null : j.perdeuEm[j.perdeuEm.length - 1];
    if (queda) r.quedas[queda] = (r.quedas[queda] || 0) + 1;
  }
  return r;
}
function imprime(nome, r){
  const pct = (100 * r.vitorias / N).toFixed(0);
  console.log('— ' + nome + ' —');
  console.log('  jornadas vencidas: ' + r.vitorias + '/' + N + ' (' + pct + '%)');
  console.log('  casos vencidos por jornada: ' + (r.casos / N).toFixed(1) + ' de 8');
  console.log('  pontos médios: ' + Math.round(r.pontos / N));
  console.log('  convicções plenas por jornada: ' + (r.plenas / N).toFixed(1));
  console.log('  jornadas que precisaram de embargos: ' + r.embargosUsados + '/' + N);
  const quedas = Object.keys(r.quedas).sort((a,b)=>a-b).map(c => 'caso ' + c + ': ' + r.quedas[c]).join(' · ');
  console.log('  onde caiu: ' + (quedas || '—'));
}

console.log('Última Instância · harness — ' + N + ' jornadas por bot — ' + path.basename(arquivo));
if (quem === 'naive' || quem === 'ambos') imprime('bot ingênuo (alvo 60–65%)', rodarLote(false));
if (quem === 'smart' || quem === 'ambos') imprime('bot tático (alvo 85–90%)', rodarLote(true));
