// Daily journal: one note per day in Notes/Journal, made the first time you use it that day.
const JR = {moods: store.get('moods', {})};
const MOODS = ['Rough', 'Meh', 'Okay', 'Good', 'Great'];
const journalTitle = d => iso(d);

function journalTemplate(d){
  const k = iso(d), done = TD.list.filter(t => t.done && t.doneAt && iso(new Date(t.doneAt)) === k);
  const focus = FOCUS.filter(f => f.d === k).reduce((a, f) => a + f.m, 0);
  const classes = weekEvents(weekStart(d)).filter(e => e.d === dayIndex(d) && e.kind === 'uni' && !e.cancelled && !e.clash).sort((a, b) => a.s - b.s);
  return `# ${DAYS[dayIndex(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}

## How did today go?

## Got done
${done.map(t => `- [x] ${t.text}`).join('\n') || '- '}
${focus ? `\nFocus time: ${hm(focus)}\n` : ''}${classes.length ? `\nClasses: ${classes.map(e => `${e.title} ${typeName(e.t)}`).join(', ')}\n` : ''}
## Tomorrow
- [ ]
`;
}
async function journalEnsure(d = new Date()){
  await loadNotes();
  const title = journalTitle(d), have = NT.data.notes.find(n => n.folder === 'Journal' && n.title === title);
  if (have) return have.rel;
  if (!NT.data.folders.includes('Journal')) await NFS.mkdir('Journal');
  return NFS.create('Journal', title, journalTemplate(d));
}
async function openJournal(d = new Date()){
  await saveNow();
  NT.cur = await journalEnsure(d); NT.folder = 'Journal'; NT.q = '';
  window.VIEW === 'notes' ? MODS.notes.render() : go('notes');
}
// from the Overview card: mood and a few lines go into today's note
async function journalAdd(text, mood){
  const d = new Date(), rel = await journalEnsure(d);
  await loadNotes();
  let md = NT.data.notes.find(n => n.rel === rel)?.text || journalTemplate(d);
  if (mood) {
    JR.moods[iso(d)] = mood; store.set('moods', JR.moods);
    const line = `Mood: ${MOODS[mood - 1]} (${mood}/5)`;
    md = /^Mood: .*$/m.test(md) ? md.replace(/^Mood: .*$/m, line) : md.replace(/^(# .*\n)/, `$1\n${line}\n`);
  }
  if (text) md = /^## How did today go\?\n/m.test(md)
    ? md.replace(/^## How did today go\?\n\n?/m, m => `${m.trimEnd()}\n\n${text.trim()}\n\n`)
    : md + `\n${text.trim()}\n`;
  await NFS.write(rel, md.replace(/\n{3,}/g, '\n\n'));
  if (NT.cur === rel && window.VIEW === 'notes') MODS.notes.render();
}
function journalStreak(){
  let n = 0, d = new Date();
  const days = new Set(NT.data.notes.filter(x => x.folder === 'Journal').map(x => x.title).concat(Object.keys(JR.moods)));
  if (!days.has(iso(d))) d = addDays(d, -1);
  while (days.has(iso(d))) { n++; d = addDays(d, -1); }
  return n;
}
