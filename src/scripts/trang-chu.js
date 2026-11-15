(() => {
  window.__renderTrangChuView = () => {
    window.__trangChuPopulated = false;

    const reactRightColumn = document.querySelector('body > div.flex.min-h-screen > div.flex.min-w-0.flex-1');
    if (!reactRightColumn || !window.__UIT_TRANG_CHU_HTML__) return;

    let customView = document.getElementById('cd-trang-chu-view');
    if (!customView) {
      customView = document.createElement('div');
      customView.id = 'cd-trang-chu-view';
      reactRightColumn.appendChild(customView);
    }

    const populateFromDom = () => {
      const originalStats = document.querySelectorAll('main#main-content section[aria-label="Chỉ số tổng quan"] > div');
      if (originalStats.length === 0) return false;

      customView.innerHTML = window.__UIT_TRANG_CHU_HTML__;

      const statGrid = document.getElementById('cd-stats-grid');
      const cardTemplate = document.getElementById('cd-stat-card-template');

      originalStats.forEach(statBlock => {
        const title = statBlock.querySelector('p.uppercase')?.textContent || 'Chỉ số';
        const value = statBlock.querySelector('.text-2xl, .text-lg')?.textContent || '--';
        const desc = statBlock.querySelector('p.text-xs.text-muted-foreground:not(.uppercase)')?.textContent || '';

        if (cardTemplate) {
          const fragment = cardTemplate.content.cloneNode(true);
          fragment.querySelector('h4').textContent = title;
          fragment.querySelector('h2').textContent = value;
          fragment.querySelector('p').textContent = desc;
          statGrid.appendChild(fragment);
        }
      });

      const extractWidgetContent = (titleSubstring, targetId) => {
        const heading = Array.from(document.querySelectorAll('main#main-content .font-heading'))
          .find(h => h.textContent.includes(titleSubstring));
        const section = heading ? heading.closest('.rounded-xl') : null;
        const target = document.getElementById(targetId);

        if (section && target) {
          section.querySelectorAll(':scope > div:not(:first-child)')
            .forEach(part => target.appendChild(part.cloneNode(true)));
        }
      };

      extractWidgetContent('Thông báo từ nhà trường', 'cd-announcements-content');
      extractWidgetContent('Thời khóa biểu', 'cd-schedule-content');

      window.__trangChuPopulated = true;
      if (window.__scheduleBootCurtainCheck) {
        window.__scheduleBootCurtainCheck();
      }
      return true;
    };

    if (!populateFromDom()) {
      const targetNode = document.body || document.documentElement;
      const observer = new MutationObserver(() => {
        if (populateFromDom()) observer.disconnect();
      });
      observer.observe(targetNode, { childList: true, subtree: true });
    }
  };

  if (window.__updateCustomRouteState) {
    window.__updateCustomRouteState();
  }
})();