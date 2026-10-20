// Settings: appearance, general, overview, timetable, calendar, desktop options, reminders, planning, budget, storage, updates,
// shortcuts. Also the city search and the welcome screen on first launch.
const ST = {desk:null, info:null, update:null, recording:false};
const SHORTCUTS = [
  ['Ctrl+P', 'Search everything'], ['Ctrl+K', 'Quick capture (Ctrl+Shift+Space from anywhere)'], ['Ctrl+1 … 9', 'Go to a page'], ['Ctrl+,', 'Settings'],
  ['D', 'Light / dark'], ['N / R', 'Calendar: new event / routine'], ['F', 'Calendar: show free time'], ['M', 'Calendar: week / month'], ['T', 'Calendar: today'],
  ['← →', 'Calendar: previous / next'], ['Ctrl+N', 'Notes: new note'], ['[[', 'Notes: link another note'], ['Tab', 'Notes: indent a list item, next table cell'],
  ['Shift+drag', 'Boards: select several cards'], ['Ctrl+D', 'Boards: duplicate'],
];
const toggle = (key, on, label, sub, desk) => `<label class="st-row"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="sw"><input type="checkbox" ${desk ? `data-desk="${key}"` : `data-cfg="${key}"`} ${on ? 'checked' : ''}><i></i></span></label>`;
const row = (label, sub, control) => `<div class="st-row"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="st-ctl">${control}</span></div>`;
const pretty = acc => acc.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ');

MODS.settings = {
  async render(){
    if (DESK && !ST.info) {
      [ST.desk, ST.info] = await Promise.all([desk.settings(), desk.info()]);
      desk.checkUpdate().then(u => { ST.update = u; if (window.VIEW === 'settings' && u.available) MODS.settings.render(); });
    }
    const sel = (key, opts, cur, str) => `<select class="st-sel" data-cfg="${key}"${str ? ' data-str="1"' : ''}>${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const u = ST.update;
    $('v-settings').innerHTML = `<div class="pg narrow stg">
      <header class="pg-h"><div><h1>Settings</h1><p>${DESK ? `Fukurō ${ST.info.version}` : 'Running in the browser · desktop options are hidden'}</p></div></header>

      <section class="st-card"><h3>Appearance</h3>
        ${row('Theme', 'Auto follows Windows', `<div class="vseg">${MODES.map(m => `<button class="${m.k === state.mode ? 'on' : ''}" data-st-mode="${m.k}">${m.name}</button>`).join('')}</div>`)}
        ${row('Background picture', 'Shows behind every page, frosted', `<button class="btn" data-st="bg">${state.bg ? 'Change' : 'Choose'}</button>${state.bg ? '<button class="btn" data-st="bgclear">Remove</button>' : ''}`)}
      </section>

      <section class="st-card"><h3>General</h3>
        ${row('Week starts on', 'The first column of the calendar', `<select class="st-sel" data-wk="1">${[[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']].map(([v, l]) => `<option value="${v}" ${v === CFG.weekStart ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${row('Open on', 'The page you see when Fukurō starts', sel('startPage', [['last', 'Where I left off'], ['overview', 'Overview'], ['calendar', 'Calendar'], ['todos', 'To-dos'], ['notes', 'Notes'], ['budget', 'Budget']], CFG.startPage, true))}
        ${toggle('sound', CFG.sound !== false, 'Sounds', 'The chime for timers and reminders')}
        ${toggle('motion', CFG.motion !== false, 'Animations', 'Cards sliding in and numbers counting up on the Overview')}
      </section>

      <section class="st-card"><h3>Overview</h3>
        ${row('Cards', 'Click to show or hide', `<div class="st-chips">${OV_CARDS.map(([k, l]) => `<button class="${(CFG.ovHide || []).includes(k) ? '' : 'on'}" data-ovcard="${k}">${l}</button>`).join('')}</div>`)}
        ${row('Card order', '', sel('ovOrder', [['time', 'Changes with the time of day'], ['fixed', 'Always the same']], CFG.ovOrder, true))}
        ${toggle('ovSuggest', CFG.ovSuggest !== false, 'Suggestions when you are free', 'Revise for a close exam, a habit that is behind, or your top to-do')}
        ${toggle('ovSay', CFG.ovSay !== false, 'Summary line', 'The owl sentence under the sky')}
        ${row('City', CFG.lat != null ? esc(CFG.place) : 'Not set · the sky follows your time zone', `<button class="btn" data-st="place">${CFG.lat != null ? 'Change' : 'Choose'}</button>`)}
        ${toggle('weather', CFG.weather !== false, 'Weather', CFG.lat != null ? `Open-Meteo, for ${esc(CFG.place)} (only the city position is sent)` : 'Choose a city first')}
      </section>

      <section class="st-card"><h3>Timetable</h3>
        ${row('Classes and work shifts', TT.classes.length || SHIFTS.length ? `${TT.classes.filter(ttMine).length} class${TT.classes.filter(ttMine).length === 1 ? '' : 'es'} · ${SHIFTS.length} work shift${SHIFTS.length === 1 ? '' : 's'} a week` : 'Add them once, they repeat every week', `<button class="btn${TT.classes.length || SHIFTS.length ? '' : ' primary'}" data-st="tt">${TT.classes.length || SHIFTS.length ? 'Edit' : 'Add'}</button>`)}
        ${row('Name', 'Shown at the top of the calendar', `<input type="text" class="st-txt" data-tt="name" value="${esc(TT.name)}" maxlength="40" placeholder="e.g. Year 2 · Group B">`)}
        ${ttGroups().length ? row('Your group', 'Classes of other groups are hidden', `<select class="st-sel" data-tt="group"><option value="">All groups</option>${ttGroups().map(g => `<option value="${esc(g)}" ${g === TT.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>`) : ''}
        ${row('Class types', 'What your school calls them', FIXED.filter(f => f.k !== 'job').map(f => `<input type="text" class="st-txt short" data-ttype="${f.k}" value="${esc(typeName(f.k))}" maxlength="14">`).join(''))}
        ${row('Share with classmates', 'A file with your classes, without your work shifts', '<button class="btn" data-st="ttexport">Export</button><button class="btn" data-st="ttimport">Import…</button>')}
      </section>

      <section class="st-card"><h3>Calendar & to-dos</h3>
        ${toggle('missTodos', !!CFG.missTodos, 'Catch-up to-dos for missed classes', 'Adds a to-do when a class happens while you are at work')}
        ${missOpen().length ? row(`${missOpen().length} catch-up to-do${missOpen().length > 1 ? 's' : ''} in your list`, '', '<button class="btn" data-st="clearmiss">Remove them</button>') : ''}
        ${toggle('calTodos', CFG.calTodos !== false, 'Due to-dos on calendar days', 'A small "2 to-dos" mark next to the date')}
        ${row('Drag step', 'Moving and resizing blocks snaps to this', sel('snap', [[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']], CFG.snap || 5))}
      </section>

      ${DESK ? `<section class="st-card"><h3>Desktop</h3>
        ${toggle('autostart', ST.desk.autostart, 'Start with Windows', ST.info.packaged ? 'Opens hidden in the tray' : 'Only in the installed app', true)}
        ${toggle('closeToTray', ST.desk.closeToTray, 'Keep running when closed', 'Timers, reminders and the shortcut keep working', true)}
        ${row('Quick capture shortcut', 'Works from any app', `<button class="btn kbd-btn${ST.recording ? ' rec' : ''}" data-st="hotkey">${ST.recording ? 'Press the keys…' : pretty(ST.desk.hotkey)}</button>`)}
      </section>` : ''}

      <section class="st-card"><h3>Reminders</h3>
        ${toggle('remOn', CFG.remOn, 'Notifications', 'Before classes and your events, plus exam warnings')}
        ${row('Before each class', '', sel('remLead', [[5, '5 min'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min']], CFG.remLead))}
        ${toggle('remWork', CFG.remWork, 'Remind me before work too', '')}
        ${toggle('remExam', CFG.remExam !== false, 'Exam warnings', 'The evening before at 18:00, and an hour before when a time is set')}
        ${row('Morning summary', 'Your day in one notification', `<input type="time" class="st-time" data-cfg="remDigest" value="${CFG.remDigest || ''}"><button class="btn" data-st="digestoff"${CFG.remDigest ? '' : ' hidden'}>Off</button>`)}
        ${row('Try it', '', '<button class="btn" data-st="testrem">Send a test</button>')}
      </section>

      <section class="st-card"><h3>Free time & revision planner</h3>
        ${row('Free time counts from', 'The planner never puts sessions outside this', `<input type="time" class="st-time" data-cfg="planFrom" value="${fmt(CFG.planFrom)}"><span class="st-to">to</span><input type="time" class="st-time" data-cfg="planTo" value="${fmt(Math.min(CFG.planTo, 1439))}">`)}
        ${row('Shortest useful gap', '', sel('minFree', [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour']], CFG.minFree))}
        ${row('Daily focus goal', 'Shown on the Overview', sel('focusGoal', [[30, '30 min'], [60, '1 hour'], [90, '1h 30'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours']], CFG.focusGoal))}
      </section>

      <section class="st-card"><h3>Budget</h3>
        ${row('Currency', 'Symbol or code, e.g. €, $, £, DA', `<input type="text" class="st-txt short" data-cfg="currency" value="${esc(CFG.currency)}" maxlength="5">`)}
        ${row('Monthly spending limit', '0 means no limit', `<input type="number" class="st-txt" data-cfg="budget" value="${CFG.budget || 0}" min="0" step="100">`)}
        ${toggle('recAuto', CFG.recAuto !== false, 'Add monthly expenses by themselves', 'Off: they show as due until you tap Paid, like your salary')}
        ${toggle('limWarn', CFG.limWarn !== false, 'Limit warnings', 'A heads-up at 80% of a category limit and when you go over')}
        ${toggle('planFill', CFG.planFill !== false, 'Fill the savings plan on payday', 'Ticked by default when you confirm your salary')}
      </section>

      <section class="st-card"><h3>Your data</h3>
        ${DESK ? row('Everything except notes', esc(ST.info.dataFile), '<button class="btn" data-st="opendata">Open folder</button>') : ''}
        ${DESK ? row('Notes folder', esc(ST.info.notesRoot) + (ST.info.notesRoot === ST.info.defaultNotes ? '' : ' (custom)'), `${ST.info.notesLocked ? '' : '<button class="btn" data-st="notesdir">Change</button>'}${ST.info.notesRoot !== ST.info.defaultNotes && !ST.info.notesLocked ? '<button class="btn" data-st="notesreset">Default</button>' : ''}<button class="btn" data-st="opennotes">Open</button>`) : ''}
        ${row('Export everything', 'One .json file with all your data (notes are already plain files)', '<button class="btn" data-st="export">Export</button>')}
        ${row('Import', 'Replaces everything with a file you exported', '<button class="btn" data-st="import">Import…</button>')}
        ${row('Calendar changes', 'Forget every moved or skipped class and resized block', '<button class="btn danger-t" data-st="resetcal">Reset</button>')}
      </section>

      ${DESK ? `<section class="st-card"><h3>Updates</h3>
        ${row(u && u.available ? `Version ${esc(u.version)} is ready` : 'You have the latest version', u && u.available ? (u.notes ? esc(u.notes) : 'Restarts Fukurō, takes a few seconds') : `Fukurō ${esc(ST.info.version)} · checks GitHub for new versions`,
          u && u.available ? '<button class="btn primary" data-st="install">Restart to update</button>' : '<button class="btn" data-st="check">Check now</button>')}
      </section>` : ''}

      <section class="st-card"><h3>Keyboard</h3>
        <div class="st-keys">${SHORTCUTS.map(([k, l]) => `<div><kbd>${k}</kbd><span>${l}</span></div>`).join('')}</div>
      </section>
    </div>`;
  },
};

function setCfg(k, v){ CFG[k] = v; saveCfg(); }
$('v-settings').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.desk) { desk.setSetting(t.dataset.desk, t.checked).then(s => { ST.desk = s; }); return; }
  if (t.dataset.wk) { toast('Moving your week…'); return setTimeout(() => setWeekStart(+t.value), 300); }
  if (t.dataset.tt) { TT[t.dataset.tt] = t.value.trim(); ttChanged(t.dataset.tt === 'group'); return toast('Saved'); }
  if (t.dataset.ttype) {
    const k = t.dataset.ttype;
    TT.types[k] = t.value.trim() || {Cours:'Lecture', TD:'Tutorial', TP:'Lab'}[k];
    FIXED.find(f => f.k === k).label = t.value = TT.types[k];
    ttChanged(false); return toast('Saved');
  }
  const k = t.dataset.cfg; if (!k) return;
  if (t.type === 'checkbox') setCfg(k, t.checked);
  else if (t.type === 'time') {
    if (k === 'remDigest') setCfg(k, t.value);
    else if (t.value) setCfg(k, toMin(t.value) || (k === 'planTo' ? 1440 : 0));
    if (CFG.planTo <= CFG.planFrom) { CFG.planTo = Math.min(1440, CFG.planFrom + 60); saveCfg(); MODS.settings.render(); }
  }
  else if (t.dataset.str) setCfg(k, t.value);
  else if (t.type === 'number' || t.tagName === 'SELECT') setCfg(k, +t.value || 0);
  else setCfg(k, t.value.trim());
  if (k === 'snap') SNAP = CFG.snap || 5;
  if (k === 'remDigest' || k === 'missTodos') MODS.settings.render();
  toast('Saved');
});
$('v-settings').addEventListener('click', async e => {
  const m = e.target.closest('[data-st-mode]'); if (m) return setMode(m.dataset.stMode);
  const oc = e.target.closest('[data-ovcard]');
  if (oc) {
    const k = oc.dataset.ovcard, hide = new Set(CFG.ovHide || []);
    hide.has(k) ? hide.delete(k) : hide.add(k);
    setCfg('ovHide', [...hide]); oc.classList.toggle('on'); return;
  }
  const b = e.target.closest('[data-st]'); if (!b) return;
  switch (b.dataset.st) {
    case 'bg': $('bgFile').click(); break;
    case 'clearmiss': clearMissed(); break;
    case 'place': openPlace(); break;
    case 'tt': openTimetable(); break;
    case 'ttexport': exportTimetable(); break;
    case 'ttimport': ttFileIn.click(); break;
    case 'bgclear': state.bg = null; LS.removeItem('jk.bg'); applyBg(); MODS.settings.render(); break;
    case 'hotkey': ST.recording = true; MODS.settings.render(); break;
    case 'digestoff': setCfg('remDigest', ''); MODS.settings.render(); break;
    case 'testrem':
      if (window.Notification && Notification.permission === 'default') await Notification.requestPermission();
      actx ||= new AudioContext();
      remind('Fukurō reminder', digestText(new Date()), 'overview'); break;
    case 'opendata': desk.openPath(ST.info.dataFile.replace(/[\\/][^\\/]+$/, '')); break;
    case 'opennotes': desk.openPath(ST.info.notesRoot); break;
    case 'notesdir': {
      const dir = await desk.pickFolder(); if (!dir) return;
      ST.desk = await desk.setSetting('notesDir', dir); ST.info = await desk.info(); NT.cur = null; MODS.settings.render();
      toast('Notes now read from ' + esc(dir)); break;
    }
    case 'notesreset': ST.desk = await desk.setSetting('notesDir', ''); ST.info = await desk.info(); NT.cur = null; MODS.settings.render(); toast('Back to the default notes folder'); break;
    case 'export': exportAll(); break;
    case 'import': $('importAll').click(); break;
    case 'resetcal': {
      const prev = {ovr:state.ovr, base:state.base, size:state.size};
      state.ovr = {}; state.base = {}; state.size = {}; save('ovr', 'base', 'size');
      toast('Calendar changes cleared', [['Undo', () => { Object.assign(state, prev); save('ovr', 'base', 'size'); }]]); break;
    }
    case 'check': toast('Checking…'); ST.update = await desk.checkUpdate(); MODS.settings.render(); toast(ST.update.available ? `Version ${ST.update.version} is ready` : 'No new version yet'); break;
    case 'install': toast('Updating… Fukurō will reopen by itself'); setTimeout(() => desk.installUpdate(), 600); break;
  }
});
// record a new global shortcut
document.addEventListener('keydown', async e => {
  if (!ST.recording || window.VIEW !== 'settings') return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { ST.recording = false; return MODS.settings.render(); }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean);
  if (!mods.length) return toast('Use at least Ctrl or Alt');
  const key = e.code === 'Space' ? 'Space' : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : /^F\d+$/.test(e.key) ? e.key : null;
  if (!key) return toast('Pick a letter, a number, Space or F1–F12');
  const acc = [...mods, key].join('+');
  ST.recording = false;
  if (await desk.testHotkey(acc)) { ST.desk = await desk.settings(); toast('Shortcut set to ' + pretty(acc)); }
  else toast('Another app already uses ' + pretty(acc));
  MODS.settings.render();
}, true);

/* ---------- export / import everything ---------- */
function exportAll(){
  const keys = (LS.keys ? LS.keys() : Object.keys(localStorage)).filter(k => k.startsWith('jk.'));
  const data = {}; keys.forEach(k => data[k] = LS.getItem(k));
  download(`fukuro-${todayISO()}.json`, JSON.stringify({app:'fukuro', version:1, exported:new Date().toISOString(), data}, null, 1), 'application/json');
  toast(`Exported ${keys.length} items`);
}
const importAll = Object.assign(document.createElement('input'), {type:'file', accept:'.json,application/json', id:'importAll', hidden:true});
document.body.appendChild(importAll);
importAll.addEventListener('change', async () => {
  const file = importAll.files[0]; importAll.value = ''; if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (j.app !== 'fukuro' || !j.data) throw 0;
    openSheet(`<h2>Replace your data?</h2><p class="field-note">Everything in Fukurō (except notes) is replaced by the file from ${esc(new Date(j.exported).toLocaleString('en-GB'))}. Export first if you're not sure.</p>
      <div class="actions"><span class="sp"></span><button type="button" class="btn" data-sheet="cancel">Cancel</button><button type="submit" class="btn primary">Replace and reload</button></div>`, () => {
        Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith('jk.')) LS.setItem(k, v); });
        setTimeout(() => location.reload(), 600);
      });
  } catch { toast('This is not a Fukurō export'); }
});

// a new version dropped into the updates folder
if (DESK) desk.onUpdate(u => {
  ST.update = u;
  toast(`Fukurō ${esc(u.version)} is ready`, [['Restart to update', () => desk.installUpdate()], ['Later', () => {}]]);
  if (window.VIEW === 'settings') MODS.settings.render();
});

/* ---------- city: Open-Meteo's free geocoding, no account ---------- */
async function geocode(q){
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  return ((await r.json()).results || []).map(x => ({name:x.name, admin:x.admin1 || '', country:x.country || '', lat:+x.latitude.toFixed(3), lon:+x.longitude.toFixed(3)}));
}
const placeLabel = p => [p.name, p.admin !== p.name && p.admin, p.country].filter(Boolean).join(', ');
function setPlace(p){
  Object.assign(CFG, p ? {place:placeLabel(p), lat:p.lat, lon:p.lon} : {place:'', lat:null, lon:null}); saveCfg();
  WX.data = null; store.set('wx', null);
  if (p) loadWeather(true);
  if (window.VIEW === 'settings') MODS.settings.render();
}
function openPlace(q = '', found = null){
  openSheet(`<h2>Your city</h2>
    <p class="field-note">For the weather and the sunrise on the Overview. Only the city's position is sent to Open-Meteo.</p>
    <input type="text" name="q" placeholder="Search a city" value="${esc(q)}" maxlength="60" required>
    ${found ? found.length ? `<div class="pl-list">${found.map((p, i) => `<label class="check"><input type="radio" name="pick" value="${i}" ${i ? '' : 'checked'}>${esc(placeLabel(p))}</label>`).join('')}</div>` : '<p class="field-note">No city found with that name.</p>' : ''}
    <div class="actions">${CFG.lat != null ? '<button type="button" class="btn" data-pl="clear">Remove</button>' : ''}<span class="sp"></span><button type="button" class="btn" data-sheet="cancel">Cancel</button><button type="submit" class="btn primary">${found?.length ? 'Use this city' : 'Search'}</button></div>`, f => {
      const nq = f.q.value.trim();
      if (found?.length && nq === q) { setPlace(found[+f.pick.value]); toast('City saved'); return; }
      geocode(nq).then(r => openPlace(nq, r)).catch(() => toast('No connection, try again later'));
      return false;
    });
  $('mdForm').onclick = e => { if (e.target.closest('[data-pl=clear]')) { setPlace(null); closeSheet(); toast('City removed'); } };
}

/* ---------- first launch ---------- */
function welcome(){
  const ws = [1, 0, 6].includes(CFG.weekStart) ? CFG.weekStart : 1;
  openSheet(`<h2>Welcome to Fukurō</h2>
    <p class="field-note">A few things so it fits you. Everything can be changed later in Settings.</p>
    <div class="field-lbl">Your week starts on</div>
    <div class="quick hb-target">${[[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']].map(([v, l]) => `<label><input type="radio" name="wk" value="${v}" ${v === ws ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <div class="nums n2"><label>Your city<input type="text" name="city" placeholder="For weather and sunrise" maxlength="60"></label><label>Currency<input type="text" name="cur" placeholder="€, $, £, DA…" maxlength="5"></label></div>
    <label class="check"><input type="checkbox" name="tt"> I have classes or work shifts to add</label>
    <div class="actions"><button type="button" class="btn" data-wl="skip">Skip</button><span class="sp"></span><button type="submit" class="btn primary">Start</button></div>`, f => {
      const w = +f.wk.value, city = f.city.value.trim(), tt = f.tt.checked;
      CFG.currency = f.cur.value.trim(); saveCfg(); store.set('setup', 1);
      (city ? geocode(city).then(r => r[0] && setPlace(r[0])).catch(() => {}) : Promise.resolve()).then(() => {
        if (w !== CFG.weekStart) { if (tt) store.set('ttPrompt', 1); return setWeekStart(w); }
        closeSheet(); if (window.VIEW === 'overview') go('overview');
        if (tt) openTimetable();
      });
      return false;
    });
  $('mdForm').onclick = e => { if (e.target.closest('[data-wl=skip]')) { saveCfg(); store.set('setup', 1); closeSheet(); } };
}
addEventListener('DOMContentLoaded', () => setTimeout(() => {
  if (!store.get('setup', 0)) welcome();
  else if (store.get('ttPrompt', 0)) { LS.removeItem('jk.ttPrompt'); openTimetable(); }
}, 400));
