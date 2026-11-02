// Classes: after each class, mark it Went / Missed / Excused / Cancelled, then see per subject how many you missed.
// Marks live in state.att, keyed "YYYY-MM-DD:classId"; each keeps subject, type and time so edits to the timetable don't lose history.
const ATT_ST = {
  went:  {label:'Went',      long:'You went',         c:'#3f7f74'},
  missed:{label:'Missed',    long:'Missed',           c:'var(--shu)'},
  just:  {label:'Excused',   long:'Missed · excused', c:'#b8901f'},
  off:   {label:'Cancelled', long:'Cancelled',        c:'var(--muted)'},
};
const ATT_I = {
  went:svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 14), missed:svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 14),
  just:svg('<path d="M7 3.5h7.5L18 7v13.5H7z"/><path d="m9.5 13.5 2 2 3.5-4"/>', 14), off:svg('<circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/>', 14),
};
// tracking starts the week the feature first ran; older classes are never asked about
const ATT_FROM = store.get('attFrom', null) || (() => { const k = iso(weekStart(new Date())); store.set('attFrom', k); return k; })();

const attEnded = (date, e) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, e.e) <= new Date();
// every class that has ended since tracking started, newest first
function classOcc(){
  const out = [], now = new Date();
  for (let ws = weekStart(parseISO(ATT_FROM)); ws <= now; ws = addDays(ws, 7))
    weekEvents(ws).forEach(e => {
      if (e.kind !== 'uni' || e.allDay || (e.cancelled && !e.att)) return;
      const date = addDays(ws, e.d), k = iso(date);
      if (k >= ATT_FROM && attEnded(date, e)) out.push({key:k + ':' + e.id, date:k, ev:e});
    });
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.ev.s - a.ev.s);
}
const attPending = () => classOcc().filter(o => !state.att[o.key]);
// a mark whose class was since deleted from the timetable still opens
function attOcc(key){
  const date = key.slice(0, 10), id = key.slice(11), ws = weekStart(parseISO(date));
  const ev = weekEvents(ws).find(e => e.id === id && iso(addDays(ws, e.d)) === date);
  if (ev) return {key, date, ev};
  const r = state.att[key];
  return r && {key, date, ev:{id, kind:'uni', title:r.sub, t:r.t, s:r.s, e:r.e, c:subjOf(r.sub).c, room:''}};
}
const attWhen = o => {
  const n = daysBetween(parseISO(o.date), new Date());
  return `${n === 0 ? 'Today' : n === 1 ? 'Yesterday' : shortDate(parseISO(o.date))}, ${fmt(o.ev.s)}${o.ev.clash ? ' · at work' : ''}`;
};
const attName = e => `${e.title} ${typeName(e.t)}`;

function attRefresh(){
  if (window.VIEW === 'calendar') render(); else MODS[window.VIEW]?.render();
}
function attSet(o, st, note){
  const prev = state.att[o.key];
  if (st) state.att[o.key] = {st, note:note ?? prev?.note ?? '', sub:o.ev.title, t:o.ev.t, date:o.date, s:o.ev.s, e:o.ev.e};
  else delete state.att[o.key];
  save('att'); attRefresh();
  return prev;
}
function attMark(o, st){
  const prev = attSet(o, st);
  toast(`${esc(attName(o.ev))} · ${ATT_ST[st].long}`, [['Undo', () => { if (prev) state.att[o.key] = prev; else delete state.att[o.key]; save('att'); attRefresh(); }], ['Add note', () => openCheckin(o)]]);
}

function openCheckin(o){
  const r = state.att[o.key], e = o.ev;
  openSheet(`<h2>${esc(attName(e))}</h2>
    <p class="field-note">${esc(subjOf(e.title).name)} · ${shortDate(parseISO(o.date))}, ${fmt(e.s)} – ${fmt(e.e)}${e.room ? ' · room ' + esc(e.room) : ''}</p>
    <div class="att-pick">${Object.entries(ATT_ST).map(([k, s]) => `<label style="--c:${s.c}"><input type="radio" name="st" value="${k}" ${r?.st === k ? 'checked' : ''} required><span>${ATT_I[k]}${s.label}</span></label>`).join('')}</div>
    <textarea name="note" class="att-note" rows="3" maxlength="500" placeholder="What happened? e.g. finished chapter 3, TP2 report due Monday">${esc(r?.note || '')}</textarea>
    <label class="att-todo"><input type="checkbox" name="todo"><span>Also add the note to my to-dos</span></label>
    ${sheetActions(!!r).replace('>Delete<', '>Clear mark<')}`, f => {
      const note = f.note.value.trim();
      attSet(o, f.st.value, note);
      if (f.todo.checked && note) { TD.list.push({id:uid('td'), text:`${e.title} ${typeName(e.t)}: ${note}`, due:null, done:false, created:Date.now()}); saveTodos(); toast('Saved · note added to your to-dos'); }
    });
  $('mdForm').querySelector('[data-sheet=delete]')?.addEventListener('click', () => { closeSheet(); attSet(o, null); });
}

function attRowsHTML(list){
  return `<ul class="att-rows">${list.map(o => `<li data-att="${o.key}" style="--c:${o.ev.c}"><span class="dot"></span>
    <button class="nm" data-atts="" title="Add a note"><b>${esc(attName(o.ev))}</b><small>${esc(attWhen(o))}</small></button>
    <span class="att-btns">${Object.entries(ATT_ST).map(([k, s]) => `<button data-atts="${k}" style="--c:${s.c}" title="${s.long}">${ATT_I[k]}<span>${s.label}</span></button>`).join('')}</span></li>`).join('')}</ul>`;
}
function attCardHTML(){
  const p = attPending(); if (!p.length) return '';
  return `<section class="ov-card ov-att" style="--i:3"><h3>Did you go? · ${p.length} to mark<button data-nav-to="classes">Open</button></h3>
    <div class="ov-b">${attRowsHTML(p.slice(0, 4))}${p.length > 4 ? `<button class="ov-link" data-nav-to="classes">+${p.length - 4} more</button>` : ''}</div></section>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-atts]'); if (!b) return;
  const o = attOcc(b.closest('[data-att]').dataset.att); if (!o) return;
  if (b.dataset.atts) attMark(o, b.dataset.atts); else openCheckin(o);
});

/* ---------- when a class ends: one toast + one Windows notification ---------- */
function attCheck(){
  if (!CFG.attAsk) return;
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), k = iso(now);
  if (k < ATT_FROM) return;
  weekEvents(weekStart(now)).forEach(e => {
    if (e.kind !== 'uni' || e.allDay || e.cancelled || e.clash || e.d !== dayIndex(now)) return;
    const o = {key:k + ':' + e.id, date:k, ev:e};
    if (nowM < e.e || nowM > e.e + 20 || state.att[o.key] || REM.sent['att:' + o.key]) return;
    markSent('att:' + o.key);
    chime(); desk.flash();
    toast(`${esc(attName(e))} just ended. Did you go?`, [['Went', () => attMark(o, 'went')], ['Missed', () => attMark(o, 'missed')], ['More', () => openCheckin(o)]]);
    try {
      if (Notification.permission !== 'granted') return;
      const n = new Notification(`${attName(e)} just ended`, {body:'Did you go? Click to mark it.', icon:'build/icon.png', silent:true});
      n.onclick = () => { DESK ? desk.show() : window.focus(); openCheckin(o); };
    } catch {}
    if (window.VIEW === 'overview') MODS.overview.render();
  });
}
setInterval(attCheck, 30000);
addEventListener('DOMContentLoaded', () => setTimeout(attCheck, 5000));

/* ---------- Classes page ---------- */
const CL_TYPES = ['Cours', 'TD', 'TP'];
const attBlank = () => ({went:0, missed:0, just:0, off:0, open:0, list:[]});
// subject -> type -> counts + every occurrence (marked or not), newest first
function attStats(){
  const S = {}, at = (sub, t) => ((S[sub] ||= {})[t] ||= attBlank());
  Object.entries(state.att).forEach(([key, r]) => { const x = at(r.sub, r.t); x[r.st]++; x.list.push({key, date:r.date, s:r.s, st:r.st, note:r.note}); });
  attPending().forEach(o => { const x = at(o.ev.title, o.ev.t); x.open++; x.list.push({key:o.key, date:o.date, s:o.ev.s, st:null}); });
  TT.classes.forEach(c => at(c.sub, c.t));
  Object.values(S).forEach(ts => Object.values(ts).forEach(x => x.list.sort((a, b) => b.date.localeCompare(a.date) || b.s - a.s)));
  return S;
}
const attSum = ts => Object.values(ts).reduce((a, x) => { Object.keys(ATT_ST).concat('open').forEach(k => a[k] += x[k]); return a; }, attBlank());
const attDot = x => `<i class="${x.st || 'open'}" title="${shortDate(parseISO(x.date))} · ${x.st ? ATT_ST[x.st].long : 'Not marked'}"></i>`;

function subjCardHTML(sub, ts){
  const all = attSum(ts), s = subjOf(sub);
  const types = Object.keys(ts).sort((a, b) => (CL_TYPES.indexOf(a) + 1 || 9) - (CL_TYPES.indexOf(b) + 1 || 9));
  return `<div class="cl-card" data-sub="${esc(sub)}" style="--c:${s.c}">
    <div class="cl-top"><span><b>${esc(sub)}</b>${s.name !== sub ? `<small>${esc(s.name)}</small>` : ''}</span>
      <span class="cl-miss${all.missed ? ' bad' : ''}"><b>${all.missed + all.just}</b><small>missed</small></span></div>
    ${types.map(t => { const x = ts[t]; return `<div class="cl-type">
      <div class="cl-row"><b>${esc(typeName(t))}</b><span class="cl-n">${x.went} went · <em class="${x.missed ? 'bad' : ''}">${x.missed} missed</em>${x.just ? ` · ${x.just} excused` : ''}${x.off ? ` · ${x.off} cancelled` : ''}${x.open ? ` · <u>${x.open} to mark</u>` : ''}</span></div>
      <div class="cl-strip">${x.list.slice(0, 18).reverse().map(attDot).join('') || '<small>Nothing yet</small>'}</div></div>`; }).join('')}
    <button class="ov-link" data-cl="hist">History ${OI.arrow}</button>
  </div>`;
}

function openSubjHistory(sub){
  const ts = attStats()[sub] || {}, list = Object.entries(ts).flatMap(([t, x]) => x.list.map(y => ({...y, t}))).sort((a, b) => b.date.localeCompare(a.date) || b.s - a.s);
  openSheet(`<h2>${esc(sub)} · history</h2><p class="field-note">${esc(subjOf(sub).name)} · click a class to change it or add a note</p>
    <ul class="cl-hist">${list.map(x => `<li data-att="${x.key}"><button type="button" data-atts=""><span class="cl-d">${shortDate(parseISO(x.date))}, ${fmt(x.s)}</span><b>${esc(typeName(x.t))}</b>
      <span class="cl-st ${x.st || 'open'}">${x.st ? ATT_ST[x.st].label : 'To mark'}</span>${x.note ? `<small>${esc(x.note)}</small>` : ''}</button></li>`).join('') || '<li class="ov-empty">No classes since tracking started.</li>'}</ul>
    <div class="actions"><span class="sp"></span><button type="button" class="btn" data-sheet="cancel">Close</button></div>`, () => {});
}

MODS.classes = {
  render(){
    const S = attStats(), subs = Object.keys(S).sort(), p = attPending(), all = attSum(Object.values(S).flatMap(Object.values));
    const tile = (k, n) => `<div class="cl-tile" style="--c:${ATT_ST[k].c}"><b>${n}</b><small>${ATT_ST[k].label.toLowerCase()}</small></div>`;
    $('v-classes').innerHTML = `<div class="pg">
      <header class="pg-h"><div><h1>Classes</h1><p>Since ${shortDate(parseISO(ATT_FROM))} · click a class to add what happened</p></div>
        ${p.length ? `<button class="btn" data-cl="allwent">Mark all ${p.length} as went</button>` : ''}</header>
      ${TT.classes.length ? `<div class="cl-tiles">${tile('went', all.went)}${tile('missed', all.missed)}${tile('just', all.just)}${tile('off', all.off)}</div>
      ${p.length ? `<section class="cl-todo"><h3>To mark · ${p.length}</h3>${attRowsHTML(p.slice(0, 12))}${p.length > 12 ? `<p class="field-note">+${p.length - 12} older</p>` : ''}</section>` : ''}
      <div class="cl-grid">${subs.map(s => subjCardHTML(s, S[s])).join('')}</div>`
      : `<p class="empty-state">No timetable yet. Add your classes in Settings, then each one shows up here after it ends.</p><p style="text-align:center"><button class="btn primary" data-nav-to="settings">Open Settings</button></p>`}
    </div>`;
  },
};
$('v-classes').addEventListener('click', e => {
  const n = e.target.closest('[data-nav-to]'); if (n) return go(n.dataset.navTo);
  const b = e.target.closest('[data-cl]'); if (!b) return;
  if (b.dataset.cl === 'hist') return openSubjHistory(b.closest('[data-sub]').dataset.sub);
  if (b.dataset.cl === 'allwent') {
    const p = attPending();
    p.forEach(o => { state.att[o.key] = {st:'went', note:'', sub:o.ev.title, t:o.ev.t, date:o.date, s:o.ev.s, e:o.ev.e}; });
    save('att'); MODS.classes.render();
    toast(`${p.length} marked as went`, [['Undo', () => { p.forEach(o => delete state.att[o.key]); save('att'); attRefresh(); }]]);
  }
});
