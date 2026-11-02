// Calendar interaction: popover, drag / resize, groups, hover preview.
/* ---------- selection + popover ---------- */
function select(el){
  $('rows').querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  sel = el.dataset.id;
}

function openPop(ev, anchor){
  popEv = ev;
  const date = addDays(cur, ev.d), isUni = ev.kind === 'uni', isJob = ev.kind === 'job', isP = ev.kind === 'perso';
  const when = `${DAYS[ev.d]} ${date.getDate()} ${MONTHS[date.getMonth()]}` + (ev.allDay ? ` · ${ev.label}` : `, ${fmt(ev.s)} – ${fmt(ev.e)}`);
  const title = isUni ? `${esc(ev.title)} · ${esc(typeName(ev.t))}` : isJob ? 'Work' : esc(ev.title);
  const sub = isUni ? esc(subjOf(ev.title).name) : isJob ? 'Work shift' : esc(catOf(ev.cat).label) + (ev.repeat ? ' · every week' : '');
  const li = [`${ICON.clock}${when}`];
  if (isUni) {
    if (ev.room) li.push(`${ICON.pin}Room ${esc(ev.room)}`);
    if (ev.prof) li.push(`${ICON.user}${esc(ev.prof)}`);
    if (ttGroups().length) li.push(`${ICON.users}${ev.g ? 'Group ' + esc(ev.g) : 'Every group'}`);
  }
  if (isP && ev.note) li.push(`${ICON.note}${esc(ev.note)}`);
  if (isUni && ev.attNote) li.push(`${ICON.note}${esc(ev.attNote)}`);
  const status = ev.att ? ATT_ST[ev.att].long : ev.cancelled ? 'Cancelled this week' : ev.moved ? 'Time changed this week' : ev.clash ? 'During your work hours' : '';

  const acts = [];
  if (isUni && !ev.allDay) {
    // past classes get a mark; a coming one can only be called off
    if (ev.cancelled && !ev.att) acts.push(['restore', 'Restore']);
    else if (new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, ev.s) <= new Date())
      acts.push(...Object.entries(ATT_ST).map(([k, s]) => ['att:' + k, s.label, ev.att === k ? 'on' : '']), ['attnote', ev.attNote ? 'Edit note' : 'Note']);
    else acts.push(ev.att === 'off' ? ['att:', 'Not cancelled'] : ['att:off', 'Cancelled']);
    if (ev.moved) acts.push(['restore', 'Usual time']);
  } else if (!ev.allDay && (isJob || ev.repeat)) {
    acts.push(ev.cancelled ? ['restore', 'Restore'] : ['skip', 'Skip this week']);
    if (ev.moved) acts.push(['restore', 'Usual time']);
  }
  if ((isUni || isJob) && state.base[ev.id]) acts.push(['unbase', 'Original time']);
  if (isUni || isJob && !ev.allDay) acts.push(['ttedit', isUni ? 'Edit class' : 'Edit shift']);
  const todo = isP && ev.todo && typeof TD !== 'undefined' && TD.list.find(t => t.id === ev.todo && !t.done);
  if (todo) acts.push(['tododone', 'To-do done']);
  if (isP) acts.push(['edit', 'Edit'], ['delete', 'Delete', 'danger']);
  const hint = ev.allDay || ev.cancelled ? ''
    : 'Left / right edges: time · top / bottom: size (double-click to reset) · Shift+click: select several.';

  const pop = $('pop');
  pop.style.setProperty('--c', isJob ? 'var(--job-c)' : ev.c);
  pop.innerHTML = `<button class="icon-btn x" data-act="pop-close">${ICON.x}</button>
    <h3>${title}</h3><div class="sub">${sub}</div><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul>
    ${status ? `<div class="status">${status}</div>` : ''}
    ${acts.length ? `<div class="acts">${acts.map(([v, l, c]) => `<button class="${c || ''}" data-act="pop" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
    ${hint ? `<div class="hint">${hint}</div>` : ''}`;
  showPop(anchor);
}
function showPop(anchor){
  const pop = $('pop');
  pop.classList.add('show');
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = r.left, y = r.bottom + 12;
  if (y + ph > innerHeight - 12) y = r.top - ph - 12;
  if (x + pw > innerWidth - 12) x = innerWidth - pw - 12;
  pop.style.left = Math.max(12, x) + 'px';
  pop.style.top = Math.max(12, y) + 'px';
}
function closePop(){
  $('pop').classList.remove('show'); popEv = null; popGroup = null; sel = null;
  $('rows').querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
}

function popAction(v){
  const ev = popEv, wk = iso(cur);
  if (v === 'edit') { closePop(); return openForm(state.events.find(x => x.id === ev.id)); }
  if (v.startsWith('att:') || v === 'attnote') {
    const date = iso(addDays(cur, ev.d)), o = {key:date + ':' + ev.id, date, ev}, st = v.slice(4);
    closePop();
    return v === 'attnote' ? openCheckin(o) : attSet(o, st && ev.att !== st ? st : null);
  }
  if (v === 'ttedit') { closePop(); return ev.kind === 'uni' ? openClass(TT.classes.find(c => c.id === ev.id)) : openShift(SHIFTS.find(j => j.id === ev.id)); }
  if (v === 'skip') {
    setOvr(wk, ev.id, {hidden:true});
    toast('Hidden this week', [['Undo', () => { setOvr(wk, ev.id, null); render(); }]]);
  }
  if (v === 'restore') setOvr(wk, ev.id, null);
  if (v === 'unbase') { delete state.base[ev.id]; save('base'); }
  if (v === 'tododone') { const t = TD.list.find(x => x.id === ev.todo); t.done = true; t.doneAt = Date.now(); saveTodos(); toast(`Done · ${esc(t.text)}`); }
  if (v === 'delete') {
    const i = state.events.findIndex(x => x.id === ev.id), [gone] = state.events.splice(i, 1);
    save('events');
    toast('Deleted', [['Undo', () => { state.events.splice(i, 0, gone); save('events'); render(); }]]);
  }
  closePop(); render();
}

/* ---------- drag / resize ---------- */
const rowsEl = $('rows');
const tracks = () => rowsEl.querySelectorAll('.track');
const groupEls = gid => rowsEl.querySelectorAll(`[data-gid="${gid}"]`);

rowsEl.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
  const gl = e.target.closest('.gl');
  const el = gl || e.target.closest('.ev, .job');
  if (!el || el.classList.contains('cancelled') || el.classList.contains('allday')) return;
  const h = gl ? null : e.target.closest('.hd')?.dataset.h;
  const mode = h === 'l' ? 'left' : h === 'r' ? 'right' : h ? 'height' : 'move';
  const track = el.closest('.track');
  // moving any block of a group moves the whole group; resizing stays per block
  const gid = mode === 'move' ? el.dataset.gid : null;
  let ev;
  if (gid) {
    const d = +track.dataset.d, g = groupById(gid);
    const members = shown.filter(x => g.members.includes(x.id) && x.d === d && !x.allDay);
    ev = {id:gid, d, s:Math.min(...members.map(m => m.s)), e:Math.max(...members.map(m => m.e)), members};
  } else ev = shown.find(x => x.id === el.dataset.id);
  drag = {id:ev.id, gid, ev, el, mode, side:h, x0:e.clientX, y0:e.clientY, started:false, d:ev.d, s:ev.s, e:ev.e,
          grab: minuteAt(e.clientX, track.getBoundingClientRect()) - ev.s};
  if (mode === 'height') {
    const tr = track.getBoundingClientRect().height, tp = parseFloat(track.style.getPropertyValue('--tp')) || 6;
    const jb = track.querySelector('.job:not(.allday)') ? Math.max(...[...track.querySelectorAll('.job')].map(j => j.offsetHeight)) + 6 : track.querySelector('.job') ? 27 : 0;
    drag.h0 = el.getBoundingClientRect().height;
    drag.px = el.classList.contains('job') || el.hasAttribute('data-full') ? tr - tp - 6 : tr - tp - 6 - jb;
    drag.isJob = el.classList.contains('job');
  }
  e.preventDefault();
});

addEventListener('pointermove', e => {
  if (!drag) return hoverGhost(e);
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.started) {
    if (Math.hypot(dx, dy) < 4) return;
    drag.started = true;
    closePop();
    document.body.classList.add('is-dragging');
    viewRange = {start:START, end:END};
    markDragging();
  }
  if (drag.mode === 'height') return resizeHeight(dy);
  if (drag.mode === 'move') {
    const rects = [...tracks()].map(t => t.getBoundingClientRect());
    const d = rects.findIndex(r => e.clientY >= r.top && e.clientY <= r.bottom);
    if (d >= 0) drag.d = d;
    else if (e.clientY < rects[0].top) drag.d = 0;
    else if (e.clientY > rects[6].bottom) drag.d = 6;
  }
  const dur = drag.ev.e - drag.ev.s;
  const want = () => {
    const m = minuteAt(e.clientX, tracks()[drag.d].getBoundingClientRect());
    if (drag.mode === 'move') return {s:m - drag.grab, e:m - drag.grab + dur};
    if (drag.mode === 'left') return {s:m, e:drag.e};
    return {s:drag.s, e:m};
  };
  let w = want();
  if ((w.s < START && START > 0) || (w.e > END && END < 1440)) { growAxis(w.s < START, w.e > END); w = want(); }
  if (drag.mode === 'move') { drag.s = clamp(snap(w.s), START, END - dur); drag.e = drag.s + dur; }
  if (drag.mode === 'left') drag.s = clamp(snap(w.s), START, drag.e - 15);
  if (drag.mode === 'right') drag.e = clamp(snap(w.e), drag.s + 15, END);
  drag.gid ? placeGroup() : placeDrag();
});

function markDragging(){
  if (drag.gid) groupEls(drag.gid).forEach(x => x.classList.add('dragging'));
  else drag.el.classList.add('dragging', 'selected');
}

// Height of one block only, as a share of its row; the row itself never changes size.
function resizeHeight(dy){
  const px = drag.h0 + (drag.isJob ? 0 : 4) + (drag.side === 'b' ? dy : -dy);
  const f = Math.round(clamp(px / drag.px, drag.isJob ? 0.12 : MIN_LANE, drag.isJob ? JOB_MAX : 1) * 1000) / 1000;
  if (f === state.size[drag.id]) return;
  state.size[drag.id] = drag.fNew = f;
  renderGrid();
  drag.el = rowsEl.querySelector(`[data-id="${drag.id}"]`);
  markDragging();
}

// Widen the time axis by one hour on the side being pushed, at most every 350ms.
function growAxis(left, right){
  const t = performance.now();
  if (t - (drag.grownAt || 0) < 350) return;
  drag.grownAt = t;
  viewRange = {start: left ? Math.max(0, START - 60) : START, end: right ? Math.min(1440, END + 60) : END};
  renderGrid();
  if (!drag.gid) drag.el = rowsEl.querySelector(`[data-id="${drag.id}"]`);
  markDragging();
}

function placeDrag(){
  const el = drag.el, target = tracks()[drag.d];
  if (el.parentElement !== target) target.appendChild(el);
  el.style.left = `calc(${(drag.s-START)/SPAN*100}% + 2px)`;
  el.style.width = `calc(${(drag.e-drag.s)/SPAN*100}% - 4px)`;
  el.querySelector('.h').textContent = `${fmt(drag.s)} – ${fmt(drag.e)}`;
}

function placeGroup(){
  const delta = drag.s - drag.ev.s, target = tracks()[drag.d];
  groupEls(drag.gid).forEach(el => {
    if (el.parentElement !== target) target.appendChild(el);
    const s = +el.dataset.s + delta, e = +el.dataset.e + delta;
    if (el.classList.contains('grp')) {
      el.style.left = `${(s-START)/SPAN*100}%`;
      el.style.width = `${(e-s)/SPAN*100}%`;
    } else {
      el.style.left = `calc(${(s-START)/SPAN*100}% + 2px)`;
      el.style.width = `calc(${(e-s)/SPAN*100}% - 4px)`;
      const h = el.querySelector('.h');
      if (h) h.textContent = `${fmt(s)} – ${fmt(e)}`;
    }
  });
}

addEventListener('pointerup', () => {
  if (!drag) return;
  const g = drag; drag = null;
  if (!g.started) return;
  document.body.classList.remove('is-dragging');
  suppressUntil = performance.now() + 300;
  viewRange = null;
  if (g.mode === 'height') {
    if (g.fNew) save('size');
    return render();
  }
  if (g.gid) {
    const delta = g.s - g.ev.s, dd = g.d - g.ev.d;
    if (!delta && !dd) return render();
    return applyChanges(g.ev.members.map(m => [m, {d:m.d + dd, s:m.s + delta, e:m.e + delta}]));
  }
  if (g.d === g.ev.d && g.s === g.ev.s && g.e === g.ev.e) return render();
  applyChanges([[g.ev, {d:g.d, s:g.s, e:g.e}]]);
});
addEventListener('pointercancel', () => { if (drag) { drag = null; viewRange = null; document.body.classList.remove('is-dragging'); render(); } });

rowsEl.addEventListener('dblclick', e => {
  const h = e.target.closest('.hd[data-h=t], .hd[data-h=b]');
  if (!h) return;
  delete state.size[h.closest('[data-id]').dataset.id];
  save('size'); render();
});

function applyChanges(list){
  const wk = iso(cur), undo = [], recurring = [];
  list.forEach(([ev, ch]) => {
    if (ev.kind === 'perso' && !ev.repeat) {
      const p = state.events.find(x => x.id === ev.id), prev = {...p};
      undo.push(() => Object.assign(p, prev));
      Object.assign(p, {date:iso(addDays(cur, ch.d)), d:ch.d, s:ch.s, e:ch.e});
    } else {
      const prev = state.ovr[wk]?.[ev.id];
      undo.push(() => setOvr(wk, ev.id, prev));
      setOvr(wk, ev.id, ch);
      recurring.push([ev, ch]);
    }
  });
  save('events'); render();
  const acts = [['Undo', () => { undo.forEach(f => f()); save('events'); render(); }]];
  if (recurring.length) acts.push(['Every week', () => {
    recurring.forEach(([ev, ch]) => {
      setOvr(wk, ev.id, null);
      if (ev.kind === 'perso') Object.assign(state.events.find(x => x.id === ev.id), ch);
      else state.base[ev.id] = ch;
    });
    save('events', 'base'); render();
  }]);
  toast(recurring.length ? 'Changed for this week' : 'Changed', acts);
}

/* ---------- groups ---------- */
function renderBar(){
  const bar = $('bar'), n = picked.size;
  if (!n) return bar.classList.remove('show');
  bar.innerHTML = `<span>${n} block${n > 1 ? 's' : ''} selected${n < 2 ? ' · Shift+click to add more' : ''}</span>`
    + (n > 1 ? '<button class="primary" data-act="group-make">Group</button>' : '')
    + '<button data-act="pick-clear">Cancel</button>';
  bar.classList.add('show');
}
function clearPicks(){
  if (!picked.size) return;
  picked.clear();
  rowsEl.querySelectorAll('.picked').forEach(x => x.classList.remove('picked'));
  renderBar();
}

function makeGroup(){
  const mem = shown.filter(e => picked.has(e.id));
  if (new Set(mem.map(m => m.d)).size > 1) return toast('Blocks must be on the same day');
  const ids = mem.map(m => m.id), before = structuredClone(state.groups);
  state.groups.forEach(g => g.members = g.members.filter(id => !ids.includes(id)));
  state.groups = state.groups.filter(g => g.members.length >= 2);
  const titles = [...new Set(mem.sort((a, b) => a.s - b.s).map(m => m.kind === 'job' ? 'Work' : m.title))];
  const name = titles.length === 1 ? titles[0] : titles.slice(0, 2).join(' + ') + (titles.length > 2 ? '…' : '');
  state.groups.push({id:uid('g'), name, members:ids, collapsed:false});
  save('groups'); picked.clear(); render();
  toast('Group created', [['Undo', () => { state.groups = before; save('groups'); render(); }]]);
}

function openGroupPop(gid, anchor){
  const g = groupById(gid);
  if (!g) return;
  closePop();
  popGroup = g;
  const mem = weekEvents().filter(e => g.members.includes(e.id) && !e.allDay).sort((a, b) => a.s - b.s);
  const s = Math.min(...mem.map(m => m.s)), e = Math.max(...mem.map(m => m.e));
  const pop = $('pop');
  pop.style.setProperty('--c', 'var(--ink)');
  pop.innerHTML = `<button class="icon-btn x" data-act="pop-close">${ICON.x}</button>
    <input class="gname" value="${esc(g.name)}" maxlength="40" aria-label="Group name">
    <div class="sub">${mem.length} blocks · ${fmt(s)} – ${fmt(e)}</div>
    <ul>${mem.map(m => `<li><span class="dot" style="background:${m.kind === 'job' ? 'var(--job-c)' : m.c}"></span>${esc(m.title)}${m.kind === 'uni' ? ' · ' + esc(typeName(m.t)) : ''}<span class="tm">${fmt(m.s)} – ${fmt(m.e)}</span></li>`).join('')}</ul>
    <div class="acts"><button data-act="gpop" data-v="collapse">${g.collapsed ? 'Expand' : 'Collapse into one block'}</button><button class="danger" data-act="gpop" data-v="ungroup">Ungroup</button></div>
    <div class="hint">Drag the label or any block to move the whole group.</div>`;
  showPop(anchor);
}

function groupAction(v){
  const g = popGroup;
  if (!g) return;
  if (v === 'collapse') { g.collapsed = !g.collapsed; save('groups'); }
  if (v === 'ungroup') {
    const i = state.groups.indexOf(g);
    state.groups.splice(i, 1); save('groups');
    toast('Group removed', [['Undo', () => { state.groups.splice(i, 0, g); save('groups'); render(); }]]);
  }
  closePop(); render();
}

$('pop').addEventListener('change', e => {
  if (!e.target.classList.contains('gname') || !popGroup) return;
  popGroup.name = e.target.value.trim() || popGroup.name;
  save('groups'); renderGrid();
});
$('pop').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('gname')) e.target.blur(); });

/* ---------- hover preview on empty space ---------- */
const ghost = document.createElement('div');
ghost.className = 'ghost';
ghost.hidden = true;

function slotAt(x, track){
  const s = clamp(Math.floor(minuteAt(x, track.getBoundingClientRect()) / 30) * 30, START, END - 30);
  return {d:+track.dataset.d, s, e:s + 60};
}
function hoverGhost(e){
  const track = e.target.closest?.('#rows .track');
  if (!track || e.target.closest('.ev, .job, .gl') || $('pop').classList.contains('show') || picked.size) { ghost.hidden = true; return; }
  const slot = slotAt(e.clientX, track);
  if (ghost.parentElement !== track) track.appendChild(ghost);
  ghost.hidden = false;
  ghost.style.cssText = xPos(slot.s, Math.min(slot.e, END));
  ghost.textContent = `+ ${fmt(slot.s)}`;
}
