// App shell: liquid side bar, page switching, quick capture, running-timer pill.
const VIEWS = [
  {k:'overview', name:'Overview', icon:'<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'},
  {k:'calendar', name:'Calendar', icon:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>'},
  {k:'classes',  name:'Classes',  icon:'<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11.2v4.6c1.6 1.5 3.5 2.2 5.5 2.2s3.9-.7 5.5-2.2v-4.6M21.5 9v5"/>'},
  {k:'todos',    name:'To-dos',   icon:'<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="m8 12.2 2.8 2.8L16 9.5"/>'},
  {k:'notes',    name:'Notes',    icon:'<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8h5M9 12.5h6M9 16h4"/>'},
  {k:'chat',     name:'Chat',     icon:'<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h0a2 2 0 0 1-1-1.7z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>'},
  {k:'boards',   name:'Boards',   icon:'<rect x="3" y="4" width="8.5" height="7" rx="1.8"/><rect x="12.5" y="13" width="8.5" height="7" rx="1.8"/><path d="M7.25 11v4.5h5.25"/>'},
  {k:'habits',   name:'Habits',   icon:'<path d="M12 3c.8 3.2 5 5.3 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.9 2.4-5 .3 1.9 1.1 2.9 2.4 3.4C11.4 9.2 11 6 12 3z"/>'},
  {k:'timers',   name:'Timers',   icon:'<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 1.5M9.5 2.5h5"/>'},
  {k:'clocks',   name:'Clocks',   icon:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5M12 3.5C9.6 5.8 8.5 8.7 8.5 12s1.1 6.2 3.5 8.5"/>'},
  {k:'projects', name:'Projects', icon:'<circle cx="6.5" cy="5.5" r="2.2"/><circle cx="6.5" cy="18.5" r="2.2"/><circle cx="17.5" cy="7.5" r="2.2"/><path d="M6.5 7.7v8.6M17.5 9.7c0 4.3-5 3.8-9.6 7"/>'},
  {k:'snippets', name:'Snippets', icon:'<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>'},
  {k:'videos',   name:'Videos',   icon:'<rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="M10 9.2v5.6l4.8-2.8z"/>'},
  {k:'music',    name:'Music',    icon:'<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'},
  {k:'budget',   name:'Budget',   icon:'<path d="M4 7.5a2.5 2.5 0 0 1 2.5-2.5H17v3"/><rect x="4" y="7.5" width="16.5" height="12" rx="2.5"/><path d="M16 13.5h1.5"/>'},
];
// pages reached from the bottom of the bar, not listed with the others
const FOOT_VIEWS = [{k:'settings', name:'Settings'}];
const isView = k => VIEWS.some(v => v.k === k) || FOOT_VIEWS.some(v => v.k === k);
const MODS = {};   // each module registers {render(), tick?()} here
const svg = (path, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const DESK = !!window.deskApp;
const desk = window.deskApp || {progress(){}, flash(){}};

window.VIEW = CFG.startPage === 'last' && isView(store.get('view')) ? store.get('view') : isView(CFG.startPage) ? CFG.startPage : 'overview';

/* ---------- liquid bar ----------
   The bar's right edge is drawn as a path: a smooth bulge (a gaussian) follows the active page
   on a spring and stretches with speed; hovering raises a smaller bulge that melts into it. */
const BAR = {base:60, cx:37, r:23, amp:15, w:30};
const live = {y:0, v:0, hy:0, hv:0, ha:0, hav:0, ready:false};
let barRaf = 0, barLast = 0, hoverBtn = null;

function renderRail(){
  $('rail').innerHTML = `
    <svg class="rail-bg" aria-hidden="true"><path id="barPath"/><circle id="barDot"/></svg>
    <button class="rail-logo" data-nav="overview" aria-label="Fukurō"><span class="owl"></span></button>
    <div class="rail-items" id="railItems">
      ${VIEWS.map(v => `<button class="ri" data-nav="${v.k}" aria-label="${v.name}">${svg(v.icon)}<span class="tip">${v.name}</span>${v.k === 'timers' ? '<span class="ring" id="railRing"></span>' : ''}</button>`).join('')}
    </div>
    <div class="rail-foot">
      <button class="ri" data-rail="search" aria-label="Search">${svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>')}<span class="tip">Search everything · Ctrl+P</span></button>
      <button class="ri" data-rail="capture" aria-label="Quick capture">${svg('<path d="M12 5v14M5 12h14"/>')}<span class="tip">Quick capture · Ctrl+K</span></button>
      <button class="ri" data-rail="mode" aria-label="Light / dark">${svg('')}<span class="tip"></span></button>
      <button class="ri" data-nav="settings" aria-label="Settings">${svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')}<span class="tip">Settings · Ctrl+,</span></button>
    </div>`;
  syncRail();
}

const btnY = b => { const r = b.getBoundingClientRect(), p = $('rail').getBoundingClientRect(); return r.top - p.top + r.height / 2; };
const activeBtn = () => $('rail')?.querySelector(`.ri[data-nav="${window.VIEW}"]`);

function syncRail(){
  const dark = document.documentElement.dataset.mode === 'dark';
  const m = $('rail').querySelector('[data-rail=mode]');
  m.querySelector('svg').innerHTML = dark ? MODES[0].icon : MODES[1].icon;
  m.querySelector('.tip').textContent = dark ? 'Light mode' : 'Dark mode';
  const a = activeBtn();
  if (a && !live.ready) { live.y = live.hy = btnY(a); live.ready = true; }
  kickBar();
}

function kickBar(){ if (!barRaf) { barLast = performance.now(); barRaf = requestAnimationFrame(barFrame); } }
function barFrame(t){
  const dt = Math.min(0.032, (t - barLast) / 1000); barLast = t;
  const a = activeBtn(); if (!a) { barRaf = 0; return; }
  const ty = btnY(a), thy = hoverBtn ? btnY(hoverBtn) : ty, tha = hoverBtn && hoverBtn !== a ? 1 : 0;
  for (let i = 0; i < 2; i++) {
    const h = dt / 2;
    live.v += (230 * (ty - live.y) - 21 * live.v) * h; live.y += live.v * h;
    live.hv += (420 * (thy - live.hy) - 27 * live.hv) * h; live.hy += live.hv * h;
    live.hav += (260 * (tha - live.ha) - 22 * live.hav) * h; live.ha += live.hav * h;
  }
  drawBar();
  const still = Math.abs(live.v) + Math.abs(live.hv) + Math.abs(live.hav) * 40 < 0.6 && Math.abs(ty - live.y) < 0.3 && Math.abs(tha - live.ha) < 0.01;
  barRaf = still ? 0 : requestAnimationFrame(barFrame);
}
function drawBar(){
  const H = $('rail').clientHeight;
  const s = Math.min(1, Math.abs(live.v) / 1100);            // moving fast: wider, flatter, like liquid being dragged
  const amp = BAR.amp * (1 - 0.35 * s), w = BAR.w * (1 + 0.7 * s);
  const ha = 9 * Math.max(0, live.ha), hw = 21;
  let d = `M0,0 L${BAR.base},0`;
  for (let y = 0; y <= H; y += 3) {
    const x = BAR.base + amp * Math.exp(-(((y - live.y) / w) ** 2)) + ha * Math.exp(-(((y - live.hy) / hw) ** 2));
    d += `L${x.toFixed(1)},${y}`;
  }
  $('barPath').setAttribute('d', d + `L${BAR.base},${H}L0,${H}Z`);
  const dot = $('barDot');
  dot.setAttribute('cx', BAR.cx); dot.setAttribute('cy', live.y); dot.setAttribute('r', BAR.r * (1 - 0.08 * s));
  $('rail').querySelectorAll('.ri[data-nav]').forEach(b => b.classList.toggle('on', Math.abs(btnY(b) - live.y) < 13));
}

function go(view){
  if (!isView(view)) return;
  if (window.VIEW === 'calendar' && view !== 'calendar' && typeof closePop === 'function') closePop();
  if (view === 'overview' && window.VIEW !== 'overview' && typeof OV !== 'undefined') OV.fresh = true;   // replay the entrance
  window.VIEW = view; store.set('view', view);
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.dataset.view !== view; });
  if (view === 'calendar') render(); else MODS[view]?.render();
  syncRail(); renderPill();
}

$('rail').addEventListener('click', e => {
  const n = e.target.closest('[data-nav]');
  if (n) return go(n.dataset.nav);
  if (e.target.closest('[data-rail=capture]')) return openCapture();
  if (e.target.closest('[data-rail=search]')) return openSearch();
  if (e.target.closest('[data-rail=mode]')) setMode(document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark');
});
function setMode(m){
  state.mode = m; save('mode'); applyMode(); syncRail();
  if (window.VIEW === 'calendar') render(); else MODS[window.VIEW]?.render();
}
$('rail').addEventListener('pointerover', e => { hoverBtn = e.target.closest('.ri[data-nav]'); kickBar(); });
$('rail').addEventListener('pointerleave', () => { hoverBtn = null; kickBar(); });
addEventListener('resize', kickBar);

document.addEventListener('keydown', e => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === 'k' && !e.target.closest?.('#ntBody')) { e.preventDefault(); return openCapture(); }
  if (k === 'p') { e.preventDefault(); return openSearch(); }
  if (k === ',') { e.preventDefault(); return go('settings'); }
  const i = +e.key - 1;
  if (VIEWS[i]) { e.preventDefault(); go(VIEWS[i].k); }
});

/* ---------- quick capture: to-do by default, YouTube links go to Videos, "snip Title :: cmd" to Snippets ---------- */
function openCapture(){
  if (DESK) return desk.captureShow();
  const t = prompt('Quick capture: a to-do, "note ...", "-300 lunch", a YouTube link, or "snip Title :: command"');
  if (t && t.trim()) captureText(t.trim()).then(r => r?.undo && toast(esc(r.text), [['Undo', () => capUndo && capUndo()]]));
}
// returns what the capture box shows afterwards; anything clear-cut stays local, the rest may go to the AI (ai.js)
let capUndo = null;
async function captureText(text){
  capUndo = null;
  if (/youtu\.?be/.test(text)) { MODS.videos.add(text.match(/\S*youtu\.?be\S*/)[0]); return {text:'Saved to Videos'}; }
  const nt = text.match(/^note\s*:?\s+([\s\S]+)$/i);
  if (nt) { await MODS.notes.capture(nt[1]); return {text:'Note saved in Inbox'}; }
  const m = parseMoney(text);
  if (m && !aiDated(text)) {
    MODS.budget.add(m);
    const e = BG.data.entries[BG.data.entries.length - 1];
    capUndo = () => { BG.data.entries = BG.data.entries.filter(x => x !== e); saveBudget(); refreshMoney(); };
    return {text:`${m.kind === 'out' ? 'Spent' : m.kind === 'in' ? 'Earned' : 'Saved'} ${money(m.amt)}${m.note ? ' · ' + m.note : ''}`, undo:true};
  }
  const sn = text.match(/^snip\s+(.+?)\s*::\s*(.+)$/i);
  if (sn) { MODS.snippets.add({title:sn[1], code:sn[2]}); return {text:'Snippet saved'}; }
  const smart = await aiCapture(text);
  if (smart) return smart;
  const t = text.replace(/^(todo|to-do)\s*:?\s*/i, '');
  MODS.todos.add(t);
  const id = TD.list[TD.list.length - 1].id;
  capUndo = () => { TD.list = TD.list.filter(x => x.id !== id); saveTodos(); refreshAll(); };
  return {text:'To-do · ' + t, undo:true};
}
if (DESK) {
  desk.onCapture(async text => {
    let r; try { r = await captureText(text); } catch (e) { r = {text:'Could not add that', fail:true}; console.error(e); }
    desk.captureDone(r || {text:'Added'});
  });
  desk.onCaptureUndo(() => { if (capUndo) { capUndo(); capUndo = null; toast('Undone'); } });
}
addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
addEventListener('drop', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });

/* ---------- running timer pill (shown on every page except Timers) ---------- */
function renderPill(){
  const pill = $('tpill'), t = typeof leadTimer === 'function' ? leadTimer() : null;
  const ring = $('railRing');
  if (ring) ring.classList.toggle('show', !!t);
  if (!t) { desk.progress(-1); pill.hidden = true; return; }
  desk.progress(t.paused ? -1 : t.progress);
  pill.hidden = window.VIEW === 'timers';
  if (pill.hidden) return;
  pill.classList.toggle('paused', t.paused);
  pill.style.setProperty('--p', t.progress);
  pill.innerHTML = `<span class="pr"></span><b>${esc(t.label)}</b><span class="tm">${t.time}</span>${t.more ? `<small>+${t.more}</small>` : ''}`;
}
$('tpill').addEventListener('click', () => go('timers'));

/* ---------- small shared helpers for module pages ---------- */
const ago = ms => {
  const s = (Date.now() - ms) / 1000;
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : s < 86400 * 2 ? 'yesterday' : s < 86400 * 30 ? `${Math.floor(s / 86400)} days ago` : new Date(ms).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
};
const todayISO = () => iso(new Date());
async function copyText(text, label = 'Copied'){
  try { await navigator.clipboard.writeText(text); toast(label); } catch { toast('Could not copy'); }
}

// one shared modal for module forms: openSheet(html, form => {...}); return false to keep it open
let sheetSubmit = null;
function openSheet(html, onSubmit){
  $('mdForm').innerHTML = html;
  $('mdForm').onchange = $('mdForm').oninput = $('mdForm').onclick = null;
  sheetSubmit = onSubmit;
  $('mdModal').classList.add('show');
  setTimeout(() => $('mdForm').querySelector('input,textarea')?.focus(), 30);
}
const closeSheet = () => $('mdModal').classList.remove('show');
$('mdForm').addEventListener('submit', e => { e.preventDefault(); if (sheetSubmit && sheetSubmit($('mdForm').elements) !== false) closeSheet(); });
$('mdForm').addEventListener('click', e => { if (e.target.closest('[data-sheet=cancel]')) closeSheet(); });
$('mdModal').addEventListener('pointerdown', e => { if (e.target === $('mdModal')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
const sheetActions = (del) => `<div class="actions">${del ? '<button type="button" class="btn danger" data-sheet="delete">Delete</button>' : ''}<span class="sp"></span><button type="button" class="btn" data-sheet="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>`;

// modules load after this file, so start once every script has run
addEventListener('DOMContentLoaded', () => { renderRail(); go(window.VIEW); });
