// Your weekly timetable (classes) and work shifts, edited in Settings → Timetable.
// Times are minutes from midnight, d is the column of the week (0 = first day).
const TT = Object.assign({name:'', group:'', types:{}, subjects:{}, classes:[]}, store.get('tt', {}));
TT.types = {Cours:'Lecture', TD:'Tutorial', TP:'Lab', ...TT.types};
const SUBJ = TT.subjects;                  // code -> {c, name}
const SHIFTS = store.get('shifts', []);    // [{id, d, s, e, soft}]
const saveTT = () => store.set('tt', TT);
const saveShifts = () => store.set('shifts', SHIFTS);
const typeName = t => TT.types[t] || t;
const subjOf = k => SUBJ[k] || {c:'#5d6670', name:k};
// j: a timetable file. keep: from an older version (keeps ids so moved classes stay moved, brings work shifts)
function ttApply(j, keep){
  const shift = d => (d + (j.weekStart ?? CFG.weekStart) - CFG.weekStart + 14) % 7;
  TT.name = j.name || ''; TT.group = keep ? j.group || '' : '';
  Object.assign(TT.types, j.types || {});
  Object.keys(SUBJ).forEach(k => delete SUBJ[k]); Object.assign(SUBJ, j.subjects || {});
  TT.classes = j.classes.map(c => ({...c, id:keep && c.id || uid('u'), d:shift(c.d)}));
  if (keep && j.shifts) SHIFTS.splice(0, SHIFTS.length, ...j.shifts.map(x => ({...x, id:x.id || uid('j'), d:shift(x.d)})));
  saveTT(); saveShifts();
}
// main.js hands over a timetable.json found next to data.json
{ const f = store.get('ttFile', null); if (f) { if (!TT.classes.length && Array.isArray(f.classes)) ttApply(f, true); LS.removeItem('jk.ttFile'); } }

// Starting categories; editable from the sidebar
const DEFAULT_CATS = [];
