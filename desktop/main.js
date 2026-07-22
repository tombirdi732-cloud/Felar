// Roost desktop shell (Electron) — THIN CLIENT.
//
// Instead of bundling the UI inside the .exe, the app loads the interface
// directly from your Roost server (config.json → serverUrl, overridable with
// the ROOST_SERVER_URL env var). That means design/logic updates you push to
// the server reach every user on next launch — no re-installing the app.
//
// If the server URL is empty or points at localhost and no server responds,
// it falls back to the bundled public/ files so `npm run desktop` still works
// for local development.

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

function readServerUrl() {
  if (process.env.ROOST_SERVER_URL) return process.env.ROOST_SERVER_URL.trim();
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    return (cfg.serverUrl || '').trim();
  } catch {
    return '';
  }
}

// Resolve quickly whether the configured server is reachable.
function isReachable(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, (res) => { res.destroy(); finish(true); });
      req.on('error', () => finish(false));
      req.setTimeout(2500, () => { req.destroy(); finish(false); });
    } catch {
      finish(false);
    }
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    backgroundColor: '#0d1117',
    title: 'Roost',
    icon: path.join(__dirname, '..', 'public', 'assets', 'icons', 'app-icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const serverUrl = readServerUrl();
  const reachable = serverUrl ? await isReachable(serverUrl) : false;

  if (reachable) {
    win.loadURL(serverUrl);
  } else {
    // Dev / offline fallback: load the bundled client.
    win.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
  }

  // Open external links in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
