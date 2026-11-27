const { ipcRenderer, contextBridge } = require('electron');

(() => {
  const protocol = window.location.protocol;
  if (protocol !== 'http:' && protocol !== 'https:') return;

  contextBridge.exposeInMainWorld('uitTheme', {
    getState: () => ipcRenderer.invoke('uit-theme:get-state'),
    selectFolder: () => ipcRenderer.invoke('uit-theme:select-folder'),
    setEnabled: (enabled) => ipcRenderer.invoke('uit-theme:set-enabled', Boolean(enabled)),
    reload: () => ipcRenderer.invoke('uit-theme:reload'),
    clear: () => ipcRenderer.invoke('uit-theme:clear')
  });

  const data = ipcRenderer.sendSync('uit:get-bootstrap-data', window.location.href);
  if (!data) return;

  const pathname = window.location.pathname || '';
  const useCustomShell =
    Boolean(data.useCustomShell) &&
    window.location.hostname === 'portal.uit.edu.vn' &&
    (pathname.startsWith('/trang-chu') || pathname.startsWith('/sinh-vien'));

  const injectIntoRoot = (root) => {
    if (!root || root.dataset.uitBootstrapped === '1') return;
    root.dataset.uitBootstrapped = '1';

    if (useCustomShell) {
      root.classList.add('uit-custom-shell');
    }

    if (data.combinedCss && !document.getElementById('cd-early-css')) {
      const cssEl = document.createElement('style');
      cssEl.id = 'cd-early-css';
      cssEl.textContent = data.combinedCss;
      root.appendChild(cssEl);
    }

    if (useCustomShell) {
      try {
        localStorage.removeItem('uit_custom_theme_css');
        localStorage.removeItem('uit_custom_theme_name');
        localStorage.removeItem('uit_custom_theme_path');
        localStorage.removeItem('uit_custom_theme_active');

        const themeState = data.themeState;
        if (
          themeState &&
          themeState.hasTheme &&
          themeState.enabled &&
          themeState.compiledCss &&
          !document.getElementById('cd-custom-theme-style')
        ) {
          const themeEl = document.createElement('style');
          themeEl.id = 'cd-custom-theme-style';
          themeEl.textContent = themeState.compiledCss;
          root.appendChild(themeEl);
        }
      } catch {}

      if (data.bootCurtainHtml && !document.getElementById('cd-boot-curtain')) {
        root.insertAdjacentHTML('beforeend', data.bootCurtainHtml);
        const curtain = document.getElementById('cd-boot-curtain');
        if (curtain) {
          curtain.style.cssText =
            'position:fixed;inset:0;z-index:2147483646;background-color:var(--col-pri-bg, #0d1117);' +
            'opacity:1;display:flex;align-items:center;justify-content:center;' +
            'transition:opacity 0.65s cubic-bezier(0.22, 1, 0.36, 1);pointer-events:none;';
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

  console.log("%cDừng lại!", "color: red; font-size:4em;");
  console.log("%cViệc sử dụng console chỉ nên được dùng để debug", "color: white; font-size:2em;");
  console.log("%cKhông nên dán mã lạ vào console nếu bạn không biết bạn đang làm gì", "color: white; font-size:2em;");
})();
