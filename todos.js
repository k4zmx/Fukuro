// To-dos: quick list with optional due dates. Optionally, classes you miss for work become catch-up tasks.
const TD = {list: store.get('todos', []), seen: store.get('missSeen', {}), filter: 'all', showDone: false};
const saveTodos = () => store.set('todos', TD.list);
const missOpen = () => TD.list.filter(t => t.src === 'miss' && !t.done);
function clearMissed(){
  const before = TD.list.slice(), n = missOpen().length;
  TD.list = TD.list.filter(t => !(t.src === 'miss' && !t.done)); saveTodos();
  if (TD.filter === 'miss') TD.filter = 'all';
  if (window.VIEW && MODS[window.VIEW]) MODS[window.VIEW].render();
  toast(`Removed ${n} catch-up to-do${n > 1 ? 's' : ''}`, [['Undo', () => { TD.list = before; saveTodos(); MODS[window.VIEW]?.render(); }]]);
}
// the auto catch-up tasks used to be always on: clear the ones already added, once
if (!CFG.missTodos && !store.get('missCleared', false)) {
  store.set('missCleared', true);
  if (missOpen().length) { TD.list = TD.list.filter(t => !(t.src === 'miss' && !t.done)); saveTodos(); }
}
const tdIcon = {
  x:svg('<path d="M6 6l12 12M18 6 6 18"/>', 14), check:svg('<path d="m5.5 12.5 4 4 9-9.5"/>', 13),
  copy:svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 15),
  down:svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', 15), cal:svg('<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>', 14),
};

// a class during work hours that has already started → "catch up" task, once
function syncMissed(){
  if (!CFG.missTodos) return;
  const now = new Date(), ws = weekStart(now);
  let added = 0;
  [addDays(ws, -7), ws].forEach(w => weekEvents(w).forEach(e => {
    if (e.kind !== 'uni' || !e.clash || e.cancelled) return;
    const date = addDays(w, e.d), start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, e.s);
    const key = iso(w) + ':' + e.id;
    if (start > now || TD.seen[key]) return;
    TD.seen[key] = true; added++;
    TD.list.push({id:uid('td'), text:`Catch up on ${e.title} ${typeName(e.t)} (${DAYS[e.d].slice(0, 3)} ${date.getDate()} ${MONTHS_S[date.getMonth()]})`, src:'miss', due:null, done:false, created:Date.now()});
  }));
  if (added) { saveTodos(); store.set('missSeen', TD.seen); }
}

const dueLabel = d => {
  if (!d) return '';
  const t = todayISO(), tm = iso(addDays(new Date(), 1));
  if (d < t) return 'Overdue';
  if (d === t) return 'Today';
  if (d === tm) return 'Tomorrow';
  const x = parseISO(d); return `${DAYS[dayIndex(x)].slice(0, 3)} ${x.getDate()} ${MONTHS_S[x.getMonth()]}`;
};
function bucket(t){
  if (!t.due) return 'later';
  const today = todayISO();
  return t.due < today ? 'overdue' : t.due === today ? 'today' : 'upcoming';
}

function rowHTML(t){
  const due = dueLabel(t.due);
  return `<li class="td-row${t.done ? ' done' : ''}" data-id="${t.id}">
    <button class="td-check" data-td="toggle" aria-label="Done">${tdIcon.check}</button>
    <span class="td-text">${esc(t.text)}</span>
    ${t.src === 'miss' ? '<span class="td-tag miss">Missed class</span>' : ''}
    ${due && !t.done ? `<span class="td-tag due ${bucket(t)}">${due}</span>` : ''}
    ${t.done ? `<span class="td-when">${ago(t.doneAt)}</span>` : ''}
    <button class="td-x" data-td="del" aria-label="Delete">${tdIcon.x}</button></li>`;
}

MODS.todos = {
  add(text, due = null){
    if (!text) return;
    TD.list.push({id:uid('td'), text, due, done:false, created:Date.now()});
    saveTodos();
    if (window.VIEW === 'todos') MODS.todos.render(); else if (window.VIEW === 'overview') MODS.overview.render();
    toast(`To-do added · ${esc(text)}`);
  },
  render(){
    syncMissed();
    const open = TD.list.filter(t => !t.done), done = TD.list.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
    const f = TD.filter;
    const shown = open.filter(t => f === 'all' || (f === 'today' ? ['overdue', 'today'].includes(bucket(t)) : f === 'miss' ? t.src === 'miss' : bucket(t) === 'upcoming'));
    const groups = [['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['later', 'No date']]
      .map(([k, label]) => [label, shown.filter(t => bucket(t) === k).sort((a, b) => (a.due || '').localeCompare(b.due || '') || a.created - b.created)])
      .filter(([, l]) => l.length);
    const count = k => open.filter(t => k === 'today' ? ['overdue', 'today'].includes(bucket(t)) : k === 'miss' ? t.src === 'miss' : bucket(t) === 'upcoming').length;
    $('v-todos').innerHTML = `<div class="pg narrow">
      <header class="pg-h"><div><h1>To-dos</h1><p>${open.length} open${DESK ? ' · Ctrl+Shift+Space adds one from anywhere' : ''}</p></div>
        <div class="pg-tools"><button class="btn" data-td="copy">${tdIcon.copy}Copy list</button><button class="btn" data-td="md">${tdIcon.down}Export .md</button></div></header>
      <form class="td-add" id="tdAdd"><input name="text" placeholder="Add a to-do and press Enter" maxlength="200" autocomplete="off">
        <label class="td-date" title="Due date (optional)">${tdIcon.cal}<input type="date" name="due"></label><button class="btn primary">Add</button></form>
      <div class="chipbar">${[['all', 'All', open.length], ['today', 'Today', count('today')], ['upcoming', 'Upcoming', count('upcoming')], ...(CFG.missTodos || count('miss') ? [['miss', 'Missed classes', count('miss')]] : [])]
        .map(([k, l, n]) => `<button class="${f === k ? 'on' : ''}" data-tdf="${k}">${l}<small>${n}</small></button>`).join('')}</div>
      ${groups.map(([label, l]) => `<h3 class="td-h">${label}</h3><ul class="td-list">${l.map(rowHTML).join('')}</ul>`).join('')
        || `<p class="empty-state">${f === 'all' ? 'Nothing to do. Enjoy it.' : 'Nothing here.'}</p>`}
      ${done.length ? `<div class="td-done-h"><button data-td="showdone">${TD.showDone ? 'Hide' : 'Show'} done (${done.length})</button>${TD.showDone ? '<button data-td="clear">Clear done</button>' : ''}</div>
        ${TD.showDone ? `<ul class="td-list">${done.map(rowHTML).join('')}</ul>` : ''}` : ''}
    </div>`;
  },
};

function exportText(md){
  const open = TD.list.filter(t => !t.done);
  return (md ? `# To-dos · ${todayISO()}\n\n` : '') + open.map(t => `- [ ] ${t.text}${t.due ? ` (${dueLabel(t.due)})` : ''}`).join('\n');
}

$('v-todos').addEventListener('submit', e => {
  if (e.target.id !== 'tdAdd') return;
  e.preventDefault();
  const f = e.target.elements, text = f.text.value.trim();
  if (!text) return;
  TD.list.push({id:uid('td'), text, due:f.due.value || null, done:false, created:Date.now()});
  saveTodos(); MODS.todos.render();
  $('tdAdd').elements.text.focus();
});
$('v-todos').addEventListener('click', e => {
  const fb = e.target.closest('[data-tdf]'); if (fb) { TD.filter = fb.dataset.tdf; return MODS.todos.render(); }
  const b = e.target.closest('[data-td]'); if (!b) return;
  const id = b.closest('[data-id]')?.dataset.id, t = TD.list.find(x => x.id === id);
  switch (b.dataset.td) {
    case 'toggle': t.done = !t.done; t.doneAt = t.done ? Date.now() : null; saveTodos(); MODS.todos.render(); break;
    case 'del': {
      const i = TD.list.indexOf(t); TD.list.splice(i, 1); saveTodos(); MODS.todos.render();
      toast('To-do deleted', [['Undo', () => { TD.list.splice(i, 0, t); saveTodos(); MODS.todos.render(); }]]);
      break;
    }
    case 'showdone': TD.showDone = !TD.showDone; MODS.todos.render(); break;
    case 'clear': {
      const before = TD.list.slice(); TD.list = TD.list.filter(x => !x.done); saveTodos(); MODS.todos.render();
      toast('Done items cleared', [['Undo', () => { TD.list = before; saveTodos(); MODS.todos.render(); }]]);
      break;
    }
    case 'copy': copyText(exportText(false), 'List copied · paste it anywhere'); break;
    case 'md': download(`todos-${todayISO()}.md`, exportText(true), 'text/markdown'); toast('Exported'); break;
  }
});
// double-click a task to edit it
$('v-todos').addEventListener('dblclick', e => {
  const span = e.target.closest('.td-text'); if (!span) return;
  const t = TD.list.find(x => x.id === span.closest('[data-id]').dataset.id);
  span.outerHTML = `<input class="td-edit" value="${esc(t.text)}" maxlength="200">`;
  const inp = $('v-todos').querySelector('.td-edit'); inp.focus(); inp.select();
  const done = ok => { if (ok && inp.value.trim()) { t.text = inp.value.trim(); saveTodos(); } MODS.todos.render(); };
  inp.addEventListener('keydown', k => { if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
  inp.addEventListener('blur', () => done(true));
});
