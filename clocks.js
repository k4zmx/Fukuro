// World clocks: your time first, add any city with +.
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CK = {
  list: store.get('clocks', [{id:'chome', tz:LOCAL_TZ, label:LOCAL_TZ.split('/').pop().replace(/_/g, ' ')}]),
  q: '', dragId: null,
};
const saveClocks = () => store.set('clocks', CK.list);

// tz → country, so searching "Japan" or "USA" finds the right cities
const COUNTRY = {
  'Africa/Algiers':'Algeria','Africa/Tunis':'Tunisia','Africa/Casablanca':'Morocco','Africa/Cairo':'Egypt','Africa/Lagos':'Nigeria','Africa/Johannesburg':'South Africa','Africa/Nairobi':'Kenya','Africa/Tripoli':'Libya','Africa/Dakar':'Senegal',
  'Europe/Paris':'France','Europe/London':'United Kingdom','Europe/Berlin':'Germany','Europe/Madrid':'Spain','Europe/Rome':'Italy','Europe/Amsterdam':'Netherlands','Europe/Brussels':'Belgium','Europe/Zurich':'Switzerland','Europe/Lisbon':'Portugal','Europe/Istanbul':'Turkey','Europe/Moscow':'Russia','Europe/Stockholm':'Sweden','Europe/Oslo':'Norway','Europe/Copenhagen':'Denmark','Europe/Helsinki':'Finland','Europe/Warsaw':'Poland','Europe/Vienna':'Austria','Europe/Athens':'Greece','Europe/Dublin':'Ireland','Europe/Prague':'Czechia','Europe/Kyiv':'Ukraine','Europe/Bucharest':'Romania',
  'America/New_York':'USA','America/Chicago':'USA','America/Denver':'USA','America/Los_Angeles':'USA','America/Phoenix':'USA','America/Anchorage':'USA','Pacific/Honolulu':'USA','America/Toronto':'Canada','America/Montreal':'Canada','America/Vancouver':'Canada','America/Mexico_City':'Mexico','America/Sao_Paulo':'Brazil','America/Argentina/Buenos_Aires':'Argentina','America/Bogota':'Colombia','America/Lima':'Peru','America/Santiago':'Chile',
  'Asia/Tokyo':'Japan','Asia/Seoul':'South Korea','Asia/Shanghai':'China','Asia/Hong_Kong':'Hong Kong','Asia/Singapore':'Singapore','Asia/Dubai':'UAE','Asia/Riyadh':'Saudi Arabia','Asia/Qatar':'Qatar','Asia/Kolkata':'India','Asia/Karachi':'Pakistan','Asia/Bangkok':'Thailand','Asia/Jakarta':'Indonesia','Asia/Manila':'Philippines','Asia/Kuala_Lumpur':'Malaysia','Asia/Tehran':'Iran','Asia/Baghdad':'Iraq','Asia/Jerusalem':'Israel','Asia/Beirut':'Lebanon','Asia/Amman':'Jordan','Asia/Taipei':'Taiwan','Asia/Ho_Chi_Minh':'Vietnam','Asia/Kuwait':'Kuwait',
  'Australia/Sydney':'Australia','Australia/Melbourne':'Australia','Australia/Perth':'Australia','Pacific/Auckland':'New Zealand',
};
const cityOf = tz => tz.split('/').pop().replace(/_/g, ' ');
const regionOf = tz => COUNTRY[tz] || tz.split('/')[0].replace('America', 'Americas');

function tzOffset(tz, d = new Date()){
  const v = new Intl.DateTimeFormat('en-US', {timeZone:tz, timeZoneName:'longOffset'}).formatToParts(d).find(p => p.type === 'timeZoneName').value;
  const m = v.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
}
const tzParts = (tz, d) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:tz, hour:'2-digit', minute:'2-digit', second:'2-digit', weekday:'short', day:'numeric', month:'short', hourCycle:'h23'}).formatToParts(d).map(p => [p.type, p.value]));
const tzDate = (tz, d) => new Intl.DateTimeFormat('en-CA', {timeZone:tz}).format(d);
const gmt = off => `GMT${off < 0 ? '−' : '+'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ':' + pad(Math.abs(off) % 60) : ''}`;

function clockInfo(c, now = new Date()){
  const p = tzParts(c.tz, now), off = tzOffset(c.tz, now), diff = off - tzOffset(LOCAL_TZ, now);
  const day = tzDate(c.tz, now), here = tzDate(LOCAL_TZ, now);
  const h = Math.abs(diff) / 60;
  const rel = diff === 0 ? (c.tz === LOCAL_TZ ? 'Your time' : 'Same time') : `${diff > 0 ? '+' : '−'}${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  const when = day > here ? ' · tomorrow' : day < here ? ' · yesterday' : '';
  const hour = +p.hour;
  return {hm:`${p.hour}:${p.minute}`, sec:p.second, date:`${p.weekday} ${p.day} ${p.month}`, rel:rel + when, night:hour < 6 || hour >= 19, zone:`${regionOf(c.tz)} · ${gmt(off)}`};
}

const CI = {
  sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>', 16),
  moon:svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', 16),
  x:svg('<path d="M6 6l12 12M18 6 6 18"/>', 14), plus:svg('<path d="M12 5v14M5 12h14"/>', 22),
};

function clockCard(c){
  const i = clockInfo(c);
  return `<div class="ck-card${i.night ? ' night' : ''}" data-id="${c.id}" draggable="true">
    <div class="ck-top"><span class="ck-ic">${i.night ? CI.moon : CI.sun}</span><b class="ck-name" title="Double-click to rename">${esc(c.label)}</b>
      ${CK.list.length > 1 ? `<button class="ck-x" data-ck="del" aria-label="Remove">${CI.x}</button>` : ''}</div>
    <div class="ck-time"><span class="hm">${i.hm}</span><span class="sec">${i.sec}</span></div>
    <div class="ck-meta"><span class="date">${i.date}</span><span class="rel">${i.rel}</span></div>
    <div class="ck-zone">${esc(i.zone)}</div>
  </div>`;
}

MODS.clocks = {
  render(){
    $('v-clocks').innerHTML = `<div class="pg">
      <header class="pg-h"><div><h1>Clocks</h1><p>Drag to reorder · double-click a name to rename</p></div>
        <button class="btn primary" data-ck="add">${svg('<path d="M12 5v14M5 12h14"/>', 16)}Add city</button></header>
      <div class="ck-grid">${CK.list.map(clockCard).join('')}<button class="ck-card add" data-ck="add">${CI.plus}<span>Add city</span></button></div>
    </div>`;
  },
  tick(){
    document.querySelectorAll('#v-clocks .ck-card[data-id]').forEach(el => {
      const c = CK.list.find(x => x.id === el.dataset.id); if (!c) return;
      const i = clockInfo(c);
      el.querySelector('.hm').textContent = i.hm; el.querySelector('.sec').textContent = i.sec;
      el.querySelector('.date').textContent = i.date; el.querySelector('.rel').textContent = i.rel;
      if (el.classList.contains('night') !== i.night) MODS.clocks.render();
    });
  },
};
setInterval(() => { if (window.VIEW === 'clocks') MODS.clocks.tick(); }, 1000);

$('v-clocks').addEventListener('click', e => {
  const b = e.target.closest('[data-ck]'); if (!b) return;
  if (b.dataset.ck === 'add') return openCityPicker();
  if (b.dataset.ck === 'del') {
    const id = b.closest('[data-id]').dataset.id, i = CK.list.findIndex(c => c.id === id), [gone] = CK.list.splice(i, 1);
    saveClocks(); MODS.clocks.render();
    toast(`${esc(gone.label)} removed`, [['Undo', () => { CK.list.splice(i, 0, gone); saveClocks(); MODS.clocks.render(); }]]);
  }
});

// rename in place
$('v-clocks').addEventListener('dblclick', e => {
  const n = e.target.closest('.ck-name'); if (!n) return;
  const c = CK.list.find(x => x.id === n.closest('[data-id]').dataset.id);
  n.outerHTML = `<input class="ck-name-in" value="${esc(c.label)}" maxlength="30">`;
  const inp = $('v-clocks').querySelector('.ck-name-in');
  inp.focus(); inp.select();
  const done = ok => { if (ok && inp.value.trim()) { c.label = inp.value.trim(); saveClocks(); } MODS.clocks.render(); };
  inp.addEventListener('keydown', k => { if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
  inp.addEventListener('blur', () => done(true));
});

// drag to reorder
$('v-clocks').addEventListener('dragstart', e => { const c = e.target.closest('.ck-card[data-id]'); if (c) { CK.dragId = c.dataset.id; c.classList.add('drag'); } });
$('v-clocks').addEventListener('dragend', () => { CK.dragId = null; MODS.clocks.render(); });
$('v-clocks').addEventListener('dragover', e => {
  const over = e.target.closest('.ck-card[data-id]'); if (!CK.dragId || !over) return;
  e.preventDefault();
  if (over.dataset.id === CK.dragId) return;
  const from = CK.list.findIndex(c => c.id === CK.dragId), to = CK.list.findIndex(c => c.id === over.dataset.id);
  CK.list.splice(to, 0, CK.list.splice(from, 1)[0]); saveClocks();
  const grid = over.parentElement, dragEl = grid.querySelector(`[data-id="${CK.dragId}"]`);
  grid.insertBefore(dragEl, from < to ? over.nextSibling : over);
});

/* ---------- city picker ---------- */
let ALL_TZ;
function openCityPicker(){
  ALL_TZ ||= (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : Object.keys(COUNTRY)).filter(tz => tz.includes('/') && !tz.startsWith('Etc/'));
  CK.q = '';
  $('ckSheet').innerHTML = `<h2>Add a city</h2>
    <input type="text" class="title-in" id="ckSearch" placeholder="Search a city or country (e.g. Tokyo, Canada)" autocomplete="off">
    <div class="ck-results" id="ckResults"></div>
    <div class="actions"><span class="sp"></span><button type="button" class="btn" data-ckp="cancel">Close</button></div>`;
  renderResults();
  $('ckModal').classList.add('show');
  setTimeout(() => $('ckSearch').focus(), 30);
}
function renderResults(){
  const q = CK.q.toLowerCase().trim(), now = new Date();
  const list = ALL_TZ.filter(tz => !q || (cityOf(tz) + ' ' + regionOf(tz) + ' ' + tz).toLowerCase().includes(q))
    .sort((a, b) => (COUNTRY[b] ? 1 : 0) - (COUNTRY[a] ? 1 : 0) || cityOf(a).localeCompare(cityOf(b))).slice(0, 60);
  $('ckResults').innerHTML = list.map(tz => {
    const i = clockInfo({tz}, now), have = CK.list.some(c => c.tz === tz);
    return `<button type="button" class="ck-res${have ? ' have' : ''}" data-tz="${tz}" ${have ? 'disabled' : ''}>
      <span><b>${esc(cityOf(tz))}</b><small>${esc(i.zone)}</small></span><span class="t">${i.hm}<small>${have ? 'Added' : i.rel}</small></span></button>`;
  }).join('') || '<p class="empty">No city found</p>';
}
const closeCityPicker = () => $('ckModal').classList.remove('show');
$('ckSheet').addEventListener('input', e => { if (e.target.id === 'ckSearch') { CK.q = e.target.value; renderResults(); } });
$('ckSheet').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('ckResults').querySelector('.ck-res:not(.have)')?.click(); }
});
$('ckSheet').addEventListener('click', e => {
  if (e.target.closest('[data-ckp=cancel]')) return closeCityPicker();
  const r = e.target.closest('.ck-res'); if (!r || r.disabled) return;
  CK.list.push({id:uid('c'), tz:r.dataset.tz, label:cityOf(r.dataset.tz)});
  saveClocks(); closeCityPicker(); MODS.clocks.render();
  toast(`${esc(cityOf(r.dataset.tz))} added`);
});
$('ckModal').addEventListener('pointerdown', e => { if (e.target === $('ckModal')) closeCityPicker(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCityPicker(); });
