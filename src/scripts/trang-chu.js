(() => {
  const normalizeText = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ')
      .trim();

  const extractProgressPercent = (statBlock, descText) => {
    if (statBlock) {
      const bar = statBlock.querySelector('[role="progressbar"] > div, [style*="width:"]');
      if (bar) {
        const inlineWidth = bar.style?.width || '';
        const pctMatch = inlineWidth.match(/([0-9]+(?:\.[0-9]+)?)%/);
        if (pctMatch) {
          const val = Number(pctMatch[1]);
          if (!Number.isNaN(val)) return Math.max(0, Math.min(100, val));
        }
      }
      const progressEl = statBlock.querySelector('[role="progressbar"]');
      if (progressEl) {
        const ariaNow = Number(progressEl.getAttribute('aria-valuenow'));
        const ariaMax = Number(progressEl.getAttribute('aria-valuemax') || '100');
        if (!Number.isNaN(ariaNow) && ariaMax > 0) {
          return Math.max(0, Math.min(100, (ariaNow / ariaMax) * 100));
        }
      }
    }
    const descMatch = (descText || '').match(/([0-9]+(?:\.[0-9]+)?)%/);
    if (descMatch) {
      const val = Number(descMatch[1]);
      if (!Number.isNaN(val)) return Math.max(0, Math.min(100, val));
    }
    return null;
  };

  const sanitizeStatItem = (item) => {
    if (!item) return null;
    const title = String(item.title || 'Chỉ số').replace(/\s+/g, ' ').trim();
    let value = String(item.value ?? '').replace(/\s+/g, ' ').trim();
    let desc = String(item.desc ?? '').replace(/\s+/g, ' ').trim();
    let progress = typeof item.progress === 'number' && !Number.isNaN(item.progress) ? item.progress : null;

    const normTitle = normalizeText(title);
    const normVal = normalizeText(value);
    const normDesc = normalizeText(desc);

    const isPlaceholderValue =
      !value ||
      value === '-' ||
      value === '--' ||
      value === '\u2014' ||
      normVal === 'n/a' ||
      normVal === 'null' ||
      normVal === 'undefined' ||
      normVal.includes('chua co du lieu') ||
      normVal === 'chua co';

    let isUnavailable = isPlaceholderValue;

    if (!isUnavailable && normTitle.includes('gpa')) {
      const numericGpa = Number.parseFloat(value.replace(',', '.'));
      if (!Number.isNaN(numericGpa) && numericGpa <= 0) {
        isUnavailable = true;
      }
    }

    if (!isUnavailable && normTitle.includes('diem ren luyen')) {
      const numericDrl = Number.parseFloat(value.replace(',', '.'));
      if (!Number.isNaN(numericDrl) && numericDrl <= 0 && (!desc || normDesc.includes('chua co'))) {
        isUnavailable = true;
      }
    }

    if (!isUnavailable && (normTitle.includes('tc tich luy') || normTitle.includes('tin chi tich luy'))) {
      const fractionMatch = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/);
      if (fractionMatch && Number.parseFloat(fractionMatch[1]) <= 0) {
        isUnavailable = true;
      }
    }

    if (isUnavailable) {
      value = '--';
      desc = 'Chưa có dữ liệu';
      progress = null;
    } else if (!desc && normTitle.includes('dich vu')) {
      desc = 'Chưa có yêu cầu đang xử lý';
    }

    return { title, value, desc, progress };
  };

  const renderUserStats = (statsList) => {
    const container = document.getElementById('cd-user-stats');
    if (!container) return;
    container.innerHTML = '';

    (statsList || []).forEach((rawItem) => {
      const item = sanitizeStatItem(rawItem);
      if (!item) return;

      const card = document.createElement('div');
      card.className = 'cd-user-stat-card';

      const labelEl = document.createElement('h4');
      labelEl.className = 'cd-user-stat-label';
      labelEl.textContent = item.title;

      const valueEl = document.createElement('div');
      valueEl.className = 'cd-user-stat-value';
      valueEl.textContent = item.value;

      card.appendChild(labelEl);
      card.appendChild(valueEl);

      if (item.desc) {
        const descEl = document.createElement('p');
        descEl.className = 'cd-user-stat-desc';
        descEl.textContent = item.desc;
        card.appendChild(descEl);
      }

      if (typeof item.progress === 'number' && !Number.isNaN(item.progress)) {
        const track = document.createElement('div');
        track.className = 'cd-user-stat-progress';
        const fill = document.createElement('div');
        fill.className = 'cd-user-stat-progress-bar';
        fill.style.width = `${Math.max(0, Math.min(100, item.progress))}%`;
        track.appendChild(fill);
        card.appendChild(track);
      }

      container.appendChild(card);
    });
  };

  window.__renderCachedUserStats = () => {
    try {
      const cached = JSON.parse(sessionStorage.getItem('uit_user_stats'));
      if (Array.isArray(cached) && cached.length > 0) {
        renderUserStats(cached);
      }
    } catch {}
  };

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

      if (window.__bindTrangChuControls) {
        window.__bindTrangChuControls();
      }

      let gpaTichLuy = null;
      let tcTichLuy = null;
      let diemRenLuyen = null;
      let dichVuDangXuLy = null;
      const fallbackStats = [];

      originalStats.forEach(statBlock => {
        const title = (statBlock.querySelector('p.uppercase')?.textContent || 'Chỉ số').trim();
        const value = (statBlock.querySelector('.text-2xl, .text-lg')?.textContent || '--').trim();
        const desc = (statBlock.querySelector('p.text-xs.text-muted-foreground:not(.uppercase)')?.textContent || '').trim();
        const progress = extractProgressPercent(statBlock, desc);
        const normTitle = normalizeText(title);

        if (normTitle.includes('gpa hoc ky truoc') || normTitle.includes('gpa hk truoc')) {
          return;
        }

        const item = sanitizeStatItem({ title, value, desc, progress });

        if (normTitle.includes('gpa tich luy')) {
          gpaTichLuy = item;
        } else if (normTitle.includes('tc tich luy') || normTitle.includes('tin chi tich luy')) {
          tcTichLuy = item;
        } else if (normTitle.includes('diem ren luyen')) {
          diemRenLuyen = item;
        } else if (normTitle.includes('dich vu dang xu ly') || normTitle.includes('dich vu')) {
          dichVuDangXuLy = item;
        } else {
          fallbackStats.push(item);
        }
      });

      if (!dichVuDangXuLy) {
        if (fallbackStats.length > 0) {
          dichVuDangXuLy = fallbackStats.shift();
        } else {
          const serviceHeading = Array.from(document.querySelectorAll('main#main-content .font-heading, main#main-content h2, main#main-content h3, main#main-content p'))
            .find(el => normalizeText(el.textContent).includes('dich vu dang xu ly'));
          const serviceCard = serviceHeading?.closest('.rounded-xl, .rounded-lg, section, div');
          const serviceVal = serviceCard?.querySelector('.text-2xl, .text-lg, .text-xl')?.textContent?.trim();
          const serviceDesc = serviceCard?.querySelector('p.text-xs, p.text-sm')?.textContent?.trim();
          dichVuDangXuLy = sanitizeStatItem({
            title: 'DỊCH VỤ ĐANG XỬ LÝ',
            value: serviceVal || '0',
            desc: serviceDesc && normalizeText(serviceDesc) !== 'dich vu dang xu ly' ? serviceDesc : 'Chưa có yêu cầu đang xử lý',
            progress: null
          });
        }
      }

      const userStats = [gpaTichLuy, tcTichLuy, diemRenLuyen, dichVuDangXuLy].filter(Boolean);
      try {
        sessionStorage.setItem('uit_user_stats', JSON.stringify(userStats));
      } catch {}
      renderUserStats(userStats);

      const statGrid = document.getElementById('cd-stats-grid');
      const cardTemplate = document.getElementById('cd-stat-card-template');
      if (statGrid && cardTemplate && fallbackStats.length > 0) {
        fallbackStats.forEach((rawFallback) => {
          const { title, value, desc } = sanitizeStatItem(rawFallback);
          const fragment = cardTemplate.content.cloneNode(true);
          fragment.querySelector('h4').textContent = title;
          fragment.querySelector('h2').textContent = value;
          fragment.querySelector('p').textContent = desc;
          statGrid.appendChild(fragment);
        });
      }

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
