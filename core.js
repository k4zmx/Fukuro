// Shared by every module (loaded first).
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// desktop app: preload provides a file-backed storage with the same API
const LS = window.deskStorage || localStorage;
const store = {
  get(k, d){ try { const v = LS.getItem('jk.'+k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ LS.setItem('jk.'+k, JSON.stringify(v)); },
};
// installs from before the setup screen were built around a Saturday week
const LEGACY = LS.getItem('jk.setup') == null && LS.getItem('jk.cfg') != null;
const localWeekStart = () => { try { const l = new Intl.Locale(navigator.language), w = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo; return w.firstDay % 7; } catch { return 1; } };
// app-wide preferences (synced with the data file); per-PC options live in the desktop settings
const CFG = Object.assign({
  planFrom: 480, planTo: 1320, minFree: 30,                       // free-time window and smallest useful gap
  remOn: true, remLead: 15, remWork: false, remDigest: '08:30',    // reminders
  weekStart: LEGACY ? 6 : localWeekStart(),                        // 0 Sunday, 1 Monday, 6 Saturday
  currency: '', budget: 0,                                         // budget
  focusGoal: 120,                                                  // minutes of focus per day
  weather: true, place: '', lat: null, lon: null,                  // overview sky + weather
  startPage: 'last', sound: true, motion: true,                    // general
  ovHide: [], ovOrder: 'time', ovSay: true, ovSuggest: true,       // overview
  missTodos: false, calTodos: true, snap: 5,                      // calendar & to-dos
  remExam: true,                                                   // exam warnings
  attAsk: true,                                                    // "did you go?" when a class ends
  vdAuto: true,                                                    // videos: watched near the end
  recAuto: true, limWarn: true, planFill: true,                    // budget automation
}, store.get('cfg', {}));
const saveCfg = () => store.set('cfg', CFG);
if (LEGACY) { saveCfg(); store.set('setup', 1); }
// day 0 is the first column of the week
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS = DAY_NAMES.map((_, i) => DAY_NAMES[(CFG.weekStart + i) % 7]);
const DAYS_XS = DAYS.map(d => d[0]);
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const toMin = s => { const [h, m] = s.split(':').map(Number); return h*60 + m; };
const fmt = m => m >= 1440 ? '24:00' : `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const snap = m => Math.round(m / SNAP) * SNAP;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const dayIndex = d => (d.getDay() + 7 - CFG.weekStart) % 7;
const weekStart = date => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); return addDays(d, -dayIndex(d)); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const overlaps = (a, b) => a.s < b.e && b.s < a.e;
const daysBetween = (a, b) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
const shortDate = d => `${DAYS[dayIndex(d)].slice(0, 3)} ${d.getDate()} ${MONTHS_S[d.getMonth()]}`;

function download(name, text, type){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- toast ---------- */
function toast(msg, actions = []){
  const t = $('toast');
  t.innerHTML = `<span>${msg}</span>`;
  actions.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { fn(); t.classList.remove('show'); };
    t.appendChild(b);
  });
  t.classList.add('show');
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => t.classList.remove('show'), actions.length ? 7000 : 2200);
}

