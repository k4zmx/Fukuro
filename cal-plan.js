// Calendar planning: exams & deadlines, free time, revision planner, to-dos dragged onto the week.

/* ---------- exams & deadlines ---------- */
const DL = {list: store.get('deadlines', [])};
const saveDL = () => store.set('deadlines', DL.list);
const DL_KIND = {exam:{label:'Exam', c:'#c3402c'}, test:{label:'Test', c:'#c8692c'}, due:{label:'Deadline', c:'#6f5a9a'}};
const dlName = x => [x.subj, x.title].filter(Boolean).join(' · ') || DL_KIND[x.kind].label;
const dlDays = x => daysBetween(new Date(), parseISO(x.date));
const dlAt = x => { const d = parseISO(x.date); if (x.time) d.setHours(...x.time.split(':').map(Number)); return d; };
const dlIn = x => { const n = dlDays(x); return n < 0 ? 'passed' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };
const upcomingDL = (limit = 99) => DL.list.filter(x => !x.done && dlDays(x) >= 0).sort((a, b) => dlAt(a) - dlAt(b)).slice(0, limit);
const dlOn = date => DL.list.filter(x => x.date === iso(date));
const dlWhen = x => `${DL_KIND[x.kind].label} · ${shortDate(parseISO(x.date))}${x.time ? ', ' + x.time : ''}${x.room ? ' · room ' + x.room : ''}`;

function renderDeadlines(){
  const up = upcomingDL(6);
  $('dls').innerHTML = up.map(x => {
    const n = dlDays(x);
    return `<button class="dli${n <= 3 ? ' soon' : ''}" data-act="dl-edit" data-v="${x.id}" style="--c:${DL_KIND[x.kind].c}">
      <span class="cd"><b>${n === 0 ? 'Today' : n}</b>${n ? `<small>${n === 1 ? 'day' : 'days'}</small>` : ''}</span>
      <span class="nm"><b>${esc(dlName(x))}</b><small>${esc(dlWhen(x))}</small></span></button>`;
  }).join('') || '<p class="dl-empty">No exams or deadlines coming up.</p>';
}

function openDeadline(x, preset){
  const v = x || {kind:'exam', subj:'', title:'', date:preset || iso(addDays(new Date(), 7)), time:'', room:'', note:''};
  openSheet(`<h2>${x ? 'Edit' : 'New'} exam or deadline</h2>
    <div class="quick hb-target">${Object.entries(DL_KIND).map(([k, d]) => `<label><input type="radio" name="kind" value="${k}" ${v.kind === k ? 'checked' : ''}><span>${d.label}</span></label>`).join('')}</div>
    <select name="subj" class="sel"><option value="">No subject</option>${Object.entries(SUBJ).map(([k, s]) => `<option value="${esc(k)}" ${v.subj === k ? 'selected' : ''}>${esc(k)} · ${esc(s.name)}</option>`).join('')}</select>
    <input type="text" name="title" placeholder="Title (e.g. Midterm, Lab report, Quiz)" maxlength="60" value="${esc(v.title)}">
    <div class="f3"><label>Day<input type="date" name="date" required value="${v.date}"></label><label>Time<input type="time" name="time" value="${v.time}"></label><label>Room<input type="text" name="room" maxlength="20" value="${esc(v.room)}"></label></div>
    <textarea name="note" placeholder="Chapters, what to bring… (optional)" maxlength="300">${esc(v.note || '')}</textarea>
    <div class="actions">${x ? '<button type="button" class="btn danger" data-sheet="delete">Delete</button>' : ''}<span class="sp"></span>
      <button type="button" class="btn" data-sheet="plan">Plan revision</button><button type="button" class="btn" data-sheet="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>`,
    f => saveDeadline(x, f));
  const form = $('mdForm');
  form.querySelector('[data-sheet=delete]')?.addEventListener('click', () => {
    const i = DL.list.indexOf(x); DL.list.splice(i, 1); saveDL(); closeSheet(); refreshAll();
    toast('Deleted', [['Undo', () => { DL.list.splice(i, 0, x); saveDL(); refreshAll(); }]]);
  });
  form.querySelector('[data-sheet=plan]').addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const saved = saveDeadline(x, form.elements);
    if (saved) { closeSheet(); setTimeout(() => openPlanner(saved), 60); }
  });
}
function saveDeadline(x, f){
  const v = {kind:f.kind.value, subj:f.subj.value, title:f.title.value.trim(), date:f.date.value, time:f.time.value, room:f.room.value.trim(), note:f.note.value.trim()};
  if (!v.subj && !v.title) { toast('Pick a subject or type a title'); return false; }
  if (x) Object.assign(x, v); else DL.list.push(x = {id:uid('x'), done:false, ...v});
  saveDL(); refreshAll(); toast(`${DL_KIND[v.kind].label} saved · ${dlIn(x)}`);
  return x;
}
// redraw whatever page shows calendar data
function refreshAll(){ if (window.VIEW === 'calendar') render(); else MODS[window.VIEW]?.render(); }

/* ---------- free time ---------- */
const startOfToday = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
// gaps between everything planned on a day, inside the free-time window; nothing for days already gone
function freeSlots(list, date, from = CFG.planFrom, to = CFG.planTo){
  if (date < startOfToday() || list.some(e => e.allDay && !e.cancelled)) return [];
  const now = new Date();
  if (sameDay(date, now)) from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
  const busy = list.filter(e => !e.cancelled && !e.allDay && !e.clash).map(e => [e.s, e.e])
    .concat(dlOn(date).filter(x => x.time && x.kind !== 'due').map(x => [toMin(x.time), toMin(x.time) + 90]))
    .sort((a, b) => a[0] - b[0]);
  const out = []; let t = from;
  for (const [s, e] of busy) {
    if (Math.min(s, to) - t >= CFG.minFree) out.push({s:t, e:Math.min(s, to)});
    t = Math.max(t, e); if (t >= to) break;
  }
  if (to - t >= CFG.minFree) out.push({s:t, e:to});
  return out;
}
function freeHTML(list, date){
  return freeSlots(list, date).map(f => {
    const s = Math.max(f.s, START), e = Math.min(f.e, END);
    return e - s < 20 ? '' : `<div class="free" style="left:${(s - START) / SPAN * 100}%;width:${(e - s) / SPAN * 100}%"><span>${hm(f.e - f.s)} free</span></div>`;
  }).join('');
}
const freeToday = () => { const t = new Date(); return freeSlots(weekEvents(weekStart(t)).filter(e => e.d === dayIndex(t)), t); };

/* ---------- marks on the week grid ---------- */
function dayMarks(date){
  const k = iso(date), dls = dlOn(date), due = typeof TD === 'undefined' || CFG.calTodos === false ? [] : TD.list.filter(t => !t.done && t.due === k);
  if (!dls.length && !due.length) return '';
  return `<span class="marks">${dls.map(x => `<button class="mk" data-act="dl-edit" data-v="${x.id}" style="--c:${DL_KIND[x.kind].c}" title="${esc(dlName(x) + ' · ' + dlWhen(x))}">${DL_KIND[x.kind].label}</button>`).join('')}${due.length ? `<button class="mk td" data-act="due-pop" data-v="${k}">${due.length} to-do${due.length > 1 ? 's' : ''}</button>` : ''}</span>`;
}
function dlFlags(date){
  return dlOn(date).filter(x => x.time).map(x => {
    const m = toMin(x.time); if (m < START || m > END) return '';
    return `<div class="dlflag" style="left:${(m - START) / SPAN * 100}%;--c:${DL_KIND[x.kind].c}"><button data-act="dl-edit" data-v="${x.id}">${esc(DL_KIND[x.kind].label + ' · ' + dlName(x))}</button></div>`;
  }).join('');
}
function openDuePop(k, anchor){
  closePop();
  const list = TD.list.filter(t => !t.done && t.due === k), pop = $('pop');
  pop.style.setProperty('--c', 'var(--ink)');
  pop.innerHTML = `<button class="icon-btn x" data-act="pop-close">${ICON.x}</button>
    <h3>Due ${shortDate(parseISO(k))}</h3><div class="sub">${list.length} open to-do${list.length > 1 ? 's' : ''}</div>
    <ul class="duel">${list.map(t => `<li><button class="td-check" data-act="due-done" data-v="${t.id}" aria-label="Done">${tdIcon.check}</button>${esc(t.text)}</li>`).join('')}</ul>
    <div class="acts"><button data-act="goto" data-v="todos">Open to-dos</button></div>`;
  showPop(anchor);
}

/* ---------- revision planner ---------- */
function planSessions(x, total, len){
  const end = parseISO(x.date), days = [], cache = new Map();
  for (let d = startOfToday(); d < end; d = addDays(d, 1)) {
    const ws = iso(weekStart(d));
    if (!cache.has(ws)) cache.set(ws, weekEvents(weekStart(d)).filter(e => e.plan !== x.id));
    const slots = freeSlots(cache.get(ws).filter(e => e.d === dayIndex(d)), d).filter(s => s.e - s.s >= len);
    if (slots.length) days.push({d, slots});
  }
  const n = Math.ceil(total / len);
  // spread the sessions out, the last one on the last free day before the exam
  const pick = days.length <= n ? days : Array.from({length:n}, (_, i) => days[Math.round((days.length - 1) * (i + 1) / n)]);
  return {need:n, list:pick.map(({d, slots}) => {
    const slot = slots.reduce((a, b) => (b.e - b.s > a.e - a.s ? b : a));
    let s = Math.ceil(slot.s / 15) * 15;
    if (s > CFG.planFrom && s + 15 + len <= slot.e) s += 15;   // a short break after the previous thing
    return {d, s, e:s + len};
  })};
}
function openPlanner(x){
  const n = dlDays(x);
  if (n < 1) return toast('This one is today or already passed');
  const old = state.events.filter(e => e.plan === x.id && parseISO(e.date) >= startOfToday());
  let plan;
  const listHTML = (total, len) => {
    plan = planSessions(x, total, len);
    const short = plan.list.length < plan.need;
    return plan.list.map((p, i) => `<label class="pl-row"><input type="checkbox" name="pick" value="${i}" checked><span><b>${shortDate(p.d)}</b><small>${fmt(p.s)} – ${fmt(p.e)}</small></span></label>`).join('')
      + (short ? `<p class="field-note">Only ${plan.list.length} free day${plan.list.length === 1 ? '' : 's'} with room for a session before the exam.</p>` : '')
      || '<p class="field-note">No free time left before the exam.</p>';
  };
  const def = [2, 3, 4, 6, 8, 10].filter(h => h <= Math.max(2, n)).pop() * 60;
  openSheet(`<h2>Plan revision · ${esc(dlName(x))}</h2>
    <p class="field-note">${esc(dlWhen(x))} · ${dlIn(x)}. Sessions go into your free time between ${fmt(CFG.planFrom)} and ${fmt(CFG.planTo)}.</p>
    <div class="nums n2"><label>Total time<select name="total" class="sel">${[2, 3, 4, 6, 8, 10, 12, 15].map(h => `<option value="${h * 60}" ${h * 60 === def ? 'selected' : ''}>${h} hours</option>`).join('')}</select></label>
      <label>Each session<select name="len" class="sel">${[45, 60, 90, 120].map(m => `<option value="${m}" ${m === 90 ? 'selected' : ''}>${hm(m)}</option>`).join('')}</select></label></div>
    <div class="pl-list" id="plList">${listHTML(def, 90)}</div>
    ${old.length ? `<p class="field-note">Replaces the ${old.length} session${old.length > 1 ? 's' : ''} already planned for it.</p>` : ''}
    <div class="actions"><span class="sp"></span><button type="button" class="btn" data-sheet="cancel">Cancel</button><button type="submit" class="btn primary">Add to calendar</button></div>`,
    f => {
      const picks = [...$('mdForm').querySelectorAll('[name=pick]:checked')].map(c => plan.list[+c.value]);
      if (!picks.length) { toast('Nothing selected'); return false; }
      const before = structuredClone(state.events), cats = structuredClone(state.cats);
      let cat = state.cats.find(c => c.label.toLowerCase() === 'revision');
      if (!cat) { cat = {k:uid('c'), label:'Revision', c:'#3f7f74'}; state.cats.push(cat); }
      state.events = state.events.filter(e => !old.includes(e)).concat(picks.map(p => ({id:uid('p'), title:`Revision · ${x.subj || x.title}`, cat:cat.k, note:`For ${dlName(x)} on ${shortDate(parseISO(x.date))}`, s:p.s, e:p.e, repeat:false, date:iso(p.d), d:dayIndex(p.d), plan:x.id})));
      save('events', 'cats'); refreshAll();
      toast(`${picks.length} revision session${picks.length > 1 ? 's' : ''} added`, [['Undo', () => { state.events = before; state.cats = cats; save('events', 'cats'); refreshAll(); }]]);
    });
  $('mdForm').onchange = e => {
    if (!['total', 'len'].includes(e.target.name)) return;
    const f = $('mdForm').elements;
    $('plList').innerHTML = listHTML(+f.total.value, +f.len.value);
  };
}

/* ---------- to-dos dragged onto the week ---------- */
function renderPlanTodos(){
  const open = typeof TD === 'undefined' ? [] : TD.list.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.created - b.created);
  const planned = id => state.events.find(e => e.id === id);
  $('ctd').innerHTML = open.slice(0, 8).map(t => {
    const p = t.planned && planned(t.planned);
    return `<li draggable="true" data-todo="${t.id}" title="Drag onto a day to block time for it"><span class="grip"></span><span class="tx">${esc(t.text)}</span>${p ? `<small class="on">${DAYS[p.d].slice(0, 3)} ${fmt(p.s)}</small>` : t.due ? `<small>${dueLabel(t.due)}</small>` : ''}</li>`;
  }).join('') + (open.length > 8 ? `<li class="more">+${open.length - 8} more in To-dos</li>` : '') || '<li class="more">No open to-dos</li>';
}
$('ctd').addEventListener('dragstart', e => {
  const li = e.target.closest('[data-todo]'); if (!li) return;
  e.dataTransfer.setData('text/fukuro-todo', li.dataset.todo); e.dataTransfer.effectAllowed = 'copy';
});
rowsEl.addEventListener('dragover', e => {
  if (!e.dataTransfer.types.includes('text/fukuro-todo')) return;
  const track = e.target.closest('.track'); if (!track) return;
  e.preventDefault();
  const slot = slotAt(e.clientX, track);
  if (ghost.parentElement !== track) track.appendChild(ghost);
  ghost.hidden = false; ghost.style.cssText = xPos(slot.s, Math.min(slot.e, END)); ghost.textContent = `Plan at ${fmt(slot.s)}`;
});
rowsEl.addEventListener('dragleave', e => { if (!rowsEl.contains(e.relatedTarget)) ghost.hidden = true; });
rowsEl.addEventListener('drop', e => {
  const id = e.dataTransfer.getData('text/fukuro-todo'), track = e.target.closest('.track'), t = TD.list.find(x => x.id === id);
  ghost.hidden = true;
  if (!t || !track) return;
  e.preventDefault();
  const slot = slotAt(e.clientX, track), date = addDays(cur, slot.d), prev = {due:t.due, planned:t.planned};
  const ev = {id:uid('p'), title:t.text.slice(0, 80), cat:'', note:'', s:slot.s, e:slot.e, repeat:false, date:iso(date), d:slot.d, todo:t.id};
  state.events.push(ev);
  t.planned = ev.id; if (!t.due || t.due > ev.date) t.due = ev.date;
  save('events'); saveTodos(); render();
  toast(`Planned · ${esc(t.text)}`, [['Undo', () => { state.events = state.events.filter(x => x !== ev); Object.assign(t, prev); save('events'); saveTodos(); render(); }]]);
});
