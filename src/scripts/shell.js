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

  // Mount global custom window title bar on all sites
  const mountTitlebar = () => {
    if (!document.body) return;
    let titlebar = document.getElementById('cd-titlebar');
    if (!titlebar) {
      titlebar = document.createElement('div');
      titlebar.id = 'cd-titlebar';
      titlebar.innerHTML = `
        <img id="cd-titlebar-icon" alt="UIT" />
        <span id="cd-titlebar-title">UIT Portal wrapper</span>
      `;
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
  };

  mountTitlebar();

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
  };

  applySavedCustomTheme();

  // Sync sidebar and header visibility states
  const syncShellToggles = () => {
    if (!document.body) return;
    const sidebarHidden = localStorage.getItem('uit_sidebar_hidden') === '1';
    const headerHidden = localStorage.getItem('uit_header_hidden') === '1';

    document.body.classList.toggle('cd-sidebar-hidden', sidebarHidden);
    document.body.classList.toggle('cd-header-hidden', headerHidden);

    const sidebarBtn = document.getElementById('cd-toggle-sidebar-btn');
    const headerBtn = document.getElementById('cd-toggle-header-btn');
    if (sidebarBtn) sidebarBtn.classList.toggle('is-active', !sidebarHidden);
    if (headerBtn) headerBtn.classList.toggle('is-active', !headerHidden);
  };

  // Mount two fixed toggle buttons at the bottom of the sidebar
  const mountSidebarControls = () => {
    if (isExcludedPage(window.location.pathname)) return;
    if (!document.getElementById('cd-sidebar-footer') && document.body) {
      const footer = document.createElement('div');
      footer.id = 'cd-sidebar-footer';
      footer.innerHTML = `
        <button type="button" id="cd-toggle-sidebar-btn" class="cd-sidebar-toggle-btn" title="Toggle Sidebar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        </button>
        <button type="button" id="cd-toggle-header-btn" class="cd-sidebar-toggle-btn" title="Toggle Header">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
        </button>
      `;
      document.body.appendChild(footer);

      const sidebarBtn = document.getElementById('cd-toggle-sidebar-btn');
      const headerBtn = document.getElementById('cd-toggle-header-btn');

      if (sidebarBtn) {
        sidebarBtn.addEventListener('click', () => {
          const next = localStorage.getItem('uit_sidebar_hidden') !== '1';
          localStorage.setItem('uit_sidebar_hidden', next ? '1' : '0');
          syncShellToggles();
        });
      }

      if (headerBtn) {
        headerBtn.addEventListener('click', () => {
          const next = localStorage.getItem('uit_header_hidden') !== '1';
          localStorage.setItem('uit_header_hidden', next ? '1' : '0');
          syncShellToggles();
        });
      }
    }

    syncShellToggles();
  };

  // 0. Show color fade curtain on first load into /trang-chu
  const initBootCurtain = () => {
    if (!isPortalHost) return;
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    if (currentPath !== '/trang-chu' || sessionStorage.getItem('uit_trang_chu_faded')) return;
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

    setTimeout(() => {
      if (window.__dismissBootCurtain) window.__dismissBootCurtain();
    }, 2000);
  };

  window.__dismissBootCurtain = () => {
    const curtain = document.getElementById('cd-boot-curtain');
    if (!curtain || curtain.dataset.fading === '1') return;

    if (!window.__curtainPaintedAt) {
      requestAnimationFrame(() => window.__dismissBootCurtain());
      return;
    }

    curtain.dataset.fading = '1';
    sessionStorage.setItem('uit_trang_chu_faded', '1');

    const minHoldMs = 280;
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

  // 2. Idempotent shell mounter (survives Next.js body hydration)
  const mountShell = () => {
    mountTitlebar();
    if (isExcludedPage(window.location.pathname)) return;
    if (!document.getElementById('cd-sidebar') && window.__UIT_SHELL_HTML__) {
      document.body.insertAdjacentHTML('afterbegin', window.__UIT_SHELL_HTML__);

      const customPic = document.getElementById('cd-uit-brand');
      if (customPic && window.__UIT_BRAND__) {
        customPic.src = window.__UIT_BRAND__;
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

      applySavedCustomTheme();

      if (cachedProfile) {
        applyProfile(cachedProfile);
      }
    }

    mountSidebarControls();
  };

  mountShell();

  // 3. Remove any UMA assistant elements from DOM on portal
  const removeUmaBloat = () => {
    if (!isPortalHost) return;
    document.querySelectorAll('[data-uma-nhung], script[src*="uma.uit.edu.vn"], link[href*="uma.uit.edu.vn"], iframe[src*="uma.uit.edu.vn"]').forEach(el => el.remove());
    document.querySelectorAll('button, a, div').forEach(el => {
      if (el.children.length <= 2 && el.textContent && el.textContent.trim() === 'Hỏi UMA') {
        const container = el.closest('.fixed') || el;
        container.remove();
      }
    });
  };
  removeUmaBloat();

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

    if (isTrangChu) {
      initBootCurtain();
    }

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

      Array.from(document.body.classList).forEach(cls => {
        if (cls.startsWith('route-')) document.body.classList.remove(cls);
      });
      const slug = currentPath.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'trang-chu';
      document.body.classList.add(`route-${slug}`);

      document.querySelectorAll('#cd-sidebar .cd-nav a').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === currentPath);
      });

      if (isTrangChu && window.__renderTrangChuView) window.__renderTrangChuView();
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
    }

    const disableTheme = isPortalHost && (
      currentPath.startsWith('/login') ||
      currentPath.startsWith('/api/auth') ||
      currentPath.startsWith('/khao-sat')
    );
    if (!disableTheme && localStorage.getItem('uit_custom_theme_css') && !document.getElementById('cd-custom-theme-style')) {
      applySavedCustomTheme();
    }

    removeUmaBloat();
  });

  if (document.body) {
    enforceBodyClasses.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
  }
})();