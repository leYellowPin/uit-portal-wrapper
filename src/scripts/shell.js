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
      const statGrid = document.getElementById('cd-stats-grid');
      if (!window.__trangChuPopulated || !statGrid || statGrid.children.length === 0) return false;
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
      const isActive = normalizePath(link.getAttribute('href')) === activeHref;
      link.classList.toggle('active', isActive);
      link.setAttribute('aria-current', isActive ? 'page' : 'false');
      link.setAttribute('aria-disabled', isActive ? 'true' : 'false');
      link.tabIndex = isActive ? -1 : 0;
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

  // 4. Titlebar Search & Tab Activation
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

  const activatePortalTab = (tabLabel) => {
    if (!tabLabel) return;
    const targetNorm = normalizeText(tabLabel);

    const tryClickTab = () => {
      const tabs = Array.from(document.querySelectorAll('main [role="tab"]'));
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

  const buildSearchIndex = () => {
    const customPageHrefs = new Set(
      DEEP_SEARCH_ITEMS.filter((item) => !item.tabMatch).map((item) => normalizePath(item.href))
    );
    const excludedTitleSet = new Set(
      EXCLUDED_SEARCH_TITLES.map((t) => normalizeText(String(t).trim())).filter(Boolean)
    );

    const navItems = Array.from(document.querySelectorAll('#cd-sidebar .cd-nav a'))
      .filter((a) => {
        const href = normalizePath(a.getAttribute('href'));
        const titleNorm = normalizeText(a.textContent.trim());
        return !customPageHrefs.has(href) && !excludedTitleSet.has(titleNorm);
      })
      .map((a) => ({
        title: a.textContent.trim(),
        sub: 'Trang chính',
        href: a.getAttribute('href'),
        tabMatch: null,
        keywords: ''
      }));

    return [...DEEP_SEARCH_ITEMS, ...navItems];
  };

  const bindTitlebarSearch = () => {
    const searchInput = document.getElementById('cd-search-input');
    const searchResults = document.getElementById('cd-search-results');
    if (!searchInput || !searchResults || searchInput.dataset.bound === '1') return;

    searchInput.dataset.bound = '1';
    let activeIndex = 0;
    let currentMatches = [];

    const renderResults = (query) => {
      const q = normalizeText(query.trim());
      if (!q) {
        searchResults.hidden = true;
        return;
      }

      currentMatches = buildSearchIndex().filter((item) => {
        const keywordsText = Array.isArray(item.keywords)
          ? item.keywords.join(' ')
          : (item.keywords || '');
        const haystack = normalizeText(`${item.title} ${item.sub} ${keywordsText}`);
        return haystack.includes(q);
      }).slice(0, 8);

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
          <span class="cd-search-item-title">${item.title}</span>
          <span class="cd-search-item-sub">trong: ${item.sub}</span>
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
  const applyProfile = (profile) => {
    if (!profile) return;
    cachedProfile = profile;
    profileFetchSettled = true;
    if (!isExcludedPage(window.location.pathname)) {
      const nameEl = document.getElementById('cd-user-name');
      const avatarEl = document.getElementById('cd-user-avatar');
      const metaEl = document.getElementById('cd-user-meta');
      if (nameEl && profile.name) nameEl.textContent = profile.name;
      if (avatarEl && profile.avatar) avatarEl.src = profile.avatar;
      if (metaEl && profile.meta) metaEl.textContent = profile.meta;
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
    if (cachedProfile) {
      applyProfile(cachedProfile);
    } else if (profileFetchSettled) {
      const nameEl = document.getElementById('cd-user-name');
      if (nameEl) nameEl.textContent = 'Sinh viên UIT';
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
          if (link.classList.contains('active')) return;
          const nextLink = document.querySelector(`nav[aria-label="Điều hướng chính"] a[href="${href}"]`);
          nextLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
        });

        link.addEventListener('click', (e) => {
          if (href === normalizePath(window.location.pathname) || link.classList.contains('active')) {
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
    const isTrangChu = isPortalHost && normalizePath(currentPath) === '/trang-chu';

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
        window.__scheduleBootCurtainCheck();
      }
    }
  });

  if (document.body) {
    enforceBodyClasses.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }
})();
