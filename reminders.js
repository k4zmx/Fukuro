// Reminders: Windows notifications before classes and your events, a morning summary, and exam warnings.
const REM = {sent: store.get('remSent', {})};
const markSent = k => { REM.sent[k] = Date.now(); store.set('remSent', REM.sent); };

function remind(title, body, page){
  chime(); desk.flash();
  toast(`${esc(title)} · ${esc(body)}`);
  try {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, {body, icon:'build/icon.png', silent:true});
    n.onclick = () => { DESK ? desk.show() : window.focus(); if (page) go(page); };
  } catch {}
}

function digestText(now){
  const list = weekEvents(weekStart(now)).filter(e => e.d === dayIndex(now) && !e.cancelled && !e.allDay).sort((a, b) => a.s - b.s);
  const uni = list.filter(e => e.kind === 'uni' && !e.clash), job = list.filter(e => e.kind === 'job'), mine = list.filter(e => e.kind === 'perso');
  const due = TD.list.filter(t => !t.done && t.due && t.due <= iso(now)), soon = upcomingDL(3).filter(x => dlDays(x) <= 7);
  const parts = [];
  if (uni.length) parts.push(`${uni.length} class${uni.length > 1 ? 'es' : ''}, first ${uni[0].title} ${typeName(uni[0].t)} at ${fmt(uni[0].s)}${uni[0].room ? ' (' + uni[0].room + ')' : ''}`);
  if (job.length) parts.push(`work ${job.map(j => `${fmt(j.s)}–${fmt(j.e)}`).join(' and ')}`);
  if (mine.length) parts.push(mine.slice(0, 2).map(e => `${e.title} at ${fmt(e.s)}`).join(', '));
  if (due.length) parts.push(`${due.length} to-do${due.length > 1 ? 's' : ''} due`);
  soon.forEach(x => parts.push(`${DL_KIND[x.kind].label.toLowerCase()} ${dlName(x)} ${dlIn(x)}`));
  pendingIncome().filter(p => p.late > 0).slice(0, 1).forEach(p => parts.push(`${(p.r.note || 'salary').toLowerCase()} ${p.late} day${p.late > 1 ? 's' : ''} late`));
  return parts.length ? parts.join(' · ') : 'Nothing planned. A good day to get ahead.';
}

function checkReminders(){
  if (!CFG.remOn) return;
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), k = iso(now);
  // morning summary: once a day, at the chosen time (or later that morning if the app was closed)
  if (CFG.remDigest) {
    const at = toMin(CFG.remDigest);
    if (nowM >= at && nowM < at + 180 && !REM.sent['digest:' + k]) { markSent('digest:' + k); remind(`${greet(now.getHours())} · ${shortDate(now)}`, digestText(now), 'overview'); }
  }
  // N minutes before each class / event (only if that moment just passed, so opening the app late doesn't replay old ones)
  const lead = CFG.remLead;
  weekEvents(weekStart(now)).forEach(e => {
    if (e.d !== dayIndex(now) || e.cancelled || e.allDay || e.clash) return;
    if (e.kind === 'job' && !CFG.remWork) return;
    const key = `ev:${k}:${e.id}:${e.s}`, at = e.s - lead;
    if (nowM < at || nowM > at + 4 || nowM >= e.s || REM.sent[key]) return;
    markSent(key);
    const what = e.kind === 'uni' ? `${e.title} ${typeName(e.t)}` : e.kind === 'job' ? 'Work' : e.title;
    const where = e.kind === 'uni' ? [e.room && 'room ' + e.room, e.prof].filter(Boolean).join(' · ') : e.detail || e.note || '';
    remind(`${what} in ${e.s - nowM} min`, `${fmt(e.s)} – ${fmt(e.e)}${where ? ' · ' + where : ''}`, 'calendar');
  });
  // exams: the evening before (18:00) and an hour before when a time is set
  if (CFG.remExam !== false) DL.list.forEach(x => {
    if (x.done) return;
    const days = dlDays(x);
    if (days === 1 && nowM >= 1080 && !REM.sent['dl1:' + x.id]) { markSent('dl1:' + x.id); remind(`${DL_KIND[x.kind].label} tomorrow · ${dlName(x)}`, dlWhen(x), 'calendar'); }
    if (days === 0 && x.time && nowM >= toMin(x.time) - 60 && nowM < toMin(x.time) && !REM.sent['dl0:' + x.id]) { markSent('dl0:' + x.id); remind(`${DL_KIND[x.kind].label} in ${toMin(x.time) - nowM} min · ${dlName(x)}`, dlWhen(x), 'calendar'); }
  });
}
// forget what was sent more than 3 days ago
{
  const cut = Date.now() - 3 * 864e5;
  Object.keys(REM.sent).forEach(k => { if (REM.sent[k] < cut) delete REM.sent[k]; });
  store.set('remSent', REM.sent);
}
setInterval(checkReminders, 30000);
addEventListener('DOMContentLoaded', () => setTimeout(checkReminders, 4000));
