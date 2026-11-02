// Search everything (Ctrl+P): notes, to-dos, events, exams, snippets, videos, boards, projects, budget,
// plus pages and commands. Type ">" to see only commands.
const PAL = {items:[], i:0, notesReady:false};
const SI = {
  page:svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 15), cmd:svg('<path d="m6 8 4 4-4 4M12 16h6"/>', 15), note:svg('<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8h5"/>', 15),
  todo:svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', 15), cal:svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17"/>', 15),
  exam:svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', 15), snip:svg('<path d="m8 9-3 3 3 3M16 9l3 3-3 3"/>', 15), video:svg('<rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="M10 9.2v5.6l4.8-2.8z"/>', 15),
  board:svg('<rect x="3" y="4" width="8.5" height="7" rx="1.8"/><rect x="12.5" y="13" width="8.5" height="7" rx="1.8"/>', 15), proj:svg('<circle cx="6.5" cy="5.5" r="2.2"/><circle cx="6.5" cy="18.5" r="2.2"/><path d="M6.5 7.7v8.6"/>', 15),
  money:svg('<rect x="4" y="7.5" width="16.5" height="12" rx="2.5"/><path d="M16 13.5h1.5"/>', 15), habit:svg('<path d="M12 3c.8 3.2 5 5.3 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.9 2.4-5 .3 1.9 1.1 2.9 2.4 3.4C11.4 9.2 11 6 12 3z"/>', 15),
};
const KIND_LABEL = {cmd:'Actions', page:'Pages', note:'Notes', todo:'To-dos', exam:'Exams & deadlines', event:'Calendar', snip:'Snippets', video:'Videos', board:'Boards', proj:'Projects', money:'Budget', habit:'Habits'};

// title matches beat body matches; word starts beat the middle of a word; letters in order still count a little
function score(q, title, body = ''){
  if (!q) return 1;
  const t = title.toLowerCase();
  if (t.startsWith(q)) return 5;
  if (new RegExp('(^|[\\s·/(-])' + reEsc(q)).test(t)) return 4;
  if (t.includes(q)) return 3;
  if (body && body.toLowerCase().includes(q)) return 1.5;
  let k = 0; for (const ch of t) if (ch === q[k]) k++;
  return k === q.length && q.length > 2 ? 0.6 : 0;
}
function snippetAround(text, q){
  const t = plain(text), i = t.toLowerCase().indexOf(q);
  if (i < 0 || !q) return t.slice(0, 90);
  const s = Math.max(0, i - 30);
  return (s ? '…' : '') + t.slice(s, i + q.length + 60);
}

function commands(q){
  const raw = q.trim();
  return [
    ['New event', () => { go('calendar'); openForm(null, defaultPreset()); }],
    ['New routine (every week)', () => { go('calendar'); openForm(null, defaultPreset(), 'week'); }],
    ['New note', () => { go('notes'); setTimeout(() => newNote(), 50); }],
    ["Open today's journal", () => openJournal()],
    ['Add an exam or deadline', () => { go('calendar'); openDeadline(null); }],
    [raw && !raw.startsWith('>') ? `Add to-do: ${raw}` : 'Add a to-do', () => raw && !raw.startsWith('>') ? MODS.todos.add(raw) : go('todos')],
    ['Show free time this week', () => { go('calendar'); state.showFree = true; state.cview = 'week'; save('showFree', 'cview'); render(); }],
    ['Month view', () => { go('calendar'); setCalView('month'); }],
    ['Start Pomodoro', () => { const t = TM.list.find(x => x.kind === 'pomo'); if (t) { if (!t.run) tmAct(t.id, 'toggle'); go('timers'); } }],
    [document.documentElement.dataset.mode === 'dark' ? 'Light mode' : 'Dark mode', () => setMode(document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark')],
    ['Quick capture', () => openCapture()],
    ['Settings', () => go('settings')],
  ].map(([title, run]) => ({kind:'cmd', icon:SI.cmd, title, run}));
}
function collect(q){
  const out = [], add = (kind, icon, title, sub, s, run) => { if (s > 0) out.push({kind, icon, title, sub, s, run}); };
  if (q.startsWith('>')) { const c = q.slice(1).trim(); return commands(q).map(x => ({...x, s:score(c, x.title)})).filter(x => x.s > 0); }
  commands(q).forEach(x => add('cmd', x.icon, x.title, '', q ? score(q, x.title) * 0.9 : (/^(New note|Add a to-do|New event|Open today)/.test(x.title) ? 1 : 0), x.run));
  [...VIEWS, ...FOOT_VIEWS].forEach(v => add('page', SI.page, v.name, 'Page', q ? score(q, v.name) * 0.95 : 0, () => go(v.k)));
  if (!q) return out;
  NT.data.notes.forEach(n => add('note', SI.note, n.title, (n.folder ? n.folder + ' · ' : '') + snippetAround(n.text, q), score(q, n.title, n.text), () => MODS.notes.open(n.rel)));
  TD.list.forEach(t => add('todo', SI.todo, t.text, t.done ? 'Done' : t.due ? 'Due ' + dueLabel(t.due) : 'To-do', score(q, t.text) * (t.done ? 0.5 : 1), () => { TD.filter = 'all'; if (t.done) TD.showDone = true; go('todos'); flash(`#v-todos [data-id="${t.id}"]`); }));
  DL.list.forEach(x => add('exam', SI.exam, dlName(x), `${dlWhen(x)} · ${dlIn(x)}`, score(q, dlName(x) + ' ' + DL_KIND[x.kind].label, x.note), () => { go('calendar'); openDeadline(x); }));
  const seen = new Set();
  state.events.forEach(e => {
    const key = e.series || e.id; if (seen.has(key)) return; seen.add(key);
    add('event', SI.cal, e.title, e.repeat ? 'Every week · ' + seriesOf(e).map(x => DAYS[x.d].slice(0, 3)).join(', ') : shortDate(parseISO(e.date)) + ', ' + fmt(e.s), score(q, e.title, e.note || ''), () => {
      go('calendar'); if (!e.repeat) goWeek(weekStart(parseISO(e.date))); openForm(e);
    });
  });
  Object.entries(SUBJ).forEach(([k, s]) => add('event', SI.cal, `${k} · ${s.name}`, 'Classes', score(q, `${k} ${s.name}`), () => { go('calendar'); setCalView('week', new Date()); }));
  add('event', SI.cal, TT.classes.length || SHIFTS.length ? 'Timetable' : 'Set up your timetable', 'Your classes and work shifts', score(q, 'timetable classes work shifts schedule'), () => openTimetable());
  SN.list.forEach(s => add('snip', SI.snip, s.title, s.code + ' · Enter copies it', score(q, s.title, s.code + ' ' + (s.tag || '')), () => { s.uses++; saveSnippets(); copyText(s.code, 'Copied to clipboard'); }));
  VD.list.forEach(v => add('video', SI.video, v.title, v.author || 'YouTube', score(q, v.title, (v.author || '') + ' ' + (v.tags || []).join(' ')), () => openPlayer(v)));
  BD.list.forEach(b => b.cards.forEach(c => c.text && add('board', SI.board, c.text.split('\n')[0].slice(0, 80), 'Board · ' + b.name, score(q, c.text), () => { BD.cur = b.id; BD.sel = new Set([c.id]); go('boards'); centerCard(c); })));
  PJ.list.forEach(p => add('proj', SI.proj, p.name, p.path, score(q, p.name, p.path), () => go('projects')));
  HB.list.forEach(h => add('habit', SI.habit, h.name, 'Habit', score(q, h.name), () => go('habits')));
  BG.data.entries.forEach(e => e.note && add('money', SI.money, e.note, `${e.kind === 'in' ? '+' : '-'}${money(e.amt)} · ${shortDate(parseISO(e.date))}`, score(q, e.note) * 0.8, () => { BG.month = e.date.slice(0, 7); go('budget'); }));
  return out;
}
function centerCard(c){
  setTimeout(() => {
    const r = $('bdCanvas')?.getBoundingClientRect(); if (!r) return;
    const v = board().view; v.x = r.width / 2 - (c.x + c.w / 2) * v.z; v.y = r.height / 2 - (c.y + cardH(c) / 2) * v.z; applyView(); drawBoard();
  }, 30);
}
function flash(sel){ setTimeout(() => { const el = document.querySelector(sel); if (el) { el.scrollIntoView({block:'center'}); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); } }, 60); }

function palRender(){
  const q = $('palQ').value.trim().toLowerCase();
  const all = collect(q).sort((a, b) => b.s - a.s), per = {}, list = [];
  all.forEach(x => { per[x.kind] = (per[x.kind] || 0) + 1; if (per[x.kind] <= (q ? 5 : 8)) list.push(x); });
  // keep groups together, ordered by their best hit
  const order = [...new Set(list.map(x => x.kind))];
  PAL.items = order.flatMap(k => list.filter(x => x.kind === k)).slice(0, 40);
  PAL.i = Math.min(PAL.i, Math.max(0, PAL.items.length - 1));
  let last = '';
  $('palRes').innerHTML = PAL.items.map((x, i) => {
    const head = x.kind !== last ? `<div class="pal-g">${KIND_LABEL[x.kind]}</div>` : ''; last = x.kind;
    return `${head}<button class="pal-it${i === PAL.i ? ' on' : ''}" data-pi="${i}">${x.icon}<span><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span></button>`;
  }).join('') || `<p class="pal-empty">Nothing matches “${esc(q)}”. Press Enter to add it as a to-do.</p>`;
  $('palRes').querySelector('.on')?.scrollIntoView({block:'nearest'});
}
async function openSearch(){
  const p = $('palette');
  p.innerHTML = `<div class="pal-box"><div class="pal-in">${svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>', 18)}<input id="palQ" placeholder="Search notes, to-dos, exams, snippets…  or type > for actions" autocomplete="off" spellcheck="false"></div>
    <div class="pal-res" id="palRes"></div><div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`;
  p.hidden = false; PAL.i = 0;
  $('palQ').focus();
  palRender();
  if (!NT.data.notes.length || !PAL.notesReady) { await loadNotes(); PAL.notesReady = true; if (!p.hidden) palRender(); }
}
const closeSearch = () => { $('palette').hidden = true; };
function runItem(i){
  const x = PAL.items[i], q = $('palQ').value.trim();
  closeSearch();
  if (x) x.run(); else if (q) MODS.todos.add(q);
}
$('palette').addEventListener('input', e => { if (e.target.id === 'palQ') { PAL.i = 0; palRender(); } });
$('palette').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); return closeSearch(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = PAL.items.length; if (!n) return; PAL.i = (PAL.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; palRender(); }
  if (e.key === 'Enter') { e.preventDefault(); runItem(PAL.i); }
});
$('palette').addEventListener('mousemove', e => { const b = e.target.closest('[data-pi]'); if (b && +b.dataset.pi !== PAL.i) { PAL.i = +b.dataset.pi; $('palRes').querySelectorAll('.pal-it').forEach(x => x.classList.toggle('on', x === b)); } });
$('palette').addEventListener('click', e => { const b = e.target.closest('[data-pi]'); if (b) return runItem(+b.dataset.pi); if (e.target === $('palette')) closeSearch(); });
