// Dropdowns and date / month / time pickers in the app's own style. The native <select> and <input>
// stay underneath (hidden or still typeable), so forms, .value and change events keep working as before.
const UI = {pop:null, owner:null, kind:null, active:-1, view:null};
const UI_CHEV = svg('<path d="m6 9 6 6 6-6"/>', 14), UI_TICK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 14);
const UI_PREV = svg('<path d="m15 18-6-6 6-6"/>', 16), UI_NEXT = svg('<path d="m9 18 6-6-6-6"/>', 16);
const SEL_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const SEL_INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
const PICKED = 'input[type=date],input[type=month],input[type=time]';

/* ---------- selects ---------- */
function enhanceSelect(sel){
  if (sel.ddBtn || sel.multiple) return;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'dd-btn ' + sel.className;
  if (sel.title) btn.title = sel.title;
  sel.after(btn); sel.classList.add('dd-native'); sel.tabIndex = -1;
  sel.ddBtn = btn; btn.ddSel = sel;
  // code that sets .value / .selectedIndex directly also updates what you see
  Object.defineProperty(sel, 'value', {configurable:true, get(){ return SEL_VALUE.get.call(this); }, set(v){ SEL_VALUE.set.call(this, v); syncSelect(this); }});
  Object.defineProperty(sel, 'selectedIndex', {configurable:true, get(){ return SEL_INDEX.get.call(this); }, set(v){ SEL_INDEX.set.call(this, v); syncSelect(this); }});
  syncSelect(sel);
}
function syncSelect(sel){
  const b = sel.ddBtn; if (!b) return;
  const o = sel.options[sel.selectedIndex];
  b.innerHTML = `<span>${esc(o ? o.text : '')}</span>${UI_CHEV}`;
  b.disabled = sel.disabled;
}
function openSelect(sel){
  const opts = [...sel.options], many = opts.length > 12;
  UI.active = sel.selectedIndex;
  uiShow(sel.ddBtn, `${many ? '<input class="dd-q" placeholder="Search" autocomplete="off" spellcheck="false">' : ''}<div class="dd-items">${opts.map((o, i) =>
    `<button type="button" class="dd-opt${i === sel.selectedIndex ? ' on' : ''}" data-i="${i}"${o.disabled ? ' disabled' : ''}><span>${esc(o.text)}</span>${i === sel.selectedIndex ? UI_TICK : ''}</button>`).join('')}</div>`, 'select', sel, 'dd-list');
  markActive();
  if (many) setTimeout(() => UI.pop?.querySelector('.dd-q')?.focus(), 0);
}
function markActive(){
  const items = UI.pop?.querySelectorAll('.dd-opt'); if (!items) return;
  items.forEach(b => b.classList.toggle('act', +b.dataset.i === UI.active));
  scrollInList(UI.pop.querySelector('.dd-opt.act'), false);
}
function pickOption(i){
  const sel = UI.owner; if (!sel || sel.options[i]?.disabled) return;
  const changed = sel.selectedIndex !== i;
  sel.selectedIndex = i; uiClose(); sel.ddBtn.focus();
  if (changed) { sel.dispatchEvent(new Event('input', {bubbles:true})); sel.dispatchEvent(new Event('change', {bubbles:true})); }
}
// scroll only the list (scrollIntoView could move the page, which closes the popup)
function scrollInList(el, center){
  const box = el?.closest('.dd-items'); if (!box) return;
  const top = el.offsetTop - box.offsetTop, bottom = top + el.offsetHeight;
  if (center) box.scrollTop = top - box.clientHeight / 2 + el.offsetHeight / 2;
  else if (top < box.scrollTop) box.scrollTop = top; else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
}
const visibleOpts = () => [...UI.pop.querySelectorAll('.dd-opt:not([hidden]):not([disabled])')].map(b => +b.dataset.i);

/* ---------- date / month / time ---------- */
function setInput(inp, v){
  inp.value = v;
  inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true}));
}
function dateHTML(inp){
  const v = inp.value ? parseISO(inp.value) : null, view = UI.view, y = view.getFullYear(), m = view.getMonth();
  const start = weekStart(new Date(y, m, 1)), today = new Date();
  let days = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    days += `<button type="button" class="${d.getMonth() !== m ? 'out' : ''}${sameDay(d, today) ? ' td' : ''}${v && sameDay(d, v) ? ' on' : ''}" data-day="${iso(d)}">${d.getDate()}</button>`;
  }
  return `<div class="dp-h"><button type="button" data-nav="-1" aria-label="Previous month">${UI_PREV}</button><b>${MONTHS[m]} ${y}</b><button type="button" data-nav="1" aria-label="Next month">${UI_NEXT}</button></div>
    <div class="dp-g">${DAYS_XS.map(x => `<span>${x}</span>`).join('')}${days}</div>
    <div class="dp-f"><button type="button" data-day="${iso(today)}">Today</button>${inp.required ? '' : '<button type="button" data-day="">Clear</button>'}</div>`;
}
function monthHTML(inp){
  const y = UI.view.getFullYear(), cur = inp.value, now = todayISO().slice(0, 7);
  return `<div class="dp-h"><button type="button" data-nav="-12" aria-label="Previous year">${UI_PREV}</button><b>${y}</b><button type="button" data-nav="12" aria-label="Next year">${UI_NEXT}</button></div>
    <div class="dp-m">${MONTHS_S.map((n, i) => { const k = `${y}-${pad(i + 1)}`; return `<button type="button" class="${k === cur ? 'on' : ''}${k === now ? ' td' : ''}" data-day="${k}">${n}</button>`; }).join('')}</div>
    ${inp.required ? '' : '<div class="dp-f"><button type="button" data-day="">Clear</button></div>'}`;
}
function timeHTML(inp){
  const cur = inp.value ? toMin(inp.value) : null, list = [];
  for (let t = 0; t < 1440; t += 15) list.push(t);
  if (cur != null && cur % 15) list.push(cur), list.sort((a, b) => a - b);
  return `<div class="dd-items tp">${list.map(t => `<button type="button" class="dd-opt${t === cur ? ' on' : ''}" data-time="${fmt(t)}"><span>${fmt(t)}</span>${t === cur ? UI_TICK : ''}</button>`).join('')}</div>`;
}
function openPicker(inp){
  const kind = inp.type;
  if (kind === 'time') {
    uiShow(inp, timeHTML(inp), 'time', inp, 'dd-list tp-list');
    const cur = inp.value ? toMin(inp.value) : (new Date().getHours() * 60);
    const near = [...UI.pop.querySelectorAll('[data-time]')].reduce((a, b) => Math.abs(toMin(b.dataset.time) - cur) < Math.abs(toMin(a.dataset.time) - cur) ? b : a);
    near.classList.add('act'); scrollInList(near, true);
    return;
  }
  const v = inp.value ? (kind === 'month' ? parseISO(inp.value + '-01') : parseISO(inp.value)) : new Date();
  UI.view = new Date(v.getFullYear(), v.getMonth(), 1);
  uiShow(inp, kind === 'month' ? monthHTML(inp) : dateHTML(inp), kind, inp, 'dp');
}
const redrawPicker = () => { if (UI.kind === 'date') UI.pop.innerHTML = dateHTML(UI.owner); if (UI.kind === 'month') UI.pop.innerHTML = monthHTML(UI.owner); };

/* ---------- the popup itself ---------- */
function uiShow(anchor, html, kind, owner, cls){
  uiClose();
  const p = document.createElement('div');
  p.className = 'ui-pop ' + cls; p.innerHTML = html;
  document.body.appendChild(p);
  UI.pop = p; UI.owner = owner; UI.kind = kind; UI.anchor = anchor;
  anchor.classList.add('ui-open');
  uiPlace();
}
function uiPlace(){
  const p = UI.pop, r = UI.anchor.getBoundingClientRect();
  if (p.classList.contains('dd-list')) p.style.minWidth = Math.max(r.width, 140) + 'px';
  const h = p.offsetHeight, w = p.offsetWidth;
  const top = r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6;
  p.style.top = Math.max(8, Math.min(top, innerHeight - h - 8)) + 'px';
  p.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  p.classList.toggle('up', top < r.top);
}
function uiClose(){
  if (!UI.pop) return;
  UI.anchor?.classList.remove('ui-open');
  UI.pop.remove(); UI.pop = UI.owner = UI.kind = UI.anchor = null;
}

/* ---------- wiring ---------- */
const scanUI = root => { if (root.tagName === 'SELECT') enhanceSelect(root); else root.querySelectorAll?.('select').forEach(enhanceSelect); };
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scanUI(n)))).observe(document.body, {childList:true, subtree:true});
scanUI(document.body);

document.addEventListener('click', e => {
  const btn = e.target.closest('.dd-btn');
  if (btn) { e.preventDefault(); return UI.owner === btn.ddSel ? uiClose() : openSelect(btn.ddSel); }
  const inp = e.target.closest(PICKED);
  if (inp && !inp.disabled && !inp.readOnly && UI.owner !== inp) return openPicker(inp);
  if (!UI.pop || !e.target.closest('.ui-pop')) return;
  const opt = e.target.closest('[data-i]'); if (opt) return pickOption(+opt.dataset.i);
  const nav = e.target.closest('[data-nav]');
  if (nav) { UI.view = new Date(UI.view.getFullYear(), UI.view.getMonth() + +nav.dataset.nav, 1); return redrawPicker(); }
  const day = e.target.closest('[data-day]'), tm = e.target.closest('[data-time]');
  if (day || tm) { const inp2 = UI.owner; uiClose(); setInput(inp2, day ? day.dataset.day : tm.dataset.time); }
});
// keep focus in the field while clicking inside a picker (typing still works), but let the search box take it
document.addEventListener('mousedown', e => { if (e.target.closest('.ui-pop') && !e.target.closest('.dd-q')) e.preventDefault(); });
document.addEventListener('pointerdown', e => {
  if (UI.pop && !e.target.closest('.ui-pop') && e.target !== UI.anchor && !UI.anchor.contains(e.target)) uiClose();
}, true);
document.addEventListener('input', e => {
  if (e.target.classList.contains('dd-q')) {
    const q = e.target.value.trim().toLowerCase();
    UI.pop.querySelectorAll('.dd-opt').forEach(b => { b.hidden = q && !b.textContent.toLowerCase().includes(q); });
    UI.active = visibleOpts()[0] ?? -1; return markActive();
  }
  if (e.target === UI.owner && UI.kind !== 'select') {   // typed into the field: follow along
    if (UI.kind === 'date' && e.target.value) UI.view = new Date(parseISO(e.target.value).getFullYear(), parseISO(e.target.value).getMonth(), 1);
    if (UI.kind === 'time') UI.pop.innerHTML = timeHTML(e.target); else redrawPicker();
  }
}, true);
document.addEventListener('keydown', e => {
  const t = e.target;
  // the native date / time picker would open on these: show ours instead
  if (t.matches?.(PICKED) && (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) { e.preventDefault(); return openPicker(t); }
  if (!UI.pop) {
    if (t.classList?.contains('dd-btn') && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openSelect(t.ddSel); }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const a = UI.anchor; uiClose(); return a?.focus(); }
  if (e.key === 'Tab') return uiClose();
  if (UI.kind === 'select') {
    const vis = visibleOpts();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      const i = vis.indexOf(UI.active); UI.active = vis[Math.max(0, Math.min(vis.length - 1, (i < 0 ? -1 : i) + (e.key === 'ArrowDown' ? 1 : -1)))] ?? -1; return markActive();
    }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (UI.active >= 0) pickOption(UI.active); return; }
    if (e.key.length === 1 && !t.classList.contains('dd-q') && !e.ctrlKey) {   // type a letter to jump
      const k = e.key.toLowerCase(), opts = [...UI.owner.options], from = UI.active + 1;
      const hit = [...opts.slice(from), ...opts.slice(0, from)].find(o => o.text.toLowerCase().startsWith(k));
      if (hit) { UI.active = opts.indexOf(hit); markActive(); }
    }
  }
  if (UI.kind === 'time' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey) e.preventDefault();
}, true);
addEventListener('resize', uiClose);
document.addEventListener('scroll', e => { if (UI.pop && !UI.pop.contains(e.target)) uiClose(); }, true);
