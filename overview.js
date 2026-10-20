// Overview: the day at a glance. A live ribbon of today with a moving "now" needle, then small cards.
const greet = h => h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
const OV = {fresh:true, min:-1, sec:-1};
const MOOD_FACE = [   // simple drawn faces, mouth curve from sad to happy
  'M8.5 16.5c1.8-1.6 5.2-1.6 7 0', 'M8.5 15.8c2.2-.6 4.8-.6 7 0', 'M8.5 15h7', 'M8.5 14.4c1.8 1.4 5.2 1.4 7 0', 'M8 13.8c2 2.6 6 2.6 8 0',
].map(m => svg(`<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="${m}"/>`, 22));
const OI = {
  play:svg('<path d="M7 4.5v15l12-7.5z"/>', 14), plus:svg('<path d="M12 5v14M5 12h14"/>', 14), arrow:svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 14),
  flag:svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', 14), pin:svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', 13),
};

/* ---------- today ---------- */
function todayList(now){
  return weekEvents(weekStart(now)).filter(e => e.d === dayIndex(now) && !e.allDay && !e.cancelled && visible(e)).sort((a, b) => a.s - b.s);
}
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; };
function ribbonRange(list){
  const timed = list.length ? list : [{s:480, e:1080}];
  return {a:Math.min(420, Math.floor(Math.min(...timed.map(e => e.s)) / 60) * 60), b:Math.max(1320, Math.ceil(Math.max(...timed.map(e => e.e)) / 60) * 60)};
}
function ribbonHTML(now){
  const list = todayList(now), {a, b} = ribbonRange(list), span = b - a, x = m => ((m - a) / span * 100).toFixed(3) + '%';
  const blocks = list.filter(e => e.kind !== 'job'), jobs = list.filter(e => e.kind === 'job');
  const lanes = []; blocks.forEach(e => { let i = lanes.findIndex(end => end <= e.s); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = e.e; e.ln = i; });
  const n = Math.max(1, lanes.length);
  let ticks = ''; for (let m = a; m <= b; m += 60) ticks += `<span class="rb-tick${(m / 60) % 3 ? '' : ' maj'}" style="left:${x(m)}"><i>${(m / 60) % 3 ? '' : fmt(m)}</i></span>`;
  const free = freeSlots(weekEvents(weekStart(now)).filter(e => e.d === dayIndex(now)), now, Math.max(a, CFG.planFrom), Math.min(b, CFG.planTo));
  const label = e => e.kind === 'uni' ? `${e.title} · ${typeName(e.t)}` : e.title;
  const sub = e => e.kind === 'uni' ? [e.room, e.clash ? 'at work' : ''].filter(Boolean).join(' · ') : e.detail || '';
  return `<div class="rb" data-a="${a}" data-b="${b}">
    <div class="rb-ticks">${ticks}</div>
    <div class="rb-track" style="--n:${n}">
      ${free.map(f => `<div class="rb-free" style="left:${x(f.s)};width:calc(${x(f.e)} - ${x(f.s)})" title="Free ${fmt(f.s)} – ${fmt(f.e)}"><span>${hm(f.e - f.s)} free</span></div>`).join('')}
      ${blocks.map(e => `<button class="rb-ev ${e.kind === 'uni' ? e.t.toLowerCase() : 'perso'}${e.clash ? ' clash' : ''}" data-nav-to="calendar" style="--c:${e.c};left:${x(e.s)};width:calc(${x(e.e)} - ${x(e.s)});top:calc(${e.ln} * 100% / var(--n));height:calc(100% / var(--n) - 4px)" title="${esc(label(e))} · ${fmt(e.s)} – ${fmt(e.e)}">
        <b>${esc(label(e))}</b><small>${fmt(e.s)}${sub(e) ? ' · ' + esc(sub(e)) : ''}</small></button>`).join('')}
    </div>
    <div class="rb-job">${jobs.map(j => `<span class="${j.soft ? 'soft' : ''}" style="left:${x(j.s)};width:calc(${x(j.e)} - ${x(j.s)})">Work ${fmt(j.s)} – ${fmt(j.e)}</span>`).join('')}</div>
    <div class="rb-past" id="rbPast"></div>
    <div class="rb-now" id="rbNow"><i></i><span id="rbNowT"></span></div>
    ${list.length ? '' : '<p class="rb-empty">Nothing planned today</p>'}
  </div>`;
}
/* ---------- cards ---------- */
function examsHTML(){
  const up = upcomingDL(4);
  if (!up.length) return `<p class="ov-empty">No exams or deadlines coming up.</p><button class="ov-link" data-ov="dl-new">${OI.plus}Add one</button>`;
  return `<ul class="ov-dl">${up.map(x => { const n = dlDays(x); return `<li data-ov="dl-edit" data-v="${x.id}" style="--c:${DL_KIND[x.kind].c}" class="${n <= 3 ? 'soon' : ''}">
    <span class="cd"><b>${n === 0 ? '0' : n}</b><small>${n === 0 ? 'today' : n === 1 ? 'day' : 'days'}</small></span>
    <span class="nm"><b>${esc(dlName(x))}</b><small>${esc(dlWhen(x))}</small></span>
    ${state.events.some(e => e.plan === x.id) ? '' : `<button class="ov-mini" data-ov="plan" data-v="${x.id}" title="Plan revision in your free time">Plan</button>`}</li>`; }).join('')}</ul>`;
}
function ovFocusHTML(){
  const k = todayISO(), mins = FOCUS.filter(f => f.d === k).reduce((a, f) => a + f.m, 0), goal = CFG.focusGoal || 120, p = Math.min(1, mins / goal);
  const ws = iso(weekStart(new Date())), week = FOCUS.filter(f => f.d >= ws).reduce((a, f) => a + f.m, 0);
  const live = TM.list.filter(t => t.run);
  const R = 42, C = 2 * Math.PI * R;
  return `<div class="ov-focus">
    <div class="fr${p >= 1 ? ' full' : ''}"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="${R}"/><circle class="val" cx="50" cy="50" r="${R}" style="stroke-dasharray:${C.toFixed(1)};--off:${(C * (1 - p)).toFixed(1)};--c0:${C.toFixed(1)}"/></svg>
      <span class="fr-in"><b class="cu" data-v="${Math.round(mins)}" data-f="hm">${hm(Math.round(mins)) || '0m'}</b><small>of ${hm(goal)}</small></span></div>
    <div class="fr-side">
      <div class="fr-stat"><b>${hm(Math.round(week)) || '0h'}</b><small>this week</small></div>
      <div id="ovTimers">${live.length ? ovTimersHTML() : `<button class="btn primary" data-ov="pomo">${OI.play}Start focus</button>`}</div>
    </div></div>`;
}
function ovTimersHTML(){
  return TM.list.filter(t => t.run).slice(0, 2).map(t => `<div class="ov-tm${t.run.paused ? ' paused' : ''}" style="--p:${progressOf(t)}" data-id="${t.id}">
      <span class="pr"></span><span class="nm"><b>${esc(t.name)}</b><small>${t.kind === 'pomo' ? PHASE[t.run.phase] : t.run.paused ? 'Paused' : 'Ends ' + clockAt(t.run.endsAt)}</small></span>
      <span class="tt">${fmtSec(remaining(t))}</span>
      <button class="btn icon" data-ovt="toggle" aria-label="${t.run.paused ? 'Resume' : 'Pause'}">${t.run.paused ? TI.play : TI.pause}</button></div>`).join('');
}
function todosHTML(){
  syncMissed();
  const open = TD.list.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.created - b.created);
  return `<form class="ov-add" data-ovf="todo"><input name="t" placeholder="Add a to-do" maxlength="200" autocomplete="off"></form>`
    + (open.length ? `<ul class="ov-todos">${open.slice(0, 5).map(t => `<li data-id="${t.id}"><button class="td-check" data-ovd="toggle" aria-label="Done">${tdIcon.check}</button><span>${esc(t.text)}</span>${t.due ? `<small class="${bucket(t)}">${dueLabel(t.due)}</small>` : ''}</li>`).join('')}</ul>`
      + (open.length > 5 ? `<button class="ov-link" data-nav-to="todos">+${open.length - 5} more</button>` : '') : '<p class="ov-empty">Nothing to do. Enjoy it.</p>');
}
function habitsHTML(){
  if (!HB.list.length) return `<p class="ov-empty">No habits yet.</p><button class="ov-link" data-nav-to="habits">${OI.plus}Add one</button>`;
  const ws = weekStart(new Date()), today = dayIndex(new Date());
  return `<ul class="ov-habits">${HB.list.map(h => { const s = streakOf(h); return `<li data-id="${h.id}" style="--c:${h.color}">
    <span class="hn"><b>${esc(h.name)}</b><small>${weekCount(h, ws)}/${Math.min(h.target, 7)} this week${s.n ? ` · ${s.n} ${s.unit}${s.n === 1 ? '' : 's'} streak` : ''}</small></span>
    <span class="hd7">${DAYS_XS.map((l, i) => { const k = iso(addDays(ws, i)); return `<button class="${h.days[k] ? 'on' : ''}${i === today ? ' td' : ''}" ${i > today ? 'disabled' : `data-ovh="${k}"`} title="${DAYS[i]}">${l}</button>`; }).join('')}</span></li>`; }).join('')}</ul>`;
}
function journalHTML(){
  const k = todayISO(), mood = JR.moods[k], streak = journalStreak();
  return `<p class="ov-q">How's today going?</p>
    <div class="ov-moods">${MOOD_FACE.map((f, i) => `<button class="${mood === i + 1 ? 'on' : ''}" data-mood="${i + 1}" title="${MOODS[i]}">${f}</button>`).join('')}</div>
    <form class="ov-add" data-ovf="journal"><input name="t" placeholder="A line for today's journal" maxlength="400" autocomplete="off"></form>
    <div class="ov-row"><small>${streak ? `${streak} day${streak > 1 ? 's' : ''} in a row` : 'Written into Notes, Journal folder'}</small><button class="ov-link" data-ov="journal">Open ${OI.arrow}</button></div>`;
}
function moneyHTML(){
  syncRecurring();
  const ym = todayISO().slice(0, 7), {out} = monthSums(ym), lim = CFG.budget, av = available();
  const late = pendingIncome().filter(p => p.late > 0)[0];
  const goal = BG.data.pots.filter(p => potTarget(p) && potBal(p) < potTarget(p)).sort((a, b) => potBal(b) / potTarget(b) - potBal(a) / potTarget(a))[0];
  return `<div class="ov-money"><div><small>Free to spend</small><b class="cu${av < 0 ? ' neg' : ''}" data-v="${Math.round(av)}" data-f="money">${money(av)}</b></div>
      <div class="r"><small>Spent in ${MONTHS[new Date().getMonth()]}</small><b class="cu" data-v="${Math.round(out)}" data-f="money">${money(out)}</b></div></div>
    ${lim ? `<span class="bg-meter${out > lim ? ' over' : ''}"><i style="width:${Math.min(100, out / lim * 100)}%"></i></span>` : ''}
    ${late ? `<button class="ov-late" data-nav-to="budget">${esc(late.r.note || 'Salary')} is ${late.late} day${late.late > 1 ? 's' : ''} late · mark it when it arrives</button>` : ''}
    ${goal ? `<div class="ov-goal" style="--c:${goal.color}"><span><b>${esc(goal.name)}</b><small>${money(potBal(goal))} of ${money(potTarget(goal))}</small></span><span class="bg-meter"><i style="width:${potBal(goal) / potTarget(goal) * 100}%"></i></span></div>` : ''}
    <form class="ov-add" data-ovf="money"><input name="t" placeholder="-300 lunch  ·  +5000  ·  save 2000 laptop" maxlength="80" autocomplete="off"></form>`;
}
function weekHTML(){
  const now = new Date(), ws = weekStart(now), all = weekEvents(ws);
  let free = 0;
  for (let d = dayIndex(now); d < 7; d++) free += freeSlots(all.filter(e => e.d === d), addDays(ws, d)).reduce((a, f) => a + f.e - f.s, 0);
  return `<div class="stats">${statsHTML(ws)}</div><div class="ov-free"><span>Free time left this week</span><b>${hm(free)}</b><button class="ov-link" data-ov="free">See it ${OI.arrow}</button></div>`;
}
function clocksHTML(){
  return `<ul class="ov-clocks">${CK.list.slice(1).map(c => { const i = clockInfo(c); return `<li><span class="ck-ic">${i.night ? CI.moon : CI.sun}</span><b>${esc(c.label)}</b><small>${i.rel}</small><span class="hm">${i.hm}</span></li>`; }).join('')}</ul>`;
}
const card = (cls, title, link, body, i = 0) => `<section class="ov-card ${cls}" style="--i:${i}"><h3>${title}${link ? `<button data-nav-to="${link}">Open</button>` : ''}</h3><div class="ov-b">${body}</div></section>`;

/* ---------- sky: the header follows the real sun (sunrise / sunset), with the moon and stars at night ---------- */
// without a city, the time zone gives a rough longitude so the sky is about right
function sunTimes(date, lat = CFG.lat ?? 40, lon = CFG.lon ?? -date.getTimezoneOffset() / 4){
  const rad = Math.PI / 180, n = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5), g = 2 * Math.PI / 365 * (n - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const tz = -date.getTimezoneOffset();
  return {rise:720 - 4 * (lon + ha) - eqt + tz, set:720 - 4 * (lon - ha) - eqt + tz};
}
function skyState(){
  const now = new Date(), m = nowMin(), wx = WX.data;
  const today = wx?.rise ? {rise:wx.rise, set:wx.set} : sunTimes(now);
  const {rise, set} = today, tw = 40;
  const phase = m < rise - tw || m > set + tw ? 'night' : m < rise + tw ? 'dawn' : m > set - tw ? 'dusk' : 'day';
  let t, moon = false;
  if (m >= rise && m <= set) t = (m - rise) / (set - rise);
  else { moon = true; t = ((m > set ? m : m + 1440) - set) / (rise + 1440 - set); }
  return {phase, t:clamp(t, 0, 1), moon, rise, set};
}
const ARC = t => [60 + 880 * t, 196 - 150 * Math.sin(Math.PI * t)];
const STARS = Array.from({length:26}, (_, i) => [(i * 37.7 + 11) % 100, (i * 53.3 + 7) % 78, (i % 5) * 0.5]);
function skyHTML(now){
  const s = skyState(), ws = weekStart(now);
  let arc = 'M60,196'; for (let i = 1; i <= 40; i++) { const [x, y] = ARC(i / 40); arc += ` L${x.toFixed(1)},${y.toFixed(1)}`; }
  return `<section class="ov-sky ph-${s.phase}" id="ovSky">
    <div class="sky-stars">${STARS.map(([x, y, d]) => `<i style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join('')}</div>
    <svg class="sky-arc" viewBox="0 0 1000 220" preserveAspectRatio="none"><path d="${arc}"/><path class="hz" d="M0,196 L1000,196"/></svg>
    <span class="sky-orb${s.moon ? ' moon' : ''}" id="skyOrb"></span>
    <span class="sky-t l">${s.moon ? 'Sunset ' + fmt(Math.round(s.set)) : 'Sunrise ' + fmt(Math.round(s.rise))}</span><span class="sky-t r">${s.moon ? 'Sunrise ' + fmt(Math.round(s.rise)) : 'Sunset ' + fmt(Math.round(s.set))}</span>
    <div class="sky-in">
      <div><p class="ov-date">${DAYS[dayIndex(now)]} ${now.getDate()} ${MONTHS[now.getMonth()]} · week of ${ws.getDate()} ${MONTHS_S[ws.getMonth()]}</p>
        <h1>${greet(now.getHours())}</h1></div>
      <div class="ov-clock"><span class="hm" id="ovHM">${pad(now.getHours())}:${pad(now.getMinutes())}</span><span class="sec" id="ovSec">${pad(now.getSeconds())}</span>
        <div id="ovWx">${wxHTML()}</div></div>
    </div>
  </section>`;
}
function placeOrb(){
  const o = $('skyOrb'); if (!o) return;
  const s = skyState(), [x, y] = ARC(s.t);
  o.style.left = (x / 10) + '%'; o.style.top = (y / 220 * 100) + '%';
  const sky = $('ovSky'); if (sky && !sky.classList.contains('ph-' + s.phase)) { sky.className = 'ov-sky ph-' + s.phase; o.classList.toggle('moon', s.moon); }
}

/* ---------- weather (Open-Meteo, no account; only the city's coordinates are sent) ---------- */
const WX = {data:store.get('wx', null), loading:false};
const WX_CODE = c => c === 0 ? ['Clear', 'sun'] : c <= 2 ? ['Partly cloudy', 'part'] : c === 3 ? ['Cloudy', 'cloud'] : c <= 48 ? ['Fog', 'fog'] : c <= 67 || (c >= 80 && c <= 82) ? ['Rain', 'rain'] : c <= 77 || c === 85 || c === 86 ? ['Snow', 'snow'] : ['Storm', 'storm'];
const WX_ICON = {
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  part:'<path d="M8 3.5v1.5M3.5 8H5M4.8 4.8l1 1M12.2 4.8l-1 1"/><path d="M5.6 11.2A3.5 3.5 0 0 1 11.6 7"/><path d="M8 19.5h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.8 13 3.3 3.3 0 0 0 8 19.5z"/>',
  cloud:'<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 18.5z"/>',
  fog:'<path d="M4 9h16M6 13h12M4 17h16"/>',
  rain:'<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 14.5z"/><path d="m9 17.5-1 2.5M13 17.5l-1 2.5M17 17.5l-1 2.5"/>',
  snow:'<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 14.5z"/><path d="M9 18h.01M12 20h.01M15 18h.01"/>',
  storm:'<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 14.5z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>',
};
async function loadWeather(force){
  if (CFG.weather === false || CFG.lat == null || WX.loading || (!force && WX.data && Date.now() - WX.data.at < 30 * 6e4)) return;
  WX.loading = true;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CFG.lat}&longitude=${CFG.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=1`);
    const j = await r.json(), hm2 = s => +s.slice(11, 13) * 60 + +s.slice(14, 16);
    WX.data = {at:Date.now(), temp:Math.round(j.current.temperature_2m), code:j.current.weather_code, hi:Math.round(j.daily.temperature_2m_max[0]), lo:Math.round(j.daily.temperature_2m_min[0]), rise:hm2(j.daily.sunrise[0]), set:hm2(j.daily.sunset[0]), day:j.daily.sunrise[0].slice(0, 10)};
    store.set('wx', WX.data);
    if ($('ovWx')) { $('ovWx').innerHTML = wxHTML(); placeOrb(); }
  } catch {} finally { WX.loading = false; }
}
function wxHTML(){
  const w = WX.data;
  if (CFG.weather === false || CFG.lat == null || !w || w.day !== todayISO()) return `<small class="wx">${esc(CK.list[0]?.label || 'Local time')}</small>`;
  const [label, ic] = WX_CODE(w.code);
  return `<span class="wx" title="${esc(CFG.place || CK.list[0]?.label || '')} · updated ${clockAt(w.at)}">${svg(WX_ICON[ic], 16)}<b>${w.temp}°</b><span>${label}</span><small>${w.hi}° / ${w.lo}°</small></span>`;
}

/* ---------- right now: one card that changes with what you are doing ---------- */
function nowCardHTML(now){
  const m = nowMin(), h = now.getHours(), list = todayList(now), cur = list.find(e => e.s <= m && m < e.e && !e.clash && e.kind !== 'job') || list.find(e => e.s <= m && m < e.e && e.kind === 'job');
  const next = list.find(e => e.s > m && !e.clash);
  const name = e => e.kind === 'uni' ? `${e.title} ${typeName(e.t)}` : e.kind === 'job' ? 'Work' : e.title;
  const color = e => e.kind === 'job' ? 'var(--job-c)' : e.c;
  const left = mins => mins >= 60 ? `${Math.floor(mins / 60)}h ${pad(Math.round(mins % 60))}` : `${Math.max(1, Math.round(mins))} min`;
  const where = e => e.kind === 'uni' ? [e.room && 'Room ' + e.room, e.prof].filter(Boolean).join(' · ') : e.detail || e.note || '';
  const after = next ? `<p class="nc-next">Then <b>${esc(name(next))}</b> at ${fmt(next.s)}</p>` : '';
  if (cur) return `<div class="nc live" style="--c:${color(cur)};--p:${((m - cur.s) / (cur.e - cur.s)).toFixed(3)}">
    <span class="nc-k"><i></i>${cur.kind === 'job' ? 'At work' : cur.kind === 'uni' ? 'In class' : 'Now'}</span>
    <b class="nc-t">${esc(name(cur))}</b>${where(cur) ? `<p class="nc-s">${esc(where(cur))}</p>` : ''}
    <div class="nc-bar"><i></i></div><p class="nc-m"><span>${fmt(cur.s)}</span><b>${left(cur.e - m)} left</b><span>${fmt(cur.e)}</span></p>${after}</div>`;
  if (h >= 23 || h < 5) {
    const tm = addDays(startOfToday(), h < 5 ? 0 : 1), first = weekEvents(weekStart(tm)).filter(e => e.d === dayIndex(tm) && !e.cancelled && !e.allDay && !e.clash).sort((a, b) => a.s - b.s)[0];
    return `<div class="nc rest"><span class="nc-k">Time to rest</span><b class="nc-t">${first ? `${h < 5 ? 'Today' : 'Tomorrow'} starts at ${fmt(first.s)}` : `Nothing early ${h < 5 ? 'today' : 'tomorrow'}`}</b>
      ${first ? `<p class="nc-s">${esc(name(first))}${first.room ? ' · room ' + esc(first.room) : ''}</p>` : '<p class="nc-s">Sleep in a little.</p>'}</div>`;
  }
  if (next && next.s - m <= 90) return `<div class="nc soon" style="--c:${color(next)}"><span class="nc-k">Coming up · in ${left(next.s - m)}</span>
    <b class="nc-t">${esc(name(next))}</b><p class="nc-s">${fmt(next.s)} – ${fmt(next.e)}${where(next) ? ' · ' + esc(where(next)) : ''}</p>
    <div class="nc-count"><b>${Math.max(0, Math.floor(next.s - m))}</b><span>min</span></div></div>`;
  if (!next && h >= 18) {
    const k = todayISO(), done = TD.list.filter(t => t.done && t.doneAt && iso(new Date(t.doneAt)) === k).length, foc = Math.round(FOCUS.filter(f => f.d === k).reduce((a, f) => a + f.m, 0));
    const classes = list.filter(e => e.kind === 'uni' && !e.clash).length;
    return `<div class="nc review"><span class="nc-k">Day done</span><b class="nc-t">How did it go?</b>
      <div class="nc-stats"><span><b class="cu" data-v="${classes}">${classes}</b>class${classes === 1 ? '' : 'es'}</span><span><b class="cu" data-v="${foc}" data-f="hm">${hm(foc) || '0m'}</b>focus</span><span><b class="cu" data-v="${done}">${done}</b>done</span></div>
      ${JR.moods[k] ? `<p class="nc-s">Mood logged: ${MOODS[JR.moods[k] - 1]}</p>` : `<button class="btn" data-ov="journal">Write in your journal</button>`}</div>`;
  }
  // free right now: suggest the most useful thing
  const free = freeToday().find(f => f.s <= m + 5), until = free ? free.e : next ? next.s : CFG.planTo;
  const head = `<span class="nc-k">Free${until > m ? ` until ${fmt(until)} · ${left(until - m)}` : ''}</span>`;
  if (CFG.ovSuggest === false) return `<div class="nc idea">${head}<b class="nc-t">${next ? `Next: ${esc(name(next))}` : 'Nothing else today'}</b>${next ? `<p class="nc-s">${fmt(next.s)} – ${fmt(next.e)}${where(next) ? ' · ' + esc(where(next)) : ''}</p>` : ''}</div>`;
  const exam = upcomingDL(5).find(x => x.kind !== 'due' && dlDays(x) <= 10);
  const todo = TD.list.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.created - b.created)[0];
  const wsN = weekStart(now), habit = HB.list.find(hb => hb.target < 7 && weekCount(hb, wsN) < hb.target && !hb.days[todayISO()] && hb.target - weekCount(hb, wsN) >= 7 - dayIndex(now) - 1);
  if (exam) return `<div class="nc idea" style="--c:${DL_KIND[exam.kind].c}">${head}<b class="nc-t">Revise ${esc(exam.subj || exam.title)}</b>
    <p class="nc-s">${DL_KIND[exam.kind].label} ${dlIn(exam)} · ${esc(shortDate(parseISO(exam.date)))}</p><button class="btn primary" data-ov="pomo">${OI.play}Start a focus session</button></div>`;
  if (habit) return `<div class="nc idea" style="--c:${habit.color}">${head}<b class="nc-t">${esc(habit.name)} today?</b>
    <p class="nc-s">${weekCount(habit, wsN)} of ${habit.target} this week, ${7 - dayIndex(now)} day${7 - dayIndex(now) === 1 ? '' : 's'} left</p><button class="btn primary" data-ovh="${todayISO()}" data-hid="${habit.id}">Mark it done</button></div>`;
  if (todo) return `<div class="nc idea">${head}<b class="nc-t">${esc(todo.text)}</b>
    <p class="nc-s">${todo.due ? 'Due ' + dueLabel(todo.due).toLowerCase() : 'Top of your to-dos'}</p><button class="btn primary" data-ovdone="${todo.id}">Done</button></div>`;
  return `<div class="nc idea">${head}<b class="nc-t">Nothing pressing</b><p class="nc-s">A good moment for a walk, or to get ahead on something.</p></div>`;
}
function todaySummary(now){
  const list = todayList(now), uni = list.filter(e => e.kind === 'uni' && !e.clash).length, job = list.filter(e => e.kind === 'job').reduce((a, e) => a + e.e - e.s, 0);
  const free = freeToday().reduce((a, f) => a + f.e - f.s, 0);
  return [uni && `${uni} class${uni > 1 ? 'es' : ''}`, job && `work ${hm(job)}`, free && `${hm(free)} free left`].filter(Boolean).join(' · ') || 'Nothing planned';
}
// numbers roll up the first time the page appears
function countUps(root){
  root.querySelectorAll('.cu').forEach(el => {
    const to = +el.dataset.v, f = el.dataset.f, out = v => f === 'money' ? money(v) : f === 'hm' ? (hm(Math.round(v)) || '0m') : String(Math.round(v));
    if (!to) return;
    const t0 = performance.now(), step = t => { const p = Math.min(1, (t - t0) / 800), e = 1 - Math.pow(1 - p, 3); el.textContent = out(to * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
// what matters most comes first: plans in the morning, focus in the afternoon, journal at night
const OV_CARDS = [['todos', 'To-dos'], ['exams', 'Exams'], ['focus', 'Focus'], ['habits', 'Habits'], ['money', 'Money'], ['journal', 'Journal'], ['week', 'Week hours'], ['clocks', 'Clocks']];
function cardOrder(now){
  const hide = CFG.ovHide || [];
  if (CFG.ovOrder === 'fixed') return OV_CARDS.map(c => c[0]).filter(k => !hide.includes(k));
  const h = now.getHours(), base = h >= 5 && h < 12 ? ['todos', 'exams', 'habits', 'focus', 'money', 'journal', 'week', 'clocks']
    : h >= 12 && h < 18 ? ['focus', 'todos', 'exams', 'habits', 'money', 'week', 'journal', 'clocks'] : ['journal', 'habits', 'money', 'todos', 'focus', 'exams', 'week', 'clocks'];
  if (upcomingDL(3).some(x => dlDays(x) <= 3)) base.splice(base.indexOf('exams'), 1), base.unshift('exams');
  return base.filter(k => !hide.includes(k));
}

MODS.overview = {
  render(){
    const now = new Date(), fresh = OV.fresh && CFG.motion !== false;
    const cards = {
      exams:i => card('exams', 'Exams & deadlines', 'calendar', examsHTML(), i), focus:i => card('focus', 'Focus today', 'timers', ovFocusHTML(), i),
      todos:i => card('todos', 'To-dos', 'todos', todosHTML(), i), habits:i => card('habits', 'This week', 'habits', habitsHTML(), i),
      journal:i => card('journal', 'Journal', '', journalHTML(), i), money:i => card('money', 'Money', 'budget', moneyHTML(), i),
      week:i => card('week', 'Week hours', 'calendar', weekHTML(), i), clocks:i => CK.list.length > 1 ? card('clocks', 'Clocks', 'clocks', clocksHTML(), i) : '',
    };
    $('v-overview').innerHTML = `<div class="pg ov${fresh ? ' enter' : ''}">
      ${skyHTML(now)}
      <p class="ov-say" id="ovSay"${CFG.ovSay === false ? ' hidden' : ''}><span class="owl"></span><span>${esc(digestText(now))}</span></p>
      <div class="ov-top">
        <section class="ov-now" id="ovNow" style="--i:1">${nowCardHTML(now)}</section>
        <section class="ov-day" style="--i:2">
          <div class="ov-day-h"><h3>Today</h3><span class="ov-sum" id="ovSum">${todaySummary(now)}</span></div>
          <div id="ovRibbon">${ribbonHTML(now)}</div>
        </section>
      </div>
      <div class="ov-grid">${cardOrder(now).map((k, i) => cards[k](i + 3)).join('')}</div>
    </div>`;
    OV.fresh = false; OV.min = now.getMinutes();
    placeNeedle(); placeOrb();
    if (fresh) countUps($('v-overview'));
    loadWeather();
  },
  // every 250ms from the timer engine: sun, needle and clock move; the rest refreshes each minute
  tick(){
    const now = new Date();
    if (!$('ovHM')) return;
    if (now.getSeconds() !== OV.sec) { OV.sec = now.getSeconds(); $('ovSec').textContent = pad(OV.sec); placeNeedle(); if (OV.sec % 10 === 0) placeOrb(); }
    if (now.getMinutes() !== OV.min) {
      OV.min = now.getMinutes();
      $('ovHM').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      if (!$('ovNow').contains(document.activeElement)) $('ovNow').innerHTML = nowCardHTML(now);
      if (now.getMinutes() % 5 === 0) { $('ovRibbon').innerHTML = ribbonHTML(now); $('ovSum').textContent = todaySummary(now); $('ovSay').lastElementChild.textContent = digestText(now); placeNeedle(); }
      if (now.getMinutes() % 30 === 0) loadWeather();
      if (now.getHours() === 0 && now.getMinutes() === 0) return MODS.overview.render();
    }
    const box = $('ovTimers'); if (!box) return;
    const key = TM.list.map(t => t.run ? t.id + (t.run.paused ? 'p' : 'r') + t.run.phase : '').join();
    if (key !== box.dataset.key) { const had = box.dataset.key != null; box.dataset.key = key; if (had) box.innerHTML = TM.list.some(t => t.run) ? ovTimersHTML() : `<button class="btn primary" data-ov="pomo">${OI.play}Start focus</button>`; return; }
    box.querySelectorAll('.ov-tm').forEach(r => {
      const t = tmById(r.dataset.id); if (!t?.run) return;
      r.querySelector('.tt').textContent = fmtSec(remaining(t)); r.style.setProperty('--p', progressOf(t));
    });
  },
};
function placeNeedle(){
  const rb = $('ovRibbon')?.querySelector('.rb'); if (!rb) return;
  const a = +rb.dataset.a, b = +rb.dataset.b, m = nowMin(), p = clamp((m - a) / (b - a), 0, 1);
  $('rbNow').style.left = (p * 100).toFixed(3) + '%'; $('rbNow').hidden = m < a || m > b;
  $('rbPast').style.width = (p * 100).toFixed(3) + '%';
  $('rbNowT').textContent = fmt(Math.floor(m));
}

$('v-overview').addEventListener('click', e => {
  const n = e.target.closest('[data-nav-to]'); if (n) return go(n.dataset.navTo);
  const b = e.target.closest('[data-ovt]');
  if (b) return tmAct(b.closest('[data-id]').dataset.id, b.dataset.ovt);
  const td = e.target.closest('[data-ovd]');
  if (td) {
    const li = td.closest('li'), t = TD.list.find(x => x.id === li.dataset.id);
    t.done = true; t.doneAt = Date.now(); saveTodos(); li.classList.add('gone');
    toast('Done · ' + esc(t.text), [['Undo', () => { t.done = false; saveTodos(); MODS.overview.render(); }]]);
    return setTimeout(() => MODS.overview.render(), 380);
  }
  const hb = e.target.closest('[data-ovh]');
  if (hb) { toggleDay(HB.list.find(x => x.id === (hb.dataset.hid || hb.closest('[data-id]').dataset.id)), hb.dataset.ovh); return MODS.overview.render(); }
  const dn = e.target.closest('[data-ovdone]');
  if (dn) { const t = TD.list.find(x => x.id === dn.dataset.ovdone); t.done = true; t.doneAt = Date.now(); saveTodos(); toast('Done · ' + esc(t.text), [['Undo', () => { t.done = false; saveTodos(); MODS.overview.render(); }]]); return MODS.overview.render(); }
  const md = e.target.closest('[data-mood]');
  if (md) { journalAdd('', +md.dataset.mood).then(() => MODS.overview.render()); return; }
  const o = e.target.closest('[data-ov]'); if (!o) return;
  const x = DL.list.find(d => d.id === o.dataset.v);
  switch (o.dataset.ov) {
    case 'dl-new': openDeadline(null); break;
    case 'dl-edit': if (!e.target.closest('.ov-mini')) openDeadline(x); break;
    case 'plan': openPlanner(x); break;
    case 'pomo': { const t = TM.list.find(z => z.kind === 'pomo') || TM.list[0]; if (t) tmAct(t.id, 'toggle'); break; }
    case 'journal': openJournal(); break;
    case 'free': go('calendar'); state.showFree = true; state.cview = 'week'; save('showFree', 'cview'); render(); break;
  }
});
$('v-overview').addEventListener('submit', async e => {
  const f = e.target.closest('[data-ovf]'); if (!f) return;
  e.preventDefault();
  const v = f.elements.t.value.trim(); if (!v) return;
  if (f.dataset.ovf === 'todo') { TD.list.push({id:uid('td'), text:v, due:null, done:false, created:Date.now()}); saveTodos(); toast('To-do added'); }
  if (f.dataset.ovf === 'money') { const m = parseMoney(/^[+-]/.test(v) || /^(spent|paid|earned|save)/i.test(v) ? v : '-' + v); if (!m) return toast('Try "-300 lunch" or "+5000 salary"'); MODS.budget.add(m); return; }
  if (f.dataset.ovf === 'journal') { await journalAdd(v); toast("Added to today's journal", [['Open', () => openJournal()]]); }
  MODS.overview.render();
  $('v-overview').querySelector(`[data-ovf="${f.dataset.ovf}"] input`)?.focus();
});
