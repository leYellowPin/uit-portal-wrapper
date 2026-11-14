(() => {
  window.__renderTrangChuView = () => {
    const reactRightColumn = document.querySelector('body > div.flex.min-h-screen > div.flex.min-w-0.flex-1');
    if (!reactRightColumn) return;

    let customView = document.getElementById('cd-trang-chu-view');
    if (!customView) {
      customView = document.createElement('div');
      customView.id = 'cd-trang-chu-view';
      reactRightColumn.appendChild(customView);
    }

    const populateFromDom = () => {
      const originalStats = document.querySelectorAll('main#main-content section[aria-label="Chỉ số tổng quan"] > div');
      if (originalStats.length === 0) return false;

      customView.innerHTML = `
        <section id="cd-stats-grid"></section>
        <section id="cd-widgets-grid">
          <div class="cd-widget" id="cd-widget-announcements">
            <h3>Thông báo chung</h3>
            <div id="cd-announcements-content" class="cd-widget-body"></div>
          </div>
          <div class="cd-widget" id="cd-widget-schedule">
            <h3>Thời khóa biểu</h3>
            <div id="cd-schedule-content" class="cd-widget-body"></div>
          </div>
        </section>
      `;

      const statGrid = document.getElementById('cd-stats-grid');
      originalStats.forEach(statBlock => {
        const title = statBlock.querySelector('p.uppercase')?.textContent || 'Chỉ số';
        const value = statBlock.querySelector('.text-2xl, .text-lg')?.textContent || '--';
        const desc = statBlock.querySelector('p.text-xs.text-muted-foreground:not(.uppercase)')?.textContent || '';

        const card = document.createElement('div');
        card.className = 'cd-stat-card';
        card.innerHTML = `<h4>${title}</h4><h2>${value}</h2><p>${desc}</p>`;
        statGrid.appendChild(card);
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

      if (window.__dismissBootCurtain) {
        window.__dismissBootCurtain();
      }
      return true;
    };

    // Populate immediately if SSR HTML is ready, otherwise wait for hydration
    if (!populateFromDom()) {
      const targetNode = document.querySelector('main#main-content') || document.body;
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