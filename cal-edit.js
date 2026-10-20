// Calendar editing: event / routine form, filters, export, background, keyboard.
/* ---------- add / edit event ---------- */
const form = $('form'), F = form.elements;

function renderFormCats(selected){
  $('cats').innerHTML = state.cats.map(c => `<label style="--c:${c.c}"><input type="radio" name="cat" value="${c.k}" ${c.k === selected ? 'checked' : ''}><span class="dot"></span>${esc(c.label)}</label>`).join('')
    + `<button type="button" class="add-cat" data-act="cat-new" data-v="form">${ICON.plus}New</button>`;
}

const seriesOf = p => state.events.filter(x => x.repeat && (x.series || x.id) === (p.series || p.id));

function openForm(p, preset, mode){
  editing = p ? p.id : null;
  editSeries = p && p.repeat ? p.series || p.id : null;
  weekRows = p && p.repeat ? seriesOf(p).map(x => ({d:x.d, s:x.s, e:x.e, detail:x.detail || ''})) : [];
  $('formTitle').textContent = p ? (p.repeat ? 'Edit routine' : 'Edit event') : mode === 'week' ? 'New routine' : 'New event';
  $('fDelete').hidden = !p;
  renderFormCats(p ? catOf(p.cat).k : state.cats[0]?.k);
  F.title.value = p ? p.title : '';
  F.date.value = p ? (p.repeat ? iso(addDays(cur, p.d)) : p.date) : iso(addDays(cur, preset.d));
  F.start.value = fmt(p ? p.s : preset.s);
  F.end.value = fmt(Math.min(p ? p.e : preset.e, 1435));
  F.note.value = p ? p.note || '' : '';
  setFormMode(p ? (p.repeat ? 'week' : 'once') : mode || 'once');
  ghost.hidden = true;
  $('modal').classList.add('show');
  setTimeout(() => F.title.focus(), 30);
}
const closeForm = () => $('modal').classList.remove('show');

function setFormMode(m){
  formMode = m;
  $('fWhen').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.w === m));
  $('fOnce').hidden = m !== 'once'; $('fWeek').hidden = m !== 'week';
  [F.date, F.start, F.end].forEach(x => x.disabled = m !== 'once');
  if (m === 'week' && !weekRows.length) weekRows = [{d:dayIndex(parseISO(F.date.value)), s:toMin(F.start.value), e:toMin(F.end.value)}];
  renderWeekRows();
}
function renderWeekRows(){
  weekRows.sort((a, b) => a.d - b.d);
  $('fDays').innerHTML = DAYS.map((n, d) => `<button type="button" class="${weekRows.some(r => r.d === d) ? 'on' : ''}" data-day="${d}" title="${n}">${n.slice(0, 3)}</button>`).join('');
  $('fRows').innerHTML = weekRows.map((r, i) => `<div class="dayrow" data-i="${i}"><b>${DAYS[r.d]}</b><input type="time" step="300" data-k="s" value="${fmt(r.s)}" required><span>–</span><input type="time" step="300" data-k="e" value="${fmt(Math.min(r.e, 1435))}" required><input type="text" data-k="detail" value="${esc(r.detail || '')}" placeholder="Detail for this day (optional)" maxlength="60"></div>`).join('')
    || '<p class="empty">Pick at least one day.</p>';
}
$('fWhen').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) setFormMode(b.dataset.w); });
$('fDays').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  const d = +b.dataset.day, i = weekRows.findIndex(r => r.d === d);
  if (i >= 0) weekRows.splice(i, 1);
  else {
    const last = weekRows[weekRows.length - 1] || {s:toMin(F.start.value), e:toMin(F.end.value)};
    weekRows.push({d, s:last.s, e:last.e, detail:''});
  }
  renderWeekRows();
});
$('fRows').addEventListener('input', e => {
  const r = weekRows[e.target.closest('.dayrow').dataset.i];
  const k = e.target.dataset.k;
  if (k === 'detail') r.detail = e.target.value.trim();
  else if (e.target.value) r[k] = toMin(e.target.value);
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const info = {title:F.title.value.trim(), cat:form.querySelector('[name=cat]:checked')?.value || '', note:F.note.value.trim()};
  const old = editSeries ? seriesOf({series:editSeries}) : editing ? state.events.filter(x => x.id === editing) : [];
  let added, msg;
  if (formMode === 'week') {
    if (!weekRows.length) return toast('Pick at least one day');
    const bad = weekRows.find(r => r.e <= r.s);
    if (bad) return toast(`${DAYS[bad.d]}: end must be after start`);
    const series = editSeries || uid('s');
    added = weekRows.map(r => ({id:old.find(o => o.repeat && o.d === r.d)?.id || uid('p'), series, ...info, repeat:true, d:r.d, s:r.s, e:r.e, ...(r.detail && {detail:r.detail})}));
    msg = editing ? 'Routine updated' : `Routine added · ${added.length} day${added.length > 1 ? 's' : ''}`;
  } else {
    const s = toMin(F.start.value), en = toMin(F.end.value);
    if (en <= s) { F.end.setCustomValidity('End must be after start'); return F.end.reportValidity(); }
    const date = parseISO(F.date.value);
    added = [{id:old.length === 1 ? old[0].id : uid('p'), ...info, s, e:en, repeat:false, date:F.date.value, d:dayIndex(date)}];
    cur = weekStart(date); syncMini();
    msg = editing ? 'Event updated' : 'Event added';
  }
  state.events = state.events.filter(x => !old.includes(x)).concat(added);
  save('events'); closeForm(); render(); toast(msg);
});
F.end.addEventListener('input', () => F.end.setCustomValidity(''));
$('fCancel').onclick = closeForm;
$('fDelete').onclick = () => {
  if (!editSeries) { popEv = state.events.find(x => x.id === editing); closeForm(); return popAction('delete'); }
  const snap = structuredClone(state.events), gone = seriesOf({series:editSeries});
  state.events = state.events.filter(x => !gone.includes(x));
  save('events'); closeForm(); render();
  toast('Routine deleted', [['Undo', () => { state.events = snap; save('events'); render(); }]]);
};

function defaultPreset(){
  const t = new Date(), inWeek = sameDay(weekStart(t), cur);
  const s = inWeek ? clamp(Math.ceil((t.getHours()*60 + t.getMinutes()) / 30) * 30, 480, 1020) : 600;
  return {d: inWeek ? dayIndex(t) : 0, s, e: s + 60};
}

/* ---------- custom filters (categories) ---------- */
const catForm = $('catForm'), C = catForm.elements;
let catEditing = null, catFromForm = false;

function openCat(k, fromForm){
  const c = k ? catOf(k) : null;
  catEditing = c ? c.k : null; catFromForm = !!fromForm;
  $('catTitle').textContent = c ? 'Edit filter' : 'New filter';
  $('catDelete').hidden = !c;
  C.name.value = c ? c.label : '';
  const color = c ? c.c : PALETTE.find(p => !state.cats.some(x => x.c === p)) || PALETTE[0];
  const custom = PALETTE.includes(color) ? '#7a6a5a' : color;
  $('swatches').innerHTML = PALETTE.map(p => `<label style="--c:${p}"><input type="radio" name="color" value="${p}" ${p === color ? 'checked' : ''}></label>`).join('')
    + `<label class="custom" style="--c:${custom}" title="Other colour"><input type="radio" name="color" value="${custom}" ${custom === color ? 'checked' : ''}><input type="color" value="${custom}"></label>`;
  $('catModal').classList.add('show');
  setTimeout(() => C.name.focus(), 30);
}
const closeCat = () => $('catModal').classList.remove('show');

$('swatches').addEventListener('input', e => {
  if (e.target.type !== 'color') return;
  const lab = e.target.parentElement, radio = lab.querySelector('input[type=radio]');
  radio.value = e.target.value; radio.checked = true;
  lab.style.setProperty('--c', e.target.value);
});

catForm.addEventListener('submit', e => {
  e.preventDefault();
  const label = C.name.value.trim(), color = C.color.value;
  let k = catEditing;
  if (k) Object.assign(catOf(k), {label, c:color});
  else { k = uid('c'); state.cats.push({k, label, c:color}); }
  save('cats'); closeCat();
  if (catFromForm) renderFormCats(k);
  render();
  toast(catEditing ? 'Filter updated' : `Filter "${esc(label)}" created`);
});
$('catCancel').onclick = closeCat;
$('catDelete').onclick = () => {
  const k = catEditing, snapCats = structuredClone(state.cats), snapEvents = structuredClone(state.events);
  state.cats = state.cats.filter(c => c.k !== k);
  state.events.forEach(p => { if (p.cat === k) p.cat = ''; });
  delete state.show['cat:' + k];
  save('cats', 'events', 'show'); closeCat(); render();
  toast('Filter deleted', [['Undo', () => { state.cats = snapCats; state.events = snapEvents; save('cats', 'events'); render(); }]]);
};

[$('modal'), $('catModal')].forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.remove('show'); }));

/* ---------- export / import ---------- */

function exportICS(){
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const dt = (d, m) => m >= 1440 ? `${stamp(addDays(d, 1))}T000000` : `${stamp(d)}T${pad(Math.floor(m/60))}${pad(m%60)}00`;
  const utc = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fukuro//EN', 'CALSCALE:GREGORIAN'];
  weekEvents().filter(e => !e.cancelled && visible(e)).forEach(e => {
    const date = addDays(cur, e.d);
    const summary = e.kind === 'uni' ? `${e.title} (${typeName(e.t)})` : e.title || 'Work';
    const desc = e.kind === 'uni' ? [subjOf(e.title).name, e.prof, e.g && 'Group ' + e.g].filter(Boolean).join(' · ') : e.note || '';
    lines.push('BEGIN:VEVENT', `UID:${e.id}-${iso(date)}@fukuro`, `DTSTAMP:${utc}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${stamp(date)}`, `DTEND;VALUE=DATE:${stamp(addDays(date, 1))}`);
    else lines.push(`DTSTART:${dt(date, e.s)}`, `DTEND:${dt(date, e.e)}`);
    lines.push(`SUMMARY:${icsEsc(summary)}`);
    if (e.room) lines.push(`LOCATION:${icsEsc('Room ' + e.room)}`);
    if (desc) lines.push(`DESCRIPTION:${icsEsc(desc)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  download(`week-${iso(cur)}.ics`, lines.join('\r\n'), 'text/calendar');
  toast('.ics file downloaded');
}

const BACKUP_KEYS = ['mode','show','cats','events','ovr','base','size','groups','closed','sideHidden'];
function exportBackup(){
  const data = {app:'jikanwari', version:2};
  BACKUP_KEYS.forEach(k => data[k] = state[k]);
  download(`calendar-backup-${iso(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('Backup downloaded');
}

$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'jikanwari') throw 0;
    BACKUP_KEYS.forEach(k => { if (data[k] !== undefined) state[k] = data[k]; });
    if (!MODES.some(m => m.k === state.mode)) state.mode = 'light';
    save(...BACKUP_KEYS); render();
    toast('Backup restored');
  } catch { toast('This file is not a valid backup'); }
});

/* ---------- custom background ---------- */
function applyBg(){
  document.body.classList.toggle('has-bg', !!state.bg);
  document.body.style.setProperty('--bg-img', state.bg ? `url("${state.bg}")` : 'none');
}
$('bgFile').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 2200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', 0.84);
    URL.revokeObjectURL(img.src);
    try { LS.setItem('jk.bg', data); } catch { return toast('Image too large, try a smaller one'); }
    state.bg = data; applyBg(); renderSide();
    if (window.VIEW === 'settings') MODS.settings.render();
  };
  img.src = URL.createObjectURL(file);
});

/* ---------- global events ---------- */
const syncMini = () => { miniMonth = new Date(cur.getFullYear(), cur.getMonth(), 1); };
const goWeek = d => { cur = d; syncMini(); closePop(); render(); };
const goMonth = n => { monthCur = new Date(monthCur.getFullYear(), monthCur.getMonth() + n, 1); miniMonth = monthCur; render(); };
function setCalView(v, date){
  if (v === 'month') monthCur = new Date(addDays(cur, 3).getFullYear(), addDays(cur, 3).getMonth(), 1);
  if (date) cur = weekStart(date);
  state.cview = v; save('cview'); syncMini(); closePop(); render();
}

document.addEventListener('click', e => {
  const t = e.target, a = t.closest('[data-act]');
  // the click that ends a drag shouldn't also open a popover / the form
  if (performance.now() < suppressUntil && t.closest('#rows')) { suppressUntil = 0; return; }
  if (!t.closest('.menu-wrap')) $('menu').classList.remove('show');

  if (t.closest('#bar') && !a) return;
  const gEl = t.closest('#rows .gl, #rows .gcard');
  const evEl = t.closest('#rows .ev, #rows .job');
  if ((e.shiftKey || e.ctrlKey || e.metaKey) && evEl && !gEl && !evEl.classList.contains('allday')) {
    const id = evEl.dataset.id;
    picked.has(id) ? picked.delete(id) : picked.add(id);
    evEl.classList.toggle('picked', picked.has(id));
    closePop(); renderBar();
    return;
  }
  if (gEl) { clearPicks(); return openGroupPop(gEl.dataset.gid, gEl); }
  if (evEl) { clearPicks(); select(evEl); return openPop(shown.find(x => x.id === evEl.dataset.id), evEl); }
  const hadPop = $('pop').classList.contains('show'), hadPicks = picked.size > 0;
  if (!t.closest('#pop')) closePop();

  if (!a) {
    if (hadPicks) return clearPicks();
    const track = t.closest('#rows .track');
    if (track && !hadPop) openForm(null, slotAt(e.clientX, track));
    return;
  }
  const v = a.dataset.v;
  switch (a.dataset.act) {
    case 'add': openForm(null, defaultPreset()); break;
    case 'add-week': openForm(null, defaultPreset(), 'week'); break;
    case 'prev': state.cview === 'month' ? goMonth(-1) : goWeek(addDays(cur, -7)); break;
    case 'next': state.cview === 'month' ? goMonth(1) : goWeek(addDays(cur, 7)); break;
    case 'today': if (state.cview === 'month') { const t = new Date(); monthCur = new Date(t.getFullYear(), t.getMonth(), 1); } goWeek(weekStart(new Date())); break;
    case 'cview': setCalView(v); break;
    case 'free': state.showFree = !state.showFree; save('showFree'); render(); break;
    case 'dl-new': openDeadline(null); break;
    case 'dl-edit': openDeadline(DL.list.find(x => x.id === v)); break;
    case 'mday': setCalView('week', parseISO(v)); break;
    case 'date': if (state.cview === 'month') { monthCur = new Date(parseISO(v).getFullYear(), parseISO(v).getMonth(), 1); } goWeek(weekStart(parseISO(v))); break;
    case 'due-pop': openDuePop(v, a); break;
    case 'due-done': {
      const t = TD.list.find(x => x.id === v); t.done = true; t.doneAt = Date.now(); saveTodos(); closePop(); render();
      toast(`Done · ${esc(t.text)}`, [['Undo', () => { t.done = false; saveTodos(); render(); }]]);
      break;
    }
    case 'goto': closePop(); go(v); break;
    case 'mini-prev': miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1); renderMini(); break;
    case 'mini-next': miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1); renderMini(); break;
    case 'sec': state.closed[v] = !state.closed[v]; save('closed'); a.parentElement.classList.toggle('closed', state.closed[v]); break;
    case 'side': state.sideHidden = !state.sideHidden; save('sideHidden'); render(); break;
    case 'cat-new': e.preventDefault(); openCat(null, v === 'form'); break;
    case 'cat-edit': e.preventDefault(); openCat(v); break;
    case 'bg-pick': $('bgFile').click(); break;
    case 'bg-clear': state.bg = null; LS.removeItem('jk.bg'); applyBg(); renderSide(); break;
    case 'menu': $('menu').classList.toggle('show'); break;
    case 'print': $('menu').classList.remove('show'); window.print(); break;
    case 'ics': $('menu').classList.remove('show'); exportICS(); break;
    case 'backup': $('menu').classList.remove('show'); exportBackup(); break;
    case 'import': $('menu').classList.remove('show'); $('importFile').click(); break;
    case 'pop': popAction(v); break;
    case 'gpop': groupAction(v); break;
    case 'group-make': makeGroup(); break;
    case 'pick-clear': clearPicks(); break;
    case 'pop-close': closePop(); break;
    case 'reset-week': {
      const wk = iso(cur), prev = state.ovr[wk];
      delete state.ovr[wk]; save('ovr'); render();
      toast('Week reset', [['Undo', () => { state.ovr[wk] = prev; save('ovr'); render(); }]]);
      break;
    }
  }
});

const editChip = e => {
  const l = e.target.closest('#filters label[data-edit]');
  if (l) { e.preventDefault(); openCat(l.dataset.edit); }
};
document.addEventListener('dblclick', editChip);
document.addEventListener('contextmenu', editChip);

document.addEventListener('change', e => {
  const f = e.target.dataset.f;
  if (f) { state.show[f] = e.target.checked; save('show'); render(); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { clearPicks(); closePop(); closeForm(); closeCat(); $('menu').classList.remove('show'); return; }
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal.show') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'd') setMode(document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark');
  if (window.VIEW !== 'calendar') return;
  if (e.key === 'ArrowLeft') state.cview === 'month' ? goMonth(-1) : goWeek(addDays(cur, -7));
  if (e.key === 'ArrowRight') state.cview === 'month' ? goMonth(1) : goWeek(addDays(cur, 7));
  if (k === 't') goWeek(weekStart(new Date()));
  if (k === 's') { state.sideHidden = !state.sideHidden; save('sideHidden'); render(); }
  if (k === 'f') { state.showFree = !state.showFree; save('showFree'); render(); }
  if (k === 'm') setCalView(state.cview === 'month' ? 'week' : 'month');
  if (k === 'n') { e.preventDefault(); openForm(null, defaultPreset()); }
  if (k === 'r') { e.preventDefault(); openForm(null, defaultPreset(), 'week'); }
});

addEventListener('resize', () => { closePop(); clearTimeout(render.tm); render.tm = setTimeout(render, 120); });
setInterval(() => { if (!drag && !document.querySelector('.modal.show')) { renderGrid(); renderSide(); } }, 60000);

applyBg();
