(() => {
  const isPortalHost = window.location.hostname === 'portal.uit.edu.vn';

  const isExcludedPage = (pathname) => {
    if (!isPortalHost) return true;
    return (
      pathname.startsWith('/login') ||
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/khao-sat')
    );
  };

  // In-memory state caches to avoid storage reads inside MutationObserver
  let isSidebarHidden = localStorage.getItem('uit_sidebar_hidden') === '1';
  let isHeaderHidden = localStorage.getItem('uit_header_hidden') === '1';
  let hasCustomTheme = Boolean(localStorage.getItem('uit_custom_theme_css'));
  let cachedPortalVersion = sessionStorage.getItem('uit_portal_version') || '';

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
    const btn = document.getElementById('cd-refresh-btn');
    if (!btn) return;
    const hex = rgbToHex(getComputedStyle(btn).color);
    if (hex && hex !== window.__lastOverlaySymbolColor) {
      window.__lastOverlaySymbolColor = hex;
      console.debug('__UIT_TITLEBAR_OVERLAY__' + JSON.stringify({ symbolColor: hex }));
    }
  };

  // Sync sidebar and header visibility states
  const syncShellToggles = () => {
    if (!document.body) return;
    document.body.classList.toggle('cd-sidebar-hidden', isSidebarHidden);
    document.body.classList.toggle('cd-header-hidden', isHeaderHidden);
  };

  // Show color fade curtain on startup and full page reloads
  const initBootCurtain = (force = false) => {
    if (!isPortalHost || !document.documentElement) return;
    if (!force && window.__bootCurtainPlayed) return;
    window.__bootCurtainPlayed = true;

    let curtain = document.getElementById('cd-boot-curtain');
    if (!curtain) {
      curtain = document.createElement('div');
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
    }

    if (!window.__curtainFallbackTimer) {
      window.__curtainFallbackTimer = setTimeout(() => {
        if (window.__dismissBootCurtain) window.__dismissBootCurtain();
      }, 2500);
    }
  };

  window.__dismissBootCurtain = () => {
    const curtain = document.getElementById('cd-boot-curtain');
    if (!curtain || curtain.dataset.fading === '1') return;

    if (!window.__curtainPaintedAt) {
      requestAnimationFrame(() => window.__dismissBootCurtain());
      return;
    }

    curtain.dataset.fading = '1';
    if (window.__curtainFallbackTimer) {
      clearTimeout(window.__curtainFallbackTimer);
      window.__curtainFallbackTimer = null;
    }

    const minHoldMs = 780;
    const elapsed = Date.now() - window.__curtainPaintedAt;
    const waitMs = Math.max(0, minHoldMs - elapsed);

    setTimeout(() => {
      void curtain.offsetHeight;
      requestAnimationFrame(() => {
        curtain.style.opacity = '0';
        setTimeout(() => curtain.remove(), 700);
      });
    }, waitMs);
  };

  initBootCurtain();

  // Mount global custom window title bar with Refresh, Sidebar, and Header toggles
  const mountTitlebar = () => {
    const target = document.body || document.documentElement;
    if (!target) return;

    let titlebar = document.getElementById('cd-titlebar');
    if (!titlebar) {
      titlebar = document.createElement('div');
      titlebar.id = 'cd-titlebar';
      titlebar.innerHTML = `
        <img id="cd-titlebar-icon" alt="UIT" />
        <span id="cd-titlebar-title">UIT Portal Wrapper</span>
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
      `;
      target.insertAdjacentElement('afterbegin', titlebar);
    } else if (document.body && titlebar.parentElement !== document.body) {
      document.body.insertAdjacentElement('afterbegin', titlebar);
    }

    if (titlebar.dataset.bound !== '1') {
      titlebar.dataset.bound = '1';

      const refreshBtn = document.getElementById('cd-refresh-btn');
      const sidebarBtn = document.getElementById('cd-toggle-sidebar-btn');
      const headerBtn = document.getElementById('cd-toggle-header-btn');

      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          initBootCurtain(true);
          window.location.reload();
        });
      }

      if (sidebarBtn) {
        sidebarBtn.addEventListener('click', () => {
          isSidebarHidden = !isSidebarHidden;
          localStorage.setItem('uit_sidebar_hidden', isSidebarHidden ? '1' : '0');
          syncShellToggles();
        });
      }

      if (headerBtn) {
        headerBtn.addEventListener('click', () => {
          isHeaderHidden = !isHeaderHidden;
          localStorage.setItem('uit_header_hidden', isHeaderHidden ? '1' : '0');
          syncShellToggles();
        });
      }
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

    syncTitlebarOverlayColor();
  };

  mountTitlebar();

  // Extract portal revision or semantic version token
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

  const savePortalVersion = (version) => {
    cachedPortalVersion = version;
    sessionStorage.setItem('uit_portal_version', version);
    return version;
  };

  // Detect portal site version from native sidebar, footer, meta tags, or Next.js payload
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
      const elements = [container, ...container.querySelectorAll('*')];
      for (const el of elements) {
        if (el.closest('#cd-sidebar, #cd-header, #cd-titlebar, #cd-sidebar-footer')) continue;
        const found = extractVersionToken(el.textContent);
        if (found) return savePortalVersion(found);
      }
    }

    // Fallback: check any non-main layout element in the Next.js root shell
    const rootShell = document.querySelector('body > div.flex.min-h-screen');
    if (rootShell) {
      for (const el of rootShell.querySelectorAll('span, p, small, div, a')) {
        if (el.closest('main#main-content, #cd-trang-chu-view, #cd-sidebar, #cd-header')) continue;
        const found = extractVersionToken(el.textContent);
        if (found) return savePortalVersion(found);
      }
    }

    // Fallback: check meta tags or inline Next.js App Router scripts
    const metaVer = document.querySelector('meta[name*="version" i]')?.getAttribute('content');
    if (metaVer) {
      const found = extractVersionToken(metaVer) || (/^\d/.test(metaVer.trim()) ? `v${metaVer.trim()}` : metaVer.trim());
      if (found) return savePortalVersion(found);
    }

    const scripts = document.querySelectorAll('script:not([src])');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const content = scripts[i].textContent || '';
      if (!content) continue;
      const scriptMatch = content.match(/"(?:appVersion|portalVersion|siteVersion|version)"\s*:\s*"v?(\d+\.\d+(?:\.\d+)*(?:[-+][\w.]+)?)"/i)
        || content.match(/(?:Phiên bản|UIT Portal)\s*[:\-]?\s*v?(\d+\.\d+(?:\.\d+)*(?:[-+][\w.]+)?)/i);
      if (scriptMatch) return savePortalVersion(`v${scriptMatch[1]}`);
    }

    return '';
  };

  const updateSidebarVersionDisplay = () => {
    const versionEl = document.getElementById('cd-version-info');
    if (!versionEl) return;
    const portalVer = detectPortalVersion();
    const appVer = window.__UIT_APP_VERSION__ ? `v${window.__UIT_APP_VERSION__}` : 'v1.0.0';
    versionEl.textContent = portalVer
      ? `UIT Portal ${portalVer} | Wrapper ${appVer}`
      : `Wrapper ${appVer}`;
  };

  // Mount fixed version display bar at the bottom of the sidebar
  const mountSidebarFooter = () => {
    if (isExcludedPage(window.location.pathname)) return;
    if (!document.getElementById('cd-sidebar-footer') && document.body) {
      const footer = document.createElement('div');
      footer.id = 'cd-sidebar-footer';
      footer.innerHTML = `<span id="cd-version-info"></span>`;
      document.body.appendChild(footer);
    }
    updateSidebarVersionDisplay();
  };

  // Apply user-imported custom CSS theme from localStorage (disabled on /khao-sat and /login)
  const applySavedCustomTheme = () => {
    const pathname = window.location.pathname;
    const disableTheme = isPortalHost && (
      pathname.startsWith('/login') ||
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/khao-sat')
    );
    const savedCss = localStorage.getItem('uit_custom_theme_css');
    const savedName = localStorage.getItem('uit_custom_theme_name');
    hasCustomTheme = Boolean(savedCss);
    let styleEl = document.getElementById('cd-custom-theme-style');

    if (savedCss && !disableTheme) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'cd-custom-theme-style';
        (document.head || document.documentElement).appendChild(styleEl);
      }
      styleEl.textContent = savedCss;
    } else if (styleEl) {
      styleEl.remove();
    }

    const importBtn = document.getElementById('cd-import-theme-btn');
    const resetBtn = document.getElementById('cd-reset-theme-btn');
    if (importBtn) {
      importBtn.textContent = savedCss && savedName ? `Theme: ${savedName}` : 'Import CSS';
    }
    if (resetBtn) {
      resetBtn.style.display = savedCss ? 'inline-block' : 'none';
    }

    syncTitlebarOverlayColor();
  };

  applySavedCustomTheme();

  // 1. Profile state & helper
  let cachedProfile = null;
  try {
    cachedProfile = JSON.parse(sessionStorage.getItem('uit_user_profile'));
  } catch {}

  const applyProfile = (profile) => {
    if (!profile) return;
    cachedProfile = profile;
    if (!isExcludedPage(window.location.pathname)) {
      const nameEl = document.getElementById('cd-user-name');
      const avatarEl = document.getElementById('cd-user-avatar');
      const metaEl = document.getElementById('cd-user-meta');
      if (nameEl && profile.name)     nameEl.textContent = profile.name;
      if (avatarEl && profile.avatar) avatarEl.src = profile.avatar;
      if (metaEl && profile.meta)     metaEl.textContent = profile.meta;
    }
  };

  // Global outside-click & Escape listener for header three-dot menu
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

  // 2. Idempotent shell mounter (survives Next.js body hydration)
  const mountShell = () => {
    mountTitlebar();
    if (isExcludedPage(window.location.pathname)) return;
    if (!document.getElementById('cd-sidebar') && window.__UIT_SHELL_HTML__) {
      document.body.insertAdjacentHTML('afterbegin', window.__UIT_SHELL_HTML__);

      const brand01Element = document.getElementById('cd-uit-brand');
      if (brand01Element && window.__UIT_BRAND_DETAIL__) {
        brand01Element.src = window.__UIT_BRAND_DETAIL__;
      }

      document.querySelectorAll('#cd-sidebar .cd-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
          const href = link.getAttribute('href');
          const nextLink = document.querySelector(`nav[aria-label="Điều hướng chính"] a[href="${href}"]`);
          if (nextLink) {
            e.preventDefault();
            nextLink.click();
          }
        });
      });

      // Bind header CSS theme importer controls
      const importBtn = document.getElementById('cd-import-theme-btn');
      const resetBtn = document.getElementById('cd-reset-theme-btn');
      const fileInput = document.getElementById('cd-theme-file-input');

      if (importBtn && fileInput) {
        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = (ev) => {
            const cssContent = ev.target?.result;
            if (typeof cssContent === 'string') {
              localStorage.setItem('uit_custom_theme_css', cssContent);
              localStorage.setItem('uit_custom_theme_name', file.name.replace(/\.css$/i, ''));
              applySavedCustomTheme();
            }
          };
          reader.readAsText(file);
          fileInput.value = '';
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          localStorage.removeItem('uit_custom_theme_css');
          localStorage.removeItem('uit_custom_theme_name');
          applySavedCustomTheme();
        });
      }

      // Bind header three-dot dropdown menu
      const moreBtn = document.getElementById('cd-more-menu-btn');
      const moreDropdown = document.getElementById('cd-more-dropdown');
      if (moreBtn && moreDropdown) {
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
      }
    }

    mountSidebarFooter();
    syncShellToggles();
  };

  mountShell();

  // 3. Remove any static UMA assistant containers on initial load
  if (isPortalHost) {
    document
      .querySelectorAll('[data-uma-nhung], script[src*="uma.uit.edu.vn"], link[href*="uma.uit.edu.vn"], iframe[src*="uma.uit.edu.vn"]')
      .forEach((el) => el.remove());
  }

  // 4. Load user profile from sessionStorage cache or fetch once
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
        });
    }
  }

  // 5. Route state updater
  window.__updateCustomRouteState = () => {
    const currentPath = window.location.pathname;
    const excluded = isExcludedPage(currentPath);
    const isTrangChu = isPortalHost && (currentPath === '/trang-chu' || currentPath === '/');

    mountTitlebar();

    if (!excluded) {
      mountShell();
    }

    applySavedCustomTheme();

    const sidebar = document.getElementById('cd-sidebar');
    const sidebarFooter = document.getElementById('cd-sidebar-footer');
    const header = document.getElementById('cd-header');

    if (excluded) {
      if (sidebar) sidebar.style.display = 'none';
      if (sidebarFooter) sidebarFooter.style.display = 'none';
      if (header) header.style.display = 'none';
      document.body.classList.remove('with-custom-shell', 'is-trang-chu', 'cd-sidebar-hidden', 'cd-header-hidden');
      Array.from(document.body.classList).forEach(cls => {
        if (cls.startsWith('route-')) document.body.classList.remove(cls);
      });
    } else {
      if (sidebar) sidebar.style.display = 'flex';
      if (sidebarFooter) sidebarFooter.style.display = 'flex';
      if (header) header.style.display = 'flex';

      document.body.classList.add('with-custom-shell');
      document.body.classList.toggle('is-trang-chu', isTrangChu);
      syncShellToggles();
      updateSidebarVersionDisplay();

      Array.from(document.body.classList).forEach(cls => {
        if (cls.startsWith('route-')) document.body.classList.remove(cls);
      });
      const slug = currentPath.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'trang-chu';
      document.body.classList.add(`route-${slug}`);

      document.querySelectorAll('#cd-sidebar .cd-nav a').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === currentPath);
      });

      if (isTrangChu && window.__renderTrangChuView) {
        window.__renderTrangChuView();
      } else if (!isTrangChu && window.__dismissBootCurtain) {
        window.__dismissBootCurtain();
      }
    }

    if (excluded && window.__dismissBootCurtain) {
      window.__dismissBootCurtain();
    }

    document.documentElement.classList.add('uit-shell-ready');
  };

  window.__updateCustomRouteState();

  // 6. Hydration defender: re-mounts titlebar/shell and restores classes if React overwrites body
  const enforceBodyClasses = new MutationObserver(() => {
    const currentPath = window.location.pathname;
    const excluded = isExcludedPage(currentPath);
    const isTrangChu = isPortalHost && (currentPath === '/trang-chu' || currentPath === '/');

    if (!document.getElementById('cd-titlebar')) {
      mountTitlebar();
    }

    if (!excluded) {
      if (!document.getElementById('cd-sidebar') || !document.getElementById('cd-sidebar-footer')) {
        mountShell();
        window.__updateCustomRouteState();
      }
      if (!document.body.classList.contains('with-custom-shell')) {
        document.body.classList.add('with-custom-shell');
      }
      if (isTrangChu && !document.body.classList.contains('is-trang-chu')) {
        document.body.classList.add('is-trang-chu');
      }
      if (isTrangChu && !document.getElementById('cd-trang-chu-view') && window.__renderTrangChuView) {
        window.__renderTrangChuView();
      }
      syncShellToggles();
      if (!cachedPortalVersion) {
        updateSidebarVersionDisplay();
      }
    }

    if (!excluded && hasCustomTheme && !document.getElementById('cd-custom-theme-style')) {
      applySavedCustomTheme();
    }
  });

  if (document.body) {
    enforceBodyClasses.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
  }
})();