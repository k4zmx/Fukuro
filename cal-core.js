// Calendar data: state, the events of a given week, filters, weekly stats and "up next".
const MODES = [
  {k:'light', name:'Light',  icon:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'},
  {k:'dark',  name:'Dark',   icon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'},
  {k:'auto',  name:'Auto',   icon:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'},
];
const FIXED = [
  {k:'Cours', label:typeName('Cours'),  c:'#2b4b7e'},
  {k:'TD',    label:typeName('TD'),     c:'#2f7f86'},
  {k:'TP',    label:typeName('TP'),     c:'#6f5a9a'},
  {k:'job',   label:'Work',             c:'#b39258'},
];
const PALETTE = ['#3f7f74','#c3402c','#5d6670','#8a6d9e','#2b4b7e','#2f7f86','#6f8a3a','#b8901f','#c8692c','#b5546b','#86593f','#1c1a17'];
let SNAP = CFG.snap || 5;
let START = 480, END = 1080, SPAN = 600;
let viewRange = null;   // fixed axis while dragging, so it can grow past the edges

const state = {
  mode:       store.get('mode', 'light'),
  show:       store.get('show', {}),        // clé -> false quand le filtre est décoché
  cats:       store.get('cats', DEFAULT_CATS),
  events:     store.get('events', []),
  ovr:        store.get('ovr', {}),         // modifs d'une seule semaine : {'2026-10-10': {id: {d,s,e} | {hidden:true}}}
  base:       store.get('base', {}),        // modifs permanentes des cours / du travail
  size:       store.get('size', {}),        // hauteur d'un bloc, en fraction de la ligne (taille de ligne fixe)
  groups:     store.get('groups', []),      // [{id, name, members:[ids], collapsed}]
  closed:     store.get('closed', {}),      // sections repliées de la barre latérale
  sideHidden: store.get('sideHidden', false),
  bg:         LS.getItem('jk.bg'),
  cview:      store.get('cview', 'week'),   // 'week' | 'month'
  showFree:   store.get('showFree', false),
};
if (!store.get('catsV2', false)) {
  state.cats = state.cats.filter(c => !['perso','exam','devoir','revision'].includes(c.k));
  store.set('cats', state.cats); store.set('catsV2', true);
}
const save = (...keys) => keys.forEach(k => store.set(k, state[k]));

const NO_CAT = {k:'', label:'Personal', c:'#6b665e'};
const catOf = k => state.cats.find(c => c.k === k) || NO_CAT;
const minuteAt = (x, rect) => START + (x - rect.left) / rect.width * SPAN;

let cur = weekStart(new Date());
let miniMonth = new Date(cur.getFullYear(), cur.getMonth(), 1);
let monthCur = new Date(cur.getFullYear(), cur.getMonth(), 1);
let shown = [], sel = null, popEv = null, popGroup = null, editing = null, editSeries = null, formMode = 'once', weekRows = [], drag = null, suppressUntil = 0;
const picked = new Set();
const groupById = id => state.groups.find(g => g.id === id);

const ICON = {
  clock:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pin:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  user:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  users:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>',
  note:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12l-4 4H4z"/><path d="M8 9h8M8 13h5"/></svg>',
  x:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  pen:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  plus:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};
const HANDLES_X = '<span class="hd" data-h="l"></span><span class="hd" data-h="r"></span>';
const HANDLES = HANDLES_X + '<span class="hd" data-h="t"></span><span class="hd" data-h="b"></span>';

/* ---------- data for a given week ---------- */
function weekEvents(ws = cur){
  const ov = state.ovr[iso(ws)] || {}, out = [];
  const push = ev => {
    const o = ov[ev.id];
    if (o) { if (o.hidden) ev.cancelled = true; else { Object.assign(ev, o); ev.moved = true; } }
    out.push(ev);
  };
  TT.classes.forEach(u => {
    if (u.g && TT.group && u.g !== TT.group) return;
    push({id:u.id, kind:'uni', t:u.t, title:u.sub, c:subjOf(u.sub).c, room:u.room, prof:u.prof, g:u.g, d:u.d, s:u.s, e:u.e, ...state.base[u.id]});
  });
  SHIFTS.forEach(j => {
    if (j.allDay) push({id:j.id, kind:'job', allDay:true, label:j.label, d:j.d});
    else push({id:j.id, kind:'job', title:'Work', soft:j.soft, d:j.d, s:j.s, e:j.e, ...state.base[j.id]});
  });
  state.events.forEach(p => {
    if (p.repeat) return push({...p, kind:'perso', c:catOf(p.cat).c});
    const diff = Math.round((parseISO(p.date) - ws) / 864e5);
    if (diff >= 0 && diff < 7) out.push({...p, kind:'perso', c:catOf(p.cat).c, d:diff});
  });
  // a class during work hours stays visible but gets flagged
  out.forEach(e => {
    if (e.kind !== 'uni' || e.cancelled) return;
    e.clash = out.some(j => j.kind === 'job' && !j.cancelled && j.d === e.d && (j.allDay || overlaps(e, j)));
  });
  return out;
}
const showKey = e => e.kind === 'uni' ? e.t : e.kind === 'job' ? 'job' : catOf(e.cat).k ? 'cat:' + catOf(e.cat).k : 'perso';
const visible = e => state.show[showKey(e)] !== false;

const hm = m => m % 60 ? `${Math.floor(m/60)}h ${pad(m%60)}` : `${m/60}h`;

function statsHTML(ws){
  const evs = weekEvents(ws).filter(e => !e.cancelled && !e.allDay), sum = list => list.reduce((a, e) => a + e.e - e.s, 0);
  const rows = [
    ...FIXED.filter(f => f.k !== 'job').map(f => ({label:f.label, c:f.c, m:sum(evs.filter(e => e.kind === 'uni' && e.t === f.k && !e.clash))})),
    {label:'Work', c:'var(--job-c)', m:sum(evs.filter(e => e.kind === 'job'))},
    ...state.cats.map(c => ({label:c.label, c:c.c, m:sum(evs.filter(e => e.kind === 'perso' && e.cat === c.k))})),
    {label:'Personal', c:NO_CAT.c, m:sum(evs.filter(e => e.kind === 'perso' && !catOf(e.cat).k))},
  ].filter(r => r.m);
  const total = rows.reduce((a, r) => a + r.m, 0), missed = evs.filter(e => e.clash);
  return `<div class="tot"><b>${hm(total)}</b><span>planned</span></div>
    <div class="stack">${rows.map(r => `<i style="--c:${r.c};flex:${r.m}"></i>`).join('')}</div>
    ${rows.map(r => `<div class="st" style="--c:${r.c}"><span class="dot"></span><span>${esc(r.label)}</span><span class="v">${hm(r.m)}</span></div>`).join('')}
    ${missed.length ? `<div class="st miss"><span class="dot"></span><span>Missed classes · ${missed.length}</span><span class="v">${hm(sum(missed))}</span></div>` : ''}`;
}

// next class + next occurrence of each personal activity (Gym, cours d'allemand…)
function renderNext(){
  $('next').innerHTML = nextHTML();
}
function nextHTML(){
  const now = new Date(), ws = weekStart(now);
  const all = [ws, addDays(ws, 7), addDays(ws, 14)].flatMap(w => weekEvents(w).filter(e => !e.cancelled && !e.allDay)
    .map(e => ({...e, at:new Date(w.getFullYear(), w.getMonth(), w.getDate() + e.d, 0, e.s)})))
    .filter(e => e.at > now).sort((a, b) => a.at - b.at);
  const uni = all.find(e => e.kind === 'uni'), seen = new Set(), acts = [];
  all.filter(e => e.kind === 'perso').forEach(e => {
    const key = catOf(e.cat).k ? 'c:' + e.cat : 't:' + e.title.toLowerCase();
    if (!seen.has(key)) { seen.add(key); acts.push(e); }
  });
  const rel = e => {
    const mins = Math.round((e.at - now) / 6e4);
    const off = Math.round((new Date(e.at.getFullYear(), e.at.getMonth(), e.at.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    return {off, txt: mins < 60 ? `in ${mins} min` : off === 0 ? `in ${Math.floor(mins/60)}h ${pad(mins%60)}` : off === 1 ? 'tomorrow' : `in ${off} days`};
  };
  const day = (e, off) => off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : DAYS[e.d];
  let html = '';
  if (uni) {
    const r = rel(uni);
    html += `<div class="nx main" style="--c:${uni.c}"><span class="dot"></span><b>${esc(uni.title)} · ${esc(typeName(uni.t))}</b><span class="in">${r.txt}</span>
      <p>${day(uni, r.off)}, ${fmt(uni.s)}${uni.room ? ' · room ' + esc(uni.room) : ''}</p></div>`;
  }
  html += acts.slice(0, 4).map(e => {
    const r = rel(e), sub = e.detail || (catOf(e.cat).k && catOf(e.cat).label !== e.title ? catOf(e.cat).label : '');
    return `<div class="nx" style="--c:${e.c}"><span class="dot"></span><b>${esc(e.title)}</b><span class="in">${r.txt}</span>
      <p>${day(e, r.off)}, ${fmt(e.s)}${sub ? ' · ' + esc(sub) : ''}</p></div>`;
  }).join('');
  return html || '<p>Nothing planned</p>';
}

function setOvr(wk, id, val){
  if (val) (state.ovr[wk] ||= {})[id] = val;
  else if (state.ovr[wk]) { delete state.ovr[wk][id]; if (!Object.keys(state.ovr[wk]).length) delete state.ovr[wk]; }
  save('ovr');
}
