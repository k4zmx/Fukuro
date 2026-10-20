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
  // used by the quick-capture window
  captureSubmit: text => ipcRenderer.send('capture:submit', text),
  captureHide: () => ipcRenderer.send('capture:hide'),
  captureShow: () => ipcRenderer.send('capture:show'),
  onCaptureOpen: cb => ipcRenderer.on('capture:open', (_, mode) => cb(mode)),
});
