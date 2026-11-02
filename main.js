const { app, BrowserWindow, ipcMain, nativeTheme, shell, Tray, Menu, nativeImage, globalShortcut, dialog, screen, net, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const os = require('os');

// test runs get their own profile so they never collide with the installed app
if (process.env.EDT_DATA_DIR) app.setPath('userData', path.join(process.env.EDT_DATA_DIR, 'profile'));
if (!app.requestSingleInstanceLock()) app.quit();
// needed for Windows notifications; dev runs get their own id so they never steal the installed app's icon
// (the id predates the public release; changing it would install a second copy instead of updating)
app.setAppUserModelId(app.isPackaged ? 'com.almig.emploidutemps' : 'com.almig.fukuro.dev');

// Data lives in OneDrive/Documents when available so every PC stays in sync.
const docs = process.env.OneDrive && fs.existsSync(path.join(process.env.OneDrive, 'Documents'))
  ? path.join(process.env.OneDrive, 'Documents')
  : app.getPath('documents');
const dataDir = process.env.EDT_DATA_DIR || path.join(docs, 'Fukurō');
const dataFile = path.join(dataDir, 'data.json');
const winFile = path.join(app.getPath('userData'), 'window.json');
// per-PC settings (not synced): tray, autostart, hotkey
const setFile = path.join(app.getPath('userData'), 'settings.json');

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
let data = readJSON(dataFile, {});
// a timetable.json next to data.json (from an older version, or shared by a classmate) is loaded once
const ttFile = path.join(dataDir, 'timetable.json');
if (!data['jk.tt'] && fs.existsSync(ttFile)) {
  data['jk.ttFile'] = fs.readFileSync(ttFile, 'utf8');
  fs.renameSync(ttFile, path.join(dataDir, 'timetable.imported.json'));
}
let settings = { closeToTray: true, autostart: false, hotkey: 'Control+Shift+Space', trayHintShown: false, notesDir: '', ...readJSON(setFile, {}) };
const saveSettings = () => fs.writeFileSync(setFile, JSON.stringify(settings, null, 1));
let timer = null;

function flush(){
  clearTimeout(timer); timer = null;
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, dataFile);
}
const scheduleFlush = () => { clearTimeout(timer); timer = setTimeout(flush, 400); };

let win, tray, capture, quitting = false;
const iconPath = path.join(__dirname, 'build', 'icon.png');

/* ---------- storage + window ---------- */
ipcMain.on('store:load', e => { e.returnValue = data; });
ipcMain.on('store:set', (_, k, v) => { data[k] = v; scheduleFlush(); });
ipcMain.on('store:remove', (_, k) => { delete data[k]; scheduleFlush(); });
ipcMain.on('win:progress', (_, p) => win && !win.isDestroyed() && win.setProgressBar(p));
ipcMain.on('win:flash', () => { if (win && !win.isFocused()) win.flashFrame(true); });

/* ---------- desktop helpers for the modules ---------- */
ipcMain.handle('pick:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('open:path', (_, p) => shell.openPath(p));
ipcMain.handle('open:url', (_, u) => /^https?:\/\//.test(u) && shell.openExternal(u));
ipcMain.handle('open:code', (_, p) => new Promise(res => execFile('code', [p], { shell: true }, err => res(!err))));

const git = (cwd, args) => new Promise(res => execFile('git', args, { cwd, windowsHide: true, timeout: 8000 }, (err, out) => res(err ? null : out.trim())));
ipcMain.handle('git:info', async (_, dir) => {
  if (!fs.existsSync(dir)) return { ok: false, error: 'Folder not found' };
  const root = await git(dir, ['rev-parse', '--show-toplevel']);
  if (root == null) return { ok: false, error: 'Not a git repository' };
  const [branch, status, last, remote, counts, week] = await Promise.all([
    git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(dir, ['status', '--porcelain']),
    git(dir, ['log', '-1', '--format=%h%x1f%s%x1f%cI%x1f%an']),
    git(dir, ['remote', 'get-url', 'origin']),
    git(dir, ['rev-list', '--left-right', '--count', '@{u}...HEAD']),
    git(dir, ['rev-list', '--count', '--since=7.days', 'HEAD']),
  ]);
  const [hash, msg, date, author] = (last || '').split('\x1f');
  const [behind, ahead] = (counts || '').split(/\s+/).map(Number);
  let web = null;
  if (remote) {
    const m = remote.match(/github\.com[:/](.+?)(\.git)?$/);
    if (m) web = 'https://github.com/' + m[1];
  }
  return { ok: true, branch, changes: status ? status.split('\n').length : 0, last: hash ? { hash, msg, date, author } : null,
           remote: web, ahead: counts ? ahead : null, behind: counts ? behind : null, week: +week || 0 };
});

// git repos directly inside a folder (one level), for "add all from a folder"
ipcMain.handle('scan:repos', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Pick a folder that contains your projects' });
  if (r.canceled) return [];
  const parent = r.filePaths[0];
  const dirs = fs.readdirSync(parent, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(parent, d.name));
  return [parent, ...dirs].filter(d => fs.existsSync(path.join(d, '.git')));
});

// title + channel for a YouTube link (oEmbed, no API key)
ipcMain.handle('yt:meta', async (_, url) => {
  try {
    const r = await net.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url));
    if (!r.ok) return null;
    const j = await r.json();
    return { title: j.title, author: j.author_name };
  } catch { return null; }
});

// the in-app player: where the video is, and whether YouTube refused to play it
ipcMain.handle('yt:probe', async () => {
  const f = win?.webContents.mainFrame.framesInSubtree.find(x => /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(x.url));
  if (!f) return null;
  try {
    return await f.executeJavaScript(`(() => { const v = document.querySelector('video'), e = document.querySelector('.ytp-error');
      return {t: v ? v.currentTime : 0, d: v && isFinite(v.duration) ? v.duration : 0, err: e && e.offsetParent ? e.innerText.trim().slice(0, 160) : ''}; })()`);
  } catch { return null; }
});

/* ---------- notes: real .md files, kept local (not in OneDrive) ---------- */
const defaultNotes = path.join(os.homedir(), 'Documents', 'Fukurō', 'Notes');
let notesRoot = path.resolve(process.env.EDT_NOTES_DIR || settings.notesDir || defaultNotes);
const inRoot = rel => {
  const full = path.resolve(notesRoot, rel || '');
  if (full !== notesRoot && !full.startsWith(notesRoot + path.sep)) throw new Error('outside notes folder');
  return full;
};
const cleanName = s => (s || '').replace(/[<>:"/\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120) || 'Untitled';
function uniqueRel(folder, title, except){
  let n = 1, rel;
  do { rel = path.join(folder || '', `${cleanName(title)}${n > 1 ? ' ' + n : ''}.md`); n++; }
  while (rel !== except && fs.existsSync(inRoot(rel)));
  return rel;
}
ipcMain.handle('notes:list', () => {
  fs.mkdirSync(notesRoot, { recursive: true });
  const folders = [], notes = [];
  const readDir = (dir, folder) => fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    if (d.name.startsWith('.')) return;
    const full = path.join(dir, d.name);
    if (d.isDirectory() && !folder) { if (d.name !== 'attachments') { folders.push(d.name); readDir(full, d.name); } }
    else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) {
      const st = fs.statSync(full);
      notes.push({ rel: path.relative(notesRoot, full), folder: folder || '', title: d.name.slice(0, -3), mtime: st.mtimeMs, text: st.size < 400000 ? fs.readFileSync(full, 'utf8') : '' });
    }
  });
  readDir(notesRoot, '');
  return { root: notesRoot, folders: folders.sort((a, b) => a.localeCompare(b)), notes };
});
ipcMain.handle('notes:write', (_, rel, text) => { const f = inRoot(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return fs.statSync(f).mtimeMs; });
ipcMain.handle('notes:create', (_, folder, title, text = '') => {
  const rel = uniqueRel(folder ? cleanName(folder) : '', title);
  fs.mkdirSync(path.dirname(inRoot(rel)), { recursive: true });
  fs.writeFileSync(inRoot(rel), text);
  return rel;
});
ipcMain.handle('notes:rename', (_, rel, title, folder) => {
  const next = uniqueRel(folder, title, rel);
  if (next !== rel) { fs.mkdirSync(path.dirname(inRoot(next)), { recursive: true }); fs.renameSync(inRoot(rel), inRoot(next)); }
  return next;
});
ipcMain.handle('notes:trash', (_, rel) => shell.trashItem(inRoot(rel)));
ipcMain.handle('notes:mkdir', (_, name) => { const n = cleanName(name); fs.mkdirSync(inRoot(n), { recursive: true }); return n; });
ipcMain.handle('notes:rmdir', (_, name) => shell.trashItem(inRoot(name)));
// pasted pictures go to Notes/attachments; the note links them with a path relative to itself
ipcMain.handle('notes:image', (_, rel, dataURL) => {
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/.exec(dataURL || '');
  if (!m) throw new Error('not an image');
  const dir = inRoot('attachments'), d = new Date(), p2 = n => String(n).padStart(2, '0');
  fs.mkdirSync(dir, { recursive: true });
  let name, n = 0;
  do { name = `img-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}${n ? '-' + n : ''}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`; n++; }
  while (fs.existsSync(path.join(dir, name)));
  fs.writeFileSync(path.join(dir, name), Buffer.from(m[2], 'base64'));
  return path.relative(path.dirname(inRoot(rel)), path.join(dir, name)).split(path.sep).join('/');
});
ipcMain.handle('notes:reveal', (_, rel) => rel ? shell.showItemInFolder(inRoot(rel)) : shell.openPath(notesRoot));

/* ---------- settings ---------- */
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_, k, v) => {
  settings[k] = v; saveSettings();
  if (k === 'notesDir' && !process.env.EDT_NOTES_DIR) notesRoot = path.resolve(v || defaultNotes);
  if (k === 'autostart') applyAutostart();
  if (k === 'hotkey') registerHotkey();
  buildTrayMenu();
  return settings;
});
function applyAutostart(){
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: settings.autostart, args: ['--hidden'] });
}

/* ---------- quick capture: global hotkey opens a small box from anywhere ---------- */
function createCapture(){
  capture = new BrowserWindow({
    width: 620, height: 92, show: false, frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, minimizable: false, maximizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  capture.loadFile('capture.html');
  capture.on('blur', () => capture.hide());
}
function showCapture(){
  if (!capture || capture.isDestroyed()) createCapture();
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  capture.setPosition(Math.round(workArea.x + (workArea.width - 620) / 2), Math.round(workArea.y + workArea.height * 0.22));
  capture.show(); capture.focus();
  let cfg = {}; try { cfg = JSON.parse(data['jk.cfg'] || '{}'); } catch {}
  capture.webContents.send('capture:open', data['jk.mode'] || '"light"', cfg.aiCapture !== false && !!findClaude());
}
function registerHotkey(){
  globalShortcut.unregisterAll();
  try { return globalShortcut.register(settings.hotkey, showCapture); } catch { return false; }
}
ipcMain.handle('hotkey:test', (_, k) => {
  const prev = settings.hotkey; settings.hotkey = k;
  const ok = registerHotkey();
  if (!ok) { settings.hotkey = prev; registerHotkey(); } else { saveSettings(); buildTrayMenu(); }
  return ok;
});
// the box stays open until the main window reports what it added (the AI can take a few seconds)
ipcMain.on('capture:submit', (_, text) => {
  if (win && !win.isDestroyed()) win.webContents.send('capture', text);
  else capture && capture.hide();
});
ipcMain.on('capture:done', (_, r) => capture && !capture.isDestroyed() && capture.webContents.send('capture:done', r));
ipcMain.on('capture:undo', () => win && !win.isDestroyed() && win.webContents.send('capture:undo'));
ipcMain.on('capture:hide', () => capture && capture.hide());
ipcMain.on('capture:show', showCapture);

/* ---------- AI: Claude Code's own login on this PC (claude -p), so no API key ----------
   Kept cheap on purpose: no tools, no CLAUDE.md or plugins (--safe-mode), a short system prompt, nothing saved. */
const aiDir = path.join(app.getPath('userData'), 'ai');
let claudeBin;
function findClaude(){
  if (claudeBin) return claudeBin;
  const c = [path.join(os.homedir(), '.local', 'bin', 'claude.exe')];
  try { c.push(...require('child_process').execFileSync('where.exe', ['claude'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).filter(Boolean)); } catch {}
  return claudeBin = c.find(f => /\.exe$/i.test(f) && fs.existsSync(f)) || c.find(f => /\.cmd$/i.test(f) && fs.existsSync(f)) || null;
}
function runClaude(args, input, ms, onOut){
  let p;
  const done = new Promise(res => {
    const bin = findClaude();
    if (!bin) return res({ code: -1, out: '', err: 'missing' });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CLAUDECODE;
    // an npm install only has claude.cmd, which needs a shell (and quoted arguments)
    const cmd = /\.cmd$/i.test(bin);
    p = spawn(cmd ? `"${bin}"` : bin, cmd ? args.map(a => `"${a}"`) : args, { cwd: aiDir, env, windowsHide: true, shell: cmd });
    let out = '', err = '', over = false;
    const end = r => { if (over) return; over = true; clearTimeout(t); res(r); };
    const t = setTimeout(() => { p.kill(); end({ code: -1, out, err: 'timeout' }); }, ms);
    p.stdout.on('data', d => { out += d; if (onOut) onOut(String(d)); });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => end({ code: -1, out, err: e.message }));
    p.on('close', code => end({ code, out, err }));
    p.stdin.end(input || '');
  });
  done.proc = p;
  return done;
}
ipcMain.handle('ai:ask', async (_, { system, prompt, model = 'haiku', timeout = 45000 }) => {
  fs.mkdirSync(aiDir, { recursive: true });
  const sys = path.join(aiDir, `system-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(sys, system);
  const r = await runClaude(['-p', '--safe-mode', '--no-session-persistence', '--strict-mcp-config', '--tools', '', '--model', model,
    '--system-prompt-file', sys, '--output-format', 'json'], prompt, timeout);
  fs.rm(sys, { force: true }, () => {});
  try {
    const j = JSON.parse(r.out);
    return j.is_error ? { ok: false, error: String(j.result || 'error') } : { ok: true, text: String(j.result || '') };
  } catch { return { ok: false, error: (r.err || r.out).trim().slice(0, 300) || 'no answer' }; }
});
// chat: the same call, but the answer streams back as it is written
const chatProcs = new Map();
ipcMain.handle('ai:chat', async (e, { id, system, prompt, model = 'haiku' }) => {
  fs.mkdirSync(aiDir, { recursive: true });
  const sys = path.join(aiDir, `chat-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(sys, system);
  let buf = '', text = '', final = null;
  const line = l => {
    let j; try { j = JSON.parse(l); } catch { return; }
    const ev = j.type === 'stream_event' && j.event;
    if (ev && ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { text += ev.delta.text; if (!e.sender.isDestroyed()) e.sender.send('ai:delta', id, ev.delta.text); }
    if (j.type === 'result') final = j;
  };
  const run = runClaude(['-p', '--safe-mode', '--no-session-persistence', '--strict-mcp-config', '--tools', '', '--model', model,
    '--system-prompt-file', sys, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'], prompt, 180000, d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
  });
  chatProcs.set(id, run.proc);
  const r = await run;
  chatProcs.delete(id);
  if (buf.trim()) line(buf);
  fs.rm(sys, { force: true }, () => {});
  if (final && !final.is_error) return { ok: true, text: final.result ?? text };
  if (text) return { ok: true, text, cut: true };
  return { ok: false, error: String(final?.result || r.err || 'no answer').trim().slice(0, 300) };
});
ipcMain.on('ai:stop', (_, id) => { const p = chatProcs.get(id); if (p) p.kill(); });
ipcMain.handle('ai:status', async () => {
  if (!findClaude()) return { found: false, loggedIn: false };
  fs.mkdirSync(aiDir, { recursive: true });
  const r = await runClaude(['auth', 'status'], '', 20000);
  try { return { found: true, loggedIn: !!JSON.parse(r.out).loggedIn }; } catch { return { found: true, loggedIn: false }; }
});

/* ---------- music: yt-dlp searches YouTube and gives a stream URL ----------
   It is fetched from its GitHub release on first use (not shipped in the installer), and updated when it starts failing,
   which happens when YouTube changes something. */
const binDir = path.join(app.getPath('userData'), 'bin'), ytdlp = path.join(binDir, 'yt-dlp.exe');
let ytdlpGet = null, ytdlpFresh = false;
function ensureYtdlp(){
  if (fs.existsSync(ytdlp)) return Promise.resolve();
  return ytdlpGet ||= (async () => {
    fs.mkdirSync(binDir, { recursive: true });
    const r = await net.fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
    if (!r.ok) throw new Error('download failed (' + r.status + ')');
    const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
    let got = 0, shown = -1;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      parts.push(value); got += value.length;
      const pct = total ? Math.floor(got / total * 100) : 0;
      if (pct !== shown && win && !win.isDestroyed()) { shown = pct; win.webContents.send('music:engine', pct); }
    }
    fs.writeFileSync(ytdlp + '.part', Buffer.concat(parts));
    fs.renameSync(ytdlp + '.part', ytdlp);
    ytdlpFresh = true;
  })().finally(() => { ytdlpGet = null; });
}
function runYt(args, ms = 60000){
  return new Promise(res => {
    const p = spawn(ytdlp, ['--no-warnings', '--no-config', ...args], { cwd: binDir, windowsHide: true });
    let out = '', err = '';
    const t = setTimeout(() => p.kill(), ms);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(t); res({ code: -1, out, err: e.message }); });
    p.on('close', code => { clearTimeout(t); res({ code, out, err }); });
  });
}
// one retry after "yt-dlp -U" when YouTube changed something under it
async function yt(args, ms){
  await ensureYtdlp();
  let r = await runYt(args, ms);
  if (r.code !== 0 && !ytdlpFresh) { ytdlpFresh = true; await runYt(['-U'], 90000); r = await runYt(args, ms); }
  return r;
}
const ytErr = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err || 'no answer').replace(/^ERROR:\s*/, '').trim().slice(0, 200);
ipcMain.handle('music:state', () => ({ ready: fs.existsSync(ytdlp) }));
ipcMain.handle('music:search', async (_, q) => {
  try {
    const r = await yt([`ytsearch24:${q}`, '--flat-playlist', '-J'], 45000);
    if (r.code !== 0) return { ok: false, error: ytErr(r) };
    const j = JSON.parse(r.out);
    return { ok: true, list: (j.entries || []).filter(e => e.id && e.duration).map(e => ({ id: e.id, title: e.title, artist: e.channel || e.uploader || '', dur: Math.round(e.duration) })) };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('music:url', async (_, id) => {
  try {
    const r = await yt(['-f', 'bestaudio[ext=m4a]/bestaudio', '-g', 'https://www.youtube.com/watch?v=' + id], 45000);
    const url = r.out.trim().split('\n')[0];
    return r.code === 0 && /^https:/.test(url) ? { ok: true, url } : { ok: false, error: ytErr(r) };
  } catch (e) { return { ok: false, error: e.message }; }
});

/* ---------- app info + updates ----------
   New versions are GitHub releases. The installer downloads in the background and runs silently
   when you click "Restart to update". */
const REPO = 'k4zmx/Fukuro';
const updatesDir = path.join(app.getPath('userData'), 'updates');
ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, dataFile, notesRoot, defaultNotes, notesLocked: !!process.env.EDT_NOTES_DIR }));
ipcMain.on('win:show', () => showMain());
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
let ready = null, checking = null;   // ready: {version, notes, file} once the installer is on disk
async function fetchUpdate(){
  const gh = { 'User-Agent': 'Fukuro', Accept: 'application/vnd.github+json' };
  // Chromium's network stack (proxy settings, IPv4 fallback) rather than Node's fetch
  const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: gh });
  if (!r.ok) return;
  const rel = await r.json(), version = String(rel.tag_name || '').replace(/^v/, '');
  const asset = (rel.assets || []).find(a => /\.exe$/i.test(a.name));
  if (!asset || !newer(version, app.getVersion())) return;
  const file = path.join(updatesDir, path.basename(asset.name));
  if (!fs.existsSync(file) || fs.statSync(file).size !== asset.size) {
    fs.mkdirSync(updatesDir, { recursive: true });
    fs.readdirSync(updatesDir).forEach(f => fs.rmSync(path.join(updatesDir, f), { force: true }));
    const d = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'Fukuro' } });
    if (!d.ok) return;
    fs.writeFileSync(file + '.part', Buffer.from(await d.arrayBuffer()));
    fs.renameSync(file + '.part', file);
  }
  ready = { version, notes: (rel.body || '').split('\n')[0].trim(), file };
}
async function checkUpdate(){
  if (app.isPackaged) await (checking ||= fetchUpdate().catch(() => {}).finally(() => { checking = null; }));
  return ready ? { current: app.getVersion(), available: true, version: ready.version, notes: ready.notes } : { current: app.getVersion(), available: false };
}
ipcMain.handle('update:check', checkUpdate);
ipcMain.handle('update:install', () => {
  if (!ready || !fs.existsSync(ready.file)) return false;
  spawn('cmd.exe', ['/c', `ping -n 3 127.0.0.1 >nul & "${ready.file}" /S --force-run`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  quitting = true; app.quit();
  return true;
});
let lastOffered = null;
async function offerUpdate(){
  if (!app.isPackaged) return;
  const u = await checkUpdate();
  if (u.available && u.version !== lastOffered && win && !win.isDestroyed()) { lastOffered = u.version; win.webContents.send('update:available', u); }
}

/* ---------- tray ---------- */
function showMain(){
  if (!win || win.isDestroyed()) return createWindow(true);
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function buildTrayMenu(){
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Fukurō', click: showMain },
    { label: 'Quick capture', accelerator: settings.hotkey, click: showCapture },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: settings.autostart, enabled: app.isPackaged,
      click: i => { settings.autostart = i.checked; saveSettings(); applyAutostart(); } },
    { label: 'Keep running when closed', type: 'checkbox', checked: settings.closeToTray,
      click: i => { settings.closeToTray = i.checked; saveSettings(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}
function createTray(){
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('Fukurō');
  tray.on('click', showMain);
  buildTrayMenu();
}

function createWindow(visible){
  const b = readJSON(winFile, { width: 1440, height: 900 });
  win = new BrowserWindow({
    ...b,
    minWidth: 1000, minHeight: 640,
    title: 'Fukurō',
    icon: iconPath,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12110f' : '#e7e0d1',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.removeMenu();
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => { if (visible) win.show(); });
  win.on('focus', () => win.flashFrame(false));
  win.loadFile('index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // a click inside the YouTube player gives it focus, and its keys never reach the page
  win.webContents.on('before-input-event', (_, i) => { if (i.type === 'keyDown' && i.key === 'Escape') win.webContents.send('key:esc'); });
  win.on('close', e => {
    const maximized = win.isMaximized();
    fs.writeFileSync(winFile, JSON.stringify({ ...(maximized ? readJSON(winFile, {}) : win.getBounds()), maximized }));
    // closing hides to the tray so timers and the hotkey keep working
    if (!quitting && settings.closeToTray) {
      e.preventDefault(); win.hide();
      if (!settings.trayHintShown) {
        settings.trayHintShown = true; saveSettings();
        tray.displayBalloon({ iconType: 'info', title: 'Fukurō is still running', content: 'Timers keep going. Right-click the owl in the tray to quit.' });
      }
    }
  });
}

app.on('second-instance', showMain);
app.whenReady().then(() => {
  // a file:// page sends no referrer, and YouTube's embed then fails with "player configuration error"
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] }, (d, cb) => {
    d.requestHeaders.Referer = 'https://www.youtube-nocookie.com/'; cb({ requestHeaders: d.requestHeaders });
  });
  createTray();
  createWindow(!process.argv.includes('--hidden'));
  createCapture();
  registerHotkey();
  applyAutostart();
  setTimeout(offerUpdate, 15000);
  setInterval(offerUpdate, 3 * 3600 * 1000);
});
app.on('before-quit', () => { quitting = true; if (timer) flush(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (timer) flush(); if (quitting || !settings.closeToTray) app.quit(); });
