(() => {
  // 1. Mount shell once
  if (!document.getElementById('cd-sidebar') && window.__UIT_SHELL_HTML__) {
    document.body.insertAdjacentHTML('afterbegin', window.__UIT_SHELL_HTML__);

    // Set custom image source
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
  }

  // 2. Remove any UMA assistant elements from DOM
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
  const umaObserver = new MutationObserver(removeUmaBloat);
  umaObserver.observe(document.body, { childList: true, subtree: true });

  // 3. Load user profile from sessionStorage cache or fetch once
  const applyProfile = (profile) => {
    if (!window.location.pathname.startsWith('/login')) {
      const nameEl = document.getElementById('cd-user-name');
      const avatarEl = document.getElementById('cd-user-avatar');
      const metaEl = document.getElementById('cd-user-meta');
      if (nameEl && profile.name)     nameEl.textContent = profile.name;
      if (avatarEl && profile.avatar) avatarEl.src = profile.avatar;
      if (metaEl && profile.meta)     metaEl.textContent = profile.meta;
    }
  };

  const cached = sessionStorage.getItem('uit_user_profile');
  if (cached) {
    try {
      applyProfile(JSON.parse(cached));
    } catch {}
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

// 4. Route state updater
  window.__updateCustomRouteState = () => {
    const currentPath = window.location.pathname;
    const isLogin = currentPath.startsWith('/login');
    const isTrangChu = currentPath === '/trang-chu' || currentPath === '/';
    
    const sidebar = document.getElementById('cd-sidebar');
    const header = document.getElementById('cd-header');

    if (isLogin) {
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
  };

  window.__updateCustomRouteState();
  // HYDRATION DEFENDER: 
  const enforceBodyClasses = new MutationObserver(() => {
    const isLogin = window.location.pathname.startsWith('/login');
    const isTrangChu = window.location.pathname === '/trang-chu' || window.location.pathname === '/';
    
    if (!isLogin && !document.body.classList.contains('with-custom-shell')) {
      document.body.classList.add('with-custom-shell');
    }
    if (!isLogin && isTrangChu && !document.body.classList.contains('is-trang-chu')) {
      document.body.classList.add('is-trang-chu');
    }
    // Assuming removeUmaBloat() is declared above, call it here to catch late nodes
    if (typeof removeUmaBloat === 'function') removeUmaBloat(); 
  });
  
  enforceBodyClasses.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
})();