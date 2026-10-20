// Timers: named countdowns and Pomodoro. A running timer is stored as an end timestamp,
// so it keeps going across pages and app restarts.
const TM = {
  list: store.get('timers', [
    {id:'tpomo', kind:'pomo', name:'Pomodoro', focus:25, short:5, long:15, every:4, auto:true},
    {id:'t10', kind:'cd', name:'10 min', dur:600},
  ]),
  editing: null, kind: 'cd',
};
const PHASE = {focus:'Focus', short:'Short break', long:'Long break'};
const saveTimers = () => store.set('timers', TM.list);
const FOCUS = store.get('focusLog', []);   // [{d:'2026-10-12', m:25, name}]
const logFocus = (m, name) => { FOCUS.push({d:todayISO(), m:Math.round(m), name}); store.set('focusLog', FOCUS); };
const tmById = id => TM.list.find(t => t.id === id);

const phaseSec = (t, ph) => t.kind === 'cd' ? t.dur : t[ph || 'focus'] * 60;
const remaining = t => !t.run ? phaseSec(t) : t.run.paused ? t.run.left : Math.max(0, (t.run.endsAt - Date.now()) / 1000);
const progressOf = t => t.run ? clamp(1 - remaining(t) / t.run.dur, 0, 1) : 0;
function fmtSec(sec){
  const s = Math.ceil(sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}
const durLabel = sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return [h && h + 'h', m && m + ' min', s && s + 's'].filter(Boolean).join(' ') || '0s'; };
const clockAt = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* ---------- engine ---------- */
let actx;
function chime(){
  if (CFG.sound === false) return;
  try {
    actx ||= new AudioContext();
    const t0 = actx.currentTime + 0.02;
    [[659.25, 0], [987.77, 0.2]].forEach(([f, d]) => [[1, 0.22], [2.01, 0.05]].forEach(([h, vol]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f * h;
      g.gain.setValueAtTime(0, t0 + d);
      g.gain.linearRampToValueAtTime(vol, t0 + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.8);
      o.connect(g).connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + 1.9);
    }));
  } catch {}
}
function notify(title, body){
  chime(); desk.flash();
  toast(`${esc(title)} · ${esc(body)}`);
  try { if (Notification.permission === 'granted') new Notification(title, {body, icon:'build/icon.png', silent:true}); } catch {}
}

function startPhase(t, phase, round, paused){
  const dur = phaseSec(t, phase);
  t.run = {phase, round, dur, paused:!!paused, left:dur, endsAt:Date.now() + dur * 1000};
}
function tmAct(id, act){
  const t = tmById(id); if (!t) return;
  if (act === 'toggle') {
    actx ||= new AudioContext();   // created on a click so the chime is allowed later
    if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
    t.done = null;
    if (!t.run) startPhase(t, 'focus', 1);
    else if (t.run.paused) Object.assign(t.run, {paused:false, endsAt:Date.now() + t.run.left * 1000});
    else Object.assign(t.run, {paused:true, left:remaining(t)});
  }
  if (act === 'reset') { t.run = null; t.done = null; }
  if (act === 'plus' && t.run) { t.run.dur += 60; t.run.paused ? t.run.left += 60 : t.run.endsAt += 60000; }
  if (act === 'skip' && t.run) return advance(t, false);
  saveTimers(); refreshTimers(true);
}

function advance(t, alert){
  if (t.kind === 'cd') {
    if (alert && t.focus) logFocus(t.run.dur / 60, t.name);
    t.run = null; t.done = Date.now();
    if (alert) notify(t.name, "Time's up");
  } else {
    const {phase, round} = t.run;
    if (alert && phase === 'focus') logFocus(t.run.dur / 60, t.name);
    const next = phase === 'focus' ? (round % t.every === 0 ? 'long' : 'short') : 'focus';
    if (alert) notify(t.name, phase === 'focus' ? `Focus done · ${t[next]} min ${next === 'long' ? 'long ' : ''}break` : 'Break over · back to focus');
    startPhase(t, next, next === 'focus' ? round + 1 : round, !t.auto);
  }
  saveTimers(); refreshTimers(true);
}

function leadTimer(){
  const live = TM.list.filter(t => t.run);
  if (!live.length) return null;
  const running = live.filter(t => !t.run.paused);
  const t = (running.length ? running : live).sort((a, b) => remaining(a) - remaining(b))[0];
  return {label:t.kind === 'pomo' ? `${t.name} · ${PHASE[t.run.phase]}` : t.name, time:fmtSec(remaining(t)), progress:progressOf(t), paused:t.run.paused, more:live.length - 1};
}

setInterval(() => {
  TM.list.forEach(t => { if (t.run && !t.run.paused && t.run.endsAt <= Date.now()) advance(t, true); });
  refreshTimers(false);
}, 250);

// full: re-render the page; otherwise only update the numbers
function refreshTimers(full){
  renderPill();
  if (window.VIEW === 'overview') MODS.overview?.tick?.();
  if (window.VIEW !== 'timers') return;
  if (full) return MODS.timers.render();
  document.querySelectorAll('#v-timers .tm-card[data-id]').forEach(c => {
    const t = tmById(c.dataset.id); if (!t) return;
    c.querySelector('.big').textContent = fmtSec(remaining(t));
    c.querySelector('.arc').style.strokeDashoffset = 100 - progressOf(t) * 100;
  });
}

/* ---------- page ---------- */
const TI = {
  pen:svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 15), x:svg('<path d="M6 6l12 12M18 6 6 18"/>', 15),
  reset:svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/>', 17),
  skip:svg('<path d="M5 5l9 7-9 7z"/><path d="M18 5v14"/>', 17),
  play:svg('<path d="M7 4.5v15l12-7.5z"/>', 16), pause:svg('<path d="M8 5v14M16 5v14"/>', 16),
  plus:svg('<path d="M12 5v14M5 12h14"/>', 16),
};

function cardSub(t){
  if (t.kind === 'pomo') return t.run ? `${PHASE[t.run.phase]} · round ${t.run.round}` : `${t.focus} / ${t.short} min · long break every ${t.every}`;
  if (t.done) return `Done at ${clockAt(t.done)}`;
  if (!t.run) return durLabel(t.dur);
  return t.run.paused ? 'Paused' : `Ends at ${clockAt(t.run.endsAt)}`;
}

function cardHTML(t){
  const running = t.run && !t.run.paused, p = progressOf(t);
  const tone = t.kind === 'pomo' ? (t.run && t.run.phase !== 'focus' ? 'brk' : 'foc') : 'cd';
  const dots = t.kind === 'pomo' ? `<div class="tm-dots">${Array.from({length:t.every}, (_, i) => {
    const r = t.run ? (t.run.round - 1) % t.every : -1, cur = t.run && t.run.phase === 'focus';
    return `<i class="${i < r || (i === r && !cur) ? 'full' : i === r ? 'cur' : ''}"></i>`;
  }).join('')}</div>` : '';
  return `<div class="tm-card ${tone}${running ? ' running' : ''}${t.run?.paused ? ' paused' : ''}${t.done ? ' done' : ''}" data-id="${t.id}">
    <div class="tm-top"><b>${esc(t.name)}</b><span class="kind">${t.kind === 'pomo' ? 'Pomodoro' : 'Countdown'}</span>
      <span class="tm-tools"><button data-tm="edit" aria-label="Edit">${TI.pen}</button><button data-tm="del" aria-label="Delete">${TI.x}</button></span></div>
    <div class="tm-ring"><svg viewBox="0 0 120 120"><circle class="trk" cx="60" cy="60" r="53"/><circle class="arc" cx="60" cy="60" r="53" pathLength="100" style="stroke-dashoffset:${100 - p * 100}"/></svg>
      <div class="tm-time"><span class="big">${fmtSec(remaining(t))}</span><small>${cardSub(t)}</small></div></div>
    ${dots}
    <div class="tm-acts">
      <button class="btn icon" data-tm="reset" aria-label="Reset" ${t.run || t.done ? '' : 'disabled'}>${TI.reset}</button>
      <button class="btn play" data-tm="toggle">${running ? TI.pause + 'Pause' : TI.play + (t.run ? 'Resume' : t.done ? 'Again' : 'Start')}</button>
      ${t.kind === 'pomo'
        ? `<button class="btn icon" data-tm="skip" aria-label="Skip phase" ${t.run ? '' : 'disabled'}>${TI.skip}</button>`
        : `<button class="btn icon" data-tm="plus" aria-label="Add 1 minute" ${t.run ? '' : 'disabled'}>${TI.plus}</button>`}
    </div>
  </div>`;
}

MODS.timers = {
  render(){
    $('v-timers').innerHTML = `<div class="pg">
      <header class="pg-h"><div><h1>Timers</h1><p>Keeps running on every page · Windows notification when one ends</p></div>
        <button class="btn primary" data-tm="new">${TI.plus}New timer</button></header>
      <div class="tm-grid">${TM.list.map(cardHTML).join('')}<button class="tm-card add" data-tm="new">${TI.plus}<span>New timer</span></button></div>
      ${focusHTML()}
    </div>`;
  },
};

$('v-timers').addEventListener('click', e => {
  const b = e.target.closest('[data-tm]'); if (!b || b.disabled) return;
  const id = b.closest('[data-id]')?.dataset.id, act = b.dataset.tm;
  if (act === 'new') return openTimerForm(null);
  if (act === 'edit') return openTimerForm(tmById(id));
  if (act === 'del') {
    const i = TM.list.findIndex(t => t.id === id), [gone] = TM.list.splice(i, 1);
    saveTimers(); refreshTimers(true);
    return toast('Timer deleted', [['Undo', () => { TM.list.splice(i, 0, gone); saveTimers(); refreshTimers(true); }]]);
  }
  tmAct(id, act);
});

/* ---------- focus stats ---------- */
function focusHTML(){
  const byDay = {}; FOCUS.forEach(f => byDay[f.d] = (byDay[f.d] || 0) + f.m);
  const today = new Date(), ws = weekStart(today);
  const week = Object.entries(byDay).filter(([d]) => d >= iso(ws)).reduce((a, [, m]) => a + m, 0);
  let streak = 0, d = byDay[iso(today)] ? today : addDays(today, -1);
  while (byDay[iso(d)]) { streak++; d = addDays(d, -1); }
  const days = Array.from({length:14}, (_, i) => addDays(today, i - 13)), max = Math.max(60, ...days.map(x => byDay[iso(x)] || 0));
  const hmin = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + pad(m % 60) : ''}` : `${m} min`;
  return `<section class="fx">
    <div class="fx-h"><h2>Focus</h2><small>Pomodoro focus rounds${TM.list.some(t => t.kind === 'cd' && t.focus) ? ' and focus countdowns' : ''} you finish</small></div>
    <div class="fx-body">
      <div class="fx-nums"><div><b>${hmin(byDay[iso(today)] || 0)}</b><small>today</small></div><div><b>${hmin(week)}</b><small>this week</small></div><div><b>${streak}</b><small>day streak</small></div></div>
      <div class="fx-chart">${days.map(x => { const m = byDay[iso(x)] || 0; return `<div class="fx-bar${sameDay(x, today) ? ' today' : ''}" title="${DAYS[dayIndex(x)].slice(0, 3)} ${x.getDate()} · ${hmin(m)}"><i style="height:${m / max * 100}%"></i><span>${DAYS_XS[dayIndex(x)]}</span></div>`; }).join('')}</div>
    </div></section>`;
}

/* ---------- new / edit form ---------- */
function openTimerForm(t){
  TM.editing = t ? t.id : null;
  TM.kind = t ? t.kind : 'cd';
  const d = t && t.kind === 'cd' ? t.dur : 1500, p = t && t.kind === 'pomo' ? t : {focus:25, short:5, long:15, every:4, auto:true};
  $('tmForm').innerHTML = `<h2>${t ? 'Edit timer' : 'New timer'}</h2>
    <div class="when" id="tmKind"><button type="button" data-k="cd">Countdown</button><button type="button" data-k="pomo">Pomodoro</button></div>
    <input type="text" name="name" class="title-in" placeholder="Name (e.g. Study, Pasta, Nap)" maxlength="40" value="${t ? esc(t.name) : ''}">
    <div class="tm-f" data-for="cd">
      <div class="nums n3"><label>Hours<input type="number" name="h" min="0" max="23" value="${Math.floor(d / 3600)}"></label>
        <label>Minutes<input type="number" name="m" min="0" max="59" value="${Math.floor(d % 3600 / 60)}"></label>
        <label>Seconds<input type="number" name="s" min="0" max="59" value="${d % 60}"></label></div>
      <label class="check"><input type="checkbox" name="focus" ${t && t.focus ? 'checked' : ''}>Count as focus time (shows in Focus stats)</label>
      <div class="quick">${[5, 10, 15, 25, 45, 60, 90].map(m => `<button type="button" data-q="${m}">${m < 60 ? m + ' min' : m / 60 + 'h' + (m % 60 ? ' 30' : '')}</button>`).join('')}</div>
    </div>
    <div class="tm-f" data-for="pomo">
      <div class="nums n4"><label>Focus<input type="number" name="focus" min="1" max="180" value="${p.focus}"></label>
        <label>Short break<input type="number" name="short" min="1" max="60" value="${p.short}"></label>
        <label>Long break<input type="number" name="long" min="1" max="90" value="${p.long}"></label>
        <label>Long every<input type="number" name="every" min="2" max="10" value="${p.every}"></label></div>
      <div class="field-note">Minutes · "long every 4" = a long break after every 4 focus rounds</div>
      <label class="check"><input type="checkbox" name="auto" ${p.auto ? 'checked' : ''}>Start the next phase automatically</label>
    </div>
    <div class="actions"><span class="sp"></span><button type="button" class="btn" data-tmf="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>`;
  setTimerKind(TM.kind);
  $('tmModal').classList.add('show');
  setTimeout(() => $('tmForm').elements.name.focus(), 30);
}
function setTimerKind(k){
  TM.kind = k;
  $('tmKind').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  $('tmForm').querySelectorAll('.tm-f').forEach(f => { f.hidden = f.dataset.for !== k; });
}
const closeTimerForm = () => $('tmModal').classList.remove('show');

$('tmForm').addEventListener('click', e => {
  const k = e.target.closest('[data-k]'); if (k) return setTimerKind(k.dataset.k);
  const q = e.target.closest('[data-q]');
  if (q) { const f = $('tmForm').elements, m = +q.dataset.q; f.h.value = Math.floor(m / 60); f.m.value = m % 60; f.s.value = 0; return; }
  if (e.target.closest('[data-tmf=cancel]')) closeTimerForm();
});
$('tmModal').addEventListener('pointerdown', e => { if (e.target === $('tmModal')) closeTimerForm(); });
$('tmForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = $('tmForm').elements, n = x => Math.max(0, Math.round(+x.value || 0));
  let t;
  if (TM.kind === 'cd') {
    const dur = n(f.h) * 3600 + n(f.m) * 60 + n(f.s);
    if (dur < 5) return toast('Set at least 5 seconds');
    t = {kind:'cd', name:f.name.value.trim() || durLabel(dur), dur, focus:f.focus.checked};
  } else {
    t = {kind:'pomo', name:f.name.value.trim() || 'Pomodoro', focus:Math.max(1, n(f.focus)), short:Math.max(1, n(f.short)), long:Math.max(1, n(f.long)), every:Math.max(2, n(f.every)), auto:f.auto.checked};
  }
  const old = TM.editing && tmById(TM.editing);
  if (old) {
    const changed = old.kind !== t.kind || ['dur', 'short', 'long', 'every'].some(k => old[k] !== t[k]) || (t.kind === 'pomo' && old.focus !== t.focus);
    Object.keys(old).forEach(k => { if (!['id', 'run', 'done'].includes(k)) delete old[k]; });
    Object.assign(old, t);
    if (changed) { old.run = null; old.done = null; }
  } else TM.list.push({id:uid('t'), ...t});
  saveTimers(); closeTimerForm(); refreshTimers(true);
  toast(old ? 'Timer updated' : 'Timer added');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTimerForm(); });
