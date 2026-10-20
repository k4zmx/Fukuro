// Timetable: your weekly classes and work shifts, a file to share them with classmates, and the week start.
const TTV = {all: false};
const ttGroups = () => [...new Set(TT.classes.map(c => c.g).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
const ttMine = c => !c.g || !TT.group || c.g === TT.group;
const ttBrand = () => { $('ttName').textContent = TT.name; };
ttBrand();

function ttChanged(redraw = true){
  saveTT(); saveShifts(); ttBrand();
  render();
  if (redraw && window.VIEW === 'settings') MODS.settings.render();
}
const dropUnused = code => { if (code && !TT.classes.some(c => c.sub === code)) delete SUBJ[code]; };
const dayOpts = cur => DAYS.map((n, d) => `<option value="${d}" ${d === cur ? 'selected' : ''}>${n}</option>`).join('');

function openTimetable(){
  const shown = TT.classes.filter(c => TTV.all || ttMine(c)), hidden = TT.classes.length - shown.length;
  const days = DAYS.map((n, d) => {
    const items = [...shown.filter(c => c.d === d).map(c => ({...c, kind: 'c'})), ...SHIFTS.filter(j => j.d === d && !j.allDay).map(j => ({...j, kind: 'j'}))].sort((a, b) => a.s - b.s);
    if (!items.length) return '';
    return `<div class="tt-day"><b>${n}</b>${items.map(x => x.kind === 'c'
      ? `<button type="button" class="tt-row${ttMine(x) ? '' : ' other'}" data-ttc="${x.id}" style="--c:${subjOf(x.sub).c}"><i></i><span class="tm">${fmt(x.s)} – ${fmt(x.e)}</span><span class="nm">${esc(x.sub)} · ${esc(typeName(x.t))}</span><small>${esc([x.room, x.g].filter(Boolean).join(' · '))}</small></button>`
      : `<button type="button" class="tt-row" data-ttj="${x.id}" style="--c:var(--job-c)"><i></i><span class="tm">${fmt(x.s)} – ${fmt(x.e)}</span><span class="nm">Work</span><small>${x.soft ? 'Flexible' : ''}</small></button>`).join('')}</div>`;
  }).join('');
  openSheet(`<h2>Timetable</h2>
    ${hidden || TTV.all && TT.group ? `<p class="field-note">${TTV.all ? 'Showing every group.' : `${hidden} class${hidden > 1 ? 'es' : ''} of other groups hidden.`} <button type="button" class="lnk" data-tt="all">${TTV.all ? 'Only mine' : 'Show them'}</button></p>` : ''}
    <div class="tt-list">${days || '<p class="empty-state">No classes or work shifts yet. Add them once and they repeat every week.</p>'}</div>
    <div class="actions"><button type="button" class="btn" data-tt="class">Add class</button><button type="button" class="btn" data-tt="shift">Add work shift</button><span class="sp"></span><button type="button" class="btn primary" data-sheet="cancel">Done</button></div>`, null);
  $('mdForm').querySelector('.tt-list').parentElement.onclick = e => {
    const c = e.target.closest('[data-ttc]'), j = e.target.closest('[data-ttj]'), b = e.target.closest('[data-tt]');
    if (c) openClass(TT.classes.find(x => x.id === c.dataset.ttc));
    else if (j) openShift(SHIFTS.find(x => x.id === j.dataset.ttj));
    else if (b && b.dataset.tt === 'class') openClass(null, TT.classes.filter(ttMine).at(-1));
    else if (b && b.dataset.tt === 'shift') openShift(null);
    else if (b && b.dataset.tt === 'all') { TTV.all = !TTV.all; openTimetable(); }
  };
}

// prev: the last class added, so the next one starts from its day and end time
function openClass(c, prev){
  const v = c || {sub: '', t: 'Cours', d: prev ? prev.d : 0, s: prev ? prev.e + 10 : 480, e: prev ? prev.e + 100 : 570, room: '', prof: '', g: prev ? prev.g : TT.group};
  const used = new Set(Object.values(SUBJ).map(s => s.c)), color = c ? subjOf(c.sub).c : PALETTE.find(p => !used.has(p)) || PALETTE[0];
  const swatches = col => PALETTE.map(p => `<label style="--c:${p}"><input type="radio" name="color" value="${p}" ${p === col ? 'checked' : ''}></label>`).join('');
  openSheet(`<h2>${c ? 'Edit class' : 'New class'}</h2>
    <div class="nums n2"><label>Short name<input type="text" name="sub" list="ttSubs" maxlength="20" required placeholder="e.g. MATH1" value="${esc(v.sub)}"></label><label>Full name<input type="text" name="name" maxlength="60" placeholder="Optional" value="${esc(c ? subjOf(c.sub).name : '')}"></label></div>
    <datalist id="ttSubs">${Object.entries(SUBJ).map(([k, s]) => `<option value="${esc(k)}">${esc(s.name)}</option>`).join('')}</datalist>
    <div class="swatches" id="ttSw">${swatches(color)}</div>
    <div class="quick hb-target">${FIXED.filter(f => f.k !== 'job').map(f => `<label><input type="radio" name="t" value="${f.k}" ${v.t === f.k ? 'checked' : ''}><span>${esc(typeName(f.k))}</span></label>`).join('')}</div>
    <div class="nums n3"><label>Day<select name="d" class="sel">${dayOpts(v.d)}</select></label><label>Start<input type="time" name="s" required value="${fmt(v.s)}"></label><label>End<input type="time" name="e" required value="${fmt(Math.min(v.e, 1435))}"></label></div>
    <div class="nums n3"><label>Room<input type="text" name="room" maxlength="20" value="${esc(v.room || '')}"></label><label>Teacher<input type="text" name="prof" maxlength="40" value="${esc(v.prof || '')}"></label><label>Group<input type="text" name="g" maxlength="12" placeholder="Everyone" value="${esc(v.g || '')}"></label></div>
    ${sheetActions(!!c)}`, f => {
      const code = f.sub.value.trim(), s = toMin(f.s.value), e = toMin(f.e.value);
      if (e <= s) { toast('End must be after start'); return false; }
      SUBJ[code] = {c: f.color.value, name: f.name.value.trim() || code};
      const n = {sub: code, t: f.t.value, d: +f.d.value, s, e, room: f.room.value.trim(), prof: f.prof.value.trim(), g: f.g.value.trim()};
      if (c) { const old = c.sub; Object.assign(c, n); dropUnused(old); delete state.base[c.id]; save('base'); }
      else TT.classes.push({id: uid('u'), ...n});
      ttChanged(); openTimetable();
      return false;
    });
  const form = $('mdForm');
  // typing a subject you already have brings back its name and colour
  form.oninput = e => {
    if (e.target.name !== 'sub') return;
    const s = SUBJ[e.target.value.trim()]; if (!s) return;
    form.elements.name.value = s.name === e.target.value.trim() ? '' : s.name;
    if (PALETTE.includes(s.c)) $('ttSw').innerHTML = swatches(s.c);
  };
  if (c) form.querySelector('[data-sheet=delete]').addEventListener('click', () => {
    const i = TT.classes.indexOf(c), subj = {...SUBJ[c.sub]};
    TT.classes.splice(i, 1); dropUnused(c.sub); ttChanged(); openTimetable();
    toast('Class deleted', [['Undo', () => { TT.classes.splice(i, 0, c); SUBJ[c.sub] ||= subj; ttChanged(); }]]);
  });
}

function openShift(j){
  const v = j || {d: 0, s: 540, e: 1020, soft: false};
  openSheet(`<h2>${j ? 'Edit work shift' : 'New work shift'}</h2>
    ${j ? `<label class="field-lbl">Day</label><select name="d" class="sel">${dayOpts(v.d)}</select>`
        : `<div class="quick hb-target">${DAYS.map((n, d) => `<label><input type="checkbox" name="days" value="${d}"><span>${n.slice(0, 3)}</span></label>`).join('')}</div>`}
    <div class="nums n2"><label>Start<input type="time" name="s" required value="${fmt(v.s)}"></label><label>End<input type="time" name="e" required value="${fmt(Math.min(v.e, 1435))}"></label></div>
    <label class="check"><input type="checkbox" name="soft" ${v.soft ? 'checked' : ''}> Flexible hours (drawn lighter)</label>
    <p class="field-note">Classes during a shift are marked "At work". Reminders before work can be turned on in Settings.</p>
    ${sheetActions(!!j)}`, f => {
      const s = toMin(f.s.value), e = toMin(f.e.value);
      if (e <= s) { toast('End must be after start'); return false; }
      const n = {s, e, soft: f.soft.checked};
      if (j) { Object.assign(j, n, {d: +f.d.value}); delete state.base[j.id]; save('base'); }
      else {
        const days = [...$('mdForm').querySelectorAll('[name=days]:checked')].map(x => +x.value);
        if (!days.length) { toast('Pick at least one day'); return false; }
        days.forEach(d => SHIFTS.push({id: uid('j'), d, ...n}));
      }
      ttChanged(); openTimetable();
      return false;
    });
  if (j) $('mdForm').querySelector('[data-sheet=delete]').addEventListener('click', () => {
    const i = SHIFTS.indexOf(j);
    SHIFTS.splice(i, 1); ttChanged(); openTimetable();
    toast('Shift deleted', [['Undo', () => { SHIFTS.splice(i, 0, j); ttChanged(); }]]);
  });
}

/* ---------- share: export your classes, import a classmate's ---------- */
function exportTimetable(){
  download(`timetable${TT.name ? ' ' + TT.name.replace(/[<>:"/\\|?*·]+/g, ' ').replace(/\s+/g, ' ').trim() : ''}.json`,
    JSON.stringify({app: 'fukuro-timetable', version: 1, weekStart: CFG.weekStart, name: TT.name, types: TT.types, subjects: SUBJ, classes: TT.classes}, null, 1), 'application/json');
  toast('Timetable exported · work shifts are not included');
}
const ttFileIn = Object.assign(document.createElement('input'), {type: 'file', accept: '.json,application/json', hidden: true});
document.body.appendChild(ttFileIn);
ttFileIn.addEventListener('change', async () => {
  const file = ttFileIn.files[0]; ttFileIn.value = ''; if (!file) return;
  let j; try { j = JSON.parse(await file.text()); if (!Array.isArray(j.classes)) throw 0; } catch { return toast('This is not a Fukurō timetable'); }
  openSheet(`<h2>Import ${esc(j.name || 'this timetable')}?</h2><p class="field-note">${j.classes.length} classes replace the ${TT.classes.length} you have now. Your work shifts and events stay.</p>
    <div class="actions"><span class="sp"></span><button type="button" class="btn" data-sheet="cancel">Cancel</button><button type="submit" class="btn primary">Import</button></div>`, () => {
      ttApply(j, false); location.reload();
    });
});

/* ---------- week start: every stored weekday index moves with it ---------- */
function setWeekStart(ws){
  const from = CFG.weekStart; if (ws === from) return;
  const shift = d => (d + from - ws + 14) % 7, newIndex = date => (date.getDay() + 7 - ws) % 7;
  const origD = id => state.base[id]?.d ?? (TT.classes.find(x => x.id === id) || SHIFTS.find(x => x.id === id) || state.events.find(x => x.id === id))?.d;
  // one-week changes are keyed by the old week's first day
  const ovr = {};
  Object.entries(state.ovr).forEach(([wk, list]) => Object.entries(list).forEach(([id, o]) => {
    const d0 = origD(id); if (d0 == null) return;
    const day = addDays(parseISO(wk), d0), nw = addDays(day, -newIndex(day)), v = {...o};
    if (o.d != null) { v.d = daysBetween(nw, addDays(parseISO(wk), o.d)); if (v.d < 0 || v.d > 6) return; }
    (ovr[iso(nw)] ||= {})[id] = v;
  }));
  TT.classes.forEach(c => c.d = shift(c.d));
  SHIFTS.forEach(j => j.d = shift(j.d));
  state.events.forEach(e => e.d = e.repeat ? shift(e.d) : newIndex(parseISO(e.date)));
  Object.values(state.base).forEach(b => { if (b.d != null) b.d = shift(b.d); });
  state.ovr = ovr;
  save('events', 'base', 'ovr'); saveTT(); saveShifts();
  CFG.weekStart = ws; saveCfg();
  location.reload();
}
