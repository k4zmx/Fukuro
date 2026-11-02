// Videos: your YouTube library. Paste a link, title and thumbnail fill in, then tag and filter. Plays inside the app and resumes where you stopped.
const VD = {list: store.get('videos', []), filter: 'all', tag: '', q: ''};
const saveVideos = () => store.set('videos', VD.list);
const ytId = url => (url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1];
const thumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const VI = {eye:svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>', 15), tag:svg('<path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5-8 8z"/><circle cx="8" cy="8" r="1.4"/>', 15)};

async function fetchMeta(v){
  let m = null;
  if (DESK) m = await desk.ytMeta(v.url);
  else try { const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(v.url)); if (r.ok) { const j = await r.json(); m = {title:j.title, author:j.author_name}; } } catch {}
  if (m) { Object.assign(v, m); saveVideos(); if (window.VIEW === 'videos') MODS.videos.render(); }
}

MODS.videos = {
  add(url){
    const id = ytId(url);
    if (!id) return toast('That is not a YouTube link');
    if (VD.list.some(v => v.vid === id)) return toast('Already in your library');
    const v = {id:uid('v'), url:`https://www.youtube.com/watch?v=${id}`, vid:id, title:'Loading title…', author:'', tags:VD.tag ? [VD.tag] : [], watched:false, added:Date.now()};
    VD.list.unshift(v); saveVideos();
    if (window.VIEW === 'videos') MODS.videos.render();
    toast('Video saved');
    fetchMeta(v);
  },
  render(keepFocus){
    const tags = [...new Set(VD.list.flatMap(v => v.tags))].sort(), q = VD.q.toLowerCase();
    const shown = VD.list.filter(v => (VD.filter === 'all' || (VD.filter === 'todo' ? !v.watched : v.watched))
      && (!VD.tag || v.tags.includes(VD.tag)) && (!q || (v.title + ' ' + v.author + ' ' + v.tags.join(' ')).toLowerCase().includes(q)));
    const n = k => VD.list.filter(v => k === 'all' || (k === 'todo' ? !v.watched : v.watched)).length;
    $('v-videos').innerHTML = `<div class="pg">
      <header class="pg-h"><div><h1>Videos</h1><p>Paste a YouTube link · ${n('todo')} to watch</p></div></header>
      <form class="td-add" id="vdAdd"><input name="url" placeholder="Paste a YouTube link and press Enter" autocomplete="off"><button class="btn primary">Save</button></form>
      <div class="sn-bar"><input class="search" id="vdQ" placeholder="Search title, channel, tag" value="${esc(VD.q)}" autocomplete="off">
        <div class="chipbar inline">${[['all', 'All'], ['todo', 'To watch'], ['seen', 'Watched']].map(([k, l]) => `<button class="${VD.filter === k ? 'on' : ''}" data-vdf="${k}">${l}<small>${n(k)}</small></button>`).join('')}</div></div>
      ${tags.length ? `<div class="chipbar tags"><button class="${VD.tag ? '' : 'on'}" data-vdt="">All tags</button>${tags.map(t => `<button class="${VD.tag === t ? 'on' : ''}" data-vdt="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="vd-grid">${shown.map(v => `<div class="vd-card${v.watched ? ' seen' : ''}" data-id="${v.id}">
          <button class="vd-thumb" data-vd="open" style="background-image:url(${thumb(v.vid)})" aria-label="Play"><span class="vd-play">${svg('<path d="M8 5.5v13l10.5-6.5z"/>', 20)}</span>${resumeAt(v) ? `<span class="vd-prog" style="--p:${(v.pos / v.dur).toFixed(3)}"></span>` : ''}</button>
          <div class="vd-body"><b data-vd="open">${esc(v.title)}</b><small>${esc(v.author || '')}${v.author ? ' · ' : ''}${resumeAt(v) ? `stopped at ${vdTime(v.pos)} of ${vdTime(v.dur)}` : ago(v.added)}</small>
            ${v.tags.length ? `<div class="vd-tags">${v.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}</div>
          <div class="vd-acts"><button data-vd="seen" class="${v.watched ? 'on' : ''}" title="${v.watched ? 'Mark as to watch' : 'Mark as watched'}">${VI.eye}</button>
            <button data-vd="tags" title="Tags">${VI.tag}</button><button data-vd="del" title="Delete">${TI.x}</button></div>
        </div>`).join('') || `<p class="empty-state">${VD.list.length ? 'No match.' : 'Your library is empty. Paste a link above, or use quick capture from anywhere.'}</p>`}</div>
    </div>`;
    if (keepFocus) { const i = $('vdQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  },
};

$('v-videos').addEventListener('submit', e => {
  if (e.target.id !== 'vdAdd') return;
  e.preventDefault();
  const url = e.target.elements.url.value.trim(); if (url) MODS.videos.add(url);
});
$('v-videos').addEventListener('input', e => { if (e.target.id === 'vdQ') { VD.q = e.target.value; MODS.videos.render(true); } });
$('v-videos').addEventListener('click', e => {
  const f = e.target.closest('[data-vdf]'); if (f) { VD.filter = f.dataset.vdf; return MODS.videos.render(); }
  const t = e.target.closest('[data-vdt]'); if (t) { VD.tag = t.dataset.vdt; return MODS.videos.render(); }
  const b = e.target.closest('[data-vd]'); if (!b) return;
  const v = VD.list.find(x => x.id === b.closest('[data-id]')?.dataset.id);
  switch (b.dataset.vd) {
    case 'open': openPlayer(v); break;
    case 'seen': v.watched = !v.watched; saveVideos(); MODS.videos.render(); break;
    case 'tags': openSheet(`<h2>Tags</h2><p class="field-note">${esc(v.title)}</p>
        <input type="text" name="tags" class="title-in" placeholder="docker, nextjs, chess" value="${esc(v.tags.join(', '))}">
        ${sheetActions(false)}`, fm => {
        v.tags = [...new Set(fm.tags.value.split(',').map(x => x.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))];
        saveVideos(); MODS.videos.render();
      }); break;
    case 'del': {
      const i = VD.list.indexOf(v); VD.list.splice(i, 1); saveVideos(); MODS.videos.render();
      toast('Video removed', [['Undo', () => { VD.list.splice(i, 0, v); saveVideos(); MODS.videos.render(); }]]);
    }
  }
});

/* ---------- player ---------- */
const PL = {v:null, tm:0};
const vdTime = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60); };
// worth resuming: started, and not in the last 20 seconds
const resumeAt = v => v.dur && v.pos > 10 && v.pos < v.dur - 20 ? Math.floor(v.pos) : 0;
const openExternal = v => DESK ? desk.openUrl(v.url) : window.open(v.url, '_blank');

async function openPlayer(v){
  await closePlayer();
  PL.v = v;
  const start = resumeAt(v), el = document.createElement('div');
  el.id = 'player'; el.className = 'pl';
  el.innerHTML = `<div class="pl-box">
    <div class="pl-frame"><iframe src="https://www.youtube-nocookie.com/embed/${v.vid}?autoplay=1&rel=0&start=${start}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
      <div class="pl-err" hidden><p></p><button class="btn primary" data-pl="ext">Open on YouTube</button></div></div>
    <div class="pl-bar"><div class="pl-t"><b>${esc(v.title)}</b><small>${esc(v.author || '')}${start ? `${v.author ? ' · ' : ''}resumed at ${vdTime(start)}` : ''}</small></div>
      <button class="btn${v.watched ? ' on' : ''}" data-pl="seen">${VI.eye}${v.watched ? 'Watched' : 'Mark watched'}</button>
      <button class="btn" data-pl="ext">Open on YouTube</button>
      <button class="btn icon" data-pl="close" aria-label="Close">${TI.x}</button></div>
  </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (DESK) PL.tm = setInterval(playerTick, 4000);
}
async function playerTick(){
  const v = PL.v, r = v && DESK ? await desk.ytProbe() : null;
  if (!r || PL.v !== v) return;
  if (r.err) {
    clearInterval(PL.tm);
    const box = $('player').querySelector('.pl-err');
    box.firstElementChild.textContent = `YouTube says: "${r.err}". Some videos only play on YouTube itself.`; box.hidden = false;
    return;
  }
  if (!r.d || Math.abs(r.t - (v.pos || 0)) < 1) return;
  v.pos = Math.round(r.t); v.dur = Math.round(r.d);
  if (CFG.vdAuto && !v.watched && r.t / r.d > 0.9) { v.watched = true; playerSeen(v); toast('Marked as watched'); }
  saveVideos();
}
const playerSeen = v => { const b = $('player')?.querySelector('[data-pl=seen]'); if (b) { b.classList.toggle('on', v.watched); b.innerHTML = VI.eye + (v.watched ? 'Watched' : 'Mark watched'); } };
async function closePlayer(){
  const el = $('player'); if (!el) return;
  clearInterval(PL.tm);
  await playerTick();
  PL.v = null; el.remove();
  if (window.VIEW === 'videos') MODS.videos.render();
}
document.addEventListener('click', e => {
  const pl = e.target.closest('#player'); if (!pl) return;
  const b = e.target.closest('[data-pl]');
  if (!b) { if (e.target === pl) closePlayer(); return; }
  const v = PL.v;
  if (b.dataset.pl === 'close') closePlayer();
  if (b.dataset.pl === 'ext') { closePlayer(); openExternal(v); }
  if (b.dataset.pl === 'seen') { v.watched = !v.watched; saveVideos(); playerSeen(v); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && PL.v) closePlayer(); });
if (DESK && desk.onEsc) desk.onEsc(() => { if (PL.v && document.activeElement?.tagName === 'IFRAME') closePlayer(); });
