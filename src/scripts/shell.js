(() => {
  const isAuthRoute = (pathname) => {
    return pathname.startsWith('/login') || pathname.startsWith('/api/auth');
  };

  // 0. Show color fade curtain on first load into /trang-chu
  const initBootCurtain = () => {
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

    // Wait until Chromium actually commits the opacity: 1 frame to screen
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

    // Wait until the browser has painted at least one visible frame after cold-boot hydration
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
    if (!isAuthRoute(window.location.pathname)) {
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
    if (isAuthRoute(window.location.pathname)) return;
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

      if (cachedProfile) {
        applyProfile(cachedProfile);
      }
    }
  };

  mountShell();

  // 3. Remove any UMA assistant elements from DOM
  const removeUmaBloat = () => {
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
  if (!isAuthRoute(window.location.pathname)) {
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
    const onAuth = isAuthRoute(currentPath);
    const isTrangChu = currentPath === '/trang-chu' || currentPath === '/';

    if (isTrangChu) {
      initBootCurtain();
    }
    
    if (!onAuth) {
      mountShell();
    }

    const sidebar = document.getElementById('cd-sidebar');
    const header = document.getElementById('cd-header');

    if (onAuth) {
      if (sidebar) sidebar.style.display = 'none';
      if (header) header.style.display = 'none';
      document.body.classList.remove('with-custom-shell', 'is-trang-chu');
    } else {
      if (sidebar) sidebar.style.display = 'flex';
      if (header) header.style.display = 'flex';
      
      document.body.classList.add('with-custom-shell');
      document.body.classList.toggle('is-trang-chu', isTrangChu);

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

    // Reveal page once classes and shell are applied
    document.documentElement.classList.add('uit-shell-ready');
  };

  window.__updateCustomRouteState();

  // 6. Hydration defender: re-mounts shell and restores classes if React overwrites body
  const enforceBodyClasses = new MutationObserver(() => {
    const currentPath = window.location.pathname;
    const onAuth = isAuthRoute(currentPath);
    const isTrangChu = currentPath === '/trang-chu' || currentPath === '/';

    if (!onAuth) {
      if (!document.getElementById('cd-sidebar')) {
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
    }

    removeUmaBloat();
  });

  enforceBodyClasses.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
})();