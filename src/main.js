const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

function readAsset(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function getCombinedCss() {
  const prePaintHide = `
    html:not(.uit-shell-ready) body > * {
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;

  return [
    prePaintHide,
    readAsset('styles/shell.css'),
    readAsset('styles/trang-chu.css'),
    readAsset('styles/login.css'),
    readAsset('styles/ho-so.css'),
  ].join('\n');
}

function injectEarlyCss(webContents, targetUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl || webContents.getURL());
  } catch {
    return;
  }

  if (parsedUrl.hostname !== 'portal.uit.edu.vn') return;

  const combinedCss = getCombinedCss();
  if (combinedCss.trim()) {
    webContents.insertCSS(combinedCss).catch(console.error);
  }
}

function injectCustomUI(webContents) {
  const currentUrl = webContents.getURL();
  let parsedUrl;
  try {
    parsedUrl = new URL(currentUrl);
  } catch {
    return;
  }

  if (parsedUrl.hostname !== 'portal.uit.edu.vn') return;

  injectEarlyCss(webContents, currentUrl);

  // UIT Logo
  const brandPath = path.join(__dirname, 'assets/uit-logo-white.png');
  let brandBase = '';
  if (fs.existsSync(brandPath)) {
    const bitmap = fs.readFileSync(brandPath);
    brandBase = `data:image/png;base64,${bitmap.toString('base64')}`;
  }

  const shellHtml = readAsset('layouts/shell.html');
  const shellJs = readAsset('scripts/shell.js');
  const trangChuJs = readAsset('scripts/trang-chu.js');

  const bootstrapCode = `
    (() => {
      if (!window.__UIT_SHELL_HTML__) { window.__UIT_SHELL_HTML__ = ${JSON.stringify(shellHtml)}; }
      if (!window.__UIT_BRAND__)      { window.__UIT_BRAND__ = ${JSON.stringify(brandBase)}; }
      ${shellJs}
      ${trangChuJs}
    })();
  `;

  webContents.executeJavaScript(bootstrapCode).catch(console.error);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { 
      titleBarOverlay: 
      {
        color: 'rgba(0,0,0,0)',
        symbolColor: '#74b1be',
        height: 82
      },
    } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    frame: true
  });

  // Block UMA assistant scripts, styles, and API calls
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://uma.uit.edu.vn/*', '*://*.uma.uit.edu.vn/*'] },
    (details, callback) => callback({ cancel: true })
  );

  mainWindow.loadURL('https://portal.uit.edu.vn/api/auth/login');

  // Inject CSS before first paint on every navigation
  mainWindow.webContents.on('did-commit-navigation', (event, url) => {
    injectEarlyCss(mainWindow.webContents, url);
  });

  mainWindow.webContents.on('dom-ready', () => {
    injectCustomUI(mainWindow.webContents);
  });

  mainWindow.webContents.on('did-navigate-in-page', () => {
    mainWindow.webContents.executeJavaScript(`
      if (window.__updateCustomRouteState) window.__updateCustomRouteState();
    `).catch(console.error);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});