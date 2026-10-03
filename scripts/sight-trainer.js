(() => {
'use strict';
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const S = 12; // staff space in SVG units

/* ---------- pitch helpers ---------- */
const LETTERS = ['C','D','E','F','G','A','B'];
const PC = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function parse(n){
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  const L = m[1], acc = m[2] || '', oct = +m[3];
  const alt = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  return {letter:L, acc, oct, dia:oct*7 + LETTERS.indexOf(L), midi:(oct+1)*12 + PC[L] + alt};
}
const dia = n => parse(n).dia;
const nameFromDia = d => LETTERS[d % 7] + Math.floor(d / 7);
function naturals(lo, hi){ const a=[]; for(let d=dia(lo); d<=dia(hi); d++) a.push(nameFromDia(d)); return a; }
function withAcc(list){
  const a=[];
  for(const n of list){
    a.push(n);
    const L=n[0], o=n.slice(1);
    if(L!=='E' && L!=='B') a.push(L+'#'+o);
    if(L!=='F' && L!=='C') a.push(L+'b'+o);
  }
  return a;
}
const SHARP_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_NAMES =['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function spell(m, flat){ return (flat?FLAT_NAMES:SHARP_NAMES)[m%12] + (Math.floor(m/12)-1); }
function fmt(n){ return n[0] + (n[1]==='#'?'♯':n[1]==='b'?'♭':'') + n.replace(/^[A-G][#b]?/,''); }
const BOTTOM = {treble:dia('E4'), bass:dia('G2'), alto:dia('F3'), tenor:dia('D3')};
const T = ns => ns.map(n => ({clef:'treble', n}));
const B = ns => ns.map(n => ({clef:'bass', n}));

/* ---------- levels ---------- */
const LEVELS = [
  {title:'Treble landmarks', staff:'treble', pool:T(['C4','G4','C5']), desc:'Middle C, G on the second line, and C in the third space. Learn these cold, then read other notes as steps from them.'},
  {title:'Treble lines', staff:'treble', pool:T(['E4','G4','B4','D5','F5']), desc:'The five lines: E, G, B, D, F.'},
  {title:'Treble spaces', staff:'treble', pool:T(['F4','A4','C5','E5']), desc:'The four spaces: F, A, C, E.'},
  {title:'Whole treble staff', staff:'treble', pool:T(naturals('D4','G5')), desc:'Every natural note from D4 to G5.'},
  {title:'Bass landmarks', staff:'bass', pool:B(['F3','C3','C4']), desc:'F on the fourth line, C in the second space, and middle C just above the staff.'},
  {title:'Bass lines', staff:'bass', pool:B(['G2','B2','D3','F3','A3']), desc:'The five lines: G, B, D, F, A.'},
  {title:'Bass spaces', staff:'bass', pool:B(['A2','C3','E3','G3']), desc:'The four spaces: A, C, E, G.'},
  {title:'Whole bass staff', staff:'bass', pool:B(naturals('E2','C4')), desc:'Every natural note from E2 to middle C.'},
  {title:'Grand staff', staff:'grand', pool:[...T(naturals('C4','G5')), ...B(naturals('E2','C4'))], desc:'Both staves mixed, so you switch clefs on every note.'},
  {title:'Treble ledger lines', staff:'treble', pool:T(naturals('G3','D6')), desc:'The treble staff plus ledger lines, from G3 up to D6.'},
  {title:'Bass ledger lines', staff:'bass', pool:B(naturals('C2','E4')), desc:'The bass staff plus ledger lines, from C2 up to E4.'},
  {title:'Grand staff with ledger lines', staff:'grand', pool:[...T(naturals('A3','C6')), ...B(naturals('C2','E4'))], desc:'Both staves, including the ledger notes between and around them.'},
  {title:'Sharps and flats', staff:'grand', pool:[...T(withAcc(naturals('C4','G5'))), ...B(withAcc(naturals('E2','C4')))], desc:'Accidentals on both staves. Any key that sounds the right pitch counts.'},
  {title:'Full range', staff:'grand', pool:[...T(withAcc(naturals('G3','D6'))), ...B(withAcc(naturals('C2','E4')))], desc:'Everything above, mixed together.'},
];
const PASS_CORRECT = 18, WINDOW = 20, PASS_MS = 3000;

/* ---------- storage ---------- */
const KEY = 'note-trainer-v1';
const DEFAULTS = {settings:{octave:true, retry:true, hint:true, labels:true}, mastered:{}, notes:{}, sel:'L0', custom:{clef:'treble', lo:'C4', hi:'C5', acc:false}};
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return {...structuredClone(DEFAULTS), ...d, settings:{...DEFAULTS.settings, ...(d.settings||{})}, custom:{...DEFAULTS.custom, ...(d.custom||{})}};
  }catch(e){ return structuredClone(DEFAULTS); }
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); }catch(e){} }
const store = load();

/* ---------- state ---------- */
let cfg = null, current = null, prev = null, ghost = null;
let startT = 0, attempts = 0, locked = false, noteState = '', nextTimer = 0;
let sess = {total:0, correct:0, streak:0, best:0, timeSum:0};
let win = [];
let focusWeak = false;
const passedNow = {};

/* ---------- exercise selection ---------- */
const levelSel = $('#levelSel');
function buildLevelSel(){
  levelSel.innerHTML = '';
  LEVELS.forEach((L,i) => {
    const o = document.createElement('option');
    o.value = 'L'+i;
    o.textContent = `${i+1}. ${L.title}${store.mastered[i] ? '  ✓' : ''}`;
    levelSel.appendChild(o);
  });
  const o = document.createElement('option'); o.value='custom'; o.textContent='Custom range'; levelSel.appendChild(o);
  levelSel.value = store.sel;
  if(!levelSel.value){ levelSel.value = 'L0'; store.sel = 'L0'; }
}
function customRange(clef){
  if(clef === 'grand') return [10, 46]; // F1 to G6
  return [BOTTOM[clef]-8, BOTTOM[clef]+16]; // four ledger lines each way
}
function buildCustomSelects(){
  const c = store.custom;
  const [a,b] = customRange(c.clef);
  for(const sel of [$('#cLo'), $('#cHi')]){
    sel.innerHTML = '';
    for(let d=a; d<=b; d++){ const o=document.createElement('option'); o.value=nameFromDia(d); o.textContent=nameFromDia(d); sel.appendChild(o); }
  }
  const clamp = n => nameFromDia(Math.min(b, Math.max(a, dia(n))));
  c.lo = clamp(c.lo); c.hi = clamp(c.hi);
  if(dia(c.lo) > dia(c.hi)) [c.lo, c.hi] = [c.hi, c.lo];
  $('#cClef').value = c.clef; $('#cLo').value = c.lo; $('#cHi').value = c.hi; $('#cAcc').checked = c.acc;
}
function makeCfg(){
  win = []; focusWeak = false;
  if(store.sel === 'custom'){
    const c = store.custom;
    let notes = naturals(c.lo, c.hi);
    if(c.acc) notes = withAcc(notes);
    let pool;
    if(c.clef === 'grand') pool = notes.map(n => ({clef: dia(n) >= dia('C4') ? 'treble' : 'bass', n}));
    else pool = notes.map(n => ({clef:c.clef, n}));
    cfg = {staff:c.clef, pool, idx:null};
    $('#desc').textContent = `Notes from ${fmt(c.lo)} to ${fmt(c.hi)}${c.acc ? ', with sharps and flats' : ''}.`;
    $('#custom').classList.add('show');
  } else {
    const i = +store.sel.slice(1);
    cfg = {...LEVELS[i], idx:i};
    $('#desc').textContent = LEVELS[i].desc;
    $('#custom').classList.remove('show');
  }
  hideBanner();
  updateStats();
  pick();
}

/* ---------- drawing ---------- */
function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  if(parent) parent.appendChild(e);
  return e;
}
const CLEF_CHAR = {treble:'\u{1D11E}', bass:'\u{1D122}', alto:'\u{1D121}', tenor:'\u{1D121}'};
function staves(){
  return cfg.staff === 'grand' ? [{clef:'treble', top:72}, {clef:'bass', top:192}] : [{clef:cfg.staff, top:72}];
}
function render(){
  const svg = $('#staff');
  const grand = cfg.staff === 'grand';
  const W = 340, H = grand ? 300 : 192;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const x0 = 14, x1 = W - 14;
  const sts = staves();
  for(const st of sts){
    for(let i=0; i<5; i++) el('line', {x1:x0, y1:st.top+i*S, x2:x1, y2:st.top+i*S, class:'staffline'}, svg);
    const bottomY = st.top + 4*S;
    const t = el('text', {x:x0+8, y: st.clef==='tenor' ? bottomY - S : bottomY, 'font-size':4*S, class:'mus'}, svg);
    t.textContent = CLEF_CHAR[st.clef];
    el('line', {x1:x1, y1:st.top, x2:x1, y2:bottomY, class:'bar'}, svg);
  }
  if(grand){
    el('line', {x1:x0, y1:sts[0].top, x2:x0, y2:sts[1].top+4*S, class:'bar'}, svg);
    el('line', {x1:x0-5, y1:sts[0].top-1, x2:x0-5, y2:sts[1].top+4*S+1, class:'bracket'}, svg);
  } else {
    el('line', {x1:x0, y1:sts[0].top, x2:x0, y2:sts[0].top+4*S, class:'bar'}, svg);
  }
  if(!current) return;
  const st = sts.find(s => s.clef === current.clef) || sts[0];
  const NX = 196;
  drawNote(svg, st, current, NX, noteState);
  if(ghost){
    const g = parse(ghost);
    const p = g.dia - BOTTOM[st.clef];
    if(p >= -10 && p <= 18) drawNote(svg, st, g, NX + 46, 'ghost');
  }
  svg.setAttribute('aria-label', `A note on the ${st.clef} staff`);
}
function drawNote(svg, st, note, x, cls){
  const bottomY = st.top + 4*S;
  const p = note.dia - BOTTOM[st.clef];
  const y = bottomY - p*S/2;
  const g = el('g', {class:'note ' + (cls||'')}, svg);
  for(let q=-2; q>=p; q-=2) el('line', {x1:x-13, y1:bottomY-q*S/2, x2:x+13, y2:bottomY-q*S/2, class:'ledger'}, g);
  for(let q=10; q<=p; q+=2) el('line', {x1:x-13, y1:bottomY-q*S/2, x2:x+13, y2:bottomY-q*S/2, class:'ledger'}, g);
  // Whole-note head as a true ring (even-odd fill), so staff and ledger lines show through the hole
  const RX = 8.2, RY = 5.7, rx = 4.4, ry = 2.8, ang = -55, t = ang * Math.PI / 180;
  const dx = rx * Math.cos(t), dy = rx * Math.sin(t);
  const d = `M ${x-RX} ${y} a ${RX} ${RY} 0 1 0 ${2*RX} 0 a ${RX} ${RY} 0 1 0 ${-2*RX} 0 Z ` +
            `M ${x-dx} ${y-dy} a ${rx} ${ry} ${ang} 1 0 ${2*dx} ${2*dy} a ${rx} ${ry} ${ang} 1 0 ${-2*dx} ${-2*dy} Z`;
  el('path', {d, 'fill-rule':'evenodd', class:'head'}, g);
  if(note.acc){
    const t = el('text', {x:x-28, y:y + S/2, 'font-size':4*S, class:'mus acc'}, g);
    t.textContent = note.acc === '#' ? '\u266F' : '\u266D';
  }
}

/* ---------- game loop ---------- */
const UNIFORM_SHARE = 0.3;
function weakness(pool){
  const stats = pool.map(it => store.notes[it.clef + ':' + it.n]);
  const ref = median(stats.filter(s => s && s.c).map(s => s.ms / s.c)) || PASS_MS;
  return stats.map(s => {
    const miss = s ? (s.n - s.c + 1) / (s.n + 2) : 0.5;
    const slow = s && s.c ? Math.min(3, Math.max(0.5, s.ms / s.c / ref)) : 1;
    return slow * (1 + 4*miss);
  });
}
function sample(pool, w){
  if(!w || Math.random() < UNIFORM_SHARE) return pool[Math.floor(Math.random()*pool.length)];
  let r = Math.random() * w.reduce((a,b) => a+b, 0);
  for(let i=0; i<pool.length; i++){ r -= w[i]; if(r < 0) return pool[i]; }
  return pool[pool.length-1];
}
function pick(){
  clearTimeout(nextTimer);
  const pool = cfg.pool;
  const w = focusWeak ? weakness(pool) : null;
  let it;
  do { it = sample(pool, w); }
  while(pool.length > 1 && prev && it.n === prev.n && it.clef === prev.clef);
  prev = it;
  current = {...it, ...parse(it.n)};
  attempts = 0; locked = false; ghost = null; noteState = '';
  clearHint();
  setFeedback('Play the note shown.', 'idle');
  render();
  startT = performance.now();
}
function setFeedback(text, cls){ const f = $('#feedback'); f.textContent = text; f.className = 'feedback ' + cls; }
const mod12 = v => ((v % 12) + 12) % 12;
function handleInput(m){
  flash(m, 'press', 140);
  if(!current || locked) return;
  const ms = performance.now() - startT;
  const ok = store.settings.octave ? m === current.midi : mod12(m - current.midi) === 0;
  if(ok){
    if(attempts === 0) record(true, ms);
    locked = true; ghost = null; noteState = 'ok';
    render();
    setFeedback(attempts === 0 ? `Correct: ${fmt(current.n)} in ${(ms/1000).toFixed(1)} s` : `That's it: ${fmt(current.n)}`, 'ok');
    nextTimer = setTimeout(pick, attempts === 0 ? 380 : 750);
    return;
  }
  if(attempts === 0) record(false, ms);
  attempts++;
  ghost = spell(m, current.acc === 'b');
  flash(m, 'wrong', 600);
  if(store.settings.hint) showHint(current.midi);
  render();
  let msg = `You played ${fmt(ghost)}.`;
  if(store.settings.octave && mod12(m - current.midi) === 0) msg += ' Right note, wrong octave.';
  if(store.settings.retry){
    setFeedback(msg + ' Try again.', 'bad');
  } else {
    locked = true;
    setFeedback(`${msg} The note was ${fmt(current.n)}.`, 'bad');
    nextTimer = setTimeout(pick, 1500);
  }
}

/* ---------- stats & mastery ---------- */
const median = a => { if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); const h=s.length>>1; return s.length%2 ? s[h] : (s[h-1]+s[h])/2; };
function record(ok, ms){
  sess.total++;
  if(ok){ sess.correct++; sess.streak++; sess.best = Math.max(sess.best, sess.streak); sess.timeSum += ms; }
  else sess.streak = 0;
  const k = current.clef + ':' + current.n;
  const s = store.notes[k] || (store.notes[k] = {n:0, c:0, ms:0});
  s.n++; if(ok){ s.c++; s.ms += ms; }
  win.push({ok, ms}); if(win.length > WINDOW) win.shift();
  checkMastery();
  save();
  updateStats();
  if($('#slowDetails').open) renderSlow();
}
function windowSummary(){
  const correct = win.filter(w => w.ok).length;
  const med = median(win.filter(w => w.ok).map(w => w.ms));
  return {correct, med};
}
function checkMastery(){
  if(cfg.idx === null || win.length < WINDOW || passedNow[cfg.idx]) return;
  const {correct, med} = windowSummary();
  if(correct >= PASS_CORRECT && med <= PASS_MS){
    passedNow[cfg.idx] = true;
    const firstTime = !store.mastered[cfg.idx];
    store.mastered[cfg.idx] = true;
    const sel = levelSel.value; buildLevelSel(); levelSel.value = sel;
    const hasNext = cfg.idx < LEVELS.length - 1;
    $('#bannerText').textContent = `${firstTime ? 'Level passed' : 'Passed again'}: ${correct} of your last ${WINDOW} correct, median ${(med/1000).toFixed(1)} s.` + (hasNext ? ` Next up: ${LEVELS[cfg.idx+1].title}.` : ' That was the last level. Custom range is open for targeted work.');
    $('#nextLevel').hidden = !hasNext;
    $('#banner').classList.add('show');
  }
}
function hideBanner(){ $('#banner').classList.remove('show'); }
function updateStats(){
  const pct = sess.total ? Math.round(100*sess.correct/sess.total) : 0;
  const avg = sess.correct ? (sess.timeSum/sess.correct/1000).toFixed(1) + ' s' : '–';
  $('#stats').innerHTML =
    `<div><span>Correct </span><b>${sess.correct}/${sess.total}</b>${sess.total ? ` <span>(${pct}%)</span>` : ''}</div>` +
    `<div><span>Streak </span><b>${sess.streak}</b> <span>(best ${sess.best})</span></div>` +
    `<div><span>Average time </span><b>${avg}</b></div>`;
  const {correct, med} = windowSummary();
  $('#meterFill').style.width = (100*correct/WINDOW) + '%';
  const medTxt = med ? `, median ${(med/1000).toFixed(1)} s` : '';
  $('#meterText').textContent = cfg && cfg.idx !== null
    ? `Last ${WINDOW} notes: ${correct} correct${medTxt}. To pass, get ${PASS_CORRECT} of ${WINDOW} right with a median under ${PASS_MS/1000} s.`
    : `Last ${WINDOW} notes: ${correct} correct${medTxt}.`;
}
function renderSlow(){
  const rows = Object.entries(store.notes)
    .filter(([,s]) => s.n >= 3)
    .map(([k,s]) => { const [clef,n] = k.split(':'); return {clef, n, acc: s.c/s.n, avg: s.c ? s.ms/s.c : Infinity, count:s.n}; })
    .sort((a,b) => (b.avg/Math.max(b.acc,.25)) - (a.avg/Math.max(a.acc,.25)))
    .slice(0, 8);
  const box = $('#slow');
  if(!rows.length){ box.innerHTML = '<p class="empty">Play a few rounds and the notes that take you longest will show up here.</p>'; return; }
  box.innerHTML = '<table><thead><tr><th>Note</th><th>Clef</th><th>Average time</th><th>Accuracy</th><th>Seen</th></tr></thead><tbody>' +
    rows.map(r => `<tr><td><b>${fmt(r.n)}</b></td><td>${r.clef}</td><td>${isFinite(r.avg) ? (r.avg/1000).toFixed(1)+' s' : '–'}</td><td>${Math.round(r.acc*100)}%</td><td>${r.count}</td></tr>`).join('') +
    '</tbody></table>';
}

/* ---------- on-screen keyboard ---------- */
const KB_LO = 24, KB_HI = 96; // C1 to C7, covering every custom range (F1 to G♯6)
const isBlack = m => [1,3,6,8,10].includes(m % 12);
const keyEls = {};
function buildKeyboard(){
  const wrap = $('#keys'); wrap.innerHTML = '';
  let wi = 0;
  for(let m=KB_LO; m<=KB_HI; m++){
    const k = document.createElement('button');
    k.type = 'button'; k.tabIndex = -1;
    k.className = 'key ' + (isBlack(m) ? 'black' : 'white');
    k.setAttribute('aria-label', spell(m, false));
    if(isBlack(m)) k.style.left = `calc(${wi} * var(--ww) - var(--bw) / 2)`;
    else {
      k.style.left = `calc(${wi} * var(--ww))`; wi++;
      if(m % 12 === 0){ const l = document.createElement('span'); l.className = 'clabel'; l.textContent = 'C' + (m/12 - 1); k.appendChild(l); }
    }
    k.addEventListener('pointerdown', e => { e.preventDefault(); handleInput(m); });
    wrap.appendChild(k); keyEls[m] = k;
  }
  wrap.style.width = `calc(${wi} * var(--ww))`;
  requestAnimationFrame(() => {
    const kw = $('#kbwrap'), c4 = keyEls[60];
    kw.scrollLeft = c4.offsetLeft - kw.clientWidth/2 + 40;
  });
}
const flashTimers = {};
function flash(m, cls, ms){
  const k = keyEls[m]; if(!k) return;
  const id = m + cls;
  clearTimeout(flashTimers[id]);
  k.classList.add(cls);
  flashTimers[id] = setTimeout(() => k.classList.remove(cls), ms);
}
let hintEl = null;
function showHint(m){ clearHint(); hintEl = keyEls[m] || null; if(hintEl) hintEl.classList.add('hint'); }
function clearHint(){ if(hintEl){ hintEl.classList.remove('hint'); hintEl = null; } }

/* ---------- computer keyboard ---------- */
const KEYMAP = {a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,';':16};
let kbOct = 4;
function updKbHint(){
  $('#kbhint').innerHTML = `No MIDI keyboard? Click the keys above, or type <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>E</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>T</kbd> <kbd>G</kbd> <kbd>Y</kbd> <kbd>H</kbd> <kbd>U</kbd> <kbd>J</kbd> <kbd>K</kbd> for C up to C. <kbd>Z</kbd> and <kbd>X</kbd> shift the octave (A is now C${kbOct}).`;
}
document.addEventListener('keydown', e => {
  if(e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if(tag === 'select' || tag === 'input' || tag === 'textarea') return;
  const k = e.key.toLowerCase();
  if(k === 'z'){ kbOct = Math.max(1, kbOct-1); updKbHint(); return; }
  if(k === 'x'){ kbOct = Math.min(6, kbOct+1); updKbHint(); return; }
  if(Object.prototype.hasOwnProperty.call(KEYMAP, k)){ e.preventDefault(); handleInput((kbOct+1)*12 + KEYMAP[k]); }
});

/* ---------- MIDI ---------- */
let midiAccess = null;
function midiStatus(text, state){
  $('#midiText').textContent = text;
  $('#midi').className = 'midi ' + (state || '');
  $('#midiRetry').hidden = state === 'on';
}
function onMidi(e){
  const [st, d1, d2] = e.data;
  if((st & 0xF0) === 0x90 && d2 > 0) handleInput(d1);
}
function refreshInputs(){
  const ins = [...midiAccess.inputs.values()];
  ins.forEach(i => { i.onmidimessage = onMidi; });
  if(ins.length) midiStatus('MIDI: ' + ins.map(i => i.name).join(', '), 'on');
  else midiStatus('No MIDI keyboard found. Plug one in, then press Retry.', '');
}
async function initMidi(){
  if(!navigator.requestMIDIAccess){
    midiStatus('This browser has no Web MIDI. Use Chrome, Edge, or Firefox.', 'err');
    $('#midiRetry').hidden = true;
    return;
  }
  if(midiAccess){ refreshInputs(); return; }
  try{
    midiAccess = await navigator.requestMIDIAccess();
    midiAccess.onstatechange = refreshInputs;
    refreshInputs();
  }catch(err){
    midiStatus('MIDI access was blocked. Allow it when the browser asks, then press Retry.', 'err');
  }
}
$('#midiRetry').addEventListener('click', initMidi);

/* ---------- wiring ---------- */
levelSel.addEventListener('change', () => { store.sel = levelSel.value; save(); makeCfg(); });
$('#cClef').addEventListener('change', e => { store.custom.clef = e.target.value; buildCustomSelects(); save(); makeCfg(); });
$('#cLo').addEventListener('change', e => { store.custom.lo = e.target.value; buildCustomSelects(); save(); makeCfg(); });
$('#cHi').addEventListener('change', e => { store.custom.hi = e.target.value; buildCustomSelects(); save(); makeCfg(); });
$('#cAcc').addEventListener('change', e => { store.custom.acc = e.target.checked; save(); makeCfg(); });
$('#nextLevel').addEventListener('click', () => {
  if(cfg.idx === null || cfg.idx >= LEVELS.length-1) return;
  store.sel = 'L' + (cfg.idx+1); levelSel.value = store.sel; save(); makeCfg();
});
$('#dismiss').addEventListener('click', () => { focusWeak = true; hideBanner(); });
$('#slowDetails').addEventListener('toggle', () => { if($('#slowDetails').open) renderSlow(); });

const bind = (id, key, after) => {
  const box = $(id); box.checked = store.settings[key];
  box.addEventListener('change', () => { store.settings[key] = box.checked; save(); if(after) after(); });
};
const applyLabels = () => $('#keys').classList.toggle('clabels-off', !store.settings.labels);
bind('#sOct', 'octave'); bind('#sRetry', 'retry'); bind('#sHint', 'hint'); bind('#sLabels', 'labels', applyLabels);
$('#reset').addEventListener('click', () => {
  if(!confirm('Reset passed levels and note timing history?')) return;
  store.mastered = {}; store.notes = {}; save();
  sess = {total:0, correct:0, streak:0, best:0, timeSum:0};
  const sel = levelSel.value; buildLevelSel(); levelSel.value = sel;
  makeCfg(); renderSlow();
});

buildLevelSel();
buildCustomSelects();
buildKeyboard();
applyLabels();
updKbHint();
makeCfg();
initMidi();
if(document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
