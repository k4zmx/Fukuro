// Boards: brainstorm on an endless canvas of cards you drag, colour, shape and connect.
const STICKY = ['#f5e3a1', '#f3c9b6', '#cfe4d2', '#cad8ee', '#e2d2ec', '#ebe5d8'];
const SHAPES = [['note', 'Card'], ['round', 'Pill'], ['circle', 'Circle'], ['text', 'Text only']];
const BD = {
  list: store.get('boards', [{id:'b1', name:'Ideas', cards:[], links:[], view:{x:80, y:60, z:1}}]),
  cur: store.get('boardCur', 'b1'), sel: new Set(), selLink: null, editing: null, act: null, saveTm: 0,
};
const board = () => BD.list.find(b => b.id === BD.cur) || BD.list[0];
function saveBoards(){ clearTimeout(BD.saveTm); BD.saveTm = setTimeout(() => { store.set('boards', BD.list); store.set('boardCur', BD.cur); }, 300); }
const BI = {
  plus:svg('<path d="M12 5v14M5 12h14"/>', 16), fit:svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 16),
  minus:svg('<path d="M5 12h14"/>', 16), trash:svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>', 15),
  note:svg('<rect x="4" y="5" width="16" height="14" rx="2"/>', 15), round:svg('<rect x="2.5" y="7" width="19" height="10" rx="5"/>', 15),
  circle:svg('<circle cx="12" cy="12" r="8"/>', 15), text:svg('<path d="M5 6h14M12 6v13"/>', 15), check:svg('<path d="m5.5 12.5 4 4 9-9.5"/>', 12),
};
const selCards = () => board().cards.filter(c => BD.sel.has(c.id));
const cardH = c => c.shape === 'circle' ? c.w : c.h;

MODS.boards = {
  render(){
    const b = board(); BD.cur = b.id;
    $('v-boards').innerHTML = `<div class="bd">
      <header class="bd-top">
        <div class="bd-tabs">${BD.list.map(x => `<button class="bd-tab${x.id === b.id ? ' on' : ''}" data-bd-tab="${x.id}" title="Double-click to rename">${esc(x.name)}</button>`).join('')}
          <button class="bd-tab add" data-bd="newboard" title="New board">${BI.plus}</button></div>
        <div class="bd-tools">
          <div class="bd-shapes">${SHAPES.map(([k, l]) => `<button data-bd-shape="${k}" title="${l}">${BI[k]}</button>`).join('')}</div>
          <div class="bd-colors">${STICKY.map(c => `<button style="--sc:${c}" data-bd-color="${c}" title="Colour the selected cards"></button>`).join('')}</div>
          <button class="btn" data-bd="card">${BI.plus}Card</button>
          <div class="bd-zoom"><button data-bd="zout" title="Zoom out">${BI.minus}</button><span id="bdZ">${Math.round(b.view.z * 100)}%</span><button data-bd="zin" title="Zoom in">${BI.plus}</button><button data-bd="fit" title="Fit all">${BI.fit}</button></div>
          ${BD.list.length > 1 ? `<button class="icon-btn" data-bd="delboard" title="Delete this board">${BI.trash}</button>` : ''}
        </div>
      </header>
      <div class="bd-canvas" id="bdCanvas">
        <div class="bd-world" id="bdWorld"><svg class="bd-links" id="bdLinks"><defs><marker id="bdArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs><g id="bdLinkG"></g></svg></div>
        ${b.cards.length ? '' : '<div class="bd-hint">Double-click anywhere to add a card · drag the dot on a card to connect it · Shift+drag to select several · right-click for more · scroll to move, Ctrl+scroll to zoom</div>'}
      </div>
    </div>`;
    drawBoard();
  },
};

function applyView(){
  const v = board().view, w = $('bdWorld'), c = $('bdCanvas'); if (!w) return;
  w.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
  c.style.backgroundPosition = `${v.x}px ${v.y}px`;
  c.style.backgroundSize = `${24 * v.z}px ${24 * v.z}px`;
  $('bdZ').textContent = Math.round(v.z * 100) + '%';
}

function bdCardHTML(c){
  return `<div class="bd-card s-${c.shape || 'note'}${BD.sel.has(c.id) ? ' sel' : ''}" data-card="${c.id}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;min-height:${cardH(c)}px;--sc:${c.c}">
    <div class="bd-text"${BD.editing === c.id ? ' contenteditable="plaintext-only"' : ''}>${esc(c.text)}</div>
    ${c.todo ? `<span class="bd-badge" title="Sent to To-dos">${BI.check}</span>` : ''}
    <span class="bd-dot" data-dot title="Drag to connect"></span><span class="bd-rs" data-rs></span></div>`;
}
function drawBoard(){
  const b = board(), w = $('bdWorld'); if (!w) return;
  if (BD.editing) {   // keep what's being typed across re-renders
    const t = w.querySelector(`[data-card="${BD.editing}"] .bd-text[contenteditable]`), c = b.cards.find(x => x.id === BD.editing);
    if (t && c) c.text = t.innerText.replace(/\n$/, '');
  }
  w.querySelectorAll('.bd-card,.bd-ll').forEach(el => el.remove());
  w.insertAdjacentHTML('beforeend', b.cards.map(bdCardHTML).join(''));
  drawLinks(); applyView();
  if (BD.editing) { const t = w.querySelector(`[data-card="${BD.editing}"] .bd-text`); if (t) { t.focus(); placeCaret(t); } }
}
const markSel = () => $('bdWorld')?.querySelectorAll('.bd-card').forEach(x => x.classList.toggle('sel', BD.sel.has(x.dataset.card)));
// a line from edge to edge between two cards
function edgePoint(c, tx, ty, el){
  const h = el ? el.offsetHeight : cardH(c), cx = c.x + c.w / 2, cy = c.y + h / 2, dx = tx - cx, dy = ty - cy;
  if (c.shape === 'circle') { const r = c.w / 2 + 6, d = Math.hypot(dx, dy) || 1; return [cx + dx / d * r, cy + dy / d * r]; }
  const s = Math.min(Math.abs((c.w / 2 + 6) / (dx || 1e-6)), Math.abs((h / 2 + 6) / (dy || 1e-6)));
  return [cx + dx * s, cy + dy * s];
}
function drawLinks(temp){
  const b = board(), g = $('bdLinkG'), w = $('bdWorld'); if (!g) return;
  const el = id => w.querySelector(`[data-card="${id}"]`);
  const center = c => { const e = el(c.id); return [c.x + c.w / 2, c.y + (e ? e.offsetHeight : cardH(c)) / 2]; };
  let h = '', labels = '';
  b.links.forEach(l => {
    const a = b.cards.find(c => c.id === l.a), z = b.cards.find(c => c.id === l.b); if (!a || !z) return;
    const [bx, by] = center(z), [ax, ay] = center(a);
    const p1 = edgePoint(a, bx, by, el(a.id)), p2 = edgePoint(z, ax, ay, el(z.id));
    h += `<g class="bd-link${BD.selLink === l.id ? ' sel' : ''}" data-link="${l.id}"><path class="hit" d="M${p1}L${p2}"/><path d="M${p1}L${p2}"${l.arrow ? ' marker-end="url(#bdArrow)"' : ''}/></g>`;
    if (l.label) labels += `<div class="bd-ll${BD.selLink === l.id ? ' sel' : ''}" data-link="${l.id}" style="left:${(p1[0] + p2[0]) / 2}px;top:${(p1[1] + p2[1]) / 2}px">${esc(l.label)}</div>`;
  });
  if (temp) h += `<path class="bd-temp" d="M${temp[0]},${temp[1]}L${temp[2]},${temp[3]}"/>`;
  g.innerHTML = h;
  w.querySelectorAll('.bd-ll').forEach(x => x.remove());
  w.insertAdjacentHTML('beforeend', labels);
}

const toWorld = (cx, cy) => { const r = $('bdCanvas').getBoundingClientRect(), v = board().view; return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z]; };
function addCard(x, y, edit = true, extra = {}){
  const b = board(), c = {id:uid('k'), x:Math.round(x - 90), y:Math.round(y - 40), w:180, h:80, text:'', c:STICKY[b.cards.length % STICKY.length], shape:'note', ...extra};
  b.cards.push(c); BD.sel = new Set([c.id]); BD.selLink = null; BD.editing = edit ? c.id : null;
  $('bdCanvas').querySelector('.bd-hint')?.remove();
  saveBoards(); drawBoard();
  return c;
}
function stopEditing(){
  if (!BD.editing) return;
  const c = board().cards.find(x => x.id === BD.editing), t = $('bdWorld')?.querySelector(`[data-card="${BD.editing}"] .bd-text`);
  if (c && t) c.text = t.innerText.replace(/\n$/, '');
  BD.editing = null; saveBoards(); drawBoard();
}
function zoomAt(f, cx, cy){
  const v = board().view, r = $('bdCanvas').getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
  const z = clamp(v.z * f, 0.25, 2.5);
  v.x = px - (px - v.x) * (z / v.z); v.y = py - (py - v.y) * (z / v.z); v.z = z;
  applyView(); saveBoards();
}
function fitBoard(){
  const b = board(), r = $('bdCanvas').getBoundingClientRect();
  if (!b.cards.length) { b.view = {x:80, y:60, z:1}; return applyView(); }
  const x0 = Math.min(...b.cards.map(c => c.x)), y0 = Math.min(...b.cards.map(c => c.y));
  const x1 = Math.max(...b.cards.map(c => c.x + c.w)), y1 = Math.max(...b.cards.map(c => c.y + cardH(c) + 40));
  const z = clamp(Math.min((r.width - 120) / (x1 - x0), (r.height - 120) / (y1 - y0)), 0.25, 1.4);
  b.view = {z, x:(r.width - (x1 - x0) * z) / 2 - x0 * z, y:(r.height - (y1 - y0) * z) / 2 - y0 * z};
  applyView(); saveBoards();
}
function deleteSelected(){
  const b = board(), before = structuredClone({cards:b.cards, links:b.links});
  if (!BD.sel.size && !BD.selLink) return;
  b.cards = b.cards.filter(c => !BD.sel.has(c.id));
  b.links = b.links.filter(l => l.id !== BD.selLink && !BD.sel.has(l.a) && !BD.sel.has(l.b));
  BD.sel = new Set(); BD.selLink = null; saveBoards(); drawBoard();
  toast('Deleted', [['Undo', () => { Object.assign(b, before); saveBoards(); drawBoard(); }]]);
}
function duplicateSelected(){
  const b = board(), map = new Map();
  selCards().forEach(c => { const n = {...structuredClone(c), id:uid('k'), x:c.x + 30, y:c.y + 30, todo:null}; map.set(c.id, n.id); b.cards.push(n); });
  b.links.filter(l => map.has(l.a) && map.has(l.b)).forEach(l => b.links.push({...l, id:uid('l'), a:map.get(l.a), b:map.get(l.b)}));
  BD.sel = new Set(map.values()); saveBoards(); drawBoard();
}

/* ---------- right-click menu ---------- */
function openMenu(x, y, items){
  closeMenu();
  const m = document.createElement('div'); m.className = 'bd-menu'; m.id = 'bdMenu';
  m.innerHTML = items.map(it => it === '|' ? '<hr>' : `<button data-bdm="${it[0]}"${it[2] ? ' class="danger"' : ''}>${it[1]}</button>`).join('');
  document.body.appendChild(m);
  m.style.left = Math.min(innerWidth - m.offsetWidth - 8, x) + 'px'; m.style.top = Math.min(innerHeight - m.offsetHeight - 8, y) + 'px';
}
const closeMenu = () => $('bdMenu')?.remove();
async function menuAction(k){
  closeMenu();
  const b = board(), cards = selCards(), link = b.links.find(l => l.id === BD.selLink);
  switch (k) {
    case 'todo': cards.forEach(c => { if (!c.text.trim()) return; MODS.todos.add(c.text.trim().replace(/\s*\n\s*/g, ' ')); c.todo = true; }); saveBoards(); drawBoard(); break;
    case 'note': {
      const text = cards.map(c => c.text.trim()).filter(Boolean), title = (text[0] || 'From board').split('\n')[0].slice(0, 60);
      const md = text.length > 1 ? text.map(t => `- ${t.replace(/\n+/g, ' ')}`).join('\n') : text.join('');
      const rel = await NFS.create('', title, `${md}\n\nFrom the board "${b.name}"\n`);
      toast(`Note created · ${esc(title)}`, [['Open', () => MODS.notes.open(rel)]]);
      break;
    }
    case 'dup': duplicateSelected(); break;
    case 'del': deleteSelected(); break;
    case 'all': BD.sel = new Set(b.cards.map(c => c.id)); markSel(); break;
    case 'new': addCard(BD.menuAt[0], BD.menuAt[1]); break;
    case 'label': editLabel(link); break;
    case 'arrow': link.arrow = !link.arrow; saveBoards(); drawLinks(); break;
    case 'flip': [link.a, link.b] = [link.b, link.a]; saveBoards(); drawLinks(); break;
    default: if (k.startsWith('shape:')) { cards.forEach(c => c.shape = k.slice(6)); saveBoards(); drawBoard(); }
  }
}
function editLabel(l){
  const w = $('bdWorld'), b = board(), a = b.cards.find(c => c.id === l.a), z = b.cards.find(c => c.id === l.b); if (!a || !z) return;
  const mx = (a.x + a.w / 2 + z.x + z.w / 2) / 2, my = (a.y + cardH(a) / 2 + z.y + cardH(z) / 2) / 2;
  w.querySelector(`.bd-ll[data-link="${l.id}"]`)?.remove();
  const inp = Object.assign(document.createElement('input'), {className:'bd-ll-in', value:l.label || '', maxLength:40, placeholder:'Label'});
  inp.style.left = mx + 'px'; inp.style.top = my + 'px';
  w.appendChild(inp); inp.focus(); inp.select();
  let closed = false;
  const done = ok => { if (closed) return; closed = true; if (ok) { l.label = inp.value.trim(); saveBoards(); } inp.remove(); drawLinks(); };
  inp.addEventListener('keydown', k => { k.stopPropagation(); if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
  inp.addEventListener('blur', () => done(true));
}

/* ---------- pointer: pan, drag, resize, connect, box-select ---------- */
$('v-boards').addEventListener('pointerdown', e => {
  const canvas = e.target.closest('#bdCanvas'); if (!canvas || e.button > 1 || e.target.closest('.bd-ll-in')) return;
  closeMenu();
  const cardEl = e.target.closest('.bd-card'), b = board();
  if (cardEl && cardEl.dataset.card === BD.editing && !e.target.closest('[data-dot],[data-rs]')) return;   // let text selection work
  if (BD.editing) stopEditing();
  const linkEl = e.target.closest('[data-link]');
  if (linkEl) { BD.selLink = linkEl.dataset.link; BD.sel = new Set(); markSel(); return drawLinks(); }
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (!cardEl || e.button === 1) {
    BD.selLink = null;
    if (e.shiftKey && e.button === 0) {
      const r = canvas.getBoundingClientRect(), box = document.createElement('div'); box.className = 'bd-box'; canvas.appendChild(box);
      BD.act = {kind:'box', wx, wy, sx:e.clientX - r.left, sy:e.clientY - r.top, box, base:new Set(BD.sel)};
    } else {
      BD.sel = new Set(); markSel(); drawLinks();
      BD.act = {kind:'pan', sx:e.clientX, sy:e.clientY, vx:b.view.x, vy:b.view.y};
    }
  } else {
    const c = b.cards.find(x => x.id === cardEl.dataset.card);
    BD.selLink = null;
    if (e.shiftKey) { BD.sel.has(c.id) ? BD.sel.delete(c.id) : BD.sel.add(c.id); markSel(); drawLinks(); return; }
    if (!BD.sel.has(c.id)) BD.sel = new Set([c.id]);
    markSel(); drawLinks();
    if (e.target.closest('[data-dot]')) BD.act = {kind:'link', c};
    else if (e.target.closest('[data-rs]')) BD.act = {kind:'resize', c, sx:wx, sy:wy, w:c.w, h:cardEl.offsetHeight, el:cardEl};
    else BD.act = {kind:'move', sx:wx, sy:wy, items:selCards().map(x => ({c:x, x:x.x, y:x.y, el:$('bdWorld').querySelector(`[data-card="${x.id}"]`)}))};
  }
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
$('v-boards').addEventListener('pointermove', e => {
  const a = BD.act; if (!a) return;
  const [wx, wy] = toWorld(e.clientX, e.clientY), v = board().view;
  if (a.kind === 'pan') { v.x = a.vx + e.clientX - a.sx; v.y = a.vy + e.clientY - a.sy; applyView(); }
  if (a.kind === 'move') {
    a.items.forEach(it => { it.c.x = Math.round(it.x + wx - a.sx); it.c.y = Math.round(it.y + wy - a.sy); it.el.style.left = it.c.x + 'px'; it.el.style.top = it.c.y + 'px'; });
    drawLinks();
  }
  if (a.kind === 'resize') { a.c.w = Math.max(90, Math.round(a.w + wx - a.sx)); a.c.h = Math.max(40, Math.round(a.h + wy - a.sy)); a.el.style.width = a.c.w + 'px'; a.el.style.minHeight = cardH(a.c) + 'px'; drawLinks(); }
  if (a.kind === 'link') { const el = $('bdWorld').querySelector(`[data-card="${a.c.id}"]`), p = edgePoint(a.c, wx, wy, el); drawLinks([p[0], p[1], wx, wy]); }
  if (a.kind === 'box') {
    const r = $('bdCanvas').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    Object.assign(a.box.style, {left:Math.min(x, a.sx) + 'px', top:Math.min(y, a.sy) + 'px', width:Math.abs(x - a.sx) + 'px', height:Math.abs(y - a.sy) + 'px'});
    const x0 = Math.min(wx, a.wx), x1 = Math.max(wx, a.wx), y0 = Math.min(wy, a.wy), y1 = Math.max(wy, a.wy);
    BD.sel = new Set([...a.base, ...board().cards.filter(c => c.x < x1 && c.x + c.w > x0 && c.y < y1 && c.y + cardH(c) > y0).map(c => c.id)]);
    markSel();
  }
});
$('v-boards').addEventListener('pointerup', e => {
  const a = BD.act; BD.act = null; if (!a) return;
  if (a.kind === 'box') a.box.remove();
  if (a.kind === 'link') {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bd-card'), b = board();
    if (target && target.dataset.card !== a.c.id) {
      const id2 = target.dataset.card;
      if (!b.links.some(l => (l.a === a.c.id && l.b === id2) || (l.a === id2 && l.b === a.c.id))) b.links.push({id:uid('l'), a:a.c.id, b:id2, arrow:true});
    }
    drawLinks();
  }
  saveBoards();
});
$('v-boards').addEventListener('contextmenu', e => {
  if (!e.target.closest('#bdCanvas')) return;
  e.preventDefault();
  if (BD.editing) stopEditing();
  const cardEl = e.target.closest('.bd-card'), linkEl = e.target.closest('[data-link]');
  if (cardEl) {
    if (!BD.sel.has(cardEl.dataset.card)) { BD.sel = new Set([cardEl.dataset.card]); BD.selLink = null; markSel(); drawLinks(); }
    const n = BD.sel.size;
    return openMenu(e.clientX, e.clientY, [['todo', n > 1 ? `Make ${n} to-dos` : 'Make a to-do'], ['note', n > 1 ? 'Make one note from these' : 'Make a note'], '|',
      ...SHAPES.map(([k, l]) => ['shape:' + k, l]), '|', ['dup', 'Duplicate · Ctrl+D'], ['del', 'Delete', true]]);
  }
  if (linkEl) {
    const l = board().links.find(x => x.id === linkEl.dataset.link); BD.selLink = l.id; BD.sel = new Set(); markSel(); drawLinks();
    return openMenu(e.clientX, e.clientY, [['label', l.label ? 'Edit label' : 'Add a label'], ['arrow', l.arrow ? 'Remove arrow' : 'Show arrow'], ['flip', 'Reverse direction'], '|', ['del', 'Delete line', true]]);
  }
  BD.menuAt = toWorld(e.clientX, e.clientY);
  openMenu(e.clientX, e.clientY, [['new', 'New card here'], ['all', 'Select all · Ctrl+A']]);
});
document.addEventListener('click', e => { const m = e.target.closest('[data-bdm]'); if (m) return menuAction(m.dataset.bdm); if (!e.target.closest('#bdMenu')) closeMenu(); });
$('v-boards').addEventListener('dblclick', e => {
  if (!e.target.closest('#bdCanvas')) {
    const tab = e.target.closest('[data-bd-tab]'); if (!tab) return;
    const b = BD.list.find(x => x.id === tab.dataset.bdTab);
    tab.outerHTML = `<input class="bd-tab-in" value="${esc(b.name)}" maxlength="30">`;
    const inp = $('v-boards').querySelector('.bd-tab-in'); inp.focus(); inp.select();
    const done = ok => { if (ok && inp.value.trim()) { b.name = inp.value.trim(); saveBoards(); } MODS.boards.render(); };
    inp.addEventListener('keydown', k => { if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
    return;
  }
  const linkEl = e.target.closest('[data-link]');
  if (linkEl) return editLabel(board().links.find(l => l.id === linkEl.dataset.link));
  const cardEl = e.target.closest('.bd-card');
  if (cardEl) { BD.editing = cardEl.dataset.card; return drawBoard(); }
  const [wx, wy] = toWorld(e.clientX, e.clientY); addCard(wx, wy);
});
$('v-boards').addEventListener('wheel', e => {
  if (!e.target.closest('#bdCanvas')) return;
  e.preventDefault(); closeMenu();
  if (e.ctrlKey) return zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
  const v = board().view; v.x -= e.deltaX; v.y -= e.deltaY; applyView(); saveBoards();
}, {passive:false});
$('v-boards').addEventListener('click', e => {
  const tab = e.target.closest('[data-bd-tab]');
  if (tab) { stopEditing(); BD.cur = tab.dataset.bdTab; BD.sel = new Set(); BD.selLink = null; saveBoards(); return MODS.boards.render(); }
  const col = e.target.closest('[data-bd-color]');
  if (col) { const cs = selCards(); if (!cs.length) return toast('Select a card first'); cs.forEach(c => c.c = col.dataset.bdColor); saveBoards(); return drawBoard(); }
  const sh = e.target.closest('[data-bd-shape]');
  if (sh) { const cs = selCards(); if (!cs.length) return toast('Select a card first'); cs.forEach(c => c.shape = sh.dataset.bdShape); saveBoards(); return drawBoard(); }
  const b = e.target.closest('[data-bd]'); if (!b) return;
  const r = $('bdCanvas').getBoundingClientRect();
  switch (b.dataset.bd) {
    case 'card': { const [x, y] = toWorld(r.left + r.width / 2, r.top + r.height / 2); addCard(x + (Math.random() - .5) * 60, y + (Math.random() - .5) * 40); break; }
    case 'zin': zoomAt(1.2, r.left + r.width / 2, r.top + r.height / 2); break;
    case 'zout': zoomAt(1 / 1.2, r.left + r.width / 2, r.top + r.height / 2); break;
    case 'fit': fitBoard(); break;
    case 'newboard': { const nb = {id:uid('b'), name:`Board ${BD.list.length + 1}`, cards:[], links:[], view:{x:80, y:60, z:1}}; BD.list.push(nb); BD.cur = nb.id; saveBoards(); MODS.boards.render(); break; }
    case 'delboard': {
      const cur = board(), i = BD.list.indexOf(cur); BD.list.splice(i, 1); BD.cur = BD.list[0].id; saveBoards(); MODS.boards.render();
      toast(`Board "${esc(cur.name)}" deleted`, [['Undo', () => { BD.list.splice(i, 0, cur); BD.cur = cur.id; saveBoards(); MODS.boards.render(); }]]);
    }
  }
});
$('v-boards').addEventListener('input', e => { if (e.target.closest('.bd-text')) drawLinks(); });
document.addEventListener('keydown', e => {
  if (window.VIEW !== 'boards' || e.target.closest('input, textarea, [contenteditable]')) {
    if (window.VIEW === 'boards' && BD.editing && e.key === 'Escape') stopEditing();
    return;
  }
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { closeMenu(); BD.sel = new Set(); BD.selLink = null; markSel(); drawLinks(); }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  if (e.ctrlKey && k === 'a') { e.preventDefault(); BD.sel = new Set(board().cards.map(c => c.id)); markSel(); }
  if (e.ctrlKey && k === 'd' && BD.sel.size) { e.preventDefault(); duplicateSelected(); }
  if (e.key === 'Enter' && BD.sel.size === 1) { e.preventDefault(); BD.editing = [...BD.sel][0]; drawBoard(); }
});
