// Calendar rendering: week grid, mini month, sidebar.
/* ---------- render ---------- */
function render(){
  applyMode();
  document.querySelector('.app').classList.toggle('no-side', state.sideHidden);
  document.querySelectorAll('.sec').forEach(s => s.classList.toggle('closed', !!state.closed[s.dataset.sec]));
  const month = state.cview === 'month';
  document.querySelector('.app').classList.toggle('mview', month);
  $('vseg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state.cview));
  $('freeBtn').classList.toggle('on', state.showFree);
  renderTop(); month ? renderMonth() : renderGrid(); renderMini(); renderSide(); renderBar();
}

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyMode(){
  document.documentElement.dataset.mode = state.mode === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : state.mode;
}
darkMQ.addEventListener('change', () => { if (state.mode === 'auto') applyMode(); });

function renderTop(){
  if (state.cview === 'month') {
    $('title').textContent = `${MONTHS[monthCur.getMonth()]} ${monthCur.getFullYear()}`;
    $('range').textContent = 'Month view · click a day to open its week';
    return $('badge').classList.remove('show');
  }
  const end = addDays(cur, 6);
  $('title').textContent = cur.getMonth() === end.getMonth()
    ? `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`
    : `${MONTHS_S[cur.getMonth()]} – ${MONTHS_S[end.getMonth()]} ${end.getFullYear()}`;
  $('range').textContent = `Week of ${DAYS[0]} ${cur.getDate()} ${MONTHS[cur.getMonth()]} to ${DAYS[6]} ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  $('badge').classList.toggle('show', !!state.ovr[iso(cur)]);
}

function renderGrid(){
  const evs = weekEvents().filter(visible);
  shown = evs;
  if (viewRange) { START = viewRange.start; END = viewRange.end; }
  else {
    const timed = evs.filter(e => !e.allDay);
    START = Math.min(480, ...timed.map(e => Math.floor(e.s/60)*60));
    END = Math.max(1080, ...timed.map(e => Math.ceil(e.e/60)*60));
  }
  SPAN = END - START;

  let hours = '';
  for (let m = START; m <= END; m += 60) hours += `<span style="left:${(m-START)/SPAN*100}%">${fmt(m)}</span>`;
  $('hours').innerHTML = hours;

  const today = new Date(), nowM = today.getHours()*60 + today.getMinutes();
  const all = state.showFree ? weekEvents() : null;
  let html = '';
  for (let d = 0; d < 7; d++){
    const date = addDays(cur, d), isToday = sameDay(date, today);
    const dayEvs = evs.filter(e => e.d === d);
    const byId = new Map(dayEvs.filter(e => !e.allDay).map(e => [e.id, e]));
    const hidden = new Set(), frames = [], summaries = [];
    state.groups.forEach(g => {
      const mem = g.members.map(id => byId.get(id)).filter(Boolean);
      if (mem.length < 2) return;
      const s = Math.min(...mem.map(m => m.s)), e = Math.max(...mem.map(m => m.e));
      mem.forEach(m => m.gid = g.id);
      if (g.collapsed) {
        mem.forEach(m => hidden.add(m.id));
        summaries.push({id:g.id, kind:'group', g, mem, d, s, e, clash:mem.some(m => m.clash)});
      } else frames.push({g, mem, s, e, hasJob:mem.some(m => m.kind === 'job')});
    });
    const jobs = dayEvs.filter(e => e.kind === 'job' && !hidden.has(e.id));
    const blocks = [...dayEvs.filter(e => e.kind !== 'job' && !hidden.has(e.id)), ...summaries];
    layoutLanes(blocks);
    // blocks that never meet a work bar in time keep the full row height
    const hitsJob = x => jobs.some(j => j.allDay || overlaps(x, j));
    const tall = new Set(blocks.map(b => b.cl)), freeF = frames.filter(f => !f.hasJob && !hitsJob(f));
    blocks.forEach(b => { if (hitsJob(b)) tall.delete(b.cl); });
    blocks.forEach(b => b.full = tall.has(b.cl));
    freeF.forEach(f => f.full = true);

    const jf = Math.min(JOB_MAX, Math.max(0, ...jobs.filter(j => !j.allDay).map(j => state.size[j.id] || 0)));
    const share = 1 - (jf || (jobs.length ? 0.3 : 0));
    const jb = !jobs.length ? '0px' : jf ? `calc(${INNER} * ${jf} + 6px)` : '27px';
    const tp = frames.length ? 22 : 6;
    const skipped = dayEvs.filter(e => e.clash).length;
    const now = isToday && nowM >= START && nowM <= END ? `<div class="now" style="left:${(nowM-START)/SPAN*100}%"></div>` : '';
    html += `<div class="drow${isToday ? ' today' : ''}" data-d="${d}"${frames.length ? ' style="flex-grow:1.35;min-height:96px"' : ''}>
      <div class="dl"><span class="num">${date.getDate()}</span><div><b>${DAYS[d]}</b><small>${MONTHS_S[date.getMonth()]}</small>${skipped ? `<span class="skipn">${skipped} at work</span>` : ''}${dayMarks(date)}</div></div>
      <div class="track" data-d="${d}" style="--jb:${jb};--tp:${tp}px">${frames.map(frameHTML).join('')}${blocks.map(b => (b.tiny = b.lh * (b.full ? 1 : share) < 0.42, b.kind === 'group' ? gcardHTML(b) : evHTML(b))).join('')}${jobs.map(jobHTML).join('')}${all ? freeHTML(all.filter(e => e.d === d), date) : ''}${dlFlags(date)}${now}</div>
    </div>`;
  }
  const rows = $('rows');
  rows.style.setProperty('--hw', `${6000/SPAN}%`);
  rows.innerHTML = html;
}

function layoutLanes(list){
  list.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], end = -1, cl = 0;
  const flush = () => {
    const lanes = [];
    cluster.forEach(ev => {
      let i = lanes.findIndex(x => x <= ev.s);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = ev.e; ev.lane = i;
    });
    cluster.forEach(ev => ev.lanes = lanes.length);
    laneSizes(cluster, lanes.length);
    cluster.forEach(ev => ev.cl = cl);
    cl++;
    cluster = [];
  };
  list.forEach(ev => { if (cluster.length && ev.s >= end) flush(); cluster.push(ev); end = Math.max(end, ev.e); });
  if (cluster.length) flush();
}

// Rows never grow: a resized block takes a share of its row and the blocks stacked
// with it share what is left (each keeps at least MIN_LANE).
const MIN_LANE = 0.3, JOB_MAX = 0.6;
function laneSizes(cluster, n){
  const want = Array.from({length:n}, (_, i) => Math.max(0, ...cluster.filter(ev => ev.lane === i).map(ev => state.size[ev.id] || 0)) || null);
  let fixed = want.map(w => w && clamp(w, MIN_LANE, 1 - MIN_LANE * (n - 1)));
  const flexN = fixed.filter(f => !f).length, room = 1 - MIN_LANE * flexN, sum = fixed.reduce((a, f) => a + (f || 0), 0);
  if (sum > room) fixed = fixed.map(f => f && f * room / sum);
  const rest = (1 - Math.min(sum, room)) / (flexN || 1);
  const h = fixed.map(f => f || rest), off = h.map((_, i) => h.slice(0, i).reduce((a, x) => a + x, 0));
  cluster.forEach(ev => { ev.lt = off[ev.lane]; ev.lh = h[ev.lane]; });
}

const INNER = '(100% - var(--tp) - 6px)';
const xPos = (s, e) => `left:calc(${(s-START)/SPAN*100}% + 2px);width:calc(${(e-s)/SPAN*100}% - 4px)`;
const AREA = '(100% - var(--tp) - 6px - var(--jb))';
const area = e => e.full ? INNER : AREA;
const laneTop = e => `calc(var(--tp) + ${area(e)} * ${e.lt.toFixed(4)})`;
const laneH = e => `calc(${area(e)} * ${e.lh.toFixed(4)} - 4px)`;
const dataAttrs = e => `data-id="${e.id}" data-s="${e.s}" data-e="${e.e}"${e.gid ? ` data-gid="${e.gid}"` : ''}`;

function evHTML(e){
  const type = e.kind === 'uni' ? e.t.toLowerCase() : 'perso';
  const cls = ['ev', type, e.cancelled && 'cancelled', e.moved && 'moved', e.clash && 'clash', e.att && 'att-' + e.att, e.lanes > 1 && 'compact', e.tiny && 'tiny', e.id === sel && 'selected', picked.has(e.id) && 'picked'].filter(Boolean).join(' ');
  const badge = e.clash ? 'At work' : e.kind === 'uni' ? typeName(e.t) : catOf(e.cat).label;
  const meta = e.kind === 'uni' ? [e.room, e.prof].filter(Boolean).join(' · ') : e.detail || e.note;
  return `<div class="${cls}" ${dataAttrs(e)}${e.full ? ' data-full' : ''} style="--c:${e.c};${xPos(e.s, e.e)};top:${laneTop(e)};height:${laneH(e)}">
    <div class="t">${e.att && e.att !== 'off' ? `<b class="att-i">${ATT_I[e.att]}</b>` : ''}<span>${esc(e.title)}</span><i>${esc(badge)}</i></div>
    ${meta ? `<div class="m">${esc(meta)}</div>` : ''}
    <div class="h">${fmt(e.s)} – ${fmt(e.e)}</div>${e.cancelled ? '' : HANDLES}</div>`;
}

function gcardHTML(b){
  return `<div class="ev gcard${b.clash ? ' clash' : ''}" ${dataAttrs({...b, gid:b.id})} style="${xPos(b.s, b.e)};top:${laneTop(b)};height:${laneH(b)}">
    <div class="t"><span>${esc(b.g.name)}</span><i>${b.mem.length} blocks</i></div>
    <div class="m dots">${b.mem.map(m => `<span style="background:${m.kind === 'job' ? 'var(--job-c)' : m.c}"></span>`).join('')}</div>
    <div class="h">${fmt(b.s)} – ${fmt(b.e)}</div></div>`;
}

function frameHTML(f){
  return `<div class="grp" data-gid="${f.g.id}" data-s="${f.s}" data-e="${f.e}" style="left:${(f.s-START)/SPAN*100}%;width:${(f.e-f.s)/SPAN*100}%;bottom:${f.hasJob || f.full ? '2px' : 'calc(var(--jb) + 2px)'}">
    <button type="button" class="gl" data-gid="${f.g.id}">${esc(f.g.name)} · ${f.mem.length}</button></div>`;
}

function jobHTML(e){
  if (e.allDay) return `<div class="job allday${e.cancelled ? ' cancelled' : ''}" data-id="${e.id}" style="left:2px;right:2px"><b>Work</b><span class="h">${e.label}</span></div>`;
  const f = state.size[e.id] && Math.min(JOB_MAX, state.size[e.id]);
  const cls = ['job', e.soft && 'soft', e.cancelled && 'cancelled', e.moved && 'moved', e.id === sel && 'selected', picked.has(e.id) && 'picked'].filter(Boolean).join(' ');
  return `<div class="${cls}" ${dataAttrs(e)} style="${xPos(e.s, e.e)}${f ? `;height:calc(${INNER} * ${f})` : ''}"><b>${e.soft ? 'Work · morning' : 'Work'}</b><span class="h">${fmt(e.s)} – ${fmt(e.e)}</span>${e.cancelled ? '' : HANDLES}</div>`;
}

function renderMini(){
  const y = miniMonth.getFullYear(), m = miniMonth.getMonth();
  $('miniTitle').textContent = `${MONTHS[m]} ${y}`;
  const start = weekStart(new Date(y, m, 1)), today = new Date(), wEnd = addDays(cur, 6);
  let html = DAYS_XS.map(k => `<div class="wd">${k}</div>`).join('');
  for (let i = 0; i < 42; i++){
    const date = addDays(start, i), inWeek = date >= cur && date <= wEnd;
    const cls = [date.getMonth() !== m && 'out', inWeek && 'wk', inWeek && i % 7 === 0 && 'first', inWeek && i % 7 === 6 && 'last', sameDay(date, today) && 'td'].filter(Boolean).join(' ');
    html += `<button class="${cls}" data-act="date" data-v="${iso(date)}"><span>${date.getDate()}</span></button>`;
  }
  $('mini').innerHTML = html;
}

function renderSide(){
  const all = weekEvents(), count = k => all.filter(e => showKey(e) === k).length;
  const chip = (key, label, c, edit) => `<label style="--sw:${c}" title="${esc(label)} · ${count(key)}${edit ? ' · double-click to edit' : ''}"${edit ? ` data-edit="${edit}"` : ''}>
    <input type="checkbox" data-f="${key}" ${state.show[key] !== false ? 'checked' : ''}><span class="dot"></span><span class="lbl">${esc(label)}</span></label>`;
  $('filters').innerHTML = FIXED.filter(f => f.k === 'job' ? SHIFTS.length : TT.classes.some(c => c.t === f.k)).map(f => chip(f.k, f.label, f.c)).join('')
    + state.cats.map(c => chip('cat:' + c.k, c.label, c.c, c.k)).join('')
    + `<button class="fadd" data-act="cat-new" title="New filter" aria-label="New filter">${ICON.plus}</button>`;

  renderDeadlines(); renderPlanTodos();
  renderStats();
  renderNext();
}

function renderStats(){
  $('stats').innerHTML = statsHTML();
}
