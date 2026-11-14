const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

function readAsset(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function getGlobalTitlebarCss() {
  return `
    #cd-titlebar {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 36px !important;
      background-color: var(--col-pri-nav, #161b22) !important;
      border-bottom: 1px solid var(--col-out-nav, #30363d) !important;
      color: var(--col-head-text, #f0f6fc) !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 0 148px 0 14px !important;
      z-index: 2147483647 !important;
      box-sizing: border-box !important;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif !important;
      user-select: none !important;
      -webkit-app-region: drag !important;
    }

    #cd-titlebar-icon {
      width: 18px !important;
      height: 18px !important;
      object-fit: contain !important;
      flex-shrink: 0 !important;
    }

    #cd-titlebar-title {
      font-size: 0.82rem !important;
      font-weight: 600 !important;
      letter-spacing: 0.2px !important;
      color: var(--col-head-text, #f0f6fc) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    body:not(.with-custom-shell) {
      padding-top: 36px !important;
      box-sizing: border-box !important;
    }
  `;
}

function getCombinedCss(isPortalHost) {
  if (!isPortalHost) {
    return getGlobalTitlebarCss();
  }

  const prePaintHide = `
    html:not(.uit-shell-ready) body > * {
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;

  return [
    prePaintHide,
    getGlobalTitlebarCss(),
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

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return;

  const isPortalHost = parsedUrl.hostname === 'portal.uit.edu.vn';
  const combinedCss = getCombinedCss(isPortalHost);
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

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return;

  const isPortalHost = parsedUrl.hostname === 'portal.uit.edu.vn';
  injectEarlyCss(webContents, currentUrl);

  // UIT Logo
  const brandPath = path.join(__dirname, 'assets/uit-logo-white.png');
  let brandBase = '';
  if (fs.existsSync(brandPath)) {
    const bitmap = fs.readFileSync(brandPath);
    brandBase = `data:image/png;base64,${bitmap.toString('base64')}`;
  }

  const shellHtml = isPortalHost ? readAsset('layouts/shell.html') : '';
  const shellJs = readAsset('scripts/shell.js');
  const trangChuJs = isPortalHost ? readAsset('scripts/trang-chu.js') : '';

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
        height: 36
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

  mainWindow.loadURL('https://portal.uit.edu.vn/login');

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