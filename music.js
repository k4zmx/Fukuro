// Music: search YouTube, play the audio in a bar that stays while you use the app, like songs.
// Searching and streaming go through yt-dlp in main.js, which fetches itself the first time.
const MU = {liked:store.get('muLiked', []), q:'', list:[], tab:'search', busy:'', err:'', queue:[], qi:-1, urls:{}, loading:false, seeking:false};
const muAudio = new Audio();
muAudio.volume = store.get('muVol', 0.8);
const saveMu = () => store.set('muLiked', MU.liked);
const muThumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const muCur = () => MU.queue[MU.qi];
const muIsLiked = id => MU.liked.some(t => t.id === id);
const muTrack = t => ({id:t.id, title:t.title, artist:t.artist, dur:t.dur});
const MUI = {
  play:svg('<path d="M7.5 5v14l11-7z" fill="currentColor"/>', 18), pause:svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor"/>', 18),
  next:svg('<path d="M6 5.5v13l9.5-6.5z" fill="currentColor"/><path d="M18.5 5.5v13"/>', 16), prev:svg('<path d="M18 5.5v13l-9.5-6.5z" fill="currentColor"/><path d="M5.5 5.5v13"/>', 16),
  heart:svg('<path d="M12 19.5s-7.5-4.4-7.5-9.8A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.6c0 5.4-7.5 9.8-7.5 9.8z"/>', 16),
  queue:svg('<path d="M4 7h11M4 12h11M4 17h7M18 14v6M15 17h6"/>', 16),
  note:svg('<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>', 16),
  vol:svg('<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', 16), x:svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 15),
};

async function muSearch(q){
  q = q.trim(); if (!q || !DESK) return;
  MU.q = q; MU.tab = 'search'; MU.err = '';
  MU.busy = (await desk.music.state()).ready ? 'Searching…' : 'Getting the music engine, about 18 MB. Only this once…';
  MODS.music.render();
  const r = await desk.music.search(q);
  MU.busy = '';
  if (r.ok) { MU.list = r.list; if (r.list[0]) muUrl(r.list[0].id); } else MU.err = `Search failed: ${r.error}`;
  if (window.VIEW === 'music') MODS.music.render();
}
const muTabList = () => MU.tab === 'liked' ? MU.liked : MU.list;

/* ---------- playback ---------- */
// a stream link takes yt-dlp ~4 s, so it is asked once and shared: hover, the top result and the next song get theirs early
function muUrl(id, fresh){
  const u = MU.urls[id];
  if (u && !fresh && Date.now() - u.at < 3 * 3600e3) return u.p;
  const p = desk.music.url(id).then(r => { if (!r.ok) delete MU.urls[id]; return r; });
  MU.urls[id] = {p, at:Date.now()};
  return p;
}
async function muPlay(list, i){ MU.queue = list.map(muTrack); MU.qi = i; await muLoad(); }
async function muLoad(retry){
  const t = muCur(); if (!t) return;
  MU.loading = true; muAudio.pause(); muRefresh();
  const r = await muUrl(t.id, retry);
  if (muCur() !== t) return;   // skipped while the link was coming
  if (!r.ok) { MU.loading = false; muRefresh(); return toast(`Can't play ${esc(t.title)} · ${esc(r.error)}`); }
  MU.retried = !!retry;
  muAudio.src = r.url; muAudio.play().catch(() => {});
  MU.loading = false; muMeta(t); muRefresh(); muPrefetch();
}
// the next song's link is fetched ahead, so it starts at once
function muPrefetch(){
  const n = MU.queue[MU.qi + 1];
  if (n) muUrl(n.id);
}
function muNext(){ if (MU.qi < MU.queue.length - 1) { MU.qi++; muLoad(); } else { muAudio.pause(); muAudio.currentTime = 0; muRefresh(); } }
function muPrev(){ if (muAudio.currentTime > 3 || MU.qi === 0) muAudio.currentTime = 0; else { MU.qi--; muLoad(); } }
function muToggle(){ if (!muCur() || MU.loading) return; if (muAudio.paused) muAudio.play().catch(() => {}); else muAudio.pause(); }
function muStop(){ muAudio.pause(); muAudio.removeAttribute('src'); muAudio.load(); MU.queue = []; MU.qi = -1; muRefresh(); }
function muLike(t){
  const i = MU.liked.findIndex(x => x.id === t.id);
  if (i >= 0) MU.liked.splice(i, 1); else MU.liked.unshift(muTrack(t));
  saveMu(); muRefresh();
}
function muMeta(t){
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({title:t.title, artist:t.artist, artwork:[{src:muThumb(t.id), sizes:'320x180', type:'image/jpeg'}]});
}
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => muAudio.play());
  navigator.mediaSession.setActionHandler('pause', () => muAudio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', muNext);
  navigator.mediaSession.setActionHandler('previoustrack', muPrev);
}
muAudio.addEventListener('ended', muNext);
muAudio.addEventListener('play', () => muRefresh());
muAudio.addEventListener('pause', () => muRefresh());
muAudio.addEventListener('timeupdate', () => muTime());
muAudio.addEventListener('loadedmetadata', () => muTime());
// stream links expire after a few hours: fetch a fresh one once
muAudio.addEventListener('error', () => { const t = muCur(); if (t && !MU.retried) muLoad(true); else if (t) toast(`Can't play ${esc(t.title)}`); });

if (DESK && desk.music) desk.music.onEngine(p => {
  MU.busy = `Getting the music engine, about 18 MB. Only this once… ${p}%`;
  const b = document.querySelector('.mu-busy'); if (b) b.lastChild.textContent = MU.busy;
});

/* ---------- the bar at the bottom ---------- */
const muBarEl = document.createElement('div');
muBarEl.id = 'muBar'; muBarEl.className = 'mu-bar';
document.body.appendChild(muBarEl);
function muBar(){
  const t = muCur();
  document.body.classList.toggle('mu-on', !!t);
  if (!t) { muBarEl.innerHTML = ''; return; }
  const playing = !muAudio.paused;
  muBarEl.innerHTML = `<span class="mu-bth" style="background-image:url(${muThumb(t.id)})"></span>
    <div class="mu-btx"><b title="${esc(t.title)}">${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
    <div class="mu-ctl"><button data-mb="prev" title="Previous">${MUI.prev}</button>
      <button data-mb="toggle" class="mu-pp${MU.loading ? ' load' : ''}" title="${playing ? 'Pause' : 'Play'}">${MU.loading ? '<i></i>' : playing ? MUI.pause : MUI.play}</button>
      <button data-mb="next" title="Next"${MU.qi < MU.queue.length - 1 ? '' : ' disabled'}>${MUI.next}</button></div>
    <div class="mu-seek"><span id="muT">0:00</span><input type="range" id="muSeek" min="0" max="1000" value="0" aria-label="Seek"><span id="muD">${vdTime(t.dur || 0)}</span></div>
    <button data-mb="like" class="mu-i${muIsLiked(t.id) ? ' on' : ''}" title="Like">${MUI.heart}</button>
    <label class="mu-vol" title="Volume">${MUI.vol}<input type="range" id="muVol" min="0" max="100" value="${Math.round(muAudio.volume * 100)}" style="--p:${Math.round(muAudio.volume * 100)}%"></label>
    <button data-mb="open" class="mu-i" title="Music · queue ${MU.qi + 1} of ${MU.queue.length}">${MUI.note}</button>
    <button data-mb="close" class="mu-i" title="Stop">${MUI.x}</button>`;
  muTime();
}
function muTime(){
  const s = $('muSeek'); if (!s || MU.seeking) return;
  const d = muAudio.duration || muCur()?.dur || 0;
  s.value = d ? Math.round(muAudio.currentTime / d * 1000) : 0;
  s.style.setProperty('--p', s.value / 10 + '%');
  $('muT').textContent = vdTime(muAudio.currentTime || 0);
  if (muAudio.duration) $('muD').textContent = vdTime(muAudio.duration);
}
function muRefresh(){ muBar(); if (window.VIEW === 'music') MODS.music.render(true); }
muBarEl.addEventListener('click', e => {
  const b = e.target.closest('[data-mb]'); if (!b) return;
  switch (b.dataset.mb) {
    case 'prev': muPrev(); break;
    case 'next': muNext(); break;
    case 'toggle': muToggle(); break;
    case 'like': muLike(muCur()); break;
    case 'open': go('music'); break;
    case 'close': muStop(); break;
  }
});
muBarEl.addEventListener('input', e => {
  if (e.target.id === 'muSeek') { MU.seeking = true; e.target.style.setProperty('--p', e.target.value / 10 + '%'); $('muT').textContent = vdTime((muAudio.duration || 0) * e.target.value / 1000); }
  if (e.target.id === 'muVol') { muAudio.volume = e.target.value / 100; e.target.style.setProperty('--p', e.target.value + '%'); store.set('muVol', muAudio.volume); }
});
muBarEl.addEventListener('change', e => {
  if (e.target.id === 'muSeek') { if (muAudio.duration) muAudio.currentTime = muAudio.duration * e.target.value / 1000; MU.seeking = false; }
});

/* ---------- page ---------- */
function muRowHTML(t, i){
  const cur = muCur()?.id === t.id, playing = cur && !muAudio.paused;
  return `<li class="mu-row${cur ? ' on' : ''}" data-mi="${i}">
    <button class="mu-th" data-mu="play" style="background-image:url(${muThumb(t.id)})" aria-label="Play"><span>${cur && MU.loading ? '<i class="mu-spin"></i>' : playing ? '<i class="mu-eq"><b></b><b></b><b></b></i>' : MUI.play}</span></button>
    <button class="mu-tx" data-mu="play"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></button>
    <span class="mu-dur">${vdTime(t.dur || 0)}</span>
    <button class="mu-i${muIsLiked(t.id) ? ' on' : ''}" data-mu="like" title="${muIsLiked(t.id) ? 'Unlike' : 'Like'}">${MUI.heart}</button>
    <button class="mu-i" data-mu="next" title="Play next">${MUI.queue}</button>
  </li>`;
}
MODS.music = {
  render(soft){
    // play / pause / like: only the rows change, so the search box and scroll stay put
    if (soft && $('muList')) { $('muList').innerHTML = muTabList().map(muRowHTML).join(''); return; }
    const list = muTabList();
    const empty = MU.tab === 'liked' ? 'Songs you like show up here. Tap the heart on any song.' : 'Search for a song, an artist, a mix or a podcast.';
    $('v-music').innerHTML = `<div class="pg mu">
      <header class="pg-h"><div><h1>Music</h1><p>Anything on YouTube · plays here while you use the app</p></div></header>
      ${DESK ? `<form class="td-add" id="muForm"><input name="q" placeholder="Search a song, artist, album, mix…" value="${esc(MU.q)}" autocomplete="off"><button class="btn primary">Search</button></form>
      <div class="chipbar">${[['search', 'Results', MU.list.length], ['liked', 'Liked', MU.liked.length]].map(([k, l, c]) => `<button class="${MU.tab === k ? 'on' : ''}" data-mut="${k}">${l}${c ? `<small>${c}</small>` : ''}</button>`).join('')}
        ${list.length > 1 ? `<span class="sp"></span><button data-mu="all">${MUI.play}Play all</button>` : ''}</div>
      ${MU.busy && MU.tab === 'search' ? `<p class="mu-busy"><i class="mu-spin"></i>${esc(MU.busy)}</p>` : MU.err && MU.tab === 'search' ? `<p class="mu-err">${esc(MU.err)}</p>` : ''}
      ${list.length ? `<ul class="mu-list" id="muList">${list.map(muRowHTML).join('')}</ul>` : MU.busy && MU.tab === 'search' ? '' : `<p class="empty-state">${empty}</p>`}`
      : '<p class="empty-state">Music works in the desktop app.</p>'}
    </div>`;
  },
};
let muHover = 0;
$('v-music').addEventListener('pointerover', e => {
  const row = e.target.closest('.mu-row'); clearTimeout(muHover);
  if (!row) return;
  const t = muTabList()[+row.dataset.mi];
  if (t && !MU.urls[t.id]) muHover = setTimeout(() => muUrl(t.id), 350);
});
$('v-music').addEventListener('submit', e => { if (e.target.id !== 'muForm') return; e.preventDefault(); muSearch(e.target.elements.q.value); });
$('v-music').addEventListener('click', e => {
  const tb = e.target.closest('[data-mut]'); if (tb) { MU.tab = tb.dataset.mut; return MODS.music.render(); }
  const b = e.target.closest('[data-mu]'); if (!b) return;
  const list = muTabList(), i = +b.closest('[data-mi]')?.dataset.mi, t = list[i];
  switch (b.dataset.mu) {
    case 'all': muPlay(list, 0); break;
    case 'play': if (muCur()?.id === t.id) muToggle(); else muPlay(list, i); break;
    case 'like': muLike(t); break;
    case 'next':
      if (!muCur()) muPlay([t], 0);
      else { MU.queue.splice(MU.qi + 1, 0, muTrack(t)); muPrefetch(); muBar(); toast(`Plays next · ${esc(t.title)}`); }
      break;
  }
});
