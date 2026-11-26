(() => {
  const isPortalHost = window.location.hostname === 'portal.uit.edu.vn';

  const normalizePath = (pathname) => {
    const cleaned = (pathname || '/').replace(/\/+$/, '') || '/';
    return cleaned === '/' ? '/trang-chu' : cleaned;
  };

  const isSupportedShellPage = (pathname) => {
    if (!isPortalHost) return false;
    const p = pathname || '';
    return p.startsWith('/trang-chu') || p.startsWith('/sinh-vien');
  };

  const isExcludedPage = (pathname) => !isSupportedShellPage(pathname);

  let isSidebarHidden = localStorage.getItem('uit_sidebar_hidden') === '1';
  let hasCustomTheme = Boolean(localStorage.getItem('uit_custom_theme_css')) && localStorage.getItem('uit_custom_theme_active') !== '0';
  let cachedPortalVersion = sessionStorage.getItem('uit_portal_version') || '';

  let cachedProfile = null;
  try {
    cachedProfile = JSON.parse(sessionStorage.getItem('uit_user_profile'));
  } catch {}
  let profileFetchSettled = Boolean(cachedProfile) || isExcludedPage(window.location.pathname);

  // 1. Single-pass boot curtain controller
  const curtainState = {
    shownAt: 0,
    finished: false,
    settleTimer: null,
    fallbackTimer: null
  };

  const dismissBootCurtainNow = () => {
    curtainState.finished = true;
    clearTimeout(curtainState.settleTimer);
    clearTimeout(curtainState.fallbackTimer);
    curtainState.settleTimer = null;
    curtainState.fallbackTimer = null;

    const curtain = document.getElementById('cd-boot-curtain');
    if (!curtain || curtain.dataset.dismissed === '1') return;

    curtain.dataset.dismissed = '1';
    const waitMs = Math.max(0, 450 - (Date.now() - (curtainState.shownAt || Date.now())));
    setTimeout(() => {
      curtain.style.opacity = '0';
      setTimeout(() => curtain.remove(), 650);
    }, waitMs);
  };

  const isPageReadyForReveal = () => {
    const pathname = window.location.pathname || '';
    if (isExcludedPage(pathname)) return true;
    if (document.readyState !== 'complete') return false;
    if ((window.__uitActiveNetworkCount || 0) > 0) return false;
    if (!profileFetchSettled && !cachedProfile) return false;

    const sidebar = document.getElementById('cd-sidebar');
    if (!document.body || !sidebar) return false;
    if (!document.body.classList.contains('with-custom-shell')) return false;

    // Wait until Next.js hydrates the native nav and shell.css hides the native sidebar
    const nativeNav = document.querySelector('nav[aria-label="Điều hướng chính"]');
    if (!nativeNav) return false;
    const nativeSidebarWrapper = nativeNav.closest('div.shrink-0') || nativeNav.parentElement?.parentElement;
    if (nativeSidebarWrapper && getComputedStyle(nativeSidebarWrapper).display !== 'none') {
      return false;
    }

    if (normalizePath(pathname) === '/trang-chu') {
      const userStatsEl = document.getElementById('cd-user-stats');
      if (!window.__trangChuPopulated || !userStatsEl) return false;
    } else {
      const mainContent = document.querySelector('main#main-content') || document.querySelector('main');
      if (!mainContent || mainContent.textContent.trim().length === 0) return false;
    }

    return true;
  };

  window.__scheduleBootCurtainCheck = () => {
    if (isExcludedPage(window.location.pathname)) {
      dismissBootCurtainNow();
      return;
    }
    if (curtainState.finished) return;

    const curtain = document.getElementById('cd-boot-curtain');
    if (!curtain || curtain.dataset.dismissed === '1') return;

    if (!isPageReadyForReveal()) {
      clearTimeout(curtainState.settleTimer);
      curtainState.settleTimer = null;
      return;
    }

    if (curtainState.settleTimer) return;

    curtainState.settleTimer = setTimeout(() => {
      curtainState.settleTimer = null;
      if (!curtainState.finished && isPageReadyForReveal()) {
        dismissBootCurtainNow();
      }
    }, 500);
  };

  const showBootCurtain = (force = false) => {
    if (!isPortalHost || !document.documentElement) return;
    if (isExcludedPage(window.location.pathname)) {
      dismissBootCurtainNow();
      return;
    }
    if (curtainState.finished && !force) return;

    if (force) {
      curtainState.finished = false;
    }

    let curtain = document.getElementById('cd-boot-curtain');
    if (curtain && !force) {
      if (!curtainState.shownAt) curtainState.shownAt = Date.now();
      if (!curtainState.fallbackTimer) {
        curtainState.fallbackTimer = setTimeout(dismissBootCurtainNow, 8000);
      }
      window.__scheduleBootCurtainCheck();
      return;
    }

    curtain?.remove();
    if (window.__UIT_BOOT_CURTAIN_HTML__) {
      document.documentElement.insertAdjacentHTML('beforeend', window.__UIT_BOOT_CURTAIN_HTML__);
      curtain = document.getElementById('cd-boot-curtain');
      if (curtain) {
        curtain.style.cssText =
          'position:fixed;inset:0;z-index:2147483646;background-color:var(--col-pri-bg, #0d1117);' +
          'opacity:1;display:flex;align-items:center;justify-content:center;pointer-events:none;';
      }
      const logo = document.getElementById('cd-boot-curtain-logo');
      if (logo) {
        if (window.__UIT_BRAND__) logo.src = window.__UIT_BRAND__;
        else logo.remove();
      }
    }

    curtainState.shownAt = Date.now();
    clearTimeout(curtainState.fallbackTimer);
    curtainState.fallbackTimer = setTimeout(dismissBootCurtainNow, 8000);
    window.__scheduleBootCurtainCheck();
  };

  showBootCurtain(false);
  window.addEventListener('load', () => window.__scheduleBootCurtainCheck(), { once: true });

  // 2. Titlebar overlay, color scheme, and layout toggles
  const rgbToHex = (colorStr) => {
    if (!colorStr) return '';
    const trimmed = colorStr.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
      return '#' + trimmed.slice(1).split('').map((c) => c + c).join('');
    }
    const match = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!match) return '';
    const toHex = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  };

  const syncTitlebarOverlayColor = () => {
    const titlebar = document.getElementById('cd-titlebar');
    if (!titlebar) return;

    let probe = document.getElementById('cd-overlay-color-probe');
    if (!probe) {
      probe = document.createElement('span');
      probe.id = 'cd-overlay-color-probe';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;color:var(--col-sec-text, #8b949e) !important;';
      titlebar.appendChild(probe);
    }

    const hex = rgbToHex(getComputedStyle(probe).color);
    if (hex && hex !== window.__lastOverlaySymbolColor) {
      window.__lastOverlaySymbolColor = hex;
      console.debug('__UIT_TITLEBAR_OVERLAY__' + JSON.stringify({ symbolColor: hex }));
    }
  };

  const THEME_MODES = ['light', 'dark', 'system'];
  const THEME_MODE_LABELS = {
    light: 'Bảng màu: Sáng',
    dark: 'Bảng màu: Tối',
    system: 'Bảng màu: Thiết bị'
  };

  const getSavedThemeMode = () => {
    const stored = localStorage.getItem('uit_theme_mode');
    return THEME_MODES.includes(stored) ? stored : 'system';
  };

  const resolveEffectiveTheme = (mode) => {
    if (mode === 'light' || mode === 'dark') return mode;
    const prefersDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return prefersDark ? 'dark' : 'light';
  };

  const applyColorScheme = (mode = getSavedThemeMode()) => {
    const excluded = isExcludedPage(window.location.pathname);
    if (excluded) {
      document.documentElement?.removeAttribute('data-theme');
    } else {
      const effective = resolveEffectiveTheme(mode);
      document.documentElement?.setAttribute('data-theme', effective);
    }

    const schemeBtn = document.getElementById('cd-theme-scheme-btn');
    if (schemeBtn) {
      schemeBtn.textContent = THEME_MODE_LABELS[mode] || THEME_MODE_LABELS.system;
    }

    syncTitlebarOverlayColor();
  };

  if (!window.__uitSystemThemeListenerBound && window.matchMedia) {
    window.__uitSystemThemeListenerBound = true;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = () => {
      if (getSavedThemeMode() === 'system') {
        applyColorScheme('system');
      }
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onSystemThemeChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(onSystemThemeChange);
    }
  }

  const syncStatusBannerOffset = () => {
    if (!document.body) return;
    if (isExcludedPage(window.location.pathname) || !document.body.classList.contains('with-custom-shell')) {
      document.body.style.removeProperty('--cd-status-banner-height');
      return;
    }

    const banner = Array.from(document.body.children).find(
      (el) => el instanceof HTMLElement && el.getAttribute('role') === 'status'
    );

    if (!banner || banner.hidden || banner.getAttribute('aria-hidden') === 'true') {
      document.body.style.setProperty('--cd-status-banner-height', '0px');
      return;
    }

    const style = getComputedStyle(banner);
    if (style.display === 'none' || style.visibility === 'hidden') {
      document.body.style.setProperty('--cd-status-banner-height', '0px');
      return;
    }

    if (!banner.__uitResizeObserved && typeof ResizeObserver === 'function') {
      banner.__uitResizeObserved = true;
      const ro = new ResizeObserver(() => syncStatusBannerOffset());
      ro.observe(banner);
    }

    const height = Math.ceil(banner.getBoundingClientRect().height);
    document.body.style.setProperty('--cd-status-banner-height', `${height > 0 ? height : 0}px`);
  };

  if (!window.__uitStatusBannerResizeBound) {
    window.__uitStatusBannerResizeBound = true;
    window.addEventListener('resize', syncStatusBannerOffset);
  }

  const syncShellToggles = () => {
    if (!document.body) return;
    document.body.classList.toggle('cd-sidebar-hidden', isSidebarHidden);
    document.getElementById('cd-toggle-sidebar-btn')?.setAttribute('aria-pressed', isSidebarHidden ? 'true' : 'false');
    syncStatusBannerOffset();
  };

  // 3. Route transition loader for uncached /sinh-vien/ho-so SPA navigation
  let pendingRouteHref = '';
  let routeLoaderSafetyTimer = null;
  let routeLoaderHideTimer = null;

  const syncSidebarActiveLinks = (activeHref) => {
    document.querySelectorAll('#cd-sidebar .cd-nav a').forEach(link => {
      const isDisabled = link.classList.contains('cd-nav-disabled');
      const isActive = !isDisabled && normalizePath(link.getAttribute('href')) === activeHref;
      link.classList.toggle('active', isActive);
      link.setAttribute('aria-current', isActive ? 'page' : 'false');
      link.setAttribute('aria-disabled', isActive || isDisabled ? 'true' : 'false');
      link.tabIndex = isActive || isDisabled ? -1 : 0;
    });
  };

  window.__showHoSoRouteLoader = (targetHref = '/sinh-vien/ho-so') => {
    if (!isPortalHost || isExcludedPage(window.location.pathname)) return;
    if (normalizePath(window.location.pathname) === normalizePath(targetHref)) return;

    clearTimeout(routeLoaderHideTimer);
    pendingRouteHref = normalizePath(targetHref);
    syncSidebarActiveLinks(pendingRouteHref);
    document.body.classList.add('cd-route-loading');

    const reactRightColumn = document.querySelector('body > div.flex.min-h-screen > div.flex.min-w-0.flex-1');
    if (!reactRightColumn) return;

    let loader = document.getElementById('cd-route-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'cd-route-loader';
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-live', 'polite');
      loader.innerHTML = `
        <div class="cd-route-loader-spinner" aria-hidden="true"></div>
        <div class="cd-route-loader-text">Đang tải hồ sơ cá nhân...</div>
      `;
      reactRightColumn.prepend(loader);
    } else {
      loader.classList.remove('is-hiding');
    }

    clearTimeout(routeLoaderSafetyTimer);
    routeLoaderSafetyTimer = setTimeout(() => window.__hideHoSoRouteLoader(true), 15000);
  };

  let routeLoaderHideAttempt = 0;

  window.__hideHoSoRouteLoader = (restoreCurrentActive = false) => {
    clearTimeout(routeLoaderSafetyTimer);
    clearTimeout(routeLoaderHideTimer);
    routeLoaderHideAttempt += 1;
    const wasPending = Boolean(pendingRouteHref);
    pendingRouteHref = '';
    document.body.classList.remove('cd-route-loading');

    if (
      normalizePath(window.location.pathname) === '/sinh-vien/ho-so' &&
      typeof window.__updateCustomRouteState === 'function'
    ) {
      window.__updateCustomRouteState();
    } else if (restoreCurrentActive && wasPending) {
      syncSidebarActiveLinks(normalizePath(window.location.pathname));
    }

    const loader = document.getElementById('cd-route-loader');
    if (!loader) return;
    loader.classList.add('is-hiding');
    setTimeout(() => {
      if (!pendingRouteHref) loader.remove();
    }, 190);
  };

  window.__scheduleHideHoSoRouteLoader = () => {
    clearTimeout(routeLoaderHideTimer);
    const token = ++routeLoaderHideAttempt;
    const startedAt = Date.now();

    const checkAndHide = () => {
      if (token !== routeLoaderHideAttempt) return;
      const isTargetRoute = normalizePath(window.location.pathname) === '/sinh-vien/ho-so';
      const mainContent = document.querySelector('main#main-content') || document.querySelector('main');
      const hasContent = Boolean(mainContent && mainContent.textContent.trim().length > 0);
      const timedOut = Date.now() - startedAt > 2000;

      if ((isTargetRoute && hasContent) || timedOut) {
        requestAnimationFrame(() => {
          if (token === routeLoaderHideAttempt) {
            window.__hideHoSoRouteLoader(true);
          }
        });
        return;
      }

      routeLoaderHideTimer = setTimeout(checkAndHide, 50);
    };

    routeLoaderHideTimer = setTimeout(checkAndHide, 80);
  };

  // 4. Titlebar Search, Tab Activation, and Student Year Checks
  const RAW_SEARCH_CONFIG = window.__UIT_SEARCH_ITEMS__;
  const DEEP_SEARCH_ITEMS = Array.isArray(RAW_SEARCH_CONFIG)
    ? RAW_SEARCH_CONFIG
    : (Array.isArray(RAW_SEARCH_CONFIG?.items) ? RAW_SEARCH_CONFIG.items : []);
  const EXCLUDED_SEARCH_TITLES = Array.isArray(RAW_SEARCH_CONFIG?.excludeTitles)
    ? RAW_SEARCH_CONFIG.excludeTitles
    : [];

  const normalizeText = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

  const FIRST_YEAR_DISABLED_HREFS = new Set([
    '/sinh-vien/khoa-luan',
    '/sinh-vien/tot-nghiep'
  ]);

  const getStudentYearStatus = (metaText) => {
    const raw = metaText || cachedProfile?.meta || '';
    // Course code format: <course-name><enrollment-year><class-number> (e.g. "KHMT2026.2")
    const match = raw.match(/\b([A-Za-zÀ-ỹ]{2,})(20\d{2})(?:\.\d+|\d+)\b/);
    if (!match) {
      return { courseCode: '', enrollmentYear: null, yearDiff: null, isFirstYear: false };
    }
    const enrollmentYear = Number(match[2]);
    const currentYear = new Date().getFullYear();
    const yearDiff = currentYear - enrollmentYear;
    return {
      courseCode: match[0],
      enrollmentYear,
      yearDiff,
      isFirstYear: yearDiff <= 0
    };
  };

  const isFirstYearStudent = () => getStudentYearStatus().isFirstYear;

  const updateFirstYearNavState = () => {
    const nav = document.querySelector('#cd-sidebar .cd-nav');
    if (!nav) return;

    const disableGraduation = isFirstYearStudent();
    const groups = Array.from(nav.querySelectorAll('.nav-group'));
    const totNghiepGroup = groups.find(
      (g) => normalizeText(g.textContent.trim()) === 'tot nghiep'
    );

    if (!totNghiepGroup) return;

    totNghiepGroup.classList.toggle('cd-nav-disabled', disableGraduation);
    totNghiepGroup.hidden = disableGraduation;
    if (disableGraduation) {
      totNghiepGroup.setAttribute('aria-disabled', 'true');
    } else {
      totNghiepGroup.removeAttribute('aria-disabled');
    }

    const followingTabs = [];
    let nextEl = totNghiepGroup.nextElementSibling;
    while (nextEl && followingTabs.length < 2) {
      if (nextEl.tagName === 'A') {
        followingTabs.push(nextEl);
      } else if (nextEl.classList.contains('nav-group')) {
        break;
      }
      nextEl = nextEl.nextElementSibling;
    }

    followingTabs.forEach((link) => {
      link.classList.toggle('cd-nav-disabled', disableGraduation);
      link.hidden = disableGraduation;
      if (disableGraduation) {
        link.setAttribute('aria-disabled', 'true');
        link.tabIndex = -1;
      } else if (!link.classList.contains('active')) {
        link.setAttribute('aria-disabled', 'false');
        link.tabIndex = 0;
      }
    });
  };

  const TKB_HEADER_BTN_CLASS =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm h-9 rounded-md px-3 cursor-pointer';

  const customizeHoSoHeader = () => {
    if (normalizePath(window.location.pathname) !== '/sinh-vien/ho-so') return;
    const main = document.querySelector('main#main-content') || document.querySelector('main');
    if (!main) return;

    const pageRoot = main.querySelector(':scope > div') || main;
    const directChildren = Array.from(pageRoot.children).filter(
      (el) => el instanceof HTMLElement
    );

    const headerEl =
      directChildren.find(
        (el) =>
          !el.querySelector('[role="tablist"], form') &&
          Boolean(el.querySelector('img[src*="anh-the"], h2, button'))
      ) ||
      directChildren.find((el) => !el.querySelector('[role="tablist"], form'));

    if (!headerEl) return;

    if (headerEl.className !== 'mb-3 space-y-1') {
      headerEl.className = 'mb-3 space-y-1';
    }

    const exportBtn =
      Array.from(headerEl.querySelectorAll('button, a')).find((btn) =>
        normalizeText(btn.textContent).includes('ly lich sv')
      ) || headerEl.querySelector('button');

    let breadcrumbNav = headerEl.querySelector('#cd-hoso-breadcrumb');
    if (!breadcrumbNav) {
      breadcrumbNav = document.createElement('nav');
      breadcrumbNav.id = 'cd-hoso-breadcrumb';
      breadcrumbNav.setAttribute('aria-label', 'Breadcrumb');
      breadcrumbNav.className = 'flex items-center text-xs text-muted-foreground';
      breadcrumbNav.innerHTML = `
        <span class="flex items-center">
          <a class="hover:text-foreground transition-colors" href="/sinh-vien">Cổng Sinh viên</a>
        </span>
        <span class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right mx-1 h-3 w-3" aria-hidden="true">
            <path d="m9 18 6-6-6-6"></path>
          </svg>
          <span aria-current="page" class="text-foreground">Hồ sơ cá nhân</span>
        </span>
      `;
    }

    let headerRow = headerEl.querySelector('#cd-hoso-header-row');
    if (!headerRow) {
      headerRow = document.createElement('div');
      headerRow.id = 'cd-hoso-header-row';
      headerRow.className = 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4';
      headerRow.innerHTML = `
        <div id="cd-hoso-header-left" class="min-w-0 flex-1 space-y-1">
          <h1 class="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Hồ sơ cá nhân</h1>
          <p class="text-sm leading-relaxed text-muted-foreground">Thông tin lý lịch cá nhân, gia đình, học vụ và hồ sơ sinh viên.</p>
        </div>
        <div id="cd-hoso-actions" class="flex flex-wrap items-center gap-2 sm:shrink-0"></div>
      `;
    }

    if (headerEl.firstElementChild !== breadcrumbNav) {
      headerEl.prepend(breadcrumbNav);
    }
    if (breadcrumbNav.nextElementSibling !== headerRow) {
      breadcrumbNav.after(headerRow);
    }

    const actionsWrap = headerRow.querySelector('#cd-hoso-actions');
    if (exportBtn && actionsWrap) {
      exportBtn.setAttribute('data-cd-hoso-export-btn', '1');
      if (exportBtn.className !== TKB_HEADER_BTN_CLASS) {
        exportBtn.className = TKB_HEADER_BTN_CLASS;
      }
      const btnSvg = exportBtn.querySelector('svg');
      if (btnSvg && btnSvg.getAttribute('class') !== 'lucide lucide-file-down mr-2 h-4 w-4') {
        btnSvg.setAttribute('class', 'lucide lucide-file-down mr-2 h-4 w-4');
      }
      exportBtn.hidden = false;
      exportBtn.removeAttribute('aria-hidden');
      if (exportBtn.parentElement !== actionsWrap) {
        actionsWrap.appendChild(exportBtn);
      }
    }

    Array.from(headerEl.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      if (child === breadcrumbNav || child === headerRow) return;
      child.setAttribute('data-cd-hoso-hidden', '1');
      child.hidden = true;
      child.setAttribute('aria-hidden', 'true');
    });

    headerEl.setAttribute('data-cd-hoso-header', '1');
  };

  const hideHoSoBhytTab = () => {
    if (normalizePath(window.location.pathname) !== '/sinh-vien/ho-so') return;
    const tabs = Array.from(document.querySelectorAll('main [role="tab"]'));
    if (tabs.length === 0) return;

    let bhytActive = false;
    tabs.forEach((tab) => {
      const norm = normalizeText(tab.textContent.trim());
      if (norm === 'bhyt' || norm.includes('bhyt') || norm.includes('bao hiem y te')) {
        if (tab.getAttribute('data-state') === 'active' || tab.getAttribute('aria-selected') === 'true') {
          bhytActive = true;
        }
        tab.hidden = true;
        tab.dataset.cdHiddenTab = '1';
        tab.setAttribute('aria-hidden', 'true');
        tab.tabIndex = -1;
        tab.style.setProperty('display', 'none', 'important');

        const panelId = tab.getAttribute('aria-controls');
        if (panelId) {
          const panel = document.getElementById(panelId);
          if (panel) {
            panel.hidden = true;
            panel.style.setProperty('display', 'none', 'important');
          }
        }
      }
    });

    if (bhytActive) {
      const fallbackTab = tabs.find((t) => !t.hidden && t.dataset.cdHiddenTab !== '1');
      if (fallbackTab) {
        fallbackTab.click();
      }
    }
  };

  const activatePortalTab = (tabLabel) => {
    if (!tabLabel) return;
    const targetNorm = normalizeText(tabLabel);

    const tryClickTab = () => {
      const tabs = Array.from(document.querySelectorAll('main [role="tab"]'))
        .filter((t) => !t.hidden && t.dataset.cdHiddenTab !== '1');
      const match = tabs.find((t) => normalizeText(t.textContent).includes(targetNorm));
      if (!match) return false;

      if (match.getAttribute('data-state') !== 'active') {
        match.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        match.click();
      }
      match.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return true;
    };

    if (tryClickTab()) return;

    const observer = new MutationObserver(() => {
      if (tryClickTab()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  };

  const navigateAndSelectTab = (href, tabMatch) => {
    const targetPath = normalizePath(href);
    if (isFirstYearStudent() && FIRST_YEAR_DISABLED_HREFS.has(targetPath)) {
      return;
    }

    const currentPath = normalizePath(window.location.pathname);

    if (currentPath === targetPath) {
      activatePortalTab(tabMatch);
      return;
    }

    const sidebarLink = Array.from(document.querySelectorAll('#cd-sidebar .cd-nav a'))
      .find((a) => normalizePath(a.getAttribute('href')) === targetPath);

    if (sidebarLink) {
      sidebarLink.click();
    } else {
      const nativeLink = document.querySelector(`nav[aria-label="Điều hướng chính"] a[href="${targetPath}"]`);
      if (nativeLink) nativeLink.click();
      else window.location.href = targetPath;
    }

    if (tabMatch) {
      activatePortalTab(tabMatch);
    }
  };

  window.__navigateAndSelectTab = navigateAndSelectTab;

  const escapeHtml = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp')
      .replace(/</g, '&lt')
      .replace(/>/g, '&gt')
      .replace(/"/g, '&quot')
      .replace(/'/g, '&#39;');

  const formatNavGroupTitle = (rawText) => {
    const cleaned = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  };

  const collectSidebarHierarchy = () => {
    const byHref = new Map();
    const entries = [];
    const nav = document.querySelector('#cd-sidebar .cd-nav');
    if (!nav) return { byHref, entries };

    let currentGroup = '';
    Array.from(nav.children).forEach((el) => {
      if (el.classList.contains('nav-group')) {
        currentGroup = formatNavGroupTitle(el.textContent);
        return;
      }
      if (el.tagName === 'A') {
        const rawHref = el.getAttribute('href') || '';
        const href = normalizePath(rawHref);
        const pageTitle = el.textContent.trim();
        const disabled =
          el.classList.contains('cd-nav-disabled') ||
          el.getAttribute('aria-disabled') === 'true';
        const info = {
          href,
          rawHref,
          groupTitle: currentGroup,
          pageTitle,
          disabled
        };
        byHref.set(href, info);
        entries.push(info);
      }
    });

    return { byHref, entries };
  };

  const resolveDestinationHierarchy = (item, navByHref) => {
    const targetHref = normalizePath(item.href);
    const navInfo = navByHref.get(targetHref);

    if (navInfo) {
      const isPageRoot =
        !item.tabMatch &&
        normalizeText(item.title) === normalizeText(navInfo.pageTitle);

      if (isPageRoot) {
        return navInfo.groupTitle || 'Trang chính';
      }

      const chain = [navInfo.groupTitle, navInfo.pageTitle].filter(Boolean);
      if (chain.length > 0) {
        return chain.join(' > ');
      }
    }

    return item.sub || 'Trang chính';
  };

  const buildSearchIndex = () => {
    const firstYear = isFirstYearStudent();
    const { byHref: navByHref, entries: sidebarEntries } = collectSidebarHierarchy();

    const filteredDeepItems = DEEP_SEARCH_ITEMS
      .filter((item) => {
        const targetHref = normalizePath(item.href);
        if (firstYear && FIRST_YEAR_DISABLED_HREFS.has(targetHref)) {
          return false;
        }
        const navInfo = navByHref.get(targetHref);
        if (navInfo?.disabled) {
          return false;
        }
        return true;
      })
      .map((item) => ({
        ...item,
        sub: resolveDestinationHierarchy(item, navByHref)
      }));

    const customPageHrefs = new Set(
      filteredDeepItems.filter((item) => !item.tabMatch).map((item) => normalizePath(item.href))
    );
    const excludedTitleSet = new Set(
      EXCLUDED_SEARCH_TITLES.map((t) => normalizeText(String(t).trim())).filter(Boolean)
    );

    const navItems = sidebarEntries
      .filter((entry) => {
        if (entry.disabled) return false;
        if (firstYear && FIRST_YEAR_DISABLED_HREFS.has(entry.href)) return false;
        const titleNorm = normalizeText(entry.pageTitle);
        return !customPageHrefs.has(entry.href) && !excludedTitleSet.has(titleNorm);
      })
      .map((entry) => ({
        title: entry.pageTitle,
        sub: entry.groupTitle || 'Trang chính',
        href: entry.rawHref || entry.href,
        tabMatch: null,
        keywords: ''
      }));

    return [...filteredDeepItems, ...navItems];
  };

  const bindTitlebarSearch = () => {
    const titlebar = document.getElementById('cd-titlebar');
    const searchWrap = document.getElementById('cd-search-wrap');
    const searchInput = document.getElementById('cd-search-input');
    const searchResults = document.getElementById('cd-search-results');
    const searchToggleBtn = document.getElementById('cd-search-toggle-btn');
    const itemTemplate = document.getElementById('cd-search-item-template');
    const emptyTemplate = document.getElementById('cd-search-empty-template');
    if (!searchInput || !searchResults || searchInput.dataset.bound === '1') return;

    searchInput.dataset.bound = '1';
    let activeIndex = 0;
    let currentMatches = [];

    const setCompactSearchOpen = (open) => {
      if (!titlebar) return;
      titlebar.classList.toggle('is-compact-search-open', Boolean(open));
      if (searchToggleBtn) {
        searchToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      if (!open) {
        searchResults.hidden = true;
      }
    };

    const clampDropdownPosition = () => {
      if (searchResults.hidden) return;
      searchResults.style.left = '50%';
      searchResults.style.transform = 'translateX(-50%)';
      const rect = searchResults.getBoundingClientRect();
      const margin = 12;
      let shiftX = 0;
      if (rect.left < margin) {
        shiftX = margin - rect.left;
      } else if (rect.right > window.innerWidth - margin) {
        shiftX = (window.innerWidth - margin) - rect.right;
      }
      if (shiftX !== 0) {
        searchResults.style.transform = `translateX(calc(-50% + ${Math.round(shiftX)}px))`;
      }
    };

    const renderResults = (query) => {
      const q = normalizeText(query.trim()).replace(/\s+/g, ' ');
      if (!q) {
        searchResults.hidden = true;
        return;
      }

      const queryTokens = q.split(' ').filter(Boolean);

      currentMatches = buildSearchIndex()
        .map((item, idx) => {
          const keywordsText = Array.isArray(item.keywords)
            ? item.keywords.join(' ')
            : (item.keywords || '');
          const normTitle = normalizeText(item.title);
          const normSub = normalizeText(item.sub);
          const normKeywords = normalizeText(keywordsText);
          const haystack = `${normTitle} ${normSub} ${normKeywords}`;

          const matched =
            haystack.includes(q) ||
            queryTokens.every((token) => haystack.includes(token));
          if (!matched) return null;

          let score = 4;
          if (normTitle === q) score = 0;
          else if (normTitle.startsWith(q)) score = 1;
          else if (normTitle.includes(q)) score = 2;
          else if (normSub.includes(q)) score = 3;

          return { item, score, idx };
        })
        .filter(Boolean)
        .sort((a, b) => (a.score - b.score) || (a.idx - b.idx))
        .slice(0, 8)
        .map((entry) => entry.item);

      activeIndex = 0;
      searchResults.replaceChildren();

      if (currentMatches.length === 0) {
        if (emptyTemplate) {
          searchResults.appendChild(emptyTemplate.content.cloneNode(true));
        }
        searchResults.hidden = false;
        clampDropdownPosition();
        return;
      }

      currentMatches.forEach((item, idx) => {
        let btn;
        if (itemTemplate) {
          const fragment = itemTemplate.content.cloneNode(true);
          btn = fragment.querySelector('.cd-search-item');
          const titleEl = fragment.querySelector('.cd-search-item-title');
          const subEl = fragment.querySelector('.cd-search-item-sub');
          if (titleEl) titleEl.textContent = item.title;
          if (subEl) subEl.textContent = `trong: ${item.sub}`;
          if (btn && idx === 0) btn.classList.add('is-selected');
          if (btn) {
            btn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              searchResults.hidden = true;
              searchInput.value = '';
              setCompactSearchOpen(false);
              navigateAndSelectTab(item.href, item.tabMatch);
            });
          }
          searchResults.appendChild(fragment);
        }
      });

      searchResults.hidden = false;
      clampDropdownPosition();
    };

    if (searchToggleBtn && searchToggleBtn.dataset.bound !== '1') {
      searchToggleBtn.dataset.bound = '1';
      searchToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextState = !titlebar?.classList.contains('is-compact-search-open');
        setCompactSearchOpen(nextState);
        if (nextState) {
          searchInput.focus();
          renderResults(searchInput.value);
        }
      });
    }

    searchInput.addEventListener('input', (e) => renderResults(e.target.value));
    searchInput.addEventListener('focus', (e) => renderResults(e.target.value));
    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        searchResults.hidden = true;
        setCompactSearchOpen(false);
      }, 150);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchResults.hidden = true;
        setCompactSearchOpen(false);
        searchInput.blur();
        return;
      }

      if (searchResults.hidden || currentMatches.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        activeIndex = (activeIndex + delta + currentMatches.length) % currentMatches.length;
        searchResults.querySelectorAll('.cd-search-item').forEach((el, i) => {
          el.classList.toggle('is-selected', i === activeIndex);
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = currentMatches[activeIndex];
        if (chosen) {
          searchResults.hidden = true;
          searchInput.value = '';
          setCompactSearchOpen(false);
          searchInput.blur();
          navigateAndSelectTab(chosen.href, chosen.tabMatch);
        }
      }
    });

    if (!window.__cdSearchShortcutBound) {
      window.__cdSearchShortcutBound = true;
      window.addEventListener('resize', () => {
        if (window.innerWidth > 480) {
          document.getElementById('cd-titlebar')?.classList.remove('is-compact-search-open');
          document.getElementById('cd-search-toggle-btn')?.setAttribute('aria-expanded', 'false');
        }
        clampDropdownPosition();
      });

      document.addEventListener('click', (e) => {
        const tb = document.getElementById('cd-titlebar');
        const wrap = document.getElementById('cd-search-wrap');
        const toggle = document.getElementById('cd-search-toggle-btn');
        if (
          tb?.classList.contains('is-compact-search-open') &&
          wrap &&
          !wrap.contains(e.target) &&
          (!toggle || !toggle.contains(e.target))
        ) {
          setCompactSearchOpen(false);
        }
      });

      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          if (!document.documentElement.classList.contains('uit-custom-shell')) return;
          if (document.documentElement.classList.contains('uit-webview-active')) return;
          e.preventDefault();
          const tb = document.getElementById('cd-titlebar');
          if (tb && window.innerWidth <= 480) {
            tb.classList.add('is-compact-search-open');
            document.getElementById('cd-search-toggle-btn')?.setAttribute('aria-expanded', 'true');
          }
          document.getElementById('cd-search-input')?.focus();
        }
      });
    }
  };

  // 5. Custom CSS theme management & titlebar dropdown menus
  const ensureCssExtension = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    return /\.css$/i.test(trimmed) ? trimmed : `${trimmed}.css`;
  };

  const closeThemeDropdown = () => {
    const themeDropdown = document.getElementById('cd-theme-dropdown');
    const importBtn = document.getElementById('cd-import-theme-btn');
    if (themeDropdown) themeDropdown.hidden = true;
    if (importBtn) importBtn.setAttribute('aria-expanded', 'false');
  };

  const closeAccountDropdown = () => {
    const accountDropdown = document.getElementById('cd-account-dropdown');
    const accountBtn = document.getElementById('cd-account-menu-btn');
    if (accountDropdown) accountDropdown.hidden = true;
    if (accountBtn) accountBtn.setAttribute('aria-expanded', 'false');
  };

  const applySavedCustomTheme = () => {
    const disableTheme = isExcludedPage(window.location.pathname);
    const savedCss = localStorage.getItem('uit_custom_theme_css');
    const savedName = ensureCssExtension(localStorage.getItem('uit_custom_theme_name') || '');
    const isCustomActive = localStorage.getItem('uit_custom_theme_active') !== '0';
    hasCustomTheme = Boolean(savedCss) && isCustomActive;
    let styleEl = document.getElementById('cd-custom-theme-style');

    if (hasCustomTheme && !disableTheme) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'cd-custom-theme-style';
      }
      styleEl.textContent = savedCss;
      if (document.documentElement) {
        document.documentElement.appendChild(styleEl);
      }
    } else if (styleEl) {
      styleEl.remove();
    }

    const importBtn = document.getElementById('cd-import-theme-btn');
    const customCssBtn = document.getElementById('cd-theme-custom-btn');
    if (importBtn) {
      importBtn.title = savedCss && savedName ? `Import CSS (${savedName})` : 'Import CSS';
    }
    if (customCssBtn) {
      if (savedCss) {
        const displayName = savedName || 'custom.css';
        customCssBtn.textContent = displayName;
        customCssBtn.title = `Khôi phục giao diện mặc định (${displayName})`;
      } else {
        customCssBtn.textContent = 'Tùy chỉnh CSS';
        customCssBtn.title = 'Tùy chỉnh CSS';
      }
    }

    applyColorScheme(getSavedThemeMode());
  };

  window.__applySavedCustomTheme = applySavedCustomTheme;

  const revertCustomThemeToDefault = () => {
    localStorage.removeItem('uit_custom_theme_css');
    localStorage.removeItem('uit_custom_theme_name');
    localStorage.removeItem('uit_custom_theme_path');
    localStorage.removeItem('uit_custom_theme_active');
    applySavedCustomTheme();
  };

  // 6. Mount custom titlebar
  const bindTitlebarThemeMenu = () => {
    const importBtn = document.getElementById('cd-import-theme-btn');
    const themeDropdown = document.getElementById('cd-theme-dropdown');
    const schemeBtn = document.getElementById('cd-theme-scheme-btn');
    const customCssBtn = document.getElementById('cd-theme-custom-btn');
    const fileInput = document.getElementById('cd-theme-file-input');

    if (importBtn && themeDropdown && importBtn.dataset.bound !== '1') {
      importBtn.dataset.bound = '1';
      importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = themeDropdown.hidden;
        themeDropdown.hidden = !willOpen;
        importBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) closeAccountDropdown();
      });
    }

    if (schemeBtn && schemeBtn.dataset.bound !== '1') {
      schemeBtn.dataset.bound = '1';
      schemeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentMode = getSavedThemeMode();
        const nextMode = THEME_MODES[(THEME_MODES.indexOf(currentMode) + 1) % THEME_MODES.length];
        localStorage.setItem('uit_theme_mode', nextMode);

        // If an active custom CSS does not define [data-theme] selectors, pause it so the selected palette takes effect.
        const savedCss = localStorage.getItem('uit_custom_theme_css') || '';
        if (savedCss && localStorage.getItem('uit_custom_theme_active') !== '0' && !/\[data-theme\s*=/.test(savedCss)) {
          localStorage.setItem('uit_custom_theme_active', '0');
          applySavedCustomTheme();
          return;
        }

        applyColorScheme(nextMode);
      });
    }

    if (customCssBtn && fileInput && customCssBtn.dataset.bound !== '1') {
      customCssBtn.dataset.bound = '1';
      customCssBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeThemeDropdown();
        if (localStorage.getItem('uit_custom_theme_css')) {
          revertCustomThemeToDefault();
          return;
        }
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (typeof ev.target?.result === 'string') {
            localStorage.setItem('uit_custom_theme_css', ev.target.result);
            localStorage.setItem('uit_custom_theme_name', ensureCssExtension(file.name));
            localStorage.setItem('uit_custom_theme_active', '1');
            localStorage.removeItem('uit_custom_theme_path');
            applySavedCustomTheme();
          }
        };
        reader.readAsText(file);
        fileInput.value = '';
      });
    }
  };

  const bindTitlebarAccountMenu = () => {
    const accountBtn = document.getElementById('cd-account-menu-btn');
    const accountDropdown = document.getElementById('cd-account-dropdown');
    const changePwdBtn = document.getElementById('cd-change-password-btn');
    const logoutBtn = document.getElementById('cd-logout-btn');

    if (accountBtn && accountDropdown && accountBtn.dataset.bound !== '1') {
      accountBtn.dataset.bound = '1';
      accountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = accountDropdown.hidden;
        accountDropdown.hidden = !willOpen;
        accountBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) closeThemeDropdown();
      });
    }

    if (changePwdBtn && changePwdBtn.dataset.bound !== '1') {
      changePwdBtn.dataset.bound = '1';
      changePwdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAccountDropdown();
        window.location.href = 'https://portal.uit.edu.vn/api/auth/change-password';
      });
    }

    if (logoutBtn && logoutBtn.dataset.bound !== '1') {
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAccountDropdown();
        window.location.href = '/api/auth/logout';
      });
    }
  };

  const bindWebviewNavControls = () => {
    const backBtn = document.getElementById('cd-webview-back-btn');
    const reloadBtn = document.getElementById('cd-webview-reload-btn');
    const homeBtn = document.getElementById('cd-webview-home-btn');

    if (backBtn && backBtn.dataset.bound !== '1') {
      backBtn.dataset.bound = '1';
      backBtn.addEventListener('click', () => {
        const wv = document.getElementById('cd-external-webview');
        if (wv && typeof wv.canGoBack === 'function' && wv.canGoBack()) {
          wv.goBack();
        } else {
          window.__closeExternalWebview();
        }
      });
    }

    if (reloadBtn && reloadBtn.dataset.bound !== '1') {
      reloadBtn.dataset.bound = '1';
      reloadBtn.addEventListener('click', () => {
        const wv = document.getElementById('cd-external-webview');
        if (wv && typeof wv.reload === 'function') {
          wv.reload();
        }
      });
    }

    if (homeBtn && homeBtn.dataset.bound !== '1') {
      homeBtn.dataset.bound = '1';
      homeBtn.addEventListener('click', () => {
        window.__closeExternalWebview();
      });
    }
  };

  const mountTitlebar = () => {
    const target = document.documentElement;
    if (!target) return;

    let titlebar = document.getElementById('cd-titlebar');
    if (!titlebar && window.__UIT_TITLEBAR_HTML__) {
      target.insertAdjacentHTML('beforeend', window.__UIT_TITLEBAR_HTML__);
      titlebar = document.getElementById('cd-titlebar');
    } else if (titlebar && titlebar.parentElement !== target) {
      target.appendChild(titlebar);
    }

    if (!titlebar) return;

    if (titlebar.dataset.bound !== '1') {
      titlebar.dataset.bound = '1';

      window.__showBootCurtainForRefresh = () => showBootCurtain(true);
      const refreshBtn = document.getElementById('cd-refresh-btn');
      if (refreshBtn && refreshBtn.dataset.refreshBound !== '1') {
        refreshBtn.dataset.refreshBound = '1';
        refreshBtn.addEventListener('click', () => {
          if (window.__clearHoSoRscCache) window.__clearHoSoRscCache();
          showBootCurtain(true);
          requestAnimationFrame(() => window.location.reload());
        });
      }

      document.getElementById('cd-toggle-sidebar-btn')?.addEventListener('click', () => {
        isSidebarHidden = !isSidebarHidden;
        localStorage.setItem('uit_sidebar_hidden', isSidebarHidden ? '1' : '0');
        syncShellToggles();
      });
    }

    bindWebviewNavControls();
    bindTitlebarThemeMenu();
    bindTitlebarAccountMenu();
    bindTitlebarSearch();

    const iconEl = document.getElementById('cd-titlebar-icon');
    if (iconEl) {
      if (window.__UIT_BRAND__) {
        iconEl.src = window.__UIT_BRAND__;
        iconEl.style.display = 'block';
      } else {
        iconEl.style.display = 'none';
      }
    }

    applySavedCustomTheme();
  };

  mountTitlebar();

  // External <webview> manager for non-shell & external routes
  const isNativePortalUrl = (rawUrl) => {
    const raw = String(rawUrl || '').trim();
    if (!raw || raw === 'about:blank') return true;

    let parsed;
    try {
      parsed = new URL(raw, window.location.origin);
    } catch {
      return true;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    const host = parsed.hostname.toLowerCase();
    if (host === 'sso.uit.edu.vn') return true;

    const p = (parsed.pathname || '/').toLowerCase();
    if (/\.pdf($|[?#])/i.test(p) || parsed.searchParams.has('print')) {
      return true;
    }

    if (host === 'portal.uit.edu.vn') {
      return (
        p.startsWith('/trang-chu') ||
        p.startsWith('/sinh-vien') ||
        p.startsWith('/login') ||
        p.startsWith('/api/') ||
        p.includes('/print') ||
        p.includes('/in-bang-diem')
      );
    }

    return false;
  };

  let defaultPortalTitle = '';

  window.__closeExternalWebview = () => {
    const container = document.getElementById('cd-webview-container');
    if (container) {
      container.remove();
    }
    document.documentElement?.classList.remove('uit-webview-active');

    const navWrap = document.getElementById('cd-webview-nav-controls');
    if (navWrap) navWrap.hidden = true;

    const titleEl = document.getElementById('cd-titlebar-title');
    if (titleEl && defaultPortalTitle) {
      titleEl.textContent = defaultPortalTitle;
    }
    syncTitlebarOverlayColor();
  };

  window.__openInWebview = (targetUrl, initialTitle = '') => {
    if (!targetUrl || isNativePortalUrl(targetUrl)) return;

    mountTitlebar();
    const navWrap = document.getElementById('cd-webview-nav-controls');
    if (navWrap) navWrap.hidden = false;

    const titleEl = document.getElementById('cd-titlebar-title');
    if (titleEl) {
      if (!defaultPortalTitle) defaultPortalTitle = titleEl.textContent || 'UIT Student Portal';
      if (initialTitle) titleEl.textContent = initialTitle;
    }

    let container = document.getElementById('cd-webview-container');
    let wv = document.getElementById('cd-external-webview');

    if (!container) {
      container = document.createElement('div');
      container.id = 'cd-webview-container';
      document.documentElement.appendChild(container);
    }

    if (!wv) {
      wv = document.createElement('webview');
      wv.id = 'cd-external-webview';
      wv.setAttribute('allowpopups', '');
      wv.addEventListener('page-title-updated', (e) => {
        const tEl = document.getElementById('cd-titlebar-title');
        if (tEl && e.title) tEl.textContent = e.title;
      });

      const handleWebviewCustomShellRedirect = (navUrl) => {
        if (!navUrl) return;
        let parsed;
        try {
          parsed = new URL(navUrl, window.location.origin);
        } catch {
          return;
        }
        if (parsed.hostname.toLowerCase() === 'portal.uit.edu.vn') {
          const p = parsed.pathname || '/';
          if (p.startsWith('/trang-chu') || p.startsWith('/sinh-vien')) {
            window.__closeExternalWebview();
            const targetPath = normalizePath(p);
            if (normalizePath(window.location.pathname) !== targetPath) {
              navigateAndSelectTab(targetPath, null);
            }
          }
        }
      };

      wv.addEventListener('will-navigate', (e) => {
        handleWebviewCustomShellRedirect(e.url);
      });
      wv.addEventListener('did-navigate', (e) => {
        handleWebviewCustomShellRedirect(e.url);
      });
      wv.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame !== false) {
          handleWebviewCustomShellRedirect(e.url);
        }
      });

      container.appendChild(wv);
    }

    container.hidden = false;
    document.documentElement?.classList.add('uit-webview-active');
    wv.src = targetUrl;
  };

  if (!window.__uitExternalLinkInterceptorBound) {
    window.__uitExternalLinkInterceptorBound = true;

    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!anchor) return;

      const rawHref = anchor.getAttribute('href') || '';
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;

      let resolvedUrl;
      try {
        resolvedUrl = new URL(anchor.href, window.location.href).href;
      } catch {
        return;
      }

      if (!isNativePortalUrl(resolvedUrl)) {
        e.preventDefault();
        e.stopPropagation();
        const label =
          anchor.querySelector('.cd-shortcut-name')?.textContent?.trim() ||
          anchor.textContent?.trim() ||
          resolvedUrl;
        window.__openInWebview(resolvedUrl, label);
      }
    }, true);
  }

  // 7. Portal version detection
  const extractVersionToken = (rawText) => {
    if (!rawText) return '';
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text || text.length > 100) return '';

    const labeledRev = text.match(/(?:phiên bản|version|ver\.?|build|release)\s*[:\-]?\s*(r\d+(?:[-+][\w.]+)?)\b/i);
    if (labeledRev) return labeledRev[1].toLowerCase();

    const standaloneRev = text.match(/^(r\d+(?:[-+][\w.]+)?)$/i);
    if (standaloneRev) return standaloneRev[1].toLowerCase();

    const labeled = text.match(/(?:phiên bản|version|ver\.?|build|release)\s*[:\-]?\s*v?(\d+(?:\.\d+){1,3}(?:[-+][\w.]+)?)/i);
    if (labeled) return `v${labeled[1]}`;

    const vPrefixed = text.match(/\bv(\d+(?:\.\d+){1,3}(?:[-+][\w.]+)?)\b/i);
    if (vPrefixed) return `v${vPrefixed[1]}`;

    const standalone = text.match(/^v?(\d+\.\d+(?:\.\d+){0,2}(?:[-+][\w.]+)?)$/i);
    if (standalone) return `v${standalone[1]}`;

    return '';
  };

  const detectPortalVersion = () => {
    if (cachedPortalVersion) return cachedPortalVersion;

    const nativeNav = document.querySelector('nav[aria-label="Điều hướng chính"]');
    const nativeSidebarWrapper = nativeNav
      ? (nativeNav.closest('div.shrink-0') || nativeNav.parentElement?.parentElement || nativeNav.parentElement)
      : null;

    const containers = [
      document.querySelector('[title^="Build time:"]'),
      nativeSidebarWrapper,
      document.querySelector('body > div.flex.min-h-screen > div.hidden.shrink-0'),
      document.querySelector('footer'),
      document.querySelector('aside:not(#cd-sidebar)'),
      document.querySelector('header.sticky')
    ].filter(Boolean);

    for (const container of containers) {
      for (const el of [container, ...container.querySelectorAll('*')]) {
        if (el.closest('#cd-sidebar, #cd-titlebar')) continue;
        const found = extractVersionToken(el.textContent);
        if (found) {
          cachedPortalVersion = found;
          sessionStorage.setItem('uit_portal_version', found);
          return found;
        }
      }
    }

    return '';
  };

  const updateSidebarVersionDisplay = () => {
    const versionEl = document.getElementById('cd-version-info');
    if (!versionEl) return;
    const portalVer = detectPortalVersion();
    const appVer = window.__UIT_APP_VERSION__ ? `v${window.__UIT_APP_VERSION__}` : 'v1.0.0';
    versionEl.textContent = portalVer ? `UIT Portal ${portalVer} | Wrapper ${appVer}` : `Wrapper ${appVer}`;
  };

  // 8. Profile state & /trang-chu card controls
  const getGreetingByHour = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Chào buổi sáng,';
    if (hour < 18) return 'Chào buổi chiều,';
    return 'Chào buổi tối,';
  };

  const renderProfileMetaPills = (metaEl, metaText) => {
    if (!metaEl) return;
    metaEl.innerHTML = '';
    const tokens = String(metaText || '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    tokens.forEach((token) => {
      const pill = document.createElement('span');
      pill.className = 'cd-user-meta-pill';
      pill.textContent = token;
      metaEl.appendChild(pill);
    });
  };

  const applyProfile = (profile) => {
    if (!profile) return;
    cachedProfile = profile;
    profileFetchSettled = true;
    if (!isExcludedPage(window.location.pathname)) {
      const greetingEl = document.getElementById('cd-user-greeting');
      const nameEl = document.getElementById('cd-user-name');
      const avatarEl = document.getElementById('cd-user-avatar');
      const metaEl = document.getElementById('cd-user-meta');
      if (greetingEl) greetingEl.textContent = getGreetingByHour();
      if (nameEl && profile.name) nameEl.textContent = profile.name;
      if (avatarEl && profile.avatar) avatarEl.src = profile.avatar;
      if (metaEl && profile.meta) renderProfileMetaPills(metaEl, profile.meta);
      updateFirstYearNavState();
    }
    window.__scheduleBootCurtainCheck();
  };

  window.__bindTrangChuControls = () => {
    applySavedCustomTheme();
    const greetingEl = document.getElementById('cd-user-greeting');
    if (greetingEl) greetingEl.textContent = getGreetingByHour();
    if (cachedProfile) {
      applyProfile(cachedProfile);
    } else if (profileFetchSettled) {
      const nameEl = document.getElementById('cd-user-name');
      if (nameEl) nameEl.textContent = 'Sinh viên UIT';
    }
    if (window.__renderCachedUserStats) {
      window.__renderCachedUserStats();
    }
  };

  if (!window.__cdMenuDismissBound) {
    window.__cdMenuDismissBound = true;
    document.addEventListener('click', (e) => {
      const accountWrap = document.getElementById('cd-account-menu-wrap');
      if (accountWrap && !accountWrap.contains(e.target)) {
        closeAccountDropdown();
      }

      const themeWrap = document.getElementById('cd-theme-menu-wrap');
      if (themeWrap && !themeWrap.contains(e.target)) {
        closeThemeDropdown();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAccountDropdown();
        closeThemeDropdown();
      }
    });
  }

  // 9. Shell mounter
  const mountShell = () => {
    mountTitlebar();
    if (isExcludedPage(window.location.pathname)) return;
    if (!document.querySelector('#cd-sidebar #cd-sidebar-footer') && window.__UIT_SHELL_HTML__) {
      document.getElementById('cd-sidebar')?.remove();
      document.body.insertAdjacentHTML('afterbegin', window.__UIT_SHELL_HTML__);

      document.querySelectorAll('#cd-sidebar .cd-nav a').forEach(link => {
        const href = normalizePath(link.getAttribute('href'));

        link.addEventListener('mouseenter', () => {
          if (link.classList.contains('active') || link.classList.contains('cd-nav-disabled')) return;
          const nextLink = document.querySelector(`nav[aria-label="Điều hướng chính"] a[href="${href}"]`);
          nextLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
        });

        link.addEventListener('click', (e) => {
          if (
            href === normalizePath(window.location.pathname) ||
            link.classList.contains('active') ||
            link.classList.contains('cd-nav-disabled')
          ) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          if (href === '/sinh-vien/ho-so' && !window.__uitHoSoRscCache) {
            window.__showHoSoRouteLoader('/sinh-vien/ho-so');
          } else if (pendingRouteHref) {
            window.__hideHoSoRouteLoader(false);
          }

          const nextLink = document.querySelector(`nav[aria-label="Điều hướng chính"] a[href="${href}"]`);
          if (nextLink) {
            e.preventDefault();
            nextLink.click();
          }
        });
      });

      applySavedCustomTheme();
      if (cachedProfile) applyProfile(cachedProfile);
      updateFirstYearNavState();
    }

    updateSidebarVersionDisplay();
    syncShellToggles();
  };

  if (isPortalHost) {
    document
      .querySelectorAll('[data-uma-nhung], script[src*="uma.uit.edu.vn"], link[href*="uma.uit.edu.vn"], iframe[src*="uma.uit.edu.vn"]')
      .forEach((el) => el.remove());
  }

  if (!isExcludedPage(window.location.pathname)) {
    if (cachedProfile) {
      applyProfile(cachedProfile);
    } else {
      fetch('https://portal.uit.edu.vn/sinh-vien/')
        .then(res => res.text())
        .then(html => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const nameEl = doc.querySelector('main header h2') || doc.querySelector('.font-heading.text-2xl');
          const avatarEl = doc.querySelector('main header img') || doc.querySelector('img[src*="anh-the"]');
          const metaContainer = nameEl?.nextElementSibling;
          const metaSpans = metaContainer
            ? Array.from(metaContainer.querySelectorAll('span:not([aria-hidden])')).map(s => s.textContent.trim())
            : [];

          const profile = {
            name: nameEl ? nameEl.textContent.trim() : 'Sinh viên UIT',
            avatar: avatarEl ? avatarEl.getAttribute('src') : '/api/sinh-vien/anh-the',
            meta: metaSpans.join(' | ')
          };

          sessionStorage.setItem('uit_user_profile', JSON.stringify(profile));
          applyProfile(profile);
        })
        .catch(() => {
          const nameEl = document.getElementById('cd-user-name');
          if (nameEl) nameEl.textContent = 'Sinh viên UIT';
          profileFetchSettled = true;
          window.__scheduleBootCurtainCheck();
        });
    }
  }

  // 10. Route state updater
  window.__updateCustomRouteState = () => {
    const currentPath = window.location.pathname;
    const excluded = isExcludedPage(currentPath);
    const normalizedPath = normalizePath(currentPath);
    const isTrangChu = isPortalHost && normalizedPath === '/trang-chu';

    document.documentElement?.classList.toggle('uit-custom-shell', !excluded);
    mountTitlebar();
    if (!excluded) mountShell();
    applySavedCustomTheme();

    const sidebar = document.getElementById('cd-sidebar');

    if (excluded) {
      profileFetchSettled = true;
      dismissBootCurtainNow();
      document.documentElement?.removeAttribute('data-theme');
      document.getElementById('cd-custom-theme-style')?.remove();
      if (sidebar) sidebar.style.display = 'none';
      document.body.classList.remove('with-custom-shell', 'is-trang-chu', 'cd-sidebar-hidden');
      document.body.style.removeProperty('--cd-status-banner-height');
      Array.from(document.body.classList).forEach(cls => {
        if (cls.startsWith('route-')) document.body.classList.remove(cls);
      });
    } else {
      if (sidebar) sidebar.style.display = 'flex';

      document.body.classList.add('with-custom-shell');
      document.body.classList.toggle('is-trang-chu', isTrangChu);
      syncShellToggles();
      updateSidebarVersionDisplay();
      updateFirstYearNavState();

      Array.from(document.body.classList).forEach(cls => {
        if (cls.startsWith('route-')) document.body.classList.remove(cls);
      });
      const slug = currentPath.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'trang-chu';
      document.body.classList.add(`route-${slug}`);

      syncSidebarActiveLinks(pendingRouteHref || normalizedPath);

      if (pendingRouteHref && normalizedPath === pendingRouteHref) {
        window.__scheduleHideHoSoRouteLoader();
      } else if (!pendingRouteHref && document.body.classList.contains('cd-route-loading')) {
        window.__hideHoSoRouteLoader(false);
      }

      if (normalizedPath === '/sinh-vien/ho-so') {
        customizeHoSoHeader();
        hideHoSoBhytTab();
      }

      if (isTrangChu && window.__renderTrangChuView) {
        window.__renderTrangChuView();
      }
    }

    window.__scheduleBootCurtainCheck();
  };

  window.__updateCustomRouteState();

  if (!window.__uitHistoryHooked) {
    window.__uitHistoryHooked = true;
    const wrapHistoryMethod = (methodName) => {
      const orig = history[methodName];
      if (typeof orig !== 'function') return;
      history[methodName] = function (...args) {
        const result = orig.apply(this, args);
        if (typeof window.__updateCustomRouteState === 'function') {
          window.__updateCustomRouteState();
        }
        return result;
      };
    };
    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');
    window.addEventListener('popstate', () => {
      if (typeof window.__updateCustomRouteState === 'function') {
        window.__updateCustomRouteState();
      }
    });
  }

  // 11. Hydration defender
  const enforceBodyClasses = new MutationObserver((mutations) => {
    const currentPath = window.location.pathname;
    const excluded = isExcludedPage(currentPath);
    const normalizedPath = normalizePath(currentPath);
    const isTrangChu = isPortalHost && normalizedPath === '/trang-chu';

    if (document.documentElement) {
      document.documentElement.classList.toggle('uit-custom-shell', !excluded);
    }

    if (!document.getElementById('cd-titlebar')) {
      mountTitlebar();
    }

    if (!excluded) {
      if (!document.querySelector('#cd-sidebar #cd-sidebar-footer')) {
        mountShell();
        window.__updateCustomRouteState();
      }
      if (!document.body.classList.contains('with-custom-shell')) {
        document.body.classList.add('with-custom-shell');
      }
      if (isTrangChu && !document.body.classList.contains('is-trang-chu')) {
        document.body.classList.add('is-trang-chu');
      }
      const expectedSlug = currentPath.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'trang-chu';
      const expectedRouteClass = `route-${expectedSlug}`;
      if (!document.body.classList.contains(expectedRouteClass)) {
        Array.from(document.body.classList).forEach(cls => {
          if (cls.startsWith('route-')) document.body.classList.remove(cls);
        });
        document.body.classList.add(expectedRouteClass);
      }
      if (pendingRouteHref && !document.body.classList.contains('cd-route-loading')) {
        document.body.classList.add('cd-route-loading');
      }
      if (isTrangChu && !document.getElementById('cd-trang-chu-view') && window.__renderTrangChuView) {
        window.__renderTrangChuView();
      }
      updateFirstYearNavState();
      syncShellToggles();
      if (!cachedPortalVersion) {
        updateSidebarVersionDisplay();
      }
      if (hasCustomTheme && !document.getElementById('cd-custom-theme-style')) {
        applySavedCustomTheme();
      }
      if (!document.documentElement.getAttribute('data-theme')) {
        applyColorScheme(getSavedThemeMode());
      }

      const mainChanged = mutations.some(
        (m) =>
          m.type === 'childList' &&
          m.target instanceof Element &&
          (Boolean(m.target.closest('main')) ||
            Array.from(m.addedNodes).some(
              (node) => node instanceof Element && (node.matches('main') || Boolean(node.querySelector('main')))
            ))
      );
      if (mainChanged) {
        if (normalizedPath === '/sinh-vien/ho-so') {
          customizeHoSoHeader();
          hideHoSoBhytTab();
          if (pendingRouteHref === '/sinh-vien/ho-so') {
            window.__scheduleHideHoSoRouteLoader();
          }
        }
        window.__scheduleBootCurtainCheck();
      }
    }
  });

  if (document.body) {
    enforceBodyClasses.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }

  // 12. Modal viewport manager: inspect the live DOM after React opens dialogs.
  const installModalViewportManager = () => {
    if (!document.body || window.__uitModalViewportManagerInstalled) return;
    window.__uitModalViewportManagerInstalled = true;
    window.__UIT_MODAL_FIX_VERSION__ = 3;

    const dialogSelector = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';
    const directViewportFixSelector = [
      'body.with-custom-shell [role="dialog"].fixed.inset-0',
      'body.with-custom-shell [role="alertdialog"].fixed.inset-0',
      'body.with-custom-shell [aria-modal="true"].fixed.inset-0',
      'body.with-custom-shell [data-slot="sheet-content"]',
      'body.with-custom-shell [data-slot="drawer-content"].inset-y-0'
    ].join(',');

    const applyDirectViewportFix = (el) => {
      if (!(el instanceof HTMLElement) || !el.matches(directViewportFixSelector)) return;
      el.style.setProperty('margin', '0', 'important');
      el.style.setProperty('max-height', 'none', 'important');
    };

    const overlaySelector = [
      '[data-slot="dialog-overlay"]',
      '[data-slot="alert-dialog-overlay"]',
      '[data-slot="sheet-overlay"]',
      '[data-slot="drawer-overlay"]',
      '[data-radix-dialog-overlay]',
      '[data-radix-alert-dialog-overlay]',
      '.fixed.inset-0'
    ].join(',');

    const normalizeModalText = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const isSupportRoute = () => normalizePath(window.location.pathname) === '/sinh-vien/ho-tro';

    const markOverlay = (el) => {
      if (!(el instanceof HTMLElement) || el.id === 'cd-boot-curtain' || el.matches(dialogSelector)) return;
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      const coversViewport = rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8;
      const hasOverlayMarker = el.matches('[data-slot$="-overlay"], [data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]');
      const className = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
      const hasBackdropClass = /(^|\s)(bg-black|bg-background|bg-foreground|bg-slate-|bg-gray-|bg-zinc-)/.test(className);
      if (!hasOverlayMarker && !(coversViewport && hasBackdropClass)) return;
      el.setAttribute('data-uit-modal-overlay', '1');
      el.style.setProperty('position', 'fixed', 'important');
      el.style.setProperty('inset', '0', 'important');
      el.style.setProperty('width', '100vw', 'important');
      el.style.setProperty('height', '100vh', 'important');
      el.style.setProperty('z-index', '10000', 'important');
    };

    const markDialog = (el) => {
      if (!(el instanceof HTMLElement) || !isVisible(el)) return;
      const text = normalizeModalText(el.innerText || el.textContent);
      let kind = 'default';
      if (isSupportRoute()) {
        kind = (text.includes('tao ticket moi') || text.includes('tao yeu cau moi'))
          ? 'ticket-create'
          : 'ticket-detail';
      }
      el.setAttribute('data-uit-modal-fix', kind);
      el.style.setProperty('z-index', '10001', 'important');
      if (el.matches(directViewportFixSelector)) {
        applyDirectViewportFix(el);
      } else {
        el.style.setProperty('max-height', kind === 'ticket-detail'
          ? 'calc(100vh - 64px)'
          : (kind === 'ticket-create' ? 'calc(100vh - 80px)' : 'calc(100vh - 72px)'), 'important');
      }
      el.style.setProperty('overflow-y', 'auto', 'important');
      el.style.setProperty('overscroll-behavior', 'contain', 'important');

      if (kind === 'ticket-create') {
        el.style.setProperty('top', 'calc(50% + 18px)', 'important');
      } else if (kind === 'ticket-detail') {
        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('left', '50%', 'important');
        el.style.setProperty('top', '48px', 'important');
        el.style.setProperty('transform', 'translateX(-50%)', 'important');
      } else {
        const className = typeof el.className === 'string' ? el.className : '';
        if (className.includes('top-1/2') || className.includes('top-[50%]')) {
          el.style.setProperty('top', '50%', 'important');
        }
      }
    };

    const refresh = () => {
      if (!document.body.classList.contains('with-custom-shell')) return;
      document.querySelectorAll(overlaySelector).forEach(markOverlay);
      document.querySelectorAll(directViewportFixSelector).forEach(applyDirectViewportFix);
      document.querySelectorAll(dialogSelector).forEach(markDialog);
    };

    refresh();
    const observer = new MutationObserver(() => refresh());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-state', 'aria-hidden', 'hidden']
    });
    window.__uitModalViewportObserver = observer;
  };

  installModalViewportManager();
})();