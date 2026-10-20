// Projects: your local git repos at a glance — branch, unsaved changes, last commit, push status.
const PJ = {list: store.get('projects', []), info: {}, loading: false};
const saveProjects = () => store.set('projects', PJ.list);
const baseName = p => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const PI = {
  code:svg('<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>', 15), folder:svg('<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>', 15),
  gh:svg('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>', 15),
  refresh:svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>', 15), branch:svg('<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7.5v9M18 9c0 4-5 3.5-10.5 7.5"/>', 13),
  scan:svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', 15),
};

async function loadInfo(ids){
  if (!DESK) return;
  PJ.loading = true;
  await Promise.all((ids || PJ.list.map(p => p.id)).map(async id => {
    const p = PJ.list.find(x => x.id === id); if (!p) return;
    PJ.info[id] = await desk.gitInfo(p.path);
  }));
  PJ.loading = false;
  if (window.VIEW === 'projects') MODS.projects.render(true);
}

function projectCard(p){
  const i = PJ.info[p.id];
  let body;
  if (!i) body = '<p class="pj-muted">Reading git…</p>';
  else if (!i.ok) body = `<p class="pj-muted">${esc(i.error)}</p>`;
  else {
    const sync = i.ahead == null ? '<span class="pj-chip">No upstream</span>'
      : i.ahead || i.behind ? `<span class="pj-chip warn">${i.ahead ? `${i.ahead} to push` : ''}${i.ahead && i.behind ? ' · ' : ''}${i.behind ? `${i.behind} to pull` : ''}</span>` : '<span class="pj-chip ok">In sync</span>';
    body = `<div class="pj-chips"><span class="pj-chip br">${PI.branch}${esc(i.branch)}</span>
        ${i.changes ? `<span class="pj-chip warn">${i.changes} uncommitted</span>` : '<span class="pj-chip ok">Clean</span>'}${sync}</div>
      ${i.last ? `<div class="pj-last"><span class="pj-msg">${esc(i.last.msg)}</span><small><code>${i.last.hash}</code> · ${ago(Date.parse(i.last.date))} · ${esc(i.last.author)}</small></div>` : '<p class="pj-muted">No commits yet</p>'}
      <div class="pj-week">${i.week} commit${i.week === 1 ? '' : 's'} in the last 7 days</div>`;
  }
  return `<div class="pj-card" data-id="${p.id}">
    <div class="pj-top"><b>${esc(p.name)}</b><span class="tm-tools"><button data-pj="del" aria-label="Remove">${TI.x}</button></span></div>
    <div class="pj-path" title="${esc(p.path)}">${esc(p.path)}</div>
    ${body}
    <div class="pj-acts"><button class="btn" data-pj="code">${PI.code}VS Code</button><button class="btn" data-pj="folder">${PI.folder}Folder</button>
      ${i && i.remote ? `<button class="btn" data-pj="gh">${PI.gh}GitHub</button>` : ''}</div>
  </div>`;
}

MODS.projects = {
  render(fromLoad){
    if (!DESK) {
      $('v-projects').innerHTML = `<div class="pg"><header class="pg-h"><div><h1>Projects</h1><p>Reads your local git repos</p></div></header>
        <p class="empty-state">Projects needs the desktop app (it reads git on your PC).</p></div>`;
      return;
    }
    const sorted = PJ.list.slice().sort((a, b) => (Date.parse(PJ.info[b.id]?.last?.date || 0)) - (Date.parse(PJ.info[a.id]?.last?.date || 0)));
    $('v-projects').innerHTML = `<div class="pg">
      <header class="pg-h"><div><h1>Projects</h1><p>Sorted by latest commit · read from git on this PC</p></div>
        <div class="pg-tools"><button class="btn" data-pj="refresh">${PI.refresh}Refresh</button><button class="btn" data-pj="scan">${PI.scan}Add all from a folder</button>
        <button class="btn primary" data-pj="add">${TI.plus}Add project</button></div></header>
      ${PJ.list.length ? `<div class="pj-grid">${sorted.map(projectCard).join('')}</div>`
        : '<p class="empty-state">No projects yet. "Add all from a folder" picks up every git repo inside a folder like C:\\RealProjects.</p>'}
    </div>`;
    if (!fromLoad) loadInfo();
  },
};

function addPaths(paths){
  const fresh = paths.filter(pth => !PJ.list.some(p => p.path.toLowerCase() === pth.toLowerCase()));
  fresh.forEach(pth => PJ.list.push({id:uid('pj'), name:baseName(pth), path:pth}));
  saveProjects(); MODS.projects.render();
  toast(fresh.length ? `${fresh.length} project${fresh.length > 1 ? 's' : ''} added` : 'Already in your list');
}

$('v-projects').addEventListener('click', async e => {
  const b = e.target.closest('[data-pj]'); if (!b) return;
  const p = PJ.list.find(x => x.id === b.closest('[data-id]')?.dataset.id);
  switch (b.dataset.pj) {
    case 'add': { const dir = await desk.pickFolder(); if (dir) addPaths([dir]); break; }
    case 'scan': { const dirs = await desk.scanRepos(); if (dirs.length) addPaths(dirs); else toast('No git repos found there'); break; }
    case 'refresh': PJ.info = {}; MODS.projects.render(); break;
    case 'code': desk.openCode(p.path).then(ok => ok || toast('VS Code command not found')); break;
    case 'folder': desk.openPath(p.path); break;
    case 'gh': desk.openUrl(PJ.info[p.id].remote); break;
    case 'del': {
      const i = PJ.list.indexOf(p); PJ.list.splice(i, 1); saveProjects(); MODS.projects.render(true);
      toast(`${esc(p.name)} removed`, [['Undo', () => { PJ.list.splice(i, 0, p); saveProjects(); MODS.projects.render(); }]]);
    }
  }
});
