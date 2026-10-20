// Snippets: commands you keep looking up, one click to copy.
const SN = {
  list: store.get('snippets', [
    {id:'s1', title:'Restart a PM2 app and watch logs', code:'pm2 restart <app> && pm2 logs <app> --lines 50', tag:'VPS', uses:0},
    {id:'s2', title:'Apply Prisma migrations in production', code:'npx prisma migrate deploy', tag:'Prisma', uses:0},
  ]),
  q: '', tag: '',
};
const saveSnippets = () => store.set('snippets', SN.list);

MODS.snippets = {
  add({title, code, tag = ''}){
    SN.list.unshift({id:uid('s'), title, code, tag, uses:0});
    saveSnippets();
    if (window.VIEW === 'snippets') MODS.snippets.render();
    toast(`Snippet saved · ${esc(title)}`);
  },
  render(keepFocus){
    const tags = [...new Set(SN.list.map(s => s.tag).filter(Boolean))].sort();
    const q = SN.q.toLowerCase();
    const shown = SN.list.filter(s => (!SN.tag || s.tag === SN.tag) && (!q || (s.title + ' ' + s.code + ' ' + s.tag).toLowerCase().includes(q)))
      .sort((a, b) => b.uses - a.uses);
    $('v-snippets').innerHTML = `<div class="pg narrow">
      <header class="pg-h"><div><h1>Snippets</h1><p>Most used first${DESK ? ' · quick capture: "snip Title :: command"' : ''}</p></div>
        <button class="btn primary" data-sn="new">${TI.plus}New snippet</button></header>
      <div class="sn-bar"><input class="search" id="snQ" placeholder="Search snippets" value="${esc(SN.q)}" autocomplete="off">
        <div class="chipbar inline"><button class="${SN.tag ? '' : 'on'}" data-snt="">All</button>${tags.map(t => `<button class="${SN.tag === t ? 'on' : ''}" data-snt="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="sn-list">${shown.map(s => `<div class="sn-card" data-id="${s.id}">
          <div class="sn-top"><b>${esc(s.title)}</b>${s.tag ? `<span class="td-tag">${esc(s.tag)}</span>` : ''}
            <span class="tm-tools"><button data-sn="edit" aria-label="Edit">${TI.pen}</button><button data-sn="del" aria-label="Delete">${TI.x}</button></span></div>
          <div class="sn-code"><pre>${esc(s.code)}</pre><button class="btn" data-sn="copy">${tdIcon.copy}Copy</button></div>
        </div>`).join('') || `<p class="empty-state">${SN.list.length ? 'No match.' : 'No snippets yet.'}</p>`}</div>
    </div>`;
    if (keepFocus) { const i = $('snQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  },
};

function openSnippetForm(s){
  openSheet(`<h2>${s ? 'Edit snippet' : 'New snippet'}</h2>
    <input type="text" name="title" class="title-in" placeholder="What it does" maxlength="80" required value="${s ? esc(s.title) : ''}">
    <textarea name="code" class="mono" placeholder="Command or code" required>${s ? esc(s.code) : ''}</textarea>
    <input type="text" name="tag" placeholder="Tag (e.g. VPS, Git, Docker)" maxlength="20" value="${s ? esc(s.tag) : ''}" list="snTags">
    <datalist id="snTags">${[...new Set(SN.list.map(x => x.tag).filter(Boolean))].map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    ${sheetActions(false)}`, f => {
      const v = {title:f.title.value.trim(), code:f.code.value.replace(/\s+$/, ''), tag:f.tag.value.trim()};
      if (s) Object.assign(s, v); else SN.list.unshift({id:uid('s'), uses:0, ...v});
      saveSnippets(); MODS.snippets.render();
    });
}

$('v-snippets').addEventListener('input', e => { if (e.target.id === 'snQ') { SN.q = e.target.value; MODS.snippets.render(true); } });
$('v-snippets').addEventListener('click', e => {
  const t = e.target.closest('[data-snt]'); if (t) { SN.tag = t.dataset.snt; return MODS.snippets.render(); }
  const b = e.target.closest('[data-sn]'); if (!b) return;
  const s = SN.list.find(x => x.id === b.closest('[data-id]')?.dataset.id);
  if (b.dataset.sn === 'new') return openSnippetForm(null);
  if (b.dataset.sn === 'edit') return openSnippetForm(s);
  if (b.dataset.sn === 'copy') { s.uses++; saveSnippets(); copyText(s.code, 'Copied to clipboard'); }
  if (b.dataset.sn === 'del') {
    const i = SN.list.indexOf(s); SN.list.splice(i, 1); saveSnippets(); MODS.snippets.render();
    toast('Snippet deleted', [['Undo', () => { SN.list.splice(i, 0, s); saveSnippets(); MODS.snippets.render(); }]]);
  }
});
