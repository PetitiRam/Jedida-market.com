const { app, BrowserWindow, session, shell, ipcMain, Notification, dialog, protocol } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const PRODUCTION_URL = 'https://jedidamarketplace.com';
const OFFICIAL_HOST = 'jedidamarketplace.com';

let mainWindow;
let isOffline = false;

const isOfficialUrl = (urlString) => {
  try {
    const { protocol: proto, hostname } = new URL(urlString);
    return proto === 'https:' && (hostname === OFFICIAL_HOST || hostname.endsWith(`.${OFFICIAL_HOST}`));
  } catch {
    return false;
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0B3D24', // matches native splash while the window paints
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.loadFile('splash.html');

  // --- Security: only ever navigate the main window to our own domain.
  // Everything else (partner links, payment redirects the site opens) goes
  // to the system browser instead of inside the shell.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isOfficialUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOfficialUrl(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode) => {
    if (errorCode === -3) return; // ERR_ABORTED from a cancelled/redirected load, not a real failure
    isOffline = true;
    mainWindow.loadFile('offline.html');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
  });

  // --- Lifecycle: forward window focus/blur to the page, same shape as
  // Capacitor's appStateChange on mobile, so jedidaNativeBridge.js can
  // expose one onLifecycleChange() regardless of platform.
  mainWindow.on('focus', () => mainWindow.webContents.send('jedida:lifecycle', true));
  mainWindow.on('blur', () => mainWindow.webContents.send('jedida:lifecycle', false));
  mainWindow.on('minimize', () => mainWindow.webContents.send('jedida:lifecycle', false));
  mainWindow.on('restore', () => mainWindow.webContents.send('jedida:lifecycle', true));

  loadProductionSite();
}

function loadProductionSite() {
  mainWindow.loadURL(PRODUCTION_URL).catch(() => {
    isOffline = true;
    mainWindow.loadFile('offline.html');
  });
}

// --- Deep links: jedidamarketplace://... ---
function handleDeepLink(url) {
  if (!mainWindow) return;
  let target;
  try {
    const parsed = new URL(url);
    // Map jedidamarketplace://product/123 -> https://jedidamarketplace.com/product/123
    target = `${PRODUCTION_URL}${parsed.pathname}${parsed.search}`;
  } catch {
    return;
  }
  if (isOfficialUrl(target)) {
    mainWindow.loadURL(target);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

if (!app.isDefaultProtocolClient('jedidamarketplace')) {
  app.setAsDefaultProtocolClient('jedidamarketplace');
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const deepLinkArg = argv.find((a) => a.startsWith('jedidamarketplace://'));
    if (deepLinkArg) handleDeepLink(deepLinkArg);
    else if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    // Restrict the whole session to HTTPS + our own domain and its API host.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      const { protocol: proto, hostname } = new URL(details.url);
      const allowed =
        (proto === 'https:' && (hostname === OFFICIAL_HOST || hostname.endsWith(`.${OFFICIAL_HOST}`))) ||
        details.url.startsWith('devtools://');
      callback({ cancel: !allowed });
    });

    createWindow();

    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify(); // updates the SHELL binary only; site content is always live

    const macDeepLink = process.argv.find((a) => a.startsWith('jedidamarketplace://'));
    if (macDeepLink) handleDeepLink(macDeepLink);
  });
}

app.on('open-url', (event, url) => { // macOS
  event.preventDefault();
  handleDeepLink(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC bridge for preload.js (see preload.js for the renderer-facing API) ---
ipcMain.handle('jedida:notify', (_e, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
});

ipcMain.handle('jedida:save-file', async (_e, { suggestedName, data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName });
  if (canceled || !filePath) return null;
  require('fs').writeFileSync(filePath, Buffer.from(data));
  return filePath;
});

ipcMain.handle('jedida:retry-load', () => {
  isOffline = false;
  loadProductionSite();
});

ipcMain.handle('jedida:is-offline', () => isOffline);
