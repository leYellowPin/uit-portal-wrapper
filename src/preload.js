const { ipcRenderer } = require('electron');

(() => {
  const protocol = window.location.protocol;
  if (protocol !== 'http:' && protocol !== 'https:') return;

  const data = ipcRenderer.sendSync('uit:get-bootstrap-data', window.location.href);
  if (!data) return;

  const rawPath = window.location.pathname || '/';
  const cleanedPath = rawPath.replace(/\/+$/, '') || '/';
  const normalizedPath = cleanedPath === '/' ? '/trang-chu' : cleanedPath;
  const isExcluded =
    !data.isPortalHost ||
    (normalizedPath !== '/trang-chu' &&
      normalizedPath !== '/sinh-vien' &&
      !normalizedPath.startsWith('/sinh-vien/'));

  const injectIntoRoot = (root) => {
    if (!root || root.dataset.uitBootstrapped === '1') return;
    root.dataset.uitBootstrapped = '1';

    if (!isExcluded) {
      root.classList.add('uit-custom-shell');
    }

    if (data.combinedCss && !document.getElementById('cd-early-css')) {
      const cssEl = document.createElement('style');
      cssEl.id = 'cd-early-css';
      cssEl.textContent = data.combinedCss;
      root.appendChild(cssEl);
    }

    if (!isExcluded) {
      try {
        const savedCss = localStorage.getItem('uit_custom_theme_css');
        if (savedCss && !document.getElementById('cd-custom-theme-style')) {
          const themeEl = document.createElement('style');
          themeEl.id = 'cd-custom-theme-style';
          themeEl.textContent = savedCss;
          root.appendChild(themeEl);
        }
      } catch {}

      if (data.bootCurtainHtml && !document.getElementById('cd-boot-curtain')) {
        root.insertAdjacentHTML('beforeend', data.bootCurtainHtml);
        const curtain = document.getElementById('cd-boot-curtain');
        if (curtain) {
          curtain.style.cssText =
            'position:fixed;inset:0;z-index:2147483646;background-color:var(--col-pri-bg, #0d1117);' +
            'opacity:1;display:flex;align-items:center;justify-content:center;pointer-events:none;';
        }
        const logo = document.getElementById('cd-boot-curtain-logo');
        if (logo) {
          if (data.brandWhite) logo.src = data.brandWhite;
          else logo.remove();
        }
      }
    }

    if (data.earlyBootstrapScript) {
      const scriptEl = document.createElement('script');
      scriptEl.textContent = data.earlyBootstrapScript;
      root.appendChild(scriptEl);
      scriptEl.remove();
    }
  };

  if (document.documentElement) {
    injectIntoRoot(document.documentElement);
  } else {
    const rootObserver = new MutationObserver(() => {
      if (document.documentElement) {
        rootObserver.disconnect();
        injectIntoRoot(document.documentElement);
      }
    });
    rootObserver.observe(document, { childList: true });
  }
})();