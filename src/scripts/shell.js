(() => {
  const isPortalHost = window.location.hostname === 'portal.uit.edu.vn';

  const normalizePath = (pathname) => {
    const cleaned = (pathname || '/').replace(/\/+$/, '') || '/';
    return cleaned === '/' ? '/trang-chu' : cleaned;
  };

  const isExcludedPage = (pathname) => {
    if (!isPortalHost) return true;
    return (
      pathname.startsWith('/login') ||
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/khao-sat')
    );
  };

  let isSidebarHidden = localStorage.getItem('uit_sidebar_hidden') === '1';
  let hasCustomTheme = Boolean(localStorage.getItem('uit_custom_theme_css'));
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

    clearTimeout(curtainState.settleTimer);
    curtainState.settleTimer = null;

    if (!isPageReadyForReveal()) return;

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

  // 2. Titlebar overlay & layout toggles
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

  const syncShellToggles = () => {
    if (!document.body) return;
    document.body.classList.toggle('cd-sidebar-hidden', isSidebarHidden);
    document.getElementById('cd-toggle-sidebar-btn')?.setAttribute('aria-pressed', isSidebarHidden ? 'true' : 'false');
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

  window.__hideHoSoRouteLoader = (restoreCurrentActive = false) => {
    clearTimeout(routeLoaderSafetyTimer);
    clearTimeout(routeLoaderHideTimer);
    const wasPending = Boolean(pendingRouteHref);
    pendingRouteHref = '';
    document.body.classList.remove('cd-route-loading');

    if (restoreCurrentActive && wasPending) {
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
    routeLoaderHideTimer = setTimeout(() => {
      requestAnimationFrame(() => window.__hideHoSoRouteLoader(true));
    }, 120);
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

  const escapeHtml = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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
    const searchInput = document.getElementById('cd-search-input');
    const searchResults = document.getElementById('cd-search-results');
    if (!searchInput || !searchResults || searchInput.dataset.bound === '1') return;

    searchInput.dataset.bound = '1';
    let activeIndex = 0;
    let currentMatches = [];

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
      searchResults.innerHTML = '';

      if (currentMatches.length === 0) {
        searchResults.innerHTML = `<div class="cd-search-item"><span class="cd-search-item-sub">Không tìm thấy kết quả</span></div>`;
        searchResults.hidden = false;
        return;
      }

      currentMatches.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `cd-search-item${idx === 0 ? ' is-selected' : ''}`;
        btn.innerHTML = `
          <span class="cd-search-item-title">${escapeHtml(item.title)}</span>
          <span class="cd-search-item-sub">trong: ${escapeHtml(item.sub)}</span>
        `;
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          searchResults.hidden = true;
          searchInput.value = '';
          navigateAndSelectTab(item.href, item.tabMatch);
        });
        searchResults.appendChild(btn);
      });

      searchResults.hidden = false;
    };

    searchInput.addEventListener('input', (e) => renderResults(e.target.value));
    searchInput.addEventListener('focus', (e) => renderResults(e.target.value));
    searchInput.addEventListener('blur', () => {
      setTimeout(() => { searchResults.hidden = true; }, 150);
    });

    searchInput.addEventListener('keydown', (e) => {
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
          searchInput.blur();
          navigateAndSelectTab(chosen.href, chosen.tabMatch);
        }
      } else if (e.key === 'Escape') {
        searchResults.hidden = true;
        searchInput.blur();
      }
    });

    if (!window.__cdSearchShortcutBound) {
      window.__cdSearchShortcutBound = true;
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          if (!document.documentElement.classList.contains('uit-custom-shell')) return;
          e.preventDefault();
          document.getElementById('cd-search-input')?.focus();
        }
      });
    }
  };

  // 5. Mount custom titlebar
  const mountTitlebar = () => {
    const target = document.body || document.documentElement;
    if (!target) return;

    let titlebar = document.getElementById('cd-titlebar');
    if (!titlebar && window.__UIT_TITLEBAR_HTML__) {
      target.insertAdjacentHTML('afterbegin', window.__UIT_TITLEBAR_HTML__);
      titlebar = document.getElementById('cd-titlebar');
    } else if (titlebar && document.body && titlebar.parentElement !== document.body) {
      document.body.insertAdjacentElement('afterbegin', titlebar);
    }

    if (!titlebar) return;

    if (titlebar.dataset.bound !== '1') {
      titlebar.dataset.bound = '1';

      document.getElementById('cd-refresh-btn')?.addEventListener('click', () => {
        if (window.__clearHoSoRscCache) window.__clearHoSoRscCache();
        showBootCurtain(true);
        requestAnimationFrame(() => window.location.reload());
      });

      document.getElementById('cd-toggle-sidebar-btn')?.addEventListener('click', () => {
        isSidebarHidden = !isSidebarHidden;
        localStorage.setItem('uit_sidebar_hidden', isSidebarHidden ? '1' : '0');
        syncShellToggles();
      });
    }

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

    syncTitlebarOverlayColor();
  };

  mountTitlebar();

  // 6. Portal version detection
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

  // 7. Custom CSS theme management
  const applySavedCustomTheme = () => {
    const disableTheme = isExcludedPage(window.location.pathname);
    const savedCss = localStorage.getItem('uit_custom_theme_css');
    const savedName = localStorage.getItem('uit_custom_theme_name');
    hasCustomTheme = Boolean(savedCss);
    let styleEl = document.getElementById('cd-custom-theme-style');

    if (savedCss && !disableTheme) {
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
    const resetBtn = document.getElementById('cd-reset-theme-btn');
    if (importBtn) importBtn.textContent = savedCss && savedName ? `Theme: ${savedName}` : 'Import CSS';
    if (resetBtn) resetBtn.style.display = savedCss ? 'inline-block' : 'none';

    syncTitlebarOverlayColor();
  };

  applySavedCustomTheme();

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
    const importBtn = document.getElementById('cd-import-theme-btn');
    const resetBtn = document.getElementById('cd-reset-theme-btn');
    const fileInput = document.getElementById('cd-theme-file-input');

    if (importBtn && fileInput && importBtn.dataset.bound !== '1') {
      importBtn.dataset.bound = '1';
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (typeof ev.target?.result === 'string') {
            localStorage.setItem('uit_custom_theme_css', ev.target.result);
            localStorage.setItem('uit_custom_theme_name', file.name.replace(/\.css$/i, ''));
            applySavedCustomTheme();
          }
        };
        reader.readAsText(file);
        fileInput.value = '';
      });
    }

    if (resetBtn && resetBtn.dataset.bound !== '1') {
      resetBtn.dataset.bound = '1';
      resetBtn.addEventListener('click', () => {
        localStorage.removeItem('uit_custom_theme_css');
        localStorage.removeItem('uit_custom_theme_name');
        applySavedCustomTheme();
      });
    }

    const moreBtn = document.getElementById('cd-more-menu-btn');
    const moreDropdown = document.getElementById('cd-more-dropdown');
    if (moreBtn && moreDropdown && moreBtn.dataset.bound !== '1') {
      moreBtn.dataset.bound = '1';
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = moreDropdown.hidden;
        moreDropdown.hidden = !willOpen;
        moreBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    }

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
      const wrap = document.getElementById('cd-more-menu-wrap');
      const dropdown = document.getElementById('cd-more-dropdown');
      const btn = document.getElementById('cd-more-menu-btn');
      if (wrap && dropdown && !wrap.contains(e.target)) {
        dropdown.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const dropdown = document.getElementById('cd-more-dropdown');
        const btn = document.getElementById('cd-more-menu-btn');
        if (dropdown) dropdown.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
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
      if (sidebar) sidebar.style.display = 'none';
      document.body.classList.remove('with-custom-shell', 'is-trang-chu', 'cd-sidebar-hidden');
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
        requestAnimationFrame(() => window.__hideHoSoRouteLoader(false));
      } else if (!pendingRouteHref && document.body.classList.contains('cd-route-loading')) {
        window.__hideHoSoRouteLoader(false);
      }

      if (normalizedPath === '/sinh-vien/ho-so') {
        hideHoSoBhytTab();
      }

      if (isTrangChu && window.__renderTrangChuView) {
        window.__renderTrangChuView();
      }
    }

    window.__scheduleBootCurtainCheck();
  };

  window.__updateCustomRouteState();

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

      const mainChanged = mutations.some(
        (m) => m.type === 'childList' && m.target instanceof Element && m.target.closest('main')
      );
      if (mainChanged) {
        if (normalizedPath === '/sinh-vien/ho-so') {
          hideHoSoBhytTab();
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
    // These are the exact modal/sheet nodes for which the user's DevTools
    // element.style overrides worked. Apply the same declarations inline with
    // !important so portal/framework inline styles cannot reintroduce margins
    // or a restrictive max-height.
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

    const normalizeText = (value) => String(value || '')
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
      const text = normalizeText(el.innerText || el.textContent);
      let kind = 'default';
      if (isSupportRoute()) {
        kind = (text.includes('tao ticket moi') || text.includes('tao yeu cau moi'))
          ? 'ticket-create'
          : 'ticket-detail';
      }
      el.setAttribute('data-uit-modal-fix', kind);
      el.style.setProperty('z-index', '10001', 'important');
      // Keep the prior height cap only for dialog implementations outside the
      // exact selector set. For the elements identified by the user, apply the
      // proven inline max-height:none and margin:0 overrides instead.
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
    console.info('[UIT Wrapper] Modal viewport manager v3 active');
  };

  installModalViewportManager();
})();
