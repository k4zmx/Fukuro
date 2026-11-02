const { contextBridge, ipcRenderer } = require('electron');

const data = ipcRenderer.sendSync('store:load') || {};

contextBridge.exposeInMainWorld('deskStorage', {
  getItem: k => (k in data ? data[k] : null),
  setItem: (k, v) => { data[k] = String(v); ipcRenderer.send('store:set', k, String(v)); },
  removeItem: k => { delete data[k]; ipcRenderer.send('store:remove', k); },
  keys: () => Object.keys(data),
});

contextBridge.exposeInMainWorld('deskApp', {
  progress: p => ipcRenderer.send('win:progress', p),
  flash: () => ipcRenderer.send('win:flash'),
  pickFolder: () => ipcRenderer.invoke('pick:folder'),
  gitInfo: dir => ipcRenderer.invoke('git:info', dir),
  scanRepos: () => ipcRenderer.invoke('scan:repos'),
  openPath: p => ipcRenderer.invoke('open:path', p),
  openUrl: u => ipcRenderer.invoke('open:url', u),
  openCode: p => ipcRenderer.invoke('open:code', p),
  ytMeta: url => ipcRenderer.invoke('yt:meta', url),
  ytProbe: () => ipcRenderer.invoke('yt:probe'),
  onEsc: cb => ipcRenderer.on('key:esc', () => cb()),
  music: {
    state: () => ipcRenderer.invoke('music:state'),
    search: q => ipcRenderer.invoke('music:search', q),
    url: id => ipcRenderer.invoke('music:url', id),
    onEngine: cb => ipcRenderer.on('music:engine', (_, p) => cb(p)),
  },
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    write: (rel, text) => ipcRenderer.invoke('notes:write', rel, text),
    create: (folder, title, text) => ipcRenderer.invoke('notes:create', folder, title, text),
    rename: (rel, title, folder) => ipcRenderer.invoke('notes:rename', rel, title, folder),
    trash: rel => ipcRenderer.invoke('notes:trash', rel),
    mkdir: name => ipcRenderer.invoke('notes:mkdir', name),
    rmdir: name => ipcRenderer.invoke('notes:rmdir', name),
    reveal: rel => ipcRenderer.invoke('notes:reveal', rel),
    image: (rel, data) => ipcRenderer.invoke('notes:image', rel, data),
  },
  settings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (k, v) => ipcRenderer.invoke('settings:set', k, v),
  onCapture: cb => ipcRenderer.on('capture', (_, text) => cb(text)),
  info: () => ipcRenderer.invoke('app:info'),
  show: () => ipcRenderer.send('win:show'),
  testHotkey: k => ipcRenderer.invoke('hotkey:test', k),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: cb => ipcRenderer.on('update:available', (_, u) => cb(u)),
  ai: {
    ask: opts => ipcRenderer.invoke('ai:ask', opts),
    status: () => ipcRenderer.invoke('ai:status'),
    chat: opts => ipcRenderer.invoke('ai:chat', opts),
    stop: id => ipcRenderer.send('ai:stop', id),
    onDelta: cb => ipcRenderer.on('ai:delta', (_, id, t) => cb(id, t)),
  },
  captureDone: r => ipcRenderer.send('capture:done', r),
  onCaptureUndo: cb => ipcRenderer.on('capture:undo', () => cb()),
  // used by the quick-capture window
  captureSubmit: text => ipcRenderer.send('capture:submit', text),
  captureHide: () => ipcRenderer.send('capture:hide'),
  captureShow: () => ipcRenderer.send('capture:show'),
  captureUndo: () => ipcRenderer.send('capture:undo'),
  onCaptureOpen: cb => ipcRenderer.on('capture:open', (_, mode, ai) => cb(mode, ai)),
  onCaptureResult: cb => ipcRenderer.on('capture:done', (_, r) => cb(r)),
});
