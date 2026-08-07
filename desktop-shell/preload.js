const { contextBridge, ipcRenderer, clipboard } = require('electron');

// --- Lifecycle relay: main.js sends 'jedida:lifecycle' on window
// focus/blur/minimize/restore; jedidaNativeBridge.js's onLifecycleChange()
// calls this the same way it calls Capacitor's App.addListener, so page
// code never has to know which shell (or none) it's running in.
function onLifecycleChange(callback) {
  const listener = (_event, isActive) => callback(isActive);
  ipcRenderer.on('jedida:lifecycle', listener);
  return () => ipcRenderer.removeListener('jedida:lifecycle', listener);
}

// Exposes window.jedidaDesktop to the live site (same pattern as the
// Capacitor `window.Capacitor` bridge on mobile) — the existing frontend can
// feature-detect this and use it optionally; regular browser visits never
// see it, so nothing about the current site's behavior changes.
contextBridge.exposeInMainWorld('jedidaDesktop', {
  isDesktop: true,
  platform: process.platform, // 'win32' | 'darwin' | 'linux'

  onLifecycleChange,

  notify: (title, body) => ipcRenderer.invoke('jedida:notify', { title, body }),

  copyToClipboard: (text) => clipboard.writeText(text),
  readClipboard: () => clipboard.readText(),

  saveFile: (suggestedName, data) => ipcRenderer.invoke('jedida:save-file', { suggestedName, data }),

  isOffline: () => ipcRenderer.invoke('jedida:is-offline'),
  retryLoad: () => ipcRenderer.invoke('jedida:retry-load')
});
