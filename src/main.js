const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

function readAsset(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function readImageBase64(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  if (!fs.existsSync(fullPath)) return '';
  return `data:image/png;base64,${fs.readFileSync(fullPath).toString('base64')}`;
}

const BRAND_WHITE_BASE64 = readImageBase64('assets/uit-logo-white.png');
const BRAND_DETAIL_BASE64 = readImageBase64('assets/uit-logo-detail.png');

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
      padding: 0 138px 0 14px !important;
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

    #cd-titlebar-controls {
      margin-left: auto !important;
      height: 100% !important;
      display: flex !important;
      align-items: stretch !important;
      gap: 0 !important;
      flex-shrink: 0 !important;
      -webkit-app-region: no-drag !important;
    }

    .cd-titlebar-btn {
      width: 46px !important;
      height: 100% !important;
      background: transparent !important;
      border: none !important;
      border-radius: 0 !important;
      outline: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-shrink: 0 !important;
      color: var(--col-sec-text, #8b949e) !important;
      cursor: pointer !important;
      transition: background-color 0.15s ease, color 0.15s ease !important;
      -webkit-app-region: no-drag !important;
    }

    .cd-titlebar-btn svg {
      display: block !important;
      transition: color 0.15s ease, stroke 0.15s ease !important;
    }

    .cd-titlebar-btn:hover {
      background-color: color-mix(in srgb, var(--col-head-text, #f0f6fc) 10%, transparent) !important;
      border: none !important;
      color: var(--col-head-text, #f0f6fc) !important;
    }

    .cd-titlebar-btn:active {
      background-color: color-mix(in srgb, var(--col-head-text, #f0f6fc) 16%, transparent) !important;
      color: var(--col-hi-text, #ffffff) !important;
    }

    html:not(:has(body.with-custom-shell)) #cd-toggle-sidebar-btn,
    html:not(:has(body.with-custom-shell)) #cd-toggle-header-btn,
    body:not(.with-custom-shell) #cd-toggle-sidebar-btn,
    body:not(.with-custom-shell) #cd-toggle-header-btn {
      display: none !important;
    }

    html,
    body {
      height: 100vh !important;
      max-height: 100vh !important;
      margin: 0 !important;
      overflow: hidden !important;
    }

    body:not(.with-custom-shell) {
      position: fixed !important;
      top: 36px !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      height: auto !important;
      max-height: none !important;
      padding-top: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      box-sizing: border-box !important;
    }
  `;
}

function getCombinedCss(isPortalHost) {
  if (!isPortalHost) {
    return getGlobalTitlebarCss();
  }

  const prePaintHide = `
    html:not(.uit-shell-ready) body > *:not(#cd-titlebar):not(#cd-boot-curtain) {
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;

  return [
    prePaintHide,
    getGlobalTitlebarCss(),
    readAsset('styles/shell.css'),
    readAsset('styles/trang-chu.css'),
    readAsset('styles/ho-so.css'),
  ].join('\n');
}

function getEarlyBootstrapScript(isPortalHost) {
  return `
    (() => {
      if (!window.__UIT_BRAND__) {
        window.__UIT_BRAND__ = ${JSON.stringify(BRAND_WHITE_BASE64)};
      }
      const isPortalHost = ${JSON.stringify(isPortalHost)};

      const applyEarlyTheme = () => {
        try {
          const pathname = window.location.pathname || '';
          const disableTheme = isPortalHost && (
            pathname.startsWith('/login') ||
            pathname.startsWith('/api/auth') ||
            pathname.startsWith('/khao-sat')
          );
          const savedCss = localStorage.getItem('uit_custom_theme_css');
          if (savedCss && !disableTheme && !document.getElementById('cd-custom-theme-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'cd-custom-theme-style';
            styleEl.textContent = savedCss;
            (document.head || document.documentElement).appendChild(styleEl);
          }
        } catch {}
      };

      const ensureEarlyBootCurtain = () => {
        if (!isPortalHost || window.__bootCurtainPlayed || !document.documentElement) return;
        window.__bootCurtainPlayed = true;
        if (document.getElementById('cd-boot-curtain')) return;

        const curtain = document.createElement('div');
        curtain.id = 'cd-boot-curtain';
        curtain.style.cssText = [
          'position: fixed',
          'inset: 0',
          'z-index: 99999',
          'background-color: var(--col-pri-bg, #0d1117)',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'opacity: 1',
          'transition: opacity 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
          'pointer-events: none'
        ].join(';');

        if (window.__UIT_BRAND__) {
          const logo = document.createElement('img');
          logo.src = window.__UIT_BRAND__;
          logo.alt = 'UIT';
          logo.style.cssText = 'width: 56px; height: 56px; object-fit: contain;';
          curtain.appendChild(logo);
        }

        document.documentElement.appendChild(curtain);
        window.__curtainPaintedAt = 0;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.__curtainPaintedAt = Date.now();
          });
        });
      };

      const ensureEarlyTitlebar = () => {
        const target = document.body || document.documentElement;
        if (!target) return false;

        let titlebar = document.getElementById('cd-titlebar');
        if (!titlebar) {
          titlebar = document.createElement('div');
          titlebar.id = 'cd-titlebar';
          titlebar.innerHTML = \`
            <img id="cd-titlebar-icon" alt="UIT" />
            <span id="cd-titlebar-title">UIT Portal wrapper</span>
            <div id="cd-titlebar-controls">
              <button type="button" id="cd-refresh-btn" class="cd-titlebar-btn" title="Refresh Page">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              </button>
              <button type="button" id="cd-toggle-sidebar-btn" class="cd-titlebar-btn" title="Toggle Sidebar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              </button>
              <button type="button" id="cd-toggle-header-btn" class="cd-titlebar-btn" title="Toggle Header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
              </button>
            </div>
          \`;
          target.insertAdjacentElement('afterbegin', titlebar);
        } else if (document.body && titlebar.parentElement !== document.body) {
          document.body.insertAdjacentElement('afterbegin', titlebar);
        }

        const iconEl = document.getElementById('cd-titlebar-icon');
        if (iconEl) {
          if (window.__UIT_BRAND__) {
            iconEl.src = window.__UIT_BRAND__;
            iconEl.style.display = 'block';
          } else {
            iconEl.style.display = 'none';
          }
        }

        return Boolean(document.body);
      };

      applyEarlyTheme();
      ensureEarlyBootCurtain();
      if (!ensureEarlyTitlebar()) {
        const earlyObserver = new MutationObserver(() => {
          applyEarlyTheme();
          ensureEarlyBootCurtain();
          if (ensureEarlyTitlebar()) {
            earlyObserver.disconnect();
          }
        });
        earlyObserver.observe(document, { childList: true, subtree: true });
      }
    })();
  `;
}

function injectEarlyShell(webContents, targetUrl) {
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
  webContents.executeJavaScript(getEarlyBootstrapScript(isPortalHost)).catch(console.error);
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
  injectEarlyShell(webContents, currentUrl);

  const shellHtml = isPortalHost ? readAsset('layouts/shell.html') : '';
  const shellJs = readAsset('scripts/shell.js');
  const trangChuJs = isPortalHost ? readAsset('scripts/trang-chu.js') : '';
  const appVersion = app.getVersion();

  const bootstrapCode = `
    (() => {
      if (!window.__UIT_SHELL_HTML__)   { window.__UIT_SHELL_HTML__ = ${JSON.stringify(shellHtml)}; }
      if (!window.__UIT_BRAND__)        { window.__UIT_BRAND__ = ${JSON.stringify(BRAND_WHITE_BASE64)}; }
      if (!window.__UIT_BRAND_DETAIL__) { window.__UIT_BRAND_DETAIL__ = ${JSON.stringify(BRAND_DETAIL_BASE64)}; }
      if (!window.__UIT_APP_VERSION__)  { window.__UIT_APP_VERSION__ = ${JSON.stringify(appVersion)}; }
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
      titleBarOverlay: {
        color: 'rgba(0,0,0,0)',
        symbolColor: '#8b949e',
        height: 36
      },
    } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    frame: true
  });

  // Sync native titleBarOverlay symbol color with active CSS theme variables
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (process.platform === 'darwin' || typeof mainWindow.setTitleBarOverlay !== 'function') return;
    if (typeof message !== 'string' || !message.startsWith('__UIT_TITLEBAR_OVERLAY__')) return;
    try {
      const payload = JSON.parse(message.slice('__UIT_TITLEBAR_OVERLAY__'.length));
      if (payload && payload.symbolColor) {
        mainWindow.setTitleBarOverlay({
          color: 'rgba(0,0,0,0)',
          symbolColor: payload.symbolColor,
          height: 36
        });
      }
    } catch {}
  });

  // Block UMA assistant scripts, styles, and API calls
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://uma.uit.edu.vn/*', '*://*.uma.uit.edu.vn/*'] },
    (details, callback) => callback({ cancel: true })
  );

  mainWindow.loadURL('https://portal.uit.edu.vn/login');

  // Inject CSS, titlebar, and boot curtain before first paint on every navigation
  mainWindow.webContents.on('did-commit-navigation', (event, url) => {
    injectEarlyShell(mainWindow.webContents, url);
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

app.disableHardwareAcceleration();
app.commandLine.appendSwitch(
  'disable-features',
  'BackForwardCache,MediaRouter,OptimizationHints,Translate,CalculateNativeWinOcclusion','DirectCompositionVideoOverlays'
);
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=192');
app.commandLine.appendSwitch('enable-low-end-device-mode');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.commandLine.appendSwitch('disable-direct-composition');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});