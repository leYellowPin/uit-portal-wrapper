const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function readAsset(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function readAssetFromCandidates(relativePaths) {
  for (const relativePath of relativePaths) {
    const fullPath = path.join(__dirname, relativePath);
    if (fs.existsSync(fullPath)) {
      console.info(`[UIT Wrapper] Loaded asset: ${relativePath}`);
      return fs.readFileSync(fullPath, 'utf8');
    }
  }
  console.warn(`[UIT Wrapper] Asset not found in: ${relativePaths.join(', ')}`);
  return '';
}

function readJsonAsset(relativePath, fallback = { items: [], excludeTitles: [] }) {
  const raw = readAsset(relativePath);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { items: parsed, excludeTitles: [] };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        excludeTitles: Array.isArray(parsed.excludeTitles) ? parsed.excludeTitles : []
      };
    }
    return fallback;
  } catch (err) {
    console.error(`[UIT Wrapper] Failed to parse ${relativePath}:`, err);
    return fallback;
  }
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function readImageBase64(relativePath) {
  if (!relativePath) return '';
  const fullPath = path.join(__dirname, relativePath);
  if (!fs.existsSync(fullPath)) return '';
  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/png';
  return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
}

const DEFAULT_WEB_SHORTCUTS = [
  { id: 'uit-official', name: 'Website chính thức', url: 'https://uit.edu.vn', icon: 'shortcut-uit.png' },
  { id: 'uit-portal', name: 'Cổng thông tin', url: 'https://portal.uit.edu.vn', icon: 'shortcut-portal.png' },
  { id: 'uit-drl', name: 'Điểm rèn luyện', url: 'https://drl.uit.edu.vn', icon: 'shortcut-drl.png' },
  { id: 'uit-dkhp', name: 'Đăng ký học phần', url: 'https://dkhp.uit.edu.vn', icon: 'shortcut-dkhp.png' },
  { id: 'uit-moodle', name: 'Moodle', url: 'https://courses.uit.edu.vn', icon: 'shortcut-moodle.png' },
  { id: 'uit-forum', name: 'Forum', url: 'https://forum.uit.edu.vn', icon: 'shortcut-forum.png' }
];

function getResolvedWebShortcuts() {
  const raw = readAsset('config/web-shortcuts.json');
  let list = DEFAULT_WEB_SHORTCUTS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && Array.isArray(parsed.shortcuts)) {
        list = parsed.shortcuts;
      } else if (parsed && Array.isArray(parsed.items)) {
        list = parsed.items;
      }
    } catch (err) {
      console.error('[UIT Wrapper] Failed to parse config/web-shortcuts.json:', err);
    }
  }

  return list
    .filter((item) => item && typeof item === 'object' && item.url)
    .map((item, idx) => {
      const rawUrl = String(item.url).trim();
      const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      const rawIcon = String(item.icon || '').trim().replace(/^assets[\\/]/i, '');
      const iconSrc = rawIcon ? readImageBase64(path.join('assets', rawIcon)) : '';
      return {
        id: String(item.id || `shortcut-${idx}`),
        name: String(item.name || rawUrl).trim(),
        url,
        icon: rawIcon,
        iconSrc
      };
    });
}

function isCustomShellUrl(parsedUrl) {
  if (!parsedUrl || parsedUrl.hostname !== 'portal.uit.edu.vn') return false;
  const p = parsedUrl.pathname || '';
  return p.startsWith('/trang-chu') || p.startsWith('/sinh-vien');
}

const BRAND_WHITE_BASE64 = readImageBase64('assets/uit-logo-white.png');

const ASSETS = {
  titlebarHtml: readAsset('layouts/titlebar.html'),
  bootCurtainHtml: readAsset('layouts/boot-curtain.html'),
  shellHtml: readAsset('layouts/shell.html'),
  trangChuHtml: readAsset('layouts/trang-chu.html'),
  shellCss: readAssetFromCandidates(['styles/shell.css', 'src/styles/shell.css', 'shell.css']),
  trangChuCss: readAsset('styles/trang-chu.css'),
  hoSoCss: readAsset('styles/ho-so.css'),
  shellJs: readAssetFromCandidates(['scripts/shell.js', 'src/scripts/shell.js', 'shell.js']),
  trangChuJs: readAsset('scripts/trang-chu.js'),
  searchItems: readJsonAsset('config/search-items.json', { items: [], excludeTitles: [] })
};

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
      display: grid !important;
      grid-template-columns: 1fr auto 1fr !important;
      align-items: center !important;
      column-gap: 12px !important;
      padding: 0 138px 0 14px !important;
      z-index: 2147483647 !important;
      box-sizing: border-box !important;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif !important;
      user-select: none !important;
      -webkit-app-region: drag !important;
    }

    #cd-titlebar-left {
      grid-column: 1 !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      min-width: 0 !important;
      justify-self: start !important;
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
      grid-column: 3 !important;
      margin-left: 0 !important;
      justify-self: end !important;
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

    html:not(.uit-custom-shell):not(:has(body.with-custom-shell)) #cd-toggle-sidebar-btn,
    html:not(.uit-custom-shell):not(:has(body.with-custom-shell)) #cd-search-wrap,
    body:not(.with-custom-shell) #cd-search-wrap {
      display: none !important;
    }

    html,
    body {
      height: 100vh !important;
      max-height: 100vh !important;
      margin: 0 !important;
      overflow: hidden !important;
    }

    html:not(.uit-custom-shell) body:not(.with-custom-shell) {
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

const PORTAL_COMBINED_CSS = [
  `
    /* UIT modal viewport fix v2: the titlebar remains above this layer. */
    body.with-custom-shell [data-uit-modal-overlay="1"],
    body.with-custom-shell [data-slot="dialog-overlay"],
    body.with-custom-shell [data-slot="alert-dialog-overlay"],
    body.with-custom-shell [data-slot="sheet-overlay"],
    body.with-custom-shell [data-slot="drawer-overlay"],
    body.with-custom-shell [data-radix-dialog-overlay],
    body.with-custom-shell [data-radix-alert-dialog-overlay] {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 10000 !important;
    }

    body.with-custom-shell [role="dialog"],
    body.with-custom-shell [role="alertdialog"],
    body.with-custom-shell [aria-modal="true"],
    body.with-custom-shell dialog[open] {
      z-index: 10001 !important;
      max-height: calc(100vh - 72px) !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
    }

    /* Restore true viewport centering for ordinary dialogs on every page. */
    body.with-custom-shell [data-uit-modal-fix="default"][class*="top-1/2"],
    body.with-custom-shell [data-uit-modal-fix="default"][class*="top-[50%]"] {
      top: 50% !important;
    }

    /* Ticket creation: midpoint of the usable viewport (36px below titlebar). */
    body.with-custom-shell [data-uit-modal-fix="ticket-create"] {
      top: calc(50% + 18px) !important;
      max-height: calc(100vh - 80px) !important;
      overflow-y: auto !important;
    }

    /* Processed-ticket detail: pin below titlebar and scroll within viewport. */
    body.with-custom-shell [data-uit-modal-fix="ticket-detail"] {
      top: 48px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      max-height: calc(100vh - 64px) !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
    }
  `,
  `
    #cd-boot-curtain {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483646 !important;
      background-color: var(--col-pri-bg, #0d1117) !important;
    }
  `,
  getGlobalTitlebarCss(),
  ASSETS.shellCss,
  ASSETS.trangChuCss,
  ASSETS.hoSoCss
].join('\n');

const EXTERNAL_COMBINED_CSS = getGlobalTitlebarCss();

function getEarlyBootstrapScript(useCustomShell) {
  return `
    (() => {
      if (!window.__UIT_BRAND__)             { window.__UIT_BRAND__ = ${JSON.stringify(BRAND_WHITE_BASE64)}; }
      if (!window.__UIT_TITLEBAR_HTML__)     { window.__UIT_TITLEBAR_HTML__ = ${JSON.stringify(ASSETS.titlebarHtml)}; }
      if (!window.__UIT_BOOT_CURTAIN_HTML__) { window.__UIT_BOOT_CURTAIN_HTML__ = ${JSON.stringify(ASSETS.bootCurtainHtml)}; }

      const isCustomShellRoute = (pathname) => {
        if (window.location.hostname !== 'portal.uit.edu.vn') return false;
        const p = pathname || '';
        return p.startsWith('/trang-chu') || p.startsWith('/sinh-vien');
      };

      const activeCustomShell = ${JSON.stringify(Boolean(useCustomShell))} && isCustomShellRoute(window.location.pathname);

      if (document.documentElement) {
        document.documentElement.classList.toggle('uit-custom-shell', activeCustomShell);
      }

      if (activeCustomShell) {
        try {
          const savedCss = localStorage.getItem('uit_custom_theme_css');
          if (savedCss && !document.getElementById('cd-custom-theme-style') && document.documentElement) {
            const styleEl = document.createElement('style');
            styleEl.id = 'cd-custom-theme-style';
            styleEl.textContent = savedCss;
            document.documentElement.appendChild(styleEl);
          }
        } catch {}

        // Track same-origin fetch and XHR calls so the boot curtain waits until data loads
        if (!window.__uitNetworkHooked) {
          window.__uitNetworkHooked = true;
          window.__uitActiveNetworkCount = 0;
          window.__uitHoSoRscCache = null;
          window.__uitHoSoRscInFlight = null;

          const trackStart = () => {
            window.__uitActiveNetworkCount += 1;
            if (window.__scheduleBootCurtainCheck) window.__scheduleBootCurtainCheck();
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              window.__uitActiveNetworkCount = Math.max(0, window.__uitActiveNetworkCount - 1);
              if (window.__scheduleBootCurtainCheck) window.__scheduleBootCurtainCheck();
            };
            setTimeout(finish, 6000);
            return finish;
          };

          const origXhrSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.send = function (...args) {
            if (!this.__uitTracked) {
              this.__uitTracked = true;
              const finish = trackStart();
              this.addEventListener('loadend', () => {
                this.__uitTracked = false;
                finish();
              }, { once: true });
            }
            return origXhrSend.apply(this, args);
          };

          const origFetch = window.fetch.bind(window);

          const buildCachedResponse = (cached) => new Response(cached.body.slice(0), {
            status: cached.status,
            statusText: cached.statusText,
            headers: new Headers(cached.headers)
          });

          const fetchHoSoRsc = (url, stateTree, nextUrl) => {
            if (window.__uitHoSoRscCache) return Promise.resolve(window.__uitHoSoRscCache);
            if (window.__uitHoSoRscInFlight) return window.__uitHoSoRscInFlight;

            const headers = new Headers({
              'RSC': '1',
              'Accept': 'text/x-component',
              'Next-Url': nextUrl || window.location.pathname || '/trang-chu'
            });
            if (stateTree) headers.set('Next-Router-State-Tree', stateTree);

            const finish = trackStart();
            const task = origFetch(url, { method: 'GET', credentials: 'include', headers })
              .then(async (res) => {
                if (!res.ok) return null;
                const body = await res.arrayBuffer();
                if (body.byteLength < 50 * 1024) return null;
                const safeHeaders = [];
                res.headers.forEach((v, k) => {
                  const l = k.toLowerCase();
                  if (l !== 'content-encoding' && l !== 'content-length') safeHeaders.push([k, v]);
                });
                window.__uitHoSoRscCache = { body, status: res.status, statusText: res.statusText, headers: safeHeaders };
                return window.__uitHoSoRscCache;
              })
              .catch(() => null)
              .finally(() => {
                window.__uitHoSoRscInFlight = null;
                finish();
              });

            window.__uitHoSoRscInFlight = task;
            return task;
          };

          window.__preloadHoSoRsc = (stateTree, nextUrl) => fetchHoSoRsc('/sinh-vien/ho-so?_rsc=preload', stateTree, nextUrl);
          window.__clearHoSoRscCache = () => {
            window.__uitHoSoRscCache = null;
            window.__uitHoSoRscInFlight = null;
          };

          window.fetch = async (input, init) => {
            const isReq = typeof Request !== 'undefined' && input instanceof Request;
            const rawUrl = typeof input === 'string' ? input : (input instanceof URL ? input.href : input?.url);
            const method = (init?.method || (isReq ? input.method : 'GET') || 'GET').toUpperCase();

            let parsed = null;
            let sameOrigin = false;
            if (rawUrl) {
              try {
                parsed = new URL(rawUrl, window.location.origin);
                sameOrigin = parsed.origin === window.location.origin;
              } catch {}
            }

            if (parsed) {
              if (parsed.pathname.startsWith('/api/auth') || parsed.pathname === '/login' || (method !== 'GET' && parsed.pathname.startsWith('/sinh-vien/ho-so'))) {
                window.__clearHoSoRscCache();
              }

              if (method === 'GET' && sameOrigin && parsed.pathname === '/sinh-vien/ho-so' && parsed.searchParams.has('_rsc')) {
                const reqHeaders = new Headers(isReq ? input.headers : undefined);
                if (init?.headers) new Headers(init.headers).forEach((v, k) => reqHeaders.set(k, v));

                const isPrefetch = reqHeaders.has('Next-Router-Prefetch') || reqHeaders.has('Next-Router-Segment-Prefetch');
                if (isPrefetch) {
                  if (!window.__uitHoSoRscCache && !window.__uitHoSoRscInFlight) {
                    fetchHoSoRsc(parsed.pathname + parsed.search, reqHeaders.get('Next-Router-State-Tree'), reqHeaders.get('Next-Url'));
                  }
                  const finish = trackStart();
                  try { return await origFetch(input, init); } finally { finish(); }
                }

                if (window.__uitHoSoRscCache) return buildCachedResponse(window.__uitHoSoRscCache);

                if (window.__showHoSoRouteLoader) window.__showHoSoRouteLoader('/sinh-vien/ho-so');
                try {
                  const cached = await (window.__uitHoSoRscInFlight || fetchHoSoRsc(parsed.pathname + parsed.search, reqHeaders.get('Next-Router-State-Tree'), reqHeaders.get('Next-Url')));
                  if (cached) return buildCachedResponse(cached);
                } finally {
                  if (window.__scheduleHideHoSoRouteLoader) window.__scheduleHideHoSoRouteLoader();
                }
              }
            }

            if (sameOrigin) {
              const finish = trackStart();
              try { return await origFetch(input, init); } finally { finish(); }
            }
            return origFetch(input, init);
          };
        }
      } else {
        document.getElementById('cd-custom-theme-style')?.remove();
        if (window.__lastOverlaySymbolColor !== '#8b949e') {
          window.__lastOverlaySymbolColor = '#8b949e';
          console.debug('__UIT_TITLEBAR_OVERLAY__' + JSON.stringify({ symbolColor: '#8b949e' }));
        }
      }

      // Mount early titlebar on every site as soon as <body> exists
      const mountEarlyTitlebar = () => {
        const target = document.body || document.documentElement;
        if (!target) return false;
        let titlebar = document.getElementById('cd-titlebar');
        if (!titlebar && window.__UIT_TITLEBAR_HTML__) {
          target.insertAdjacentHTML('afterbegin', window.__UIT_TITLEBAR_HTML__);
          titlebar = document.getElementById('cd-titlebar');
        } else if (titlebar && document.body && titlebar.parentElement !== document.body) {
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
        const refreshBtn = document.getElementById('cd-refresh-btn');
        if (refreshBtn && refreshBtn.dataset.refreshBound !== '1') {
          refreshBtn.dataset.refreshBound = '1';
          refreshBtn.addEventListener('click', () => {
            if (window.__clearHoSoRscCache) window.__clearHoSoRscCache();
            if (window.__showBootCurtainForRefresh) window.__showBootCurtainForRefresh();
            requestAnimationFrame(() => window.location.reload());
          });
        }
        return Boolean(document.body);
      };

      mountEarlyTitlebar();
      if (!window.__uitTitlebarGuardInstalled) {
        window.__uitTitlebarGuardInstalled = true;
        const obs = new MutationObserver(() => {
          if (!document.getElementById('cd-titlebar') || (document.body && document.getElementById('cd-titlebar')?.parentElement !== document.body)) {
            mountEarlyTitlebar();
          }
        });
        obs.observe(document.documentElement || document, { childList: true });
        if (document.body) {
          obs.observe(document.body, { childList: true });
        } else {
          const bodyWaitObs = new MutationObserver(() => {
            if (document.body) {
              bodyWaitObs.disconnect();
              mountEarlyTitlebar();
              obs.observe(document.body, { childList: true });
            }
          });
          bodyWaitObs.observe(document.documentElement || document, { childList: true });
        }
      }
    })();
  `;
}

ipcMain.on('uit:get-bootstrap-data', (event, targetUrl) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    event.returnValue = null;
    return;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    event.returnValue = null;
    return;
  }

  const useCustomShell = isCustomShellUrl(parsedUrl);
  event.returnValue = {
    useCustomShell,
    combinedCss: useCustomShell ? PORTAL_COMBINED_CSS : EXTERNAL_COMBINED_CSS,
    bootCurtainHtml: useCustomShell ? ASSETS.bootCurtainHtml : '',
    brandWhite: BRAND_WHITE_BASE64,
    earlyBootstrapScript: getEarlyBootstrapScript(useCustomShell)
  };
});

function injectCustomUI(webContents) {
  const currentUrl = webContents.getURL();
  let parsedUrl;
  try {
    parsedUrl = new URL(currentUrl);
  } catch {
    return;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return;

  const useCustomShell = isCustomShellUrl(parsedUrl);
  const combinedCss = useCustomShell ? PORTAL_COMBINED_CSS : EXTERNAL_COMBINED_CSS;

  if (!useCustomShell) {
    const titlebarOnlyCode = `
      (() => {
        const styleEl = document.getElementById('cd-early-css');
        if (styleEl) {
          styleEl.textContent = ${JSON.stringify(combinedCss)};
        } else if (document.documentElement) {
          const s = document.createElement('style');
          s.id = 'cd-early-css';
          s.textContent = ${JSON.stringify(combinedCss)};
          document.documentElement.appendChild(s);
        }
        if (!window.__UIT_TITLEBAR_HTML__) { window.__UIT_TITLEBAR_HTML__ = ${JSON.stringify(ASSETS.titlebarHtml)}; }
        if (!window.__UIT_BRAND__)         { window.__UIT_BRAND__ = ${JSON.stringify(BRAND_WHITE_BASE64)}; }
        if (window.__updateCustomRouteState) {
          window.__updateCustomRouteState();
        } else {
          ${getEarlyBootstrapScript(false)}
        }
      })();
    `;
    webContents.executeJavaScript(titlebarOnlyCode).catch(console.error);
    return;
  }

  const appVersion = app.getVersion();
  const webShortcuts = getResolvedWebShortcuts();

  const bootstrapCode = `
    (() => {
      const styleEl = document.getElementById('cd-early-css');
      if (styleEl) {
        styleEl.textContent = ${JSON.stringify(combinedCss)};
      } else if (document.documentElement) {
        const s = document.createElement('style');
        s.id = 'cd-early-css';
        s.textContent = ${JSON.stringify(combinedCss)};
        document.documentElement.appendChild(s);
      }
      if (!window.__UIT_TITLEBAR_HTML__)     { window.__UIT_TITLEBAR_HTML__ = ${JSON.stringify(ASSETS.titlebarHtml)}; }
      if (!window.__UIT_BOOT_CURTAIN_HTML__) { window.__UIT_BOOT_CURTAIN_HTML__ = ${JSON.stringify(ASSETS.bootCurtainHtml)}; }
      if (!window.__UIT_SHELL_HTML__)        { window.__UIT_SHELL_HTML__ = ${JSON.stringify(ASSETS.shellHtml)}; }
      if (!window.__UIT_TRANG_CHU_HTML__)    { window.__UIT_TRANG_CHU_HTML__ = ${JSON.stringify(ASSETS.trangChuHtml)}; }
      if (!window.__UIT_BRAND__)             { window.__UIT_BRAND__ = ${JSON.stringify(BRAND_WHITE_BASE64)}; }
      if (!window.__UIT_APP_VERSION__)       { window.__UIT_APP_VERSION__ = ${JSON.stringify(appVersion)}; }
      if (!window.__UIT_SEARCH_ITEMS__)      { window.__UIT_SEARCH_ITEMS__ = ${JSON.stringify(ASSETS.searchItems)}; }
      window.__UIT_WEB_SHORTCUTS__ = ${JSON.stringify(webShortcuts)};
      ${getEarlyBootstrapScript(true)}
      if (!window.__uitShellInitialized) {
        window.__uitShellInitialized = true;
        ${ASSETS.shellJs}
        ${ASSETS.trangChuJs}
      } else if (window.__updateCustomRouteState) {
        window.__updateCustomRouteState();
      }
    })();
  `;

  webContents.executeJavaScript(bootstrapCode).catch(console.error);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 880,
    minHeight: 480,
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    frame: true
  });

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

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://uma.uit.edu.vn/*', '*://*.uma.uit.edu.vn/*'] },
    (details, callback) => callback({ cancel: true })
  );

  mainWindow.webContents.on('dom-ready', () => {
    injectCustomUI(mainWindow.webContents);
  });

  mainWindow.webContents.on('did-navigate-in-page', () => {
    injectCustomUI(mainWindow.webContents);
  });

  mainWindow.loadURL('https://portal.uit.edu.vn/trang-chu');
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch(
  'disable-features',
  'BackForwardCache,MediaRouter,OptimizationHints,Translate,CalculateNativeWinOcclusion,DirectCompositionVideoOverlays'
);
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=192');
app.commandLine.appendSwitch('enable-low-end-device-mode');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.commandLine.appendSwitch('disable-direct-composition');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
