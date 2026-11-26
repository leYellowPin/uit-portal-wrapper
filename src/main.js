const { app, BrowserWindow, session, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'uit-theme',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function resolveAssetFullPath(relativePath) {
  if (!relativePath) return '';
  const normalized = String(relativePath).replace(/^[\/]+/, '');
  const candidates = [
    path.join(__dirname, normalized),
    path.join(__dirname, 'src', normalized),
    path.join(__dirname, '..', normalized)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function readAsset(relativePath) {
  const fullPath = resolveAssetFullPath(relativePath);
  return fullPath ? fs.readFileSync(fullPath, 'utf8') : '';
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
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.css': 'text/css; charset=utf-8'
};

function readImageBase64(relativePath) {
  const fullPath = resolveAssetFullPath(relativePath);
  if (!fullPath) return '';
  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/png';
  return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
}

function isPathInsideDir(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

function parseSemverParts(versionStr) {
  const cleaned = String(versionStr || '').trim().replace(/^v/i, '').split('-')[0];
  if (!cleaned) return null;
  const parts = cleaned.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function matchSingleVersionToken(token, currentParts) {
  const t = String(token || '').trim().replace(/^v/i, '');
  if (!t || t === '*' || t.toLowerCase() === 'x') return true;

  const wildcardMatch = t.match(/^(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/i);
  if (wildcardMatch) {
    const reqMajor = Number(wildcardMatch[1]);
    if (currentParts[0] !== reqMajor) return false;
    const minToken = wildcardMatch[2];
    if (minToken && minToken !== 'x' && minToken !== '*') {
      if (currentParts[1] !== Number(minToken)) return false;
      const patchToken = wildcardMatch[3];
      if (patchToken && patchToken !== 'x' && patchToken !== '*') {
        return currentParts[2] === Number(patchToken);
      }
    }
    return true;
  }

  if (t.startsWith('^')) {
    const base = parseSemverParts(t.slice(1));
    if (!base) return true;
    const upper = base[0] > 0 ? [base[0] + 1, 0, 0] : [0, base[1] + 1, 0];
    return compareSemver(currentParts, base) >= 0 && compareSemver(currentParts, upper) < 0;
  }

  if (t.startsWith('~')) {
    const base = parseSemverParts(t.slice(1));
    if (!base) return true;
    const upper = [base[0], base[1] + 1, 0];
    return compareSemver(currentParts, base) >= 0 && compareSemver(currentParts, upper) < 0;
  }

  const opMatch = t.match(/^(>=|<=|>|<|=)\s*(.+)$/);
  if (opMatch) {
    const op = opMatch[1];
    const target = parseSemverParts(opMatch[2]);
    if (!target) return true;
    const cmp = compareSemver(currentParts, target);
    if (op === '>=') return cmp >= 0;
    if (op === '<=') return cmp <= 0;
    if (op === '>') return cmp > 0;
    if (op === '<') return cmp < 0;
    return cmp === 0;
  }

  return true;
}

function checkAppVersionCompatibility(requirement, currentVersion) {
  const req = String(requirement || '').trim();
  const appVer = String(currentVersion || app.getVersion()).trim();
  if (!req || req === '*') {
    return { compatible: true, appVersion: appVer, requiredVersion: req || '*' };
  }

  const currentParts = parseSemverParts(appVer);
  if (!currentParts) {
    return { compatible: true, appVersion: appVer, requiredVersion: req };
  }

  const tokens = req.split(/\s+/).filter(Boolean);
  const compatible = tokens.every((tok) => matchSingleVersionToken(tok, currentParts));
  return { compatible, appVersion: appVer, requiredVersion: req };
}

function getThemeConfigPath() {
  return path.join(app.getPath('userData'), 'uit-theme-pack.json');
}

function readPersistedThemeConfig() {
  try {
    const cfgPath = getThemeConfigPath();
    if (!fs.existsSync(cfgPath)) return { themeDir: '', enabled: true };
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { themeDir: '', enabled: true };
    return {
      themeDir: typeof parsed.themeDir === 'string' ? parsed.themeDir : '',
      enabled: parsed.enabled !== false
    };
  } catch {
    return { themeDir: '', enabled: true };
  }
}

function writePersistedThemeConfig(config) {
  try {
    const cfgPath = getThemeConfigPath();
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          themeDir: String(config?.themeDir || ''),
          enabled: Boolean(config?.enabled)
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (err) {
    console.error('[UIT Wrapper] Failed to persist theme pack config:', err);
  }
}

function buildThemeAssetUrl(themeDir, targetFullPath, cacheBustToken, suffix = '') {
  const rel = path.relative(themeDir, targetFullPath).split(path.sep).join('/');
  const encodedPath = rel.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  const queryPrefix = suffix && suffix.startsWith('?') ? `${suffix}&` : '?';
  const hashPart = suffix && suffix.includes('#') ? suffix.slice(suffix.indexOf('#')) : '';
  const cleanQuery = suffix && suffix.startsWith('?')
    ? suffix.slice(1, suffix.includes('#') ? suffix.indexOf('#') : undefined)
    : '';
  const query = cleanQuery ? `?${cleanQuery}&v=${cacheBustToken}` : `?v=${cacheBustToken}`;
  return `uit-theme://pack/${encodedPath}${query}${hashPart}`;
}

function compileThemeCssFile(themeDir, cssFullPath, cacheBustToken, visited = new Set()) {
  const resolvedCss = path.resolve(cssFullPath);
  if (visited.has(resolvedCss)) return '';
  visited.add(resolvedCss);

  const cssDir = path.dirname(resolvedCss);
  let cssText = fs.readFileSync(resolvedCss, 'utf8');

  // Inline local @import statements relative to the importing stylesheet
  cssText = cssText.replace(
    /@import\s+(?:url\(\s*)?(['"]?)([^'")\s]+)\1\s*\)?\s*([^;]*);/gi,
    (fullMatch, _quote, rawTarget, mediaQuery) => {
      const trimmed = String(rawTarget || '').trim();
      if (!trimmed || /^(?:https?:|data:|blob:|uit-theme:)/i.test(trimmed)) {
        return fullMatch;
      }
      const cleanRel = trimmed.split(/[?#]/)[0];
      const importedPath = path.resolve(cssDir, cleanRel);
      if (!isPathInsideDir(themeDir, importedPath) || !fs.existsSync(importedPath)) {
        return fullMatch;
      }
      const inlined = compileThemeCssFile(themeDir, importedPath, cacheBustToken, visited);
      const mq = String(mediaQuery || '').trim();
      return mq ? `@media ${mq} {\n${inlined}\n}` : inlined;
    }
  );

  // Rewrite relative url(...) references to uit-theme://pack/...
  cssText = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (fullMatch, _quote, rawUrl) => {
    const trimmed = String(rawUrl || '').trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      /^(?:data:|https?:|blob:|uit-theme:)/i.test(trimmed)
    ) {
      return fullMatch;
    }

    const suffixIdx = trimmed.search(/[?#]/);
    const pathPart = suffixIdx === -1 ? trimmed : trimmed.slice(0, suffixIdx);
    const suffix = suffixIdx === -1 ? '' : trimmed.slice(suffixIdx);
    if (!pathPart) return fullMatch;

    const targetFullPath = path.resolve(cssDir, pathPart);
    if (!isPathInsideDir(themeDir, targetFullPath)) {
      return fullMatch;
    }

    const rewrittenUrl = buildThemeAssetUrl(themeDir, targetFullPath, cacheBustToken, suffix);
    return `url("${rewrittenUrl}")`;
  });

  return cssText;
}

function inspectThemeFolder(themeDir, options = {}) {
  const resolvedDir = path.resolve(String(themeDir || '').trim());
  if (!resolvedDir || !fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new Error('Thư mục giao diện không tồn tại hoặc không hợp lệ.');
  }

  const metadataCandidates = ['theme.json', 'pack.json'];
  let metadataPath = '';
  for (const candidate of metadataCandidates) {
    const full = path.join(resolvedDir, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      metadataPath = full;
      break;
    }
  }

  if (!metadataPath) {
    throw new Error('Thư mục đã chọn không chứa tệp theme.json.');
  }

  let rawMeta;
  try {
    rawMeta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    throw new Error('Tệp theme.json không đúng định dạng JSON hợp lệ.');
  }

  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    throw new Error('Nội dung tệp theme.json không hợp lệ.');
  }

  const name = String(rawMeta.name || rawMeta.theme_name || '').trim();
  if (!name) {
    throw new Error('Tệp theme.json thiếu trường bắt buộc "name".');
  }

  const entryRel = String(rawMeta.entry || rawMeta.stylesheet || rawMeta.css || 'theme.css').trim();
  const entryFullPath = path.resolve(resolvedDir, entryRel);
  if (!isPathInsideDir(resolvedDir, entryFullPath)) {
    throw new Error('Đường dẫn tệp CSS trong theme.json nằm ngoài thư mục giao diện.');
  }
  if (!fs.existsSync(entryFullPath) || !fs.statSync(entryFullPath).isFile()) {
    throw new Error(`Không tìm thấy tệp CSS "${entryRel}".`);
  }

  const cacheBustToken = String(Date.now());
  const compiledCss = compileThemeCssFile(resolvedDir, entryFullPath, cacheBustToken);
  const enabled = options.enabled !== false;

  const rawSchemes = Array.isArray(rawMeta.color_schemes)
    ? rawMeta.color_schemes
    : (Array.isArray(rawMeta.modes) ? rawMeta.modes : null);
  const colorSchemes = rawSchemes
    ? rawSchemes
        .map((s) => String(s || '').trim().toLowerCase())
        .filter((s) => s === 'dark' || s === 'light')
    : null;

  const rawDefaultScheme = String(rawMeta.default_scheme || '').trim().toLowerCase();
  const defaultScheme = ['light', 'dark', 'system'].includes(rawDefaultScheme) ? rawDefaultScheme : null;

  const author = Array.isArray(rawMeta.authors)
    ? rawMeta.authors.map((a) => String(a || '').trim()).filter(Boolean).join(', ')
    : String(rawMeta.author || '').trim();

  const compatibleAppVersion = String(
    rawMeta.compatible_app_version ||
    rawMeta.compatibleAppVersion ||
    rawMeta.app_version ||
    rawMeta.min_app_version ||
    ''
  ).trim();

  let iconUrl = '';
  const iconRel = String(rawMeta.icon || '').trim() || 'pack.png';
  const iconFullPath = path.resolve(resolvedDir, iconRel);
  if (
    isPathInsideDir(resolvedDir, iconFullPath) &&
    fs.existsSync(iconFullPath) &&
    fs.statSync(iconFullPath).isFile()
  ) {
    iconUrl = buildThemeAssetUrl(resolvedDir, iconFullPath, cacheBustToken);
  }

  const compatibility = checkAppVersionCompatibility(compatibleAppVersion, app.getVersion());

  return {
    hasTheme: true,
    enabled,
    themeDir: resolvedDir,
    folderName: path.basename(resolvedDir),
    metadata: {
      formatVersion: Number(rawMeta.format_version || 1) || 1,
      id: String(rawMeta.id || path.basename(resolvedDir)).trim(),
      name,
      version: String(rawMeta.version || rawMeta.theme_version || '').trim(),
      description: String(rawMeta.description || '').trim(),
      author,
      compatibleAppVersion,
      entry: entryRel,
      colorSchemes,
      defaultScheme,
      iconUrl
    },
    compatibility,
    compiledCss: enabled ? compiledCss : '',
    rawHasColorSchemes: /\[data-theme\s*=/.test(compiledCss)
  };
}

let activeThemeState = {
  hasTheme: false,
  enabled: false,
  themeDir: '',
  folderName: '',
  metadata: null,
  compatibility: null,
  compiledCss: '',
  rawHasColorSchemes: false
};

function loadActiveThemeState(forceReload = false) {
  if (!forceReload && activeThemeState.hasTheme) {
    return activeThemeState;
  }

  const persisted = readPersistedThemeConfig();
  if (!persisted.themeDir) {
    activeThemeState = {
      hasTheme: false,
      enabled: false,
      themeDir: '',
      folderName: '',
      metadata: null,
      compatibility: null,
      compiledCss: '',
      rawHasColorSchemes: false
    };
    return activeThemeState;
  }

  try {
    activeThemeState = inspectThemeFolder(persisted.themeDir, { enabled: persisted.enabled });
  } catch (err) {
    console.warn('[UIT Wrapper] Resetting unavailable theme pack:', err.message);
    writePersistedThemeConfig({ themeDir: '', enabled: false });
    activeThemeState = {
      hasTheme: false,
      enabled: false,
      themeDir: '',
      folderName: '',
      metadata: null,
      compatibility: null,
      compiledCss: '',
      rawHasColorSchemes: false
    };
  }

  return activeThemeState;
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

function parseUrlSafe(rawUrl) {
  if (!rawUrl) return null;
  try {
    return rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl));
  } catch {
    return null;
  }
}

function isCustomShellUrl(rawUrl) {
  const parsedUrl = parseUrlSafe(rawUrl);
  if (!parsedUrl || parsedUrl.hostname.toLowerCase() !== 'portal.uit.edu.vn') return false;
  const p = parsedUrl.pathname || '';
  return p.startsWith('/trang-chu') || p.startsWith('/sinh-vien');
}

function isNativeAuthUrl(rawUrl) {
  const parsedUrl = parseUrlSafe(rawUrl);
  if (!parsedUrl) return false;

  const host = parsedUrl.hostname.toLowerCase();
  if (host === 'sso.uit.edu.vn') {
    return true;
  }

  if (host === 'portal.uit.edu.vn') {
    const p = parsedUrl.pathname || '/';
    return p.startsWith('/login') || p.startsWith('/api/auth');
  }

  return false;
}

function isNativePopupPrintUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw || raw === 'about:blank') return true;

  const parsedUrl = parseUrlSafe(raw);
  if (!parsedUrl) return false;

  if (
    parsedUrl.protocol === 'about:' ||
    parsedUrl.protocol === 'blob:' ||
    parsedUrl.protocol === 'data:'
  ) {
    return true;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return false;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const p = (parsedUrl.pathname || '/').toLowerCase();

  if (/\.pdf($|[?#])/i.test(p) || parsedUrl.searchParams.has('print')) {
    return true;
  }

  if (host === 'portal.uit.edu.vn') {
    if (isNativeAuthUrl(parsedUrl)) return false;
    if (
      p.includes('/print') ||
      p.includes('/in-bang-diem') ||
      p.startsWith('/api/')
    ) {
      return true;
    }
  }

  return false;
}

function getNativePopupWindowOptions(parentWindow) {
  return {
    parent: parentWindow || undefined,
    width: 1024,
    height: 768,
    minWidth: 640,
    minHeight: 480,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    titleBarStyle: 'default',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  };
}

const BRAND_WHITE_BASE64 = readImageBase64('assets/uit-logo-white.png');

const ASSETS = {
  titlebarHtml: readAsset('layouts/titlebar.html'),
  bootCurtainHtml: readAsset('layouts/boot-curtain.html'),
  shellHtml: readAsset('layouts/shell.html'),
  trangChuHtml: readAsset('layouts/trang-chu.html'),
  themeCss: readAssetFromCandidates(['styles/theme.css', 'src/styles/theme.css', 'theme.css']),
  shellCss: readAssetFromCandidates(['styles/shell.css', 'src/styles/shell.css', 'shell.css']),
  trangChuCss: readAsset('styles/trang-chu.css'),
  hoSoCss: readAsset('styles/ho-so.css'),
  tkbCss: readAsset('styles/tkb.css'),
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

    .cd-titlebar-btn[hidden] {
      display: none !important;
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

    html:not(.uit-custom-shell):not(:has(body.with-custom-shell)) #cd-theme-menu-wrap,
    html:not(.uit-custom-shell):not(:has(body.with-custom-shell)) #cd-account-menu-wrap,
    html:not(.uit-custom-shell):not(:has(body.with-custom-shell)) #cd-toggle-sidebar-btn,
    html:not(.uit-custom-shell):not(:has(body.with-custom-shell)) #cd-search-wrap,
    html:not(.uit-custom-shell):not(:has(body.with-custom-shell)) #cd-search-toggle-btn,
    html:has(> body:not(.with-custom-shell)) #cd-search-wrap,
    html:has(> body:not(.with-custom-shell)) #cd-search-toggle-btn {
      display: none !important;
    }

    html,
    body {
      height: 100vh !important;
      max-height: 100vh !important;
      margin: 0 !important;
      overflow: hidden !important;
    }

    html:not(.uit-custom-shell):not(#_#_#) > body:not(.with-custom-shell):not(#_#_#) {
      position: fixed !important;
      top: 36px !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: calc(100vh - 36px) !important;
      max-height: calc(100vh - 36px) !important;
      margin: 0 !important;
      padding-top: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      box-sizing: border-box !important;
      transform: translate3d(0, 0, 0) !important;
    }

    #cd-webview-container {
      position: fixed !important;
      top: 36px !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: calc(100vh - 36px) !important;
      z-index: 2147483640 !important;
      background-color: var(--col-pri-bg, #0d1117) !important;
      display: flex !important;
    }

    #cd-webview-container[hidden] {
      display: none !important;
    }

    #cd-external-webview {
      flex: 1 1 auto !important;
      width: 100% !important;
      height: 100% !important;
      border: none !important;
      display: flex !important;
    }

    #cd-webview-nav-controls {
      display: inline-flex !important;
      align-items: center !important;
      height: 36px !important;
      margin-left: -6px !important;
      -webkit-app-region: no-drag !important;
    }

    #cd-webview-nav-controls[hidden],
    html.uit-webview-active #cd-toggle-sidebar-btn,
    html.uit-webview-active #cd-refresh-btn,
    html.uit-webview-active #cd-search-wrap,
    html.uit-webview-active #cd-search-toggle-btn {
      display: none !important;
    }

    #cd-webview-nav-controls .cd-titlebar-btn {
      width: 34px !important;
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
  ASSETS.themeCss,
  ASSETS.shellCss,
  ASSETS.trangChuCss,
  ASSETS.hoSoCss,
  ASSETS.tkbCss
].join('\n');

const EXTERNAL_COMBINED_CSS = getGlobalTitlebarCss();

function getEarlyBootstrapScript(useCustomShell, themeState = null) {
  return `
    (() => {
      if (!window.__UIT_BRAND__)             { window.__UIT_BRAND__ = ${JSON.stringify(BRAND_WHITE_BASE64)}; }
      if (!window.__UIT_TITLEBAR_HTML__)     { window.__UIT_TITLEBAR_HTML__ = ${JSON.stringify(ASSETS.titlebarHtml)}; }
      if (!window.__UIT_BOOT_CURTAIN_HTML__) { window.__UIT_BOOT_CURTAIN_HTML__ = ${JSON.stringify(ASSETS.bootCurtainHtml)}; }
      if (${JSON.stringify(Boolean(themeState))}) {
        window.__UIT_THEME_STATE__ = ${JSON.stringify(themeState)};
      }

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
          // Clean up legacy single-file theme keys if present
          localStorage.removeItem('uit_custom_theme_css');
          localStorage.removeItem('uit_custom_theme_name');
          localStorage.removeItem('uit_custom_theme_path');
          localStorage.removeItem('uit_custom_theme_active');

          const mode = localStorage.getItem('uit_theme_mode') || 'system';
          const effective = (mode === 'light' || mode === 'dark')
            ? mode
            : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
          document.documentElement?.setAttribute('data-theme', effective);

          const st = window.__UIT_THEME_STATE__;
          const hasPack = Boolean(st && st.hasTheme && st.enabled && st.compiledCss);
          let styleEl = document.getElementById('cd-custom-theme-style');
          if (hasPack && document.documentElement) {
            if (!styleEl) {
              styleEl = document.createElement('style');
              styleEl.id = 'cd-custom-theme-style';
              document.documentElement.appendChild(styleEl);
            }
            styleEl.textContent = st.compiledCss;
          } else if (styleEl) {
            styleEl.remove();
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

              if (parsed.pathname.startsWith('/api/auth') || parsed.pathname === '/login' || (method !== 'GET' && parsed.pathname.startsWith('/api/sinh-vien/tkb'))) {
                if (window.__clearTkbDangKyCache) window.__clearTkbDangKyCache();
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
        document.documentElement?.removeAttribute('data-theme');
        document.getElementById('cd-custom-theme-style')?.remove();
        if (window.__lastOverlaySymbolColor !== '#8b949e') {
          window.__lastOverlaySymbolColor = '#8b949e';
          console.debug('__UIT_TITLEBAR_OVERLAY__' + JSON.stringify({ symbolColor: '#8b949e' }));
        }
      }

      // Mount early titlebar on <html> so body transforms on external sites never shift it
      const mountEarlyTitlebar = () => {
        const target = document.documentElement;
        if (!target) return false;
        let titlebar = document.getElementById('cd-titlebar');
        if (!titlebar && window.__UIT_TITLEBAR_HTML__) {
          target.insertAdjacentHTML('beforeend', window.__UIT_TITLEBAR_HTML__);
          titlebar = document.getElementById('cd-titlebar');
        } else if (titlebar && titlebar.parentElement !== target) {
          target.appendChild(titlebar);
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
            if (window.__clearTkbDangKyCache) window.__clearTkbDangKyCache();
            if (window.__showBootCurtainForRefresh) window.__showBootCurtainForRefresh();
            requestAnimationFrame(() => window.location.reload());
          });
        }
        return Boolean(titlebar);
      };

      mountEarlyTitlebar();
      if (!window.__uitTitlebarGuardInstalled) {
        window.__uitTitlebarGuardInstalled = true;
        const obs = new MutationObserver(() => {
          const root = document.documentElement;
          const tb = document.getElementById('cd-titlebar');
          if (!tb || (root && tb.parentElement !== root)) {
            mountEarlyTitlebar();
          }
        });
        obs.observe(document.documentElement || document, { childList: true });
      }
    })();
  `;
}

let primaryMainWindow = null;

function isAuthorizedMainSender(event) {
  return (
    event.sender.getType() === 'window' &&
    (!primaryMainWindow || primaryMainWindow.isDestroyed() || event.sender === primaryMainWindow.webContents)
  );
}

ipcMain.on('uit:get-bootstrap-data', (event, targetUrl) => {
  if (!isAuthorizedMainSender(event)) {
    event.returnValue = null;
    return;
  }

  const parsedUrl = parseUrlSafe(targetUrl);
  if (!parsedUrl || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) {
    event.returnValue = null;
    return;
  }

  const useCustomShell = isCustomShellUrl(parsedUrl);
  const themeState = useCustomShell ? loadActiveThemeState(true) : null;
  event.returnValue = {
    useCustomShell,
    combinedCss: useCustomShell ? PORTAL_COMBINED_CSS : EXTERNAL_COMBINED_CSS,
    bootCurtainHtml: useCustomShell ? ASSETS.bootCurtainHtml : '',
    brandWhite: BRAND_WHITE_BASE64,
    themeState,
    earlyBootstrapScript: getEarlyBootstrapScript(useCustomShell, themeState)
  };
});

ipcMain.handle('uit-theme:get-state', (event) => {
  if (!isAuthorizedMainSender(event)) return null;
  return loadActiveThemeState(true);
});

ipcMain.handle('uit-theme:select-folder', async (event) => {
  if (!isAuthorizedMainSender(event)) return { canceled: true };

  const parentWin = primaryMainWindow && !primaryMainWindow.isDestroyed() ? primaryMainWindow : undefined;
  const result = await dialog.showOpenDialog(parentWin, {
    title: 'Chọn thư mục gói giao diện',
    properties: ['openDirectory']
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return { canceled: true, state: loadActiveThemeState(false) };
  }

  const selectedDir = result.filePaths[0];
  let inspected;
  try {
    inspected = inspectThemeFolder(selectedDir, { enabled: true });
  } catch (err) {
    await dialog.showMessageBox(parentWin, {
      type: 'error',
      title: 'Không thể tải gói giao diện',
      message: err.message || 'Thư mục giao diện không hợp lệ.'
    });
    return { canceled: false, error: err.message, state: loadActiveThemeState(false) };
  }

  if (inspected.compatibility && !inspected.compatibility.compatible) {
    const confirmRes = await dialog.showMessageBox(parentWin, {
      type: 'warning',
      title: 'Phiên bản ứng dụng không tương thích',
      message: `Gói giao diện "${inspected.metadata.name}" yêu cầu phiên bản ứng dụng ${inspected.compatibility.requiredVersion} (hiện tại: ${inspected.compatibility.appVersion}).`,
      detail: 'Giao diện có thể hiển thị sai lệch. Bạn vẫn muốn áp dụng gói giao diện này chứ?',
      buttons: ['Vẫn áp dụng', 'Hủy'],
      defaultId: 0,
      cancelId: 1
    });

    if (confirmRes.response === 1) {
      return { canceled: true, state: loadActiveThemeState(false) };
    }
  }

  writePersistedThemeConfig({ themeDir: inspected.themeDir, enabled: true });
  activeThemeState = inspected;
  return {
    canceled: false,
    newlyApplied: true,
    state: activeThemeState
  };
});

ipcMain.handle('uit-theme:set-enabled', (event, enabled) => {
  if (!isAuthorizedMainSender(event)) return null;
  const persisted = readPersistedThemeConfig();
  if (!persisted.themeDir) return loadActiveThemeState(true);
  writePersistedThemeConfig({ themeDir: persisted.themeDir, enabled: Boolean(enabled) });
  return loadActiveThemeState(true);
});

ipcMain.handle('uit-theme:reload', (event) => {
  if (!isAuthorizedMainSender(event)) return null;
  return loadActiveThemeState(true);
});

ipcMain.handle('uit-theme:clear', (event) => {
  if (!isAuthorizedMainSender(event)) return null;
  writePersistedThemeConfig({ themeDir: '', enabled: false });
  return loadActiveThemeState(true);
});

function allowCustomThemeProtocolInCsp(policy) {
  if (!policy || typeof policy !== 'string') return policy;
  let updated = policy
    .replace(/frame-src[^;]*;?/gi, '')
    .replace(/child-src[^;]*;?/gi, '');

  const directives = ['default-src', 'img-src', 'font-src', 'style-src', 'media-src'];
  for (const dir of directives) {
    const regex = new RegExp(`(${dir}\\b[^;]*)`, 'i');
    if (regex.test(updated)) {
      updated = updated.replace(regex, (match) => {
        if (/\buit-theme:/i.test(match)) return match;
        return `${match} uit-theme:`;
      });
    }
  }
  return updated;
}

function injectCustomUI(webContents) {
  const currentUrl = webContents.getURL();
  const parsedUrl = parseUrlSafe(currentUrl);
  if (!parsedUrl || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) return;

  const useCustomShell = isCustomShellUrl(parsedUrl);
  const combinedCss = useCustomShell ? PORTAL_COMBINED_CSS : EXTERNAL_COMBINED_CSS;

  if (!useCustomShell) {
    const titlebarOnlyCode = `
      (() => {
        const styleEl = document.getElementById('cd-early-css');
        if (styleEl && document.documentElement) {
          styleEl.textContent = ${JSON.stringify(combinedCss)};
          document.documentElement.appendChild(styleEl);
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
          ${getEarlyBootstrapScript(false, null)}
        }
      })();
    `;
    webContents.executeJavaScript(titlebarOnlyCode).catch(console.error);
    return;
  }

  const appVersion = app.getVersion();
  const webShortcuts = getResolvedWebShortcuts();
  const themeState = loadActiveThemeState(true);

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
      window.__UIT_THEME_STATE__ = ${JSON.stringify(themeState)};
      ${getEarlyBootstrapScript(true, themeState)}
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

function registerThemeAssetProtocol() {
  protocol.handle('uit-theme', (request) => {
    const state = loadActiveThemeState(false);
    if (!state || !state.themeDir) {
      return new Response('No active theme pack', { status: 404 });
    }

    const parsed = parseUrlSafe(request.url);
    if (!parsed) {
      return new Response('Invalid URL', { status: 400 });
    }

    const rawPathname = parsed.pathname.replace(/^\/+/, '');
    let decodedRelPath = '';
    try {
      decodedRelPath = rawPathname
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .join(path.sep);
    } catch {
      return new Response('Malformed path', { status: 400 });
    }

    if (!decodedRelPath) {
      return new Response('Not found', { status: 404 });
    }

    const targetFullPath = path.resolve(state.themeDir, decodedRelPath);
    if (!isPathInsideDir(state.themeDir, targetFullPath)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      if (!fs.existsSync(targetFullPath) || !fs.statSync(targetFullPath).isFile()) {
        return new Response('Not found', { status: 404 });
      }
      const ext = path.extname(targetFullPath).toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      const data = fs.readFileSync(targetFullPath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    } catch {
      return new Response('Read error', { status: 500 });
    }
  });
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
      contextIsolation: true,
      webviewTag: true
    },
    frame: true
  });
  primaryMainWindow = mainWindow;

  mainWindow.webContents.on('did-create-window', (childWindow) => {
    childWindow.setMenuBarVisibility(false);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (typeof message !== 'string') return;

    if (message.startsWith('__UIT_TITLEBAR_OVERLAY__')) {
      if (process.platform === 'darwin' || typeof mainWindow.setTitleBarOverlay !== 'function') return;
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
    }
  });

  const openUrlInMainWebview = (targetUrl) => {
    const escaped = JSON.stringify(String(targetUrl));
    const currentUrl = mainWindow.webContents.getURL();
    if (isCustomShellUrl(currentUrl)) {
      mainWindow.webContents.executeJavaScript(
        `window.__openInWebview && window.__openInWebview(${escaped});`
      ).catch(() => {});
    } else {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(
          `window.__openInWebview && window.__openInWebview(${escaped});`
        ).catch(() => {});
      });
      mainWindow.loadURL('https://portal.uit.edu.vn/trang-chu');
    }
  };

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://uma.uit.edu.vn/*', '*://*.uma.uit.edu.vn/*'] },
    (details, callback) => callback({ cancel: true })
  );

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://portal.uit.edu.vn/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-security-policy') {
          headers[key] = headers[key].map((policy) => allowCustomThemeProtocolInCsp(policy));
        }
      }
      callback({ responseHeaders: headers });
    }
  );

  const openUrlInNativePopup = (targetUrl) => {
    const popup = new BrowserWindow(getNativePopupWindowOptions(mainWindow));
    popup.setMenuBarVisibility(false);
    popup.loadURL(String(targetUrl)).catch(() => {});
  };

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isNativeAuthUrl(url)) return;

    if (isNativePopupPrintUrl(url)) {
      event.preventDefault();
      openUrlInNativePopup(url);
      return;
    }

    const currentUrl = mainWindow.webContents.getURL();
    if (!isCustomShellUrl(currentUrl) && isCustomShellUrl(url)) {
      return;
    }

    event.preventDefault();
    openUrlInMainWebview(url);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isNativeAuthUrl(url)) {
      mainWindow.loadURL(url);
      return { action: 'deny' };
    }

    const parsed = parseUrlSafe(url);
    const isSamePortalNonShellPopup =
      parsed &&
      parsed.hostname.toLowerCase() === 'portal.uit.edu.vn' &&
      !isCustomShellUrl(parsed);

    if (isNativePopupPrintUrl(url) || isSamePortalNonShellPopup) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: getNativePopupWindowOptions(mainWindow)
      };
    }

    openUrlInMainWebview(url);
    return { action: 'deny' };
  });

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

app.on('web-contents-created', (_, contents) => {
  if (contents.getType() !== 'webview') return;

  const redirectWebviewToMainShell = (targetUrl) => {
    if (!isCustomShellUrl(targetUrl)) return false;
    const host = contents.hostWebContents;
    if (!host || host.isDestroyed()) return false;

    const parsed = parseUrlSafe(targetUrl);
    if (!parsed) return false;

    const escapedUrl = JSON.stringify(parsed.href);
    const escapedPath = JSON.stringify(parsed.pathname + parsed.search + parsed.hash);

    if (isCustomShellUrl(host.getURL())) {
      host.executeJavaScript(`
        (() => {
          if (window.__closeExternalWebview) window.__closeExternalWebview();
          const targetPath = ${escapedPath};
          const currentFull = window.location.pathname + window.location.search + window.location.hash;
          if (currentFull !== targetPath) {
            const normTarget = targetPath.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
            const normalizedTarget = normTarget === '/' ? '/trang-chu' : normTarget;
            const sidebarLink = Array.from(document.querySelectorAll('#cd-sidebar .cd-nav a'))
              .find((a) => {
                const raw = (a.getAttribute('href') || '/').replace(/\/+$/, '') || '/';
                return (raw === '/' ? '/trang-chu' : raw) === normalizedTarget;
              });
            if (sidebarLink && !sidebarLink.classList.contains('active')) {
              sidebarLink.click();
            } else {
              const nativeLink = document.querySelector(\`nav[aria-label="Điều hướng chính"] a[href="\${normalizedTarget}"]\`);
              if (nativeLink) nativeLink.click();
              else window.location.href = ${escapedUrl};
            }
          }
        })();
      `).catch(() => {});
    } else {
      host.loadURL(parsed.href).catch(() => {});
    }

    return true;
  };

  contents.on('will-navigate', (event, url) => {
    if (redirectWebviewToMainShell(url)) {
      event.preventDefault();
    }
  });

  contents.on('will-redirect', (event, url) => {
    if (redirectWebviewToMainShell(url)) {
      event.preventDefault();
    }
  });

  contents.on('did-navigate-in-page', (_, url, isMainFrame) => {
    if (isMainFrame) {
      redirectWebviewToMainShell(url);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (redirectWebviewToMainShell(url)) {
      return { action: 'deny' };
    }
    if (isNativePopupPrintUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: getNativePopupWindowOptions(primaryMainWindow)
      };
    }
    if (parseUrlSafe(url)) {
      contents.loadURL(url).catch(() => {});
    }
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  registerThemeAssetProtocol();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});