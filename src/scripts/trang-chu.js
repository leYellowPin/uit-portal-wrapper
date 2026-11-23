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

  const WEEKDAYS_VI = [
    'Chủ Nhật',
    'Thứ Hai',
    'Thứ Ba',
    'Thứ Tư',
    'Thứ Năm',
    'Thứ Sáu',
    'Thứ Bảy'
  ];

  const formatVietnameseDate = (date = new Date()) => {
    const weekday = WEEKDAYS_VI[date.getDay()] || '';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${weekday} \u00B7 ${dd}/${mm}/${yyyy}`;
  };

  const parseTimeRangeSeconds = (text) => {
    if (!text) return null;
    const match = String(text).match(
      /(\d{1,2})\s*[:hH]\s*(\d{2})\s*(?:-|–|—|to|đến)\s*(\d{1,2})\s*[:hH]\s*(\d{2})/i
    );
    if (!match) return null;

    const startH = Number.parseInt(match[1], 10);
    const startM = Number.parseInt(match[2], 10);
    const endH = Number.parseInt(match[3], 10);
    const endM = Number.parseInt(match[4], 10);

    if (
      Number.isNaN(startH) || Number.isNaN(startM) ||
      Number.isNaN(endH) || Number.isNaN(endM) ||
      startH < 0 || startH > 23 || startM < 0 || startM > 59 ||
      endH < 0 || endH > 23 || endM < 0 || endM > 59
    ) {
      return null;
    }

    const startSeconds = startH * 3600 + startM * 60;
    const endSeconds = endH * 3600 + endM * 60;
    if (endSeconds <= startSeconds) return null;

    return { startSeconds, endSeconds };
  };

  const evaluateScheduleStatus = (range, now = new Date()) => {
    const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (nowSeconds < range.startSeconds) {
      return { status: 'upcoming', label: 'Chưa học' };
    }
    if (nowSeconds < range.endSeconds) {
      return { status: 'ongoing', label: 'Đang học' };
    }
    return { status: 'completed', label: 'Đã học' };
  };

  const findScheduleDotAnchor = (li) => {
    const leafCandidates = Array.from(li.querySelectorAll('p, span, div, code, strong')).filter(
      (el) => el.children.length === 0 && (el.textContent || '').trim().length > 0
    );

    const fullClassCodeEl = leafCandidates.find((el) =>
      /^[A-Z]{2,6}\d{2,4}(?:\.[A-Z0-9]+)+$/i.test((el.textContent || '').trim())
    );
    if (fullClassCodeEl) return fullClassCodeEl;

    const shortClassCodeEl = leafCandidates.find((el) =>
      /^[A-Z]{2,6}\d{2,4}$/i.test((el.textContent || '').trim())
    );
    if (shortClassCodeEl) return shortClassCodeEl;

    return leafCandidates[0] || null;
  };

  const applyScheduleStatusToItem = (li, now) => {
    li.querySelectorAll('.cd-tkb-status-dot').forEach((dot) => dot.remove());
    li.querySelectorAll('.cd-tkb-code-with-dot').forEach((el) => el.classList.remove('cd-tkb-code-with-dot'));

    const range = parseTimeRangeSeconds(li.textContent || '');
    if (!range) {
      li.removeAttribute('data-tkb-status');
      return;
    }

    const { status, label } = evaluateScheduleStatus(range, now);
    li.dataset.tkbStatus = status;
    li.title = label;

    // Hide any empty tiny native indicator dot so there is never a duplicate dot
    li.querySelectorAll('span[class*="rounded-full"], div[class*="rounded-full"]').forEach((el) => {
      if ((el.textContent || '').trim() === '' && el.children.length === 0) {
        el.style.display = 'none';
      }
    });

    const anchor = findScheduleDotAnchor(li);
    if (anchor) {
      anchor.classList.add('cd-tkb-code-with-dot');
      const dot = document.createElement('span');
      dot.className = 'cd-tkb-status-dot';
      dot.dataset.status = status;
      dot.title = label;
      dot.setAttribute('aria-label', label);
      anchor.appendChild(dot);
    }
  };

  const updateScheduleStatuses = () => {
    const now = new Date();
    const dateEl = document.getElementById('cd-schedule-date');
    if (dateEl) {
      dateEl.textContent = formatVietnameseDate(now);
    }

    const scheduleContainer = document.getElementById('cd-schedule-content');
    if (!scheduleContainer) return;

    scheduleContainer.querySelectorAll('li').forEach((li) => {
      applyScheduleStatusToItem(li, now);
    });
  };

  const startScheduleStatusTicker = () => {
    if (window.__uitScheduleStatusTimer) {
      clearInterval(window.__uitScheduleStatusTimer);
      window.__uitScheduleStatusTimer = null;
    }
    updateScheduleStatuses();
    window.__uitScheduleStatusTimer = setInterval(() => {
      if (!document.getElementById('cd-schedule-content')) {
        clearInterval(window.__uitScheduleStatusTimer);
        window.__uitScheduleStatusTimer = null;
        return;
      }
      updateScheduleStatuses();
    }, 15000);
  };

  const FALLBACK_SHORTCUTS = [
    { id: 'uit-official', name: 'Website chính thức', url: 'https://uit.edu.vn', icon: 'shortcut-uit.png', iconSrc: '' },
    { id: 'uit-portal', name: 'Cổng thông tin', url: 'https://portal.uit.edu.vn', icon: 'shortcut-portal.png', iconSrc: '' },
    { id: 'uit-drl', name: 'Điểm rèn luyện', url: 'https://drl.uit.edu.vn', icon: 'shortcut-drl.png', iconSrc: '' },
    { id: 'uit-dkhp', name: 'Đăng ký học phần', url: 'https://dkhp.uit.edu.vn', icon: 'shortcut-dkhp.png', iconSrc: '' },
    { id: 'uit-moodle', name: 'Moodle', url: 'https://courses.uit.edu.vn', icon: 'shortcut-moodle.png', iconSrc: '' },
    { id: 'uit-forum', name: 'Forum', url: 'https://forum.uit.edu.vn', icon: 'shortcut-forum.png', iconSrc: '' }
  ];

  const createFallbackShortcutIcon = () => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('cd-shortcut-fallback-svg');

    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', '2');
    line.setAttribute('y1', '12');
    line.setAttribute('x2', '22');
    line.setAttribute('y2', '12');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z');

    svg.appendChild(circle);
    svg.appendChild(line);
    svg.appendChild(path);
    return svg;
  };

  const renderWebShortcuts = () => {
    const container = document.getElementById('cd-shortcuts-content');
    if (!container) return;

    const shortcuts = Array.isArray(window.__UIT_WEB_SHORTCUTS__) && window.__UIT_WEB_SHORTCUTS__.length > 0
      ? window.__UIT_WEB_SHORTCUTS__
      : FALLBACK_SHORTCUTS;

    container.innerHTML = '';

    shortcuts.forEach((item) => {
      if (!item || !item.url) return;

      const link = document.createElement('a');
      link.className = 'cd-shortcut-item';
      link.href = item.url;
      if (item.id) link.dataset.shortcutId = item.id;
      link.title = `${item.name || item.url} (${item.url})`;

      const iconBox = document.createElement('div');
      iconBox.className = 'cd-shortcut-icon-box';

      if (item.iconSrc) {
        const img = document.createElement('img');
        img.className = 'cd-shortcut-icon';
        img.src = item.iconSrc;
        img.alt = '';
        img.draggable = false;
        img.addEventListener('error', () => {
          img.remove();
          iconBox.appendChild(createFallbackShortcutIcon());
        }, { once: true });
        iconBox.appendChild(img);
      } else {
        iconBox.appendChild(createFallbackShortcutIcon());
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'cd-shortcut-name';
      nameEl.textContent = item.name || item.url;

      link.appendChild(iconBox);
      link.appendChild(nameEl);

      link.addEventListener('click', (e) => {
        if (window.__openInWebview) {
          try {
            const parsed = new URL(item.url);
            const isNative =
              parsed.hostname === 'sso.uit.edu.vn' ||
              (parsed.hostname === 'portal.uit.edu.vn' &&
                (parsed.pathname.startsWith('/trang-chu') ||
                  parsed.pathname.startsWith('/sinh-vien') ||
                  parsed.pathname.startsWith('/login') ||
                  parsed.pathname.startsWith('/api/auth')));
            if (!isNative) {
              e.preventDefault();
              window.__openInWebview(item.url, item.name || item.url);
            }
          } catch {}
        }
      });

      container.appendChild(link);
    });
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
      startScheduleStatusTicker();
      renderWebShortcuts();

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
