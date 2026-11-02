// AI, kept light: quick capture that understands plain sentences, and a weekly review written into Notes.
// It runs on the Claude Code sign-in of this PC (main.js), so there is no API key. Nothing is sent unless one of these runs.
const AI = {status:null, busy:false};
const REV = {list: store.get('reviews', {})};   // week start -> {rel, read, at, text, next, partial}
const aiReady = () => DESK && !!desk.ai && !!AI.status?.loggedIn;
const aiCount = () => { const l = store.get('aiLog', {}); return l.w === iso(weekStart(new Date())) ? l.n : 0; };
const aiBump = () => { const w = iso(weekStart(new Date())), l = store.get('aiLog', {}); store.set('aiLog', {w, n:(l.w === w ? l.n : 0) + 1}); };
async function aiAsk(system, prompt, model, timeout){
  aiBump();
  return desk.ai.ask({system, prompt, model, timeout});
}
async function aiCheck(){ if (DESK && desk.ai) AI.status = await desk.ai.status(); return AI.status; }
const aiJSON = t => { const m = String(t).match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const clip = (s, n = 120) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const okTime = s => /^\d{1,2}:\d{2}$/.test(s || '') && toMin(s) < 1440;

/* ---------- quick capture ---------- */
// only notes that carry a day, a time, an amount or a habit are worth a request; "buy milk" stays a local to-do
const SMART_WORDS = /\b(today|tonight|tomorrow|tmrw|yesterday|weekend|week|month|morning|noon|afternoon|evening|night|every|daily|(mon|tues|wednes|thurs|fri|satur|sun)day|mon|tue|wed|thu|fri|sat|jan|feb|apr|jun|jul|aug|sept?|oct|nov|dec|exam|test|quiz|midterm|final|deadline|due|spent|paid|bought|earned|did|went|finished|demain|aujourd|soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|examen|contr[oô]le)\b/i;
// "-300 lunch" stays local, unless it names a day the local parser would miss
const DAY_WORDS = /\b(yesterday|tomorrow|tonight|last|(mon|tues|wednes|thurs|fri|satur|sun)day|hier|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b|\d{1,2}(st|nd|rd|th)\b|\d{1,2}[/.]\d{1,2}/i;
const aiDated = t => CFG.aiCapture !== false && aiReady() && DAY_WORDS.test(t);
const wantsAI = t => CFG.aiCapture !== false && aiReady()
  && (/\d/.test(t) || SMART_WORDS.test(t) || t.split(/\s+/).length > 8 || HB.list.some(h => new RegExp(`\\b${reEsc(h.name)}\\b`, 'i').test(t)));

const CAP_SYS = `You turn one short note typed into a planner app into actions. Reply with JSON only: {"actions":[...]}
Action types:
{"type":"todo","text":"...","due":"YYYY-MM-DD" or null}
{"type":"event","title":"...","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","weekly":false,"cat":"category key or empty"}
{"type":"money","kind":"out" or "in","amount":123,"note":"what it was","cat":"category key","account":"account id","date":"YYYY-MM-DD"}
{"type":"exam","kind":"exam" or "test" or "due","subject":"subject key or empty","title":"...","date":"YYYY-MM-DD","time":"HH:MM" or "","room":""}
{"type":"habit","habit":"habit id","date":"YYYY-MM-DD"}
{"type":"note","text":"..."}
Rules: something at a time is an event (no end given: 1 hour, "every" makes it weekly). A task with only a day is a todo with due; "remind me to" is a todo. An exam or final is kind exam, a test or quiz is kind test, an assignment due date is kind due; the title is only the kind of exam (Midterm, Final, Quiz…) and must not repeat the subject. Doing a habit ticks it. An idea, thought or info to keep (often starting with "idea") is a note, not a todo. One note can give several actions. Keep titles short and capitalised, in the note's language. Use only the keys listed. If unsure, one todo with the text.`;

function capPrompt(text){
  const now = new Date(), days = [];
  for (let i = 1; i < 15; i++) { const d = addDays(now, i); days.push(`${DAY_NAMES[d.getDay()]}=${iso(d)}`); }
  const kv = list => list.join(', ') || 'none';
  return `Now: ${DAY_NAMES[now.getDay()]} ${iso(now)} ${fmt(now.getHours() * 60 + now.getMinutes())}
Coming days (take dates from here): ${days.join(', ')}
Event categories: ${kv(state.cats.map(c => `${c.k}=${c.label}`))}
Subjects: ${kv(Object.entries(SUBJ).map(([k, s]) => `${k}=${s.name}`))}
Spending categories: ${BCAT.out.map(c => c[0]).join(', ')}. Income: ${BCAT.in.map(c => c[0]).join(', ')}
Accounts: ${kv(BG.data.wallets.map(w => `${w.id}=${w.name}`))}
Habits: ${kv(HB.list.map(h => `${h.id}=${h.name}`))}

Note: ${text}`;
}

// each action returns [what the box shows, how to take it back]
async function applyAction(a){
  const today = todayISO(), date = okDate(a.date) ? a.date : today;
  switch (a.type) {
    case 'todo': {
      const text = clip(a.text, 200); if (!text) return;
      const t = {id:uid('td'), text, due:okDate(a.due) ? a.due : null, done:false, created:Date.now()};
      TD.list.push(t);
      return [`To-do · ${text}${t.due ? ' · ' + dueLabel(t.due) : ''}`, () => { TD.list = TD.list.filter(x => x !== t); }];
    }
    case 'event': {
      const title = clip(a.title, 60); if (!title || !okTime(a.start)) return;
      const s = toMin(a.start), e = okTime(a.end) && toMin(a.end) > s ? toMin(a.end) : Math.min(1440, s + 60), d = parseISO(date);
      const cat = state.cats.some(c => c.k === a.cat) ? a.cat : '';
      const ev = a.weekly ? {id:uid('p'), series:uid('s'), title, cat, note:'', repeat:true, d:dayIndex(d), s, e}
        : {id:uid('p'), title, cat, note:'', s, e, repeat:false, date, d:dayIndex(d)};
      state.events.push(ev);
      return [`${title} · ${a.weekly ? 'every ' + DAY_NAMES[d.getDay()] : shortDate(d)}, ${fmt(s)}–${fmt(e)}`, () => { state.events = state.events.filter(x => x !== ev); }];
    }
    case 'money': {
      const amt = Math.abs(+a.amount); if (!amt) return;
      const kind = a.kind === 'in' ? 'in' : 'out', note = clip(a.note, 60);
      const cat = BCAT[kind].some(c => c[0] === a.cat) ? a.cat : guessCat(note, kind);
      const e = {id:uid('m'), date, amt, kind, cat, note, w:BG.data.wallets.some(w => w.id === a.account) ? a.account : 'cash'};
      BG.data.entries.push(e); setTimeout(() => limitWarning(e), 2600);
      return [`${kind === 'out' ? 'Spent' : 'Earned'} ${money(amt)} · ${bcat(cat)[1]}${note ? ' · ' + note : ''}`, () => { BG.data.entries = BG.data.entries.filter(x => x !== e); }];
    }
    case 'exam': {
      const kind = DL_KIND[a.kind] ? a.kind : 'exam', subj = SUBJ[a.subject] ? a.subject : '';
      const title = [DL_KIND[kind].label, a.kind, subj].some(w => w && clip(a.title).toLowerCase() === w.toLowerCase()) ? '' : clip(a.title, 60);
      if ((!subj && !title) || !okDate(a.date)) return;
      const x = {id:uid('x'), done:false, kind, subj, title, date:a.date, time:okTime(a.time) ? a.time : '', room:clip(a.room, 20), note:''};
      DL.list.push(x);
      return [`${DL_KIND[x.kind].label} · ${dlName(x)} · ${shortDate(parseISO(x.date))}${x.time ? ', ' + x.time : ''}`, () => { DL.list = DL.list.filter(y => y !== x); }];
    }
    case 'habit': {
      const h = HB.list.find(x => x.id === a.habit); if (!h || date > today) return;
      if (h.days[date]) return [`${h.name} was already ticked`, () => {}];
      h.days[date] = true;
      return [`${h.name} ticked · ${date === today ? 'today' : shortDate(parseISO(date))}`, () => { delete h.days[date]; }];
    }
    case 'note': {
      const text = String(a.text || '').trim(); if (!text) return;
      await NFS.mkdir('Inbox');
      const title = clip(text.split(/[.!?\n]/)[0], 60), rel = await NFS.create('Inbox', title, text + '\n');
      return [`Note in Inbox · ${title}`, () => { NFS.trash(rel); }];
    }
  }
}
const saveCaptured = () => { saveTodos(); saveBudget(); saveDL(); saveHabits(); save('events'); refreshAll(); };

// null: not worth a request, the caller keeps it as a plain to-do
async function aiCapture(text){
  if (!wantsAI(text)) return null;
  const r = await aiAsk(CAP_SYS, capPrompt(text), 'haiku', 30000);
  const acts = r.ok ? aiJSON(r.text)?.actions : null;
  const done = [], undo = [];
  if (Array.isArray(acts)) for (const a of acts.slice(0, 6)) {
    try { const x = await applyAction(a); if (x) { done.push(x[0]); undo.push(x[1]); } } catch (e) { console.error(e); }
  }
  if (!done.length) {
    const t = {id:uid('td'), text:clip(text, 200), due:null, done:false, created:Date.now()};
    TD.list.push(t); done.push(`To-do · ${t.text}${r.ok ? '' : ' (Claude did not answer)'}`); undo.push(() => { TD.list = TD.list.filter(x => x !== t); });
  }
  saveCaptured();
  let undone = false;
  const undoAll = () => { if (undone) return; undone = true; undo.reverse().forEach(f => f()); saveCaptured(); };
  capUndo = undoAll;
  toast(esc(done.join(' · ')), [['Undo', undoAll]]);
  return {text:done.join(' · '), undo:true};
}

/* ---------- weekly review ---------- */
const reviewDay = () => CFG.reviewDay ?? (CFG.weekStart + 6) % 7;   // a getDay() number; default the last day of the week
function reviewMoment(ws){
  const d = addDays(ws, (reviewDay() - CFG.weekStart + 7) % 7), [h, m] = (CFG.reviewTime || '19:00').split(':').map(Number);
  d.setHours(h, m, 0, 0); return d;
}
// the week whose review time has passed; a PC that was off that evening still gets it in the next few days
function dueReviewWeek(now = new Date()){
  const ws = weekStart(now);
  if (now >= reviewMoment(ws)) return ws;
  const prev = addDays(ws, -7);
  return now - reviewMoment(prev) < 4 * 864e5 ? prev : null;
}

function reviewStats(ws){
  const from = iso(ws), to = iso(addDays(ws, 7)), inWeek = k => k >= from && k < to, dayOf = ms => iso(new Date(ms));
  const all = weekEvents(ws), evs = all.filter(e => !e.cancelled && !e.allDay), sum = l => l.reduce((a, e) => a + e.e - e.s, 0);
  const uni = evs.filter(e => e.kind === 'uni' && !e.clash), miss = evs.filter(e => e.clash), job = evs.filter(e => e.kind === 'job'), mine = evs.filter(e => e.kind === 'perso');
  const cancelled = all.filter(e => e.cancelled && e.kind === 'uni').length, att = Object.values(state.att).filter(r => inWeek(r.date) && r.st !== 'off');
  const done = TD.list.filter(t => t.done && t.doneAt && inWeek(dayOf(t.doneAt)));
  const open = TD.list.filter(t => !t.done), overdue = open.filter(t => t.due && t.due < todayISO());
  const added = TD.list.filter(t => t.created > 1e12 && inWeek(dayOf(t.created))).length;
  const focus = FOCUS.filter(f => inWeek(f.d)), fMin = focus.reduce((a, f) => a + f.m, 0), fDays = new Set(focus.map(f => f.d)).size;
  const habits = HB.list.map(h => `${h.name} ${weekCount(h, ws)}/${Math.min(h.target, 7)}`);
  const outs = BG.data.entries.filter(e => e.kind === 'out' && inWeek(e.date)), spent = outs.reduce((a, e) => a + e.amt, 0);
  const earned = BG.data.entries.filter(e => e.kind === 'in' && inWeek(e.date)).reduce((a, e) => a + e.amt, 0);
  const byCat = {}; outs.forEach(e => { byCat[e.cat] = (byCat[e.cat] || 0) + e.amt; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${bcat(k)[1].toLowerCase()} ${money(v)}`);
  const before = [1, 2, 3, 4].map(i => BG.data.entries.filter(e => e.kind === 'out' && e.date >= iso(addDays(ws, -7 * i)) && e.date < iso(addDays(ws, -7 * (i - 1)))).reduce((a, e) => a + e.amt, 0)).filter(Boolean);
  const usual = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
  const moods = Object.entries(JR.moods).filter(([k]) => inWeek(k)).map(([, v]) => v);
  const nws = addDays(ws, 7), next = weekEvents(nws).filter(e => !e.cancelled && !e.allDay), free = [];
  for (let d = 0; d < 7; d++) freeSlots(next.filter(e => e.d === d), addDays(nws, d)).forEach(f => free.push({d, ...f}));
  const slots = free.filter(f => f.e - f.s >= 60).sort((a, b) => (b.e - b.s) - (a.e - a.s)).slice(0, 6).sort((a, b) => a.d - b.d || a.s - b.s)
    .map(f => `${DAYS[f.d].slice(0, 3)} ${fmt(f.s)}–${fmt(f.e)}`);
  const dls = upcomingDL().filter(x => dlDays(x) <= 21).map(x => `${dlName(x)} (${DL_KIND[x.kind].label.toLowerCase()}) ${dlIn(x)}`);
  const lines = [
    uni.length || miss.length ? `Classes: ${uni.length} (${hm(sum(uni)) || '0h'})${miss.length ? ` · ${miss.length} missed for work` : ''}${cancelled ? ` · ${cancelled} cancelled` : ''}` : '',
    att.length ? `Attendance: went ${att.filter(r => r.st === 'went').length}, missed ${att.filter(r => r.st === 'missed').length}${att.some(r => r.st === 'just') ? `, excused ${att.filter(r => r.st === 'just').length}` : ''}` : '',
    job.length ? `Work: ${hm(sum(job))}` : '',
    mine.length ? `Your plans: ${mine.length} (${hm(sum(mine))})` : '',
    `To-dos: ${done.length} done, ${added} added, ${open.length} open${overdue.length ? ` (${overdue.length} overdue)` : ''}`,
    `Focus: ${hm(fMin) || '0h'}${fDays ? ` on ${fDays} day${fDays > 1 ? 's' : ''}` : ''} · goal ${hm(CFG.focusGoal)} a day`,
    habits.length ? `Habits: ${habits.join(' · ')}` : '',
    spent || earned ? `Money: spent ${money(spent)}${cats.length ? ` (${cats.slice(0, 4).join(', ')})` : ''}${earned ? ` · earned ${money(earned)}` : ''}${usual ? ` · a usual week is ${money(usual)}` : ''}` : '',
    moods.length ? `Mood: ${(moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)}/5 over ${moods.length} day${moods.length > 1 ? 's' : ''}` : '',
    dls.length ? `Coming up: ${dls.join(', ')}` : '',
    `Next week: ${hm(free.reduce((a, f) => a + f.e - f.s, 0)) || '0h'} free${slots.length ? `, longest gaps ${slots.join(', ')}` : ''}`,
  ].filter(Boolean);
  const nextPlans = next.filter(e => e.kind === 'perso').map(e => `${DAYS[e.d].slice(0, 3)} ${fmt(e.s)} ${e.title}`);
  const brief = `Week of ${shortDate(ws)} to ${shortDate(addDays(ws, 6))}. Today is ${DAY_NAMES[new Date().getDay()]} ${shortDate(new Date())}.
${lines.join('\n')}
Done this week: ${done.slice(0, 12).map(t => t.text).join('; ') || 'nothing ticked'}
Overdue: ${overdue.slice(0, 8).map(t => `${t.text} (due ${t.due})`).join('; ') || 'none'}
Other open to-dos: ${open.filter(t => !overdue.includes(t)).slice(0, 8).map(t => t.text + (t.due ? ` (due ${t.due})` : '')).join('; ') || 'none'}
Already planned next week: ${nextPlans.slice(0, 10).join('; ') || 'nothing besides classes and work'}`;
  const active = evs.length || done.length || added || fMin || outs.length || moods.length;
  return {md:'## The numbers\n' + lines.map(l => '- ' + l).join('\n'), brief, active};
}

const REV_SYS = `You write a short weekly review for someone who uses a planner app (often a student who also works). Be honest, warm and concrete, never generic. Use only the facts given; do not invent anything. No emojis. Reply with Markdown in exactly this shape:
## In one line
one sentence
## Went well
2 or 3 bullets
## Slipped
1 to 3 bullets (skip praise here; if nothing slipped, say so in one bullet)
## Next week
3 bullets, each a concrete action with a day and time taken from the free gaps, aimed at the coming exams, overdue to-dos or habits that are behind
Under 170 words. If last week's plan is given, say briefly whether it happened.`;

async function writeReview(ws, auto){
  if (AI.busy || !aiReady()) return null;
  AI.busy = true;
  try {
    const k = iso(ws), st = reviewStats(ws), prev = REV.list[iso(addDays(ws, -7))]?.next;
    const r = await aiAsk(REV_SYS, st.brief + (prev ? `\n\nLast week's plan:\n${prev}` : ''), 'sonnet', 120000);
    const text = r.ok ? r.text.trim().replace(/^```\w*\n?|\n?```$/g, '').trim() : '';
    const body = `# Week of ${shortDate(ws)} – ${shortDate(addDays(ws, 6))}\n\n${text || '_Claude did not answer, so only the numbers are here. Try again from Settings, AI._'}\n\n${st.md}\n`;
    let rel = REV.list[k]?.rel;
    if (rel) await NFS.write(rel, body);
    else { await NFS.mkdir('Reviews'); rel = await NFS.create('Reviews', `Week of ${k}`, body); }
    const next = (text.match(/## Next week\s*\n([\s\S]*?)(?=\n## |$)/) || [])[1]?.trim() || '';
    REV.list[k] = {rel, read:false, at:Date.now(), text, next, partial:new Date() < reviewMoment(ws)};
    Object.keys(REV.list).sort().slice(0, -12).forEach(x => delete REV.list[x]);
    store.set('reviews', REV.list);
    if (auto) remind('Your weekly review is ready', (text.match(/## In one line\s*\n(.+)/) || [])[1] || 'Open the Overview to read it', 'overview');
    if (window.VIEW === 'overview') MODS.overview.render();
    return REV.list[k];
  } finally { AI.busy = false; }
}
function checkReview(){
  if (CFG.aiReview === false || !aiReady()) return;
  const ws = dueReviewWeek(); if (!ws) return;
  const have = REV.list[iso(ws)];
  if ((!have || have.partial) && reviewStats(ws).active) writeReview(ws, true);
}
addEventListener('DOMContentLoaded', () => { const c = aiCheck(); setTimeout(() => c.then(checkReview), 6000); });
setInterval(checkReview, 60000);

// the newest review stays on the Overview until you tick "Got it"
function reviewCardHTML(){
  const k = Object.keys(REV.list).sort().pop(), r = REV.list[k];
  if (!r || r.read || !r.text) return '';
  return `<section class="ov-card ov-review" style="--i:3"><h3>Weekly review · week of ${esc(shortDate(parseISO(k)))}<span>
    <button data-ovr="open">Open note</button><button data-ovr="read">Got it</button></span></h3>
    <div class="ov-b ov-rv">${mdToHtml(r.text)}</div></section>`;
}
$('v-overview').addEventListener('click', e => {
  const b = e.target.closest('[data-ovr]'); if (!b) return;
  const k = Object.keys(REV.list).sort().pop(), r = REV.list[k];
  if (b.dataset.ovr === 'open') return MODS.notes.open(r.rel);
  r.read = true; store.set('reviews', REV.list); MODS.overview.render();
});
async function reviewNow(){
  if (!aiReady()) return toast('Needs Claude Code, signed in on this PC');
  toast('Writing your review… about 20 seconds');
  const r = await writeReview(weekStart(new Date()), false);
  if (!r) return toast('Busy with another review, try again in a minute');
  toast(r.text ? 'Weekly review ready' : 'Claude did not answer · only the numbers were saved', [['Open', () => MODS.notes.open(r.rel)]]);
  if (window.VIEW === 'settings') MODS.settings.render();
}
