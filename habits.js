// Habits: tick the days you did it; weekly target (e.g. Gym 3× a week) and streaks.
const HB = {list: store.get('habits', [{id:'hgym', name:'Gym', color:'#b5546b', target:3, days:{}}])};
const saveHabits = () => store.set('habits', HB.list);
const WEEKS = 12;

function weekCount(h, ws){ let n = 0; for (let i = 0; i < 7; i++) if (h.days[iso(addDays(ws, i))]) n++; return n; }
function streakOf(h){
  const today = new Date();
  if (h.target >= 7) {   // daily habit: consecutive days, today may still be pending
    let n = 0, d = h.days[iso(today)] ? today : addDays(today, -1);
    while (h.days[iso(d)]) { n++; d = addDays(d, -1); }
    return {n, unit:'day'};
  }
  let n = 0, ws = weekStart(today);
  if (weekCount(h, ws) >= h.target) n++;
  ws = addDays(ws, -7);
  while (weekCount(h, ws) >= h.target) { n++; ws = addDays(ws, -7); }
  return {n, unit:'week'};
}

function habitCard(h){
  const today = new Date(), ws = weekStart(today), first = addDays(ws, -7 * (WEEKS - 1));
  const s = streakOf(h), wk = weekCount(h, ws);
  let grid = '';
  for (let w = 0; w < WEEKS; w++) {
    grid += '<div class="hb-col">';
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d), k = iso(date), future = date > today;
      grid += `<button class="hb-day${h.days[k] ? ' on' : ''}${sameDay(date, today) ? ' today' : ''}" ${future ? 'disabled' : `data-day="${k}"`} title="${DAYS[d]} ${date.getDate()} ${MONTHS_S[date.getMonth()]}"></button>`;
    }
    grid += '</div>';
  }
  const done = !!h.days[iso(today)];
  return `<div class="hb-card" data-id="${h.id}" style="--c:${h.color}">
    <div class="hb-top"><b>${esc(h.name)}</b><span class="hb-goal">${h.target >= 7 ? 'Every day' : h.target + '× a week'}</span>
      <span class="tm-tools"><button data-hb="edit" aria-label="Edit">${TI.pen}</button></span></div>
    <div class="hb-stats"><div><b>${s.n}</b><small>${s.unit}${s.n === 1 ? '' : 's'} streak</small></div><div><b>${wk}/${Math.min(h.target, 7)}</b><small>this week</small></div></div>
    <div class="hb-grid"><div class="hb-lbl">${DAYS_XS.map(x => `<span>${x}</span>`).join('')}</div>${grid}</div>
    <button class="btn hb-today${done ? ' on' : ''}" data-hb="today">${done ? tdIcon.check + 'Done today' : 'Mark today'}</button>
  </div>`;
}

MODS.habits = {
  render(){
    $('v-habits').innerHTML = `<div class="pg">
      <header class="pg-h"><div><h1>Habits</h1><p>Click any day to tick it · the last ${WEEKS} weeks, ${DAYS[0]} to ${DAYS[6]}</p></div>
        <button class="btn primary" data-hb="new">${TI.plus}New habit</button></header>
      <div class="hb-grid-wrap">${HB.list.map(habitCard).join('')}<button class="hb-card add" data-hb="new">${TI.plus}<span>New habit</span></button></div>
    </div>`;
  },
};

function toggleDay(h, k){ if (h.days[k]) delete h.days[k]; else h.days[k] = true; saveHabits(); }

$('v-habits').addEventListener('click', e => {
  const day = e.target.closest('[data-day]');
  const h = HB.list.find(x => x.id === e.target.closest('[data-id]')?.dataset.id);
  if (day && h) { toggleDay(h, day.dataset.day); return MODS.habits.render(); }
  const b = e.target.closest('[data-hb]'); if (!b) return;
  if (b.dataset.hb === 'new') return openHabitForm(null);
  if (b.dataset.hb === 'edit') return openHabitForm(h);
  if (b.dataset.hb === 'today') { toggleDay(h, todayISO()); MODS.habits.render(); }
});

function openHabitForm(h){
  const color = h ? h.color : PALETTE.find(p => !HB.list.some(x => x.color === p)) || PALETTE[0];
  openSheet(`<h2>${h ? 'Edit habit' : 'New habit'}</h2>
    <input type="text" name="name" class="title-in" placeholder="Name (e.g. Gym, Read, German)" maxlength="30" required value="${h ? esc(h.name) : ''}">
    <div class="field-lbl">How often</div>
    <div class="quick hb-target">${[1, 2, 3, 4, 5, 6, 7].map(n => `<label><input type="radio" name="target" value="${n}" ${(h ? h.target : 3) === n ? 'checked' : ''}><span>${n === 7 ? 'Every day' : n + '× week'}</span></label>`).join('')}</div>
    <div class="field-lbl">Colour</div>
    <div class="swatches">${PALETTE.map(p => `<label style="--c:${p}"><input type="radio" name="color" value="${p}" ${p === color ? 'checked' : ''}></label>`).join('')}</div>
    ${sheetActions(!!h)}`, f => {
      const v = {name:f.name.value.trim(), target:+f.target.value, color:f.color.value};
      if (h) Object.assign(h, v); else HB.list.push({id:uid('h'), days:{}, ...v});
      saveHabits(); MODS.habits.render();
    });
  $('mdForm').querySelector('[data-sheet=delete]')?.addEventListener('click', () => {
    const i = HB.list.indexOf(h); HB.list.splice(i, 1); saveHabits(); closeSheet(); MODS.habits.render();
    toast('Habit deleted', [['Undo', () => { HB.list.splice(i, 0, h); saveHabits(); MODS.habits.render(); }]]);
  });
}
