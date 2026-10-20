// Notes: real .md files (desktop: Documents\Fukurō\Notes) with a live rich editor.
// Formatting shows while typing; files stay plain Markdown so any other app can read them.

/* ---------- storage: desktop files, or localStorage when opened in a browser ---------- */
const NFS = DESK ? desk.notes : (() => {
  const db = () => store.get('notesFS', {folders:[], files:{}}), put = d => store.set('notesFS', d);
  const name = (folder, title, except) => {
    const d = db(); let n = 1, rel;
    do { rel = (folder ? folder + '/' : '') + (title.replace(/[\/:*?"<>|]/g, ' ').trim() || 'Untitled') + (n > 1 ? ' ' + n : '') + '.md'; n++; } while (rel !== except && d.files[rel]);
    return rel;
  };
  return {
    async list(){ const d = db(); return {root:'browser storage', folders:d.folders.slice().sort(), notes:Object.entries(d.files).map(([rel, f]) => ({rel, folder:rel.includes('/') ? rel.split('/')[0] : '', title:rel.split('/').pop().slice(0, -3), mtime:f.mtime, text:f.text}))}; },
    async write(rel, text){ const d = db(); d.files[rel] = {text, mtime:Date.now()}; put(d); return Date.now(); },
    async create(folder, title, text = ''){ const d = db(), rel = name(folder, title); d.files[rel] = {text, mtime:Date.now()}; put(d); return rel; },
    async rename(rel, title, folder){ const d = db(), next = name(folder, title, rel); if (next !== rel) { d.files[next] = d.files[rel]; delete d.files[rel]; put(d); } return next; },
    async trash(rel){ const d = db(); delete d.files[rel]; put(d); },
    async mkdir(n){ const d = db(); if (!d.folders.includes(n)) d.folders.push(n); put(d); return n; },
    async rmdir(n){ const d = db(); d.folders = d.folders.filter(f => f !== n); Object.keys(d.files).forEach(r => { if (r.startsWith(n + '/')) delete d.files[r]; }); put(d); },
    async image(rel, dataURL){ return dataURL; },   // no files in the browser: the picture stays inside the note
    async reveal(){},
  };
})();

const NT = {data:{folders:[], notes:[]}, folder:'__all', q:'', cur:null, pinned:store.get('notesPinned', []), saveTm:0, dirty:false, addingFolder:false};
const savePins = () => store.set('notesPinned', NT.pinned);
const NI = {
  plus:svg('<path d="M12 5v14M5 12h14"/>', 16), pin:svg('<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/>', 15),
  trash:svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>', 15), folder:svg('<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>', 15),
  all:svg('<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8h5"/>', 15), open:svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10"/>', 15),
  journal:svg('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5v17M12 8h4M12 11.5h4"/>', 15),
  link:svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 16),
  table:svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10"/>', 16),
  image:svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-8.5 8.5"/>', 16),
};

/* ---------- Markdown <-> editor HTML ---------- */
let MD_BASE = '';   // folder of the note being shown, so relative picture paths resolve
function imgURL(src){
  if (/^(data:|https?:|file:)/i.test(src) || !DESK || !NT.data.root) return src;
  const base = 'file:///' + NT.data.root.replace(/\\/g, '/') + '/' + (MD_BASE ? MD_BASE + '/' : '');
  try { return new URL(src, base).href; } catch { return src; }
}
function mdInline(s){
  const codes = [];
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${imgURL(src.replace(/&amp;/g, '&'))}" data-src="${src}" alt="${alt}">`)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => `<a class="wl" data-wl="${t.trim()}" contenteditable="false">${l || t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
const LIST_RE = /^(\s*)([-*]|\d+[.)])\s+(\[[ xX]\]\s?)?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const BLOCK = /^(#{1,3}\s|```|>|\s*[-*]\s|\s*\d+[.)]\s|-{3,}\s*$|\s*\|.*\|\s*$)/;
const cells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

// nested lists: each item's level comes from its indent compared with the items above it
function listBlock(items){
  const stack = [];
  items.forEach(it => {
    while (stack.length && it.ind < stack[stack.length - 1]) stack.pop();
    if (!stack.length || it.ind > stack[stack.length - 1]) stack.push(it.ind);
    it.lvl = stack.length - 1;
  });
  const build = (k, lvl) => {
    let h = '';
    while (k < items.length && items[k].lvl >= lvl) {
      const first = items[k], tag = first.ord ? 'ol' : 'ul';
      h += first.task ? '<ul class="tasks">' : `<${tag}>`;
      while (k < items.length && items[k].lvl >= lvl) {
        const x = items[k];
        if (x.ord !== first.ord || x.task !== first.task) break;
        k++;
        let li = `<li${x.task ? ` data-checked="${x.checked}"` : ''}>${mdInline(x.text) || '<br>'}`;
        if (k < items.length && items[k].lvl > lvl) { const [sub, nk] = build(k, lvl + 1); li += sub; k = nk; }
        h += li + '</li>';
      }
      h += first.task ? '</ul>' : `</${tag}>`;
    }
    return [h, k];
  };
  return build(0, 0)[0];
}
function mdToHtml(md){
  const L = md.replace(/\r/g, '').split('\n'); let h = '', i = 0;
  while (i < L.length) {
    const l = L[i]; let m;
    if (/^```/.test(l)) { const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++]); i++; h += `<pre>${esc(b.join('\n')) || '<br>'}</pre>`; continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { h += `<h${m[1].length}>${mdInline(m[2]) || '<br>'}</h${m[1].length}>`; i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { h += '<hr>'; i++; continue; }
    if (/^>/.test(l)) { const b = []; while (i < L.length && /^>/.test(L[i])) b.push(L[i++].replace(/^>\s?/, '')); h += `<blockquote>${b.map(mdInline).join('<br>')}</blockquote>`; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && TABLE_SEP.test(L[i + 1] || '')) {
      const head = cells(l), rows = []; i += 2;
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) rows.push(cells(L[i++]));
      const td = (c, t) => `<${t}>${mdInline(c) || '<br>'}</${t}>`;
      h += `<table><thead><tr>${head.map(c => td(c, 'th')).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => td(r[k] || '', 'td')).join('')}</tr>`).join('')}</tbody></table>`;
      continue;
    }
    if (LIST_RE.test(l)) {
      const items = [];
      while (i < L.length && (m = L[i].match(LIST_RE))) { items.push({ind:m[1].replace(/\t/g, '    ').length, ord:/\d/.test(m[2]), task:m[3] != null, checked:/x/i.test(m[3] || ''), text:m[4]}); i++; }
      h += listBlock(items); continue;
    }
    if (!l.trim()) { i++; continue; }
    const b = []; while (i < L.length && L[i].trim() && !BLOCK.test(L[i])) b.push(L[i++]);
    if (!b.length) b.push(L[i++]);
    h += `<p>${b.map(mdInline).join('<br>')}</p>`;
  }
  return h || '<p><br></p>';
}
function htmlToMd(root){
  const inl = node => [...node.childNodes].map(n => {
    if (n.nodeType === 3) return n.textContent.replace(/ /g, ' ').replace(/​/g, '');
    if (n.nodeType !== 1) return '';
    const t = n.tagName;
    if (t === 'BR') return '\n';
    if (t === 'UL' || t === 'OL') return '';
    if (t === 'IMG') return `![${n.getAttribute('alt') || ''}](${n.dataset.src || n.getAttribute('src')})`;
    if (t === 'A' && n.classList.contains('wl')) { const tg = n.dataset.wl, l = n.textContent; return l === tg ? `[[${tg}]]` : `[[${tg}|${l}]]`; }
    const x = inl(n);
    if (!x.trim() && t !== 'CODE') return x;
    if (t === 'B' || t === 'STRONG') return `**${x}**`;
    if (t === 'I' || t === 'EM') return `*${x}*`;
    if (t === 'S' || t === 'STRIKE' || t === 'DEL') return `~~${x}~~`;
    if (t === 'CODE') return '`' + n.textContent.replace(/​/g, '') + '`';
    if (t === 'A') { const href = n.getAttribute('href'); return x === href ? href : `[${x}](${href})`; }
    if (t === 'DIV' || t === 'P') return x + '\n';
    return x;
  }).join('');
  const listMd = (list, ind) => [...list.children].filter(li => li.tagName === 'LI').map((li, k) => {
    const ord = list.tagName === 'OL', task = list.classList.contains('tasks');
    const pre = ord ? `${k + 1}. ` : task ? `- [${li.dataset.checked === 'true' ? 'x' : ' '}] ` : '- ';
    const subs = [...li.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL');
    return [ind + pre + inl(li).replace(/\n+/g, ' ').trim(), ...subs.map(s => listMd(s, ind + ' '.repeat(ord ? pre.length : 2)))].join('\n');
  }).join('\n');
  const tableMd = tb => {
    const rows = [...tb.querySelectorAll('tr')].map(tr => [...tr.children].map(c => inl(c).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()));
    if (!rows.length) return '';
    const w = Math.max(...rows.map(r => r.length)), line = r => `| ${r.join(' | ')} |`;
    rows.forEach(r => { while (r.length < w) r.push(''); });
    return [line(rows[0]), `| ${rows[0].map(() => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
  };
  const out = [];
  [...root.childNodes].forEach(n => {
    if (n.nodeType === 3) { if (n.textContent.trim()) out.push(n.textContent.trim()); return; }
    if (n.nodeType !== 1) return;
    const t = n.tagName, line = () => inl(n).replace(/\n+$/, '');
    if (/^H[1-3]$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + line().replace(/\n/g, ' ').trim());
    else if (t === 'UL' || t === 'OL') out.push(listMd(n, ''));
    else if (t === 'TABLE') out.push(tableMd(n));
    else if (t === 'BLOCKQUOTE') out.push(line().split('\n').map(x => '> ' + x).join('\n'));
    else if (t === 'PRE') out.push('```\n' + n.textContent.replace(/​/g, '').replace(/\n$/, '') + '\n```');
    else if (t === 'HR') out.push('---');
    else { const x = line(); if (x.trim()) out.push(x); }
  });
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
const plain = md => md.replace(/```[\s\S]*?```/g, ' ').replace(/\\\|/g, '/').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/^#{1,3}\s|^>\s?|^\s*[-*]\s+(\[[ xX]\]\s*)?|^\s*\d+[.)]\s|^\s*\|?\s*:?-{3,}.*$/gm, '').replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, t, __, l) => l || t).replace(/[*_`~|]|\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();

/* ---------- data ---------- */
async function loadNotes(){
  NT.data = await NFS.list();
  NT.pinned = NT.pinned.filter(r => NT.data.notes.some(n => n.rel === r));
}
const curNote = () => NT.data.notes.find(n => n.rel === NT.cur);
function visibleNotes(){
  const q = NT.q.toLowerCase();
  return NT.data.notes.filter(n => (NT.folder === '__all' || (NT.folder === '__pinned' ? NT.pinned.includes(n.rel) : n.folder === NT.folder))
      && (!q || (n.title + ' ' + n.text).toLowerCase().includes(q)))
    .sort((a, b) => (NT.pinned.includes(b.rel) - NT.pinned.includes(a.rel)) || b.mtime - a.mtime);
}
const noteByTitle = (title, folder) => {
  const t = title.toLowerCase(), all = NT.data.notes.filter(n => n.title.toLowerCase() === t);
  return all.find(n => n.folder === folder) || all[0];
};
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const backlinks = n => NT.data.notes.filter(x => x.rel !== n.rel && new RegExp(`\\[\\[${reEsc(n.title)}(\\|[^\\]]*)?\\]\\]`, 'i').test(x.text));

/* ---------- page ---------- */
MODS.notes = {
  async render(){
    if (!NT.dirty) await loadNotes();
    if (NT.cur && !curNote()) NT.cur = null;
    MD_BASE = curNote()?.folder || '';
    $('v-notes').innerHTML = `<div class="nt">
      <aside class="nt-side">
        <div class="nt-side-h"><h1>Notes</h1><button class="icon-btn" data-nt="reveal" title="Open the notes folder">${NI.open}</button></div>
        <button class="nt-f${NT.folder === '__all' ? ' on' : ''}" data-ntf="__all">${NI.all}<span>All notes</span><small>${NT.data.notes.length}</small></button>
        <button class="nt-f${NT.folder === '__pinned' ? ' on' : ''}" data-ntf="__pinned">${NI.pin}<span>Pinned</span><small>${NT.pinned.length}</small></button>
        <button class="nt-f nt-jr" data-nt="journal" title="Today's page in the Journal folder">${NI.journal}<span>Today's journal</span></button>
        <div class="nt-sep">Folders</div>
        ${NT.data.folders.map(f => `<div class="nt-f${NT.folder === f ? ' on' : ''}" data-ntf="${esc(f)}">${NI.folder}<span>${esc(f)}</span><small>${NT.data.notes.filter(n => n.folder === f).length}</small><button class="nt-fx" data-nt="rmdir" title="Delete folder">${TI.x}</button></div>`).join('')}
        ${NT.addingFolder ? '<input class="nt-newf" id="ntNewF" placeholder="Folder name" maxlength="40">' : `<button class="nt-f nt-add" data-nt="mkdir">${NI.plus}<span>New folder</span></button>`}
        <div class="nt-root" title="${esc(NT.data.root)}">${esc(NT.data.root)}</div>
      </aside>
      <section class="nt-list">
        <div class="nt-list-h"><input class="search" id="ntQ" placeholder="Search notes" value="${esc(NT.q)}" autocomplete="off"><button class="btn primary icon" data-nt="new" title="New note (Ctrl+N)">${NI.plus}</button></div>
        <div class="nt-items" id="ntItems">${listHTML()}</div>
      </section>
      <section class="nt-ed" id="ntEd">${editorHTML()}</section>
    </div>`;
    mountEditor();
  },
  async open(rel){ await saveNow(); NT.cur = rel; NT.q = ''; NT.folder = '__all'; window.VIEW === 'notes' ? MODS.notes.render() : go('notes'); },
};

function listHTML(){
  const list = visibleNotes();
  return list.map(n => `<button class="nt-item${n.rel === NT.cur ? ' on' : ''}" data-rel="${esc(n.rel)}">
      <b>${NT.pinned.includes(n.rel) ? `<span class="nt-pin">${NI.pin}</span>` : ''}${esc(n.title)}</b>
      <span class="nt-pv">${esc(plain(n.text).slice(0, 140)) || '<i>Empty note</i>'}</span>
      <small>${ago(n.mtime)}${NT.folder === '__all' && n.folder ? ' · ' + esc(n.folder) : ''}</small></button>`).join('')
    || `<p class="empty-state">${NT.q ? 'No match.' : 'No notes here yet.'}</p>`;
}

const TOOLS = [
  ['h1', 'Heading', 'H1'], ['h2', 'Subheading', 'H2'], ['bold', 'Bold (Ctrl+B)', '<b>B</b>'], ['italic', 'Italic (Ctrl+I)', '<i>I</i>'], ['code', 'Inline code (Ctrl+E)', '&lt;/&gt;'],
  ['link', 'Link (Ctrl+K) · type [[ to link a note', NI.link],
  ['|'], ['ul', 'Bullet list · Tab to indent', svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>', 16)],
  ['ol', 'Numbered list', svg('<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 14.5c.5-1 2.5-1 2.5.3 0 1-2.5 1.7-2.5 3.2h2.5"/>', 16)],
  ['check', 'Checklist', svg('<rect x="3.5" y="4.5" width="6" height="6" rx="1.5"/><path d="m4.8 16 1.5 1.5 2.8-3M13 7.5h7.5M13 16h7.5"/>', 16)],
  ['quote', 'Quote', svg('<path d="M5 6v12M9.5 8h9.5M9.5 12h9.5M9.5 16h6"/>', 16)], ['pre', 'Code block', svg('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m8.5 10-2 2 2 2M15.5 10l2 2-2 2"/>', 16)],
  ['table', 'Table', NI.table], ['image', 'Picture (or paste a screenshot)', NI.image],
];
const TABLE_TOOLS = [['row', '+ Row'], ['col', '+ Column'], ['delrow', '− Row'], ['delcol', '− Column'], ['deltable', 'Remove table']];
function editorHTML(){
  const n = curNote();
  if (!n) return `<div class="nt-empty">${svg('<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8h5M9 12.5h6M9 16h4"/>', 34)}<p>Pick a note or create one</p><button class="btn primary" data-nt="new">${NI.plus}New note</button></div>`;
  const pinned = NT.pinned.includes(n.rel), back = backlinks(n);
  return `<div class="nt-ed-h">
      <select class="nt-move" id="ntMove" title="Folder"><option value="">No folder</option>${NT.data.folders.map(f => `<option ${f === n.folder ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <span class="nt-saved" id="ntSaved">Saved · ${ago(n.mtime)}</span>
      <button class="icon-btn${pinned ? ' on' : ''}" data-nt="pin" title="${pinned ? 'Unpin' : 'Pin'}">${NI.pin}</button>
      ${DESK ? `<button class="icon-btn" data-nt="show" title="Show file in Explorer">${NI.open}</button>` : ''}
      <button class="icon-btn" data-nt="del" title="Delete note">${NI.trash}</button>
    </div>
    <input class="nt-title" id="ntTitle" value="${esc(n.title)}" placeholder="Title" maxlength="120" spellcheck="false">
    <div class="nt-tools">${TOOLS.map(t => t[0] === '|' ? '<i></i>' : `<button data-tool="${t[0]}" title="${t[1]}">${t[2]}</button>`).join('')}
      <span class="nt-ttools" id="ntTT" hidden><i></i>${TABLE_TOOLS.map(([k, l]) => `<button data-ttool="${k}">${l}</button>`).join('')}</span></div>
    <div class="nt-body" id="ntBody" contenteditable="true" spellcheck="true"></div>
    ${back.length ? `<div class="nt-back"><small>Linked from</small>${back.map(b => `<button data-rel="${esc(b.rel)}">${NI.link}${esc(b.title)}</button>`).join('')}</div>` : ''}
    <input type="file" id="ntImgFile" accept="image/*" hidden>`;
}

function mountEditor(){
  const body = $('ntBody'); if (!body) return;
  body.innerHTML = mdToHtml(curNote().text);
  document.execCommand('defaultParagraphSeparator', false, 'p');
}

/* ---------- saving ---------- */
function queueSave(){
  NT.dirty = true; $('ntSaved') && ($('ntSaved').textContent = 'Editing…');
  clearTimeout(NT.saveTm); NT.saveTm = setTimeout(saveNow, 500);
}
async function saveNow(){
  clearTimeout(NT.saveTm);
  const n = curNote(), body = $('ntBody'); if (!n || !body || !NT.dirty) return;
  n.text = htmlToMd(body);
  n.mtime = await NFS.write(n.rel, n.text);
  NT.dirty = false;
  if ($('ntSaved')) $('ntSaved').textContent = 'Saved';
  const item = $('ntItems')?.querySelector(`[data-rel="${CSS.escape(n.rel)}"] .nt-pv`);
  if (item) item.textContent = plain(n.text).slice(0, 140);
}
async function renameCur(title, folder){
  const n = curNote(); if (!n) return;
  await saveNow();
  title = title.trim() || 'Untitled';
  if (title === n.title && folder === n.folder) return;
  const oldTitle = n.title, rel = await NFS.rename(n.rel, title, folder), moved = folder !== n.folder;
  NT.pinned = NT.pinned.map(r => r === n.rel ? rel : r); savePins();
  // a rename must not reload the editor: you may already be typing in it
  Object.assign(n, {rel, folder, title:rel.split(/[\\/]/).pop().slice(0, -3)});
  NT.cur = rel;
  if (n.title !== oldTitle) await relink(oldTitle, n.title, rel);
  if (moved) return MODS.notes.render();
  if ($('ntTitle') && document.activeElement !== $('ntTitle')) $('ntTitle').value = n.title;
  $('ntItems').innerHTML = listHTML();
}
// [[Old title]] in other notes follows the rename
async function relink(from, to, except){
  const re = new RegExp(`\\[\\[${reEsc(from)}(\\|[^\\]]*)?\\]\\]`, 'gi');
  for (const x of NT.data.notes) {
    if (x.rel === except || !re.test(x.text)) continue;
    x.text = x.text.replace(re, (_, l) => `[[${to}${l || ''}]]`);
    x.mtime = await NFS.write(x.rel, x.text);
  }
}
async function newNote(text = '', title){
  await saveNow();
  const folder = NT.data.folders.includes(NT.folder) ? NT.folder : '';
  NT.cur = await NFS.create(folder, title || `Note ${new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short'})}`, text);
  NT.q = '';
  await MODS.notes.render();
  const t = $('ntTitle'); if (t && !title) { t.focus(); t.select(); }
}
// quick capture "note ..." lands in an Inbox folder
MODS.notes.capture = async text => {
  if (!NT.data.folders.includes('Inbox')) await NFS.mkdir('Inbox');
  const title = text.split(/[.!?\n]/)[0].slice(0, 60);
  await NFS.create('Inbox', title, text + '\n');
  if (window.VIEW === 'notes') MODS.notes.render();
  toast(`Note saved in Inbox · ${esc(title)}`);
};
async function openWiki(title){
  await saveNow();
  let n = noteByTitle(title, curNote()?.folder || '');
  if (!n) {
    const rel = await NFS.create(curNote()?.folder || '', title, `# ${title}\n`);
    toast(`Created "${esc(title)}"`);
    NT.cur = rel;
  } else NT.cur = n.rel;
  MODS.notes.render();
}

/* ---------- editor behaviour ---------- */
const blockOf = node => { const b = $('ntBody'); while (node && node.parentNode !== b) node = node.parentNode; return node; };
function caretBlock(){ const s = getSelection(); return s.rangeCount ? blockOf(s.anchorNode) : null; }
function placeCaret(el, atEnd = true){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
const upTo = (tag, n = getSelection().anchorNode) => { while (n && n.id !== 'ntBody' && n.tagName !== tag) n = n.parentNode; return n && n.tagName === tag ? n : null; };
const liAtCaret = () => upTo('LI');
const cellAtCaret = () => upTo('TD') || upTo('TH');
// moving nodes around drops the selection: remember where the caret was and put it back
function keepCaret(fn){
  const s = getSelection(), node = s.anchorNode, off = s.anchorOffset;
  fn();
  if (node && node.isConnected) { const r = document.createRange(); r.setStart(node, Math.min(off, node.length ?? node.childNodes.length)); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
}
const isList = n => n && (n.tagName === 'UL' || n.tagName === 'OL');
const sameKind = (a, b) => a.tagName === b.tagName && a.classList.contains('tasks') === b.classList.contains('tasks');
const liText = li => [...li.childNodes].filter(c => !isList(c)).map(c => c.textContent).join('').replace(/​/g, '');

// lists are built by hand: the browser's list command nests them inside paragraphs
function toList(blk, tag, check){
  const li = document.createElement('li');
  while (blk.firstChild) li.appendChild(blk.firstChild);
  if (!li.textContent.replace(/​/g, '')) li.innerHTML = '<br>';
  if (check) li.dataset.checked = 'false';
  const prev = blk.previousElementSibling;
  if (prev && prev.tagName === tag.toUpperCase() && prev.classList.contains('tasks') === !!check) { prev.appendChild(li); blk.remove(); }
  else { const list = document.createElement(tag); if (check) list.className = 'tasks'; list.appendChild(li); blk.replaceWith(list); }
  placeCaret(li);
}
function unList(list){
  const ps = [];
  const walk = l => [...l.children].forEach(li => {
    const p = document.createElement('p');
    [...li.childNodes].filter(c => !isList(c)).forEach(c => p.appendChild(c));
    if (!p.textContent) p.innerHTML = '<br>';
    ps.push(p); [...li.children].filter(isList).forEach(walk);
  });
  walk(list);
  list.replaceWith(...ps); placeCaret(ps[ps.length - 1]);
}
function listTool(tag, check){
  const li = liAtCaret(), blk = caretBlock(); if (!blk) return;
  const list = li ? li.parentElement : null;
  if (list) {
    if (list.tagName === tag.toUpperCase() && list.classList.contains('tasks') === !!check) return list === blk ? unList(blk) : outdent(li);
    const nl = document.createElement(tag); if (check) nl.className = 'tasks';
    [...list.children].forEach(x => { if (check) x.dataset.checked ||= 'false'; else delete x.dataset.checked; nl.appendChild(x); });
    keepCaret(() => list.replaceWith(nl)); return;
  }
  if (/^(P|DIV|H[1-3]|BLOCKQUOTE)$/.test(blk.tagName)) toList(blk, tag, check);
}
function indent(li){
  const prev = li.previousElementSibling, list = li.parentElement; if (!prev) return;
  keepCaret(() => {
    let sub = prev.lastElementChild;
    if (!isList(sub) || !sameKind(sub, list)) { sub = list.cloneNode(false); prev.appendChild(sub); }
    sub.appendChild(li);
  });
}
function outdent(li){
  const list = li.parentElement, parent = list.parentElement;
  if (parent.tagName !== 'LI') return liToP(li);
  keepCaret(() => {
    const after = [...list.children].slice([...list.children].indexOf(li) + 1);
    if (after.length) { const sub = list.cloneNode(false); after.forEach(a => sub.appendChild(a)); li.appendChild(sub); }
    parent.after(li);
    if (!list.children.length) list.remove();
  });
}
// a top-level item becomes a paragraph, splitting its list in two
function liToP(li){
  const list = li.parentElement, items = [...list.children], rest = items.slice(items.indexOf(li) + 1);
  const p = document.createElement('p');
  [...li.childNodes].filter(c => !isList(c)).forEach(c => p.appendChild(c));
  if (!p.textContent.replace(/​/g, '')) p.innerHTML = '<br>';
  const subs = [...li.children].filter(isList);
  list.after(p);
  if (rest.length || subs.length) { const tail = list.cloneNode(false); subs.forEach(s => [...s.children].forEach(c => tail.appendChild(c))); rest.forEach(r => tail.appendChild(r)); p.after(tail); }
  li.remove(); if (!list.children.length) list.remove();
  placeCaret(p, false);
}

/* tables */
function insertTable(){
  const blk = caretBlock(), body = $('ntBody');
  const t = document.createElement('table');
  t.innerHTML = `<thead><tr>${'<th><br></th>'.repeat(3)}</tr></thead><tbody>${`<tr>${'<td><br></td>'.repeat(3)}</tr>`.repeat(2)}</tbody>`;
  if (blk && blk.tagName === 'P' && !blk.textContent.trim()) blk.replaceWith(t); else if (blk) blk.after(t); else body.appendChild(t);
  if (!t.nextElementSibling) t.after(Object.assign(document.createElement('p'), {innerHTML:'<br>'}));
  placeCaret(t.querySelector('th'));
}
function tableTool(k){
  const cell = cellAtCaret(); if (!cell) return;
  const table = cell.closest('table'), tr = cell.parentElement, col = [...tr.children].indexOf(cell), rows = [...table.querySelectorAll('tr')];
  const newRow = () => { const r = document.createElement('tr'); r.innerHTML = '<td><br></td>'.repeat(tr.children.length); return r; };
  if (k === 'row') { const r = newRow(); tr.parentElement.tagName === 'THEAD' ? table.tBodies[0].prepend(r) : tr.after(r); placeCaret(r.children[col]); }
  if (k === 'col') rows.forEach(r => { const c = document.createElement(r.parentElement.tagName === 'THEAD' ? 'th' : 'td'); c.innerHTML = '<br>'; r.children[col].after(c); });
  if (k === 'delrow' && tr.parentElement.tagName !== 'THEAD') { const next = tr.nextElementSibling || tr.previousElementSibling; tr.remove(); if (next) placeCaret(next.children[col]); }
  if (k === 'delcol' && tr.children.length > 1) rows.forEach(r => r.children[col].remove());
  if (k === 'deltable') { const p = Object.assign(document.createElement('p'), {innerHTML:'<br>'}); table.replaceWith(p); placeCaret(p); }
  queueSave(); syncTableTools();
}
function moveCell(cell, back){
  const all = [...cell.closest('table').querySelectorAll('th,td')], i = all.indexOf(cell);
  if (back) { if (i > 0) placeCaret(all[i - 1]); return; }
  if (i < all.length - 1) return placeCaret(all[i + 1]);
  const tr = cell.parentElement, r = document.createElement('tr'); r.innerHTML = '<td><br></td>'.repeat(tr.children.length);
  cell.closest('table').tBodies[0].appendChild(r); placeCaret(r.firstElementChild); queueSave();
}
const syncTableTools = () => { const tt = $('ntTT'); if (tt) tt.hidden = !cellAtCaret(); };
document.addEventListener('selectionchange', () => { if (window.VIEW === 'notes') syncTableTools(); });

/* pictures: saved next to the notes (attachments folder) and linked with a relative path */
async function addImage(file){
  if (!file || !/^image\//.test(file.type)) return false;
  const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  const n = curNote(); if (!n) return false;
  const src = await NFS.image(n.rel, data);
  $('ntBody').focus();
  document.execCommand('insertHTML', false, `<img src="${esc(imgURL(src))}" data-src="${esc(src)}" alt="">`);
  queueSave();
  return true;
}

/* link box: Ctrl+K or the toolbar */
let linkRange = null;
function openLinkBox(){
  const s = getSelection(); if (!s.rangeCount) return;
  linkRange = s.getRangeAt(0).cloneRange();
  const r = linkRange.getBoundingClientRect(), box = document.createElement('div');
  box.className = 'nt-linkbox'; box.id = 'ntLink';
  box.innerHTML = `<input placeholder="Paste a link, or type a note name" value="${esc(upTo('A', linkRange.startContainer)?.getAttribute('href') || '')}"><small>Enter to apply · Esc to cancel</small>`;
  document.body.appendChild(box);
  box.style.left = Math.min(innerWidth - 340, Math.max(12, r.left)) + 'px'; box.style.top = (r.bottom + 8) + 'px';
  const inp = box.querySelector('input'); inp.focus(); inp.select();
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeLinkBox(true); }
    if (e.key === 'Enter') { e.preventDefault(); applyLink(inp.value.trim()); }
  });
  inp.addEventListener('blur', () => setTimeout(() => closeLinkBox(false), 100));
}
function closeLinkBox(refocus){
  $('ntLink')?.remove();
  if (refocus && linkRange) { $('ntBody')?.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(linkRange); }
}
function applyLink(v){
  closeLinkBox(true); if (!v) return;
  const s = getSelection(), txt = s.toString();
  if (/^(https?:\/\/|mailto:|www\.)/i.test(v)) {
    const url = /^www\./i.test(v) ? 'https://' + v : v;
    if (txt) document.execCommand('createLink', false, url);
    else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>​`);
  } else document.execCommand('insertHTML', false, `<a class="wl" data-wl="${esc(v)}" contenteditable="false">${esc(txt || v)}</a>​`);
  queueSave();
}

/* [[ suggestions */
const WL = {q:null, i:0, list:[]};
function wlCheck(){
  const s = getSelection(), node = s.anchorNode;
  if (!s.isCollapsed || !node || node.nodeType !== 3 || node.parentNode.closest('pre,code')) return wlClose();
  const m = node.textContent.slice(0, s.anchorOffset).match(/\[\[([^\[\]]{0,60})$/);
  if (!m) return wlClose();
  const q = m[1].toLowerCase(), cur = curNote();
  WL.q = m[1]; WL.node = node; WL.end = s.anchorOffset; WL.start = s.anchorOffset - m[0].length;
  WL.list = NT.data.notes.filter(n => n.rel !== cur?.rel && n.title.toLowerCase().includes(q)).sort((a, b) => a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q) || b.mtime - a.mtime).slice(0, 7).map(n => ({t:n.title, f:n.folder}));
  if (m[1].trim() && !WL.list.some(x => x.t.toLowerCase() === q.trim())) WL.list.push({t:m[1].trim(), make:true});
  WL.i = clamp(WL.i, 0, Math.max(0, WL.list.length - 1));
  let box = $('ntWl'); if (!box) { box = document.createElement('div'); box.id = 'ntWl'; box.className = 'nt-wl'; document.body.appendChild(box); }
  box.innerHTML = WL.list.map((x, k) => `<button class="${k === WL.i ? 'on' : ''}" data-wli="${k}">${x.make ? `New note “${esc(x.t)}”` : `<b>${esc(x.t)}</b>${x.f ? `<small>${esc(x.f)}</small>` : ''}`}</button>`).join('') || '<p>Type a note name</p>';
  const r = s.getRangeAt(0).getBoundingClientRect();
  box.style.left = Math.min(innerWidth - 300, r.left) + 'px'; box.style.top = (r.bottom + 6) + 'px';
}
function wlClose(){ WL.q = null; WL.i = 0; $('ntWl')?.remove(); }
function wlPick(k){
  const x = WL.list[k]; if (!x || !WL.node?.isConnected) return wlClose();
  const r = document.createRange(); r.setStart(WL.node, WL.start); r.setEnd(WL.node, WL.end); r.deleteContents();
  const a = Object.assign(document.createElement('a'), {className:'wl', textContent:x.t, contentEditable:'false'}); a.dataset.wl = x.t;
  const zw = document.createTextNode('​'); r.insertNode(zw); r.insertNode(a);
  const c = document.createRange(); c.setStartAfter(zw); c.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(c);
  wlClose(); queueSave();
}

function applyTool(t){
  const body = $('ntBody'); body.focus();
  const blk = caretBlock();
  const fb = tag => document.execCommand('formatBlock', false, blk && blk.tagName === tag.toUpperCase() ? 'p' : tag);
  if (t === 'h1' || t === 'h2') fb(t);
  else if (t === 'quote') fb('blockquote');
  else if (t === 'bold' || t === 'italic') document.execCommand(t);
  else if (t === 'ul') listTool('ul');
  else if (t === 'ol') listTool('ol');
  else if (t === 'check') listTool('ul', true);
  else if (t === 'link') return openLinkBox();
  else if (t === 'table') insertTable();
  else if (t === 'image') return $('ntImgFile').click();
  else if (t === 'code') {
    const s = getSelection(), txt = s.toString();
    if (txt) document.execCommand('insertHTML', false, `<code>${esc(txt)}</code>​`);
  }
  else if (t === 'pre') {
    const txt = blk && blk.tagName === 'P' ? blk.textContent : '';
    const pre = document.createElement('pre'); pre.textContent = txt || '​';
    if (blk && blk.tagName === 'P') blk.replaceWith(pre); else body.appendChild(pre);
    if (!pre.nextSibling) pre.after(Object.assign(document.createElement('p'), {innerHTML:'<br>'}));
    placeCaret(pre);
  }
  queueSave();
}

// markdown shortcuts typed at the start of a line
function blockShortcut(){
  const blk = caretBlock(); if (!blk || !['P', 'DIV'].includes(blk.tagName)) return false;
  const m = blk.textContent.match(/^(#{1,3}|[-*]|1[.)]|\[ ?\]|>)[\s ]/); if (!m) return false;
  const first = (function f(n){ return n.nodeType === 3 ? n : n.firstChild && f(n.firstChild); })(blk);
  if (!first || !first.textContent.startsWith(m[0])) return false;
  first.textContent = first.textContent.slice(m[0].length);
  if (!blk.textContent) blk.innerHTML = '<br>';
  placeCaret(blk, false);
  const k = m[1];
  if (k[0] === '#') document.execCommand('formatBlock', false, 'h' + k.length);
  else if (k === '>') document.execCommand('formatBlock', false, 'blockquote');
  else if (k === '-' || k === '*') toList(blk, 'ul');
  else if (k[0] === '1') toList(blk, 'ol');
  else toList(blk, 'ul', true);
  return true;
}
// **bold**, *italic*, `code`, [[note]] typed inline
function inlineShortcut(){
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return;
  const node = s.anchorNode; if (node.nodeType !== 3 || node.parentNode.closest('pre,code')) return;
  const before = node.textContent.slice(0, s.anchorOffset);
  const rules = [[/(\[\[([^\[\]]+)\]\])$/, 'wl'], [/(\*\*([^*\s][^*]*)\*\*)$/, 'b'], [/(?:^|[^*])(\*([^*\s][^*]*)\*)$/, 'i'], [/(`([^`]+)`)$/, 'code'], [/(~~([^~]+)~~)$/, 's']];
  for (const [re, tag] of rules) {
    const m = before.match(re); if (!m) continue;
    const r = document.createRange(); r.setStart(node, s.anchorOffset - m[1].length); r.setEnd(node, s.anchorOffset);
    r.deleteContents();
    const el = document.createElement(tag === 'wl' ? 'a' : tag); el.textContent = m[2];
    if (tag === 'wl') { el.className = 'wl'; el.dataset.wl = m[2].trim(); el.contentEditable = 'false'; wlClose(); }
    const zw = document.createTextNode('​');   // caret lands after the formatted word, outside it
    r.insertNode(zw); r.insertNode(el);
    const c = document.createRange(); c.setStartAfter(zw); c.collapse(true); s.removeAllRanges(); s.addRange(c);
    return;
  }
}
const atStartOf = el => { const s = getSelection(); if (!s.isCollapsed) return false; const r = s.getRangeAt(0).cloneRange(); r.setStart(el, 0); return !r.toString().replace(/​/g, ''); };

$('v-notes').addEventListener('input', e => {
  if (e.target.id === 'ntQ') { NT.q = e.target.value; $('ntItems').innerHTML = listHTML(); return; }
  if (e.target.id !== 'ntBody') return;
  if (e.inputType === 'insertText' && (e.data === ' ' || e.data === ' ')) blockShortcut();
  if (e.inputType === 'insertText' && /[*`~\]]/.test(e.data)) inlineShortcut();
  wlCheck();
  queueSave();
});
$('v-notes').addEventListener('keydown', e => {
  if (e.target.id === 'ntTitle' && e.key === 'Enter') { e.preventDefault(); $('ntBody').focus(); placeCaret($('ntBody'), false); return; }
  if (e.target.id === 'ntNewF') {
    if (e.key === 'Enter' && e.target.value.trim()) { NFS.mkdir(e.target.value.trim()).then(n => { NT.addingFolder = false; NT.folder = n; MODS.notes.render(); }); }
    if (e.key === 'Escape') { NT.addingFolder = false; MODS.notes.render(); }
    return;
  }
  if (e.target.id !== 'ntBody') return;
  if (WL.q != null && $('ntWl')) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); WL.i = (WL.i + (e.key === 'ArrowDown' ? 1 : -1) + WL.list.length) % WL.list.length; return wlCheck(); }
    if ((e.key === 'Enter' || e.key === 'Tab') && WL.list.length) { e.preventDefault(); return wlPick(WL.i); }
    if (e.key === 'Escape') { e.preventDefault(); return wlClose(); }
  }
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === 'e') { e.preventDefault(); applyTool('code'); return; }
  if (e.ctrlKey && k === 'k') { e.preventDefault(); openLinkBox(); return; }
  const blk = caretBlock(), li = liAtCaret(), cell = cellAtCaret();
  if (e.key === 'Tab') {
    if (cell) { e.preventDefault(); return moveCell(cell, e.shiftKey); }
    if (li) { e.preventDefault(); e.shiftKey ? outdent(li) : indent(li); return queueSave(); }
  }
  if (e.key === 'Enter' && !e.shiftKey && cell) {   // Enter goes to the cell below, adding a row at the end
    e.preventDefault();
    const tr = cell.parentElement, col = [...tr.children].indexOf(cell);
    let next = tr.parentElement.tagName === 'THEAD' ? cell.closest('table').tBodies[0]?.rows[0] : tr.nextElementSibling;
    if (!next) { next = document.createElement('tr'); next.innerHTML = '<td><br></td>'.repeat(tr.children.length); cell.closest('table').tBodies[0].appendChild(next); }
    placeCaret(next.children[col]); return queueSave();
  }
  if (e.key === 'Enter' && !e.shiftKey && li && !liText(li).trim() && !li.querySelector('ul,ol')) { e.preventDefault(); outdent(li); return queueSave(); }
  if (e.key === 'Backspace' && li && atStartOf(li)) { e.preventDefault(); outdent(li); return queueSave(); }
  if (e.key === 'Enter' && !e.shiftKey && blk) {
    if (blk.tagName === 'PRE') {   // newline inside code; Enter on an empty last line leaves the block
      e.preventDefault();
      if (/\n​?$/.test(blk.textContent) && getSelection().anchorOffset >= getSelection().anchorNode.textContent.length) {
        blk.textContent = blk.textContent.replace(/\n​?$/, '') || '​';
        const p = Object.assign(document.createElement('p'), {innerHTML:'<br>'}); blk.after(p); placeCaret(p);
      } else document.execCommand('insertText', false, '\n');
      queueSave(); return;
    }
    if (blk.tagName === 'P' && /^```\s*$/.test(blk.textContent)) { e.preventDefault(); blk.textContent = ''; placeCaret(blk); applyTool('pre'); return; }
    if (blk.tagName === 'P' && /^-{3,}\s*$/.test(blk.textContent)) {
      e.preventDefault(); const hr = document.createElement('hr'), p = Object.assign(document.createElement('p'), {innerHTML:'<br>'});
      blk.replaceWith(hr); hr.after(p); placeCaret(p); queueSave(); return;
    }
    if (li && li.closest('ul.tasks') === li.parentElement) setTimeout(() => { const x = liAtCaret(); if (x && x.parentElement.classList.contains('tasks')) x.dataset.checked = 'false'; });
  }
  if (e.key === 'Backspace' && blk && /^(H[1-3]|BLOCKQUOTE)$/.test(blk.tagName) && atStartOf(blk)) { e.preventDefault(); document.execCommand('formatBlock', false, 'p'); queueSave(); }
});
$('v-notes').addEventListener('paste', async e => {
  if (!e.target.closest?.('#ntBody')) return;
  const img = [...e.clipboardData.files].find(f => /^image\//.test(f.type));
  e.preventDefault();
  if (img) return addImage(img);
  const text = e.clipboardData.getData('text/plain');
  if (/^https?:\/\/\S+$/.test(text.trim()) && getSelection().toString()) document.execCommand('createLink', false, text.trim());
  else if (/\n/.test(text) || BLOCK.test(text)) document.execCommand('insertHTML', false, mdToHtml(text));
  else document.execCommand('insertText', false, text);
  queueSave();
});
$('v-notes').addEventListener('drop', e => {
  const f = [...(e.dataTransfer?.files || [])].find(x => /^image\//.test(x.type));
  if (!f || !e.target.closest('#ntBody')) return;
  e.preventDefault();
  const r = document.caretRangeFromPoint?.(e.clientX, e.clientY); if (r) { getSelection().removeAllRanges(); getSelection().addRange(r); }
  addImage(f);
});
$('v-notes').addEventListener('change', e => {
  if (e.target.id === 'ntTitle') renameCur(e.target.value, curNote().folder);
  if (e.target.id === 'ntMove') renameCur($('ntTitle').value, e.target.value);
  if (e.target.id === 'ntImgFile') { addImage(e.target.files[0]); e.target.value = ''; }
});
$('v-notes').addEventListener('mousedown', e => { if (e.target.closest('[data-tool],[data-ttool]')) e.preventDefault(); });   // keep the selection in the editor
document.addEventListener('mousedown', e => { if (e.target.closest('#ntWl')) { e.preventDefault(); wlPick(+e.target.closest('[data-wli]')?.dataset.wli); } });
$('v-notes').addEventListener('click', async e => {
  const li = e.target.closest('#ntBody ul.tasks > li');
  if (li && e.clientX < li.getBoundingClientRect().left + 24 && e.clientY < li.getBoundingClientRect().top + 26) { li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true'; queueSave(); return; }
  const wl = e.target.closest('#ntBody a.wl'); if (wl) return openWiki(wl.dataset.wl);
  const a = e.target.closest('#ntBody a');
  if (a && (e.ctrlKey || e.metaKey)) { DESK ? desk.openUrl(a.href) : window.open(a.href, '_blank'); return; }
  const tool = e.target.closest('[data-tool]'); if (tool) return applyTool(tool.dataset.tool);
  const tt = e.target.closest('[data-ttool]'); if (tt) return tableTool(tt.dataset.ttool);
  const item = e.target.closest('[data-rel]');
  if (item) { await saveNow(); NT.cur = item.dataset.rel; return MODS.notes.render(); }
  const f = e.target.closest('[data-ntf]');
  if (f && !e.target.closest('[data-nt]')) { NT.folder = f.dataset.ntf; return MODS.notes.render(); }
  const b = e.target.closest('[data-nt]'); if (!b) return;
  const n = curNote();
  switch (b.dataset.nt) {
    case 'new': newNote(); break;
    case 'journal': openJournal(); break;
    case 'mkdir': NT.addingFolder = true; await MODS.notes.render(); $('ntNewF').focus(); break;
    case 'rmdir': {
      const name = b.closest('[data-ntf]').dataset.ntf, count = NT.data.notes.filter(x => x.folder === name).length;
      await NFS.rmdir(name); if (NT.folder === name) NT.folder = '__all';
      MODS.notes.render(); toast(`Folder "${esc(name)}" ${count ? `and its ${count} note${count > 1 ? 's' : ''} moved to the Recycle Bin` : 'deleted'}`);
      break;
    }
    case 'pin': NT.pinned.includes(n.rel) ? NT.pinned.splice(NT.pinned.indexOf(n.rel), 1) : NT.pinned.unshift(n.rel); savePins(); MODS.notes.render(); break;
    case 'del': await NFS.trash(n.rel); NT.cur = null; MODS.notes.render(); toast(DESK ? 'Note moved to the Recycle Bin' : 'Note deleted'); break;
    case 'show': NFS.reveal(n.rel); break;
    case 'reveal': NFS.reveal(); break;
  }
});
document.addEventListener('keydown', e => {
  if (window.VIEW === 'notes' && e.ctrlKey && e.key.toLowerCase() === 'n' && !e.target.closest('#ntBody')) { e.preventDefault(); newNote(); }
});
// pick up edits made in other apps when coming back to Fukurō
addEventListener('focus', () => { if (window.VIEW === 'notes' && !NT.dirty && !document.activeElement?.closest?.('#ntBody,#ntTitle')) MODS.notes.render(); });
addEventListener('beforeunload', () => { if (NT.dirty) saveNow(); });
