(() => {
  const normalizeText = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ')
      .trim();

  const navigateToPortalTarget = (href, tabMatch = null) => {
    if (!href) return;
    if (typeof window.__navigateAndSelectTab === 'function') {
      window.__navigateAndSelectTab(href, tabMatch);
    } else {
      window.location.href = href;
    }
  };

  const resolveUserStatLink = (normTitle) => {
    if (normTitle.includes('gpa tich luy')) {
      return { href: '/sinh-vien/bang-diem', tabMatch: null };
    }
    if (normTitle.includes('tc tich luy') || normTitle.includes('tin chi tich luy')) {
      return { href: '/sinh-vien/bang-diem', tabMatch: 'Theo CTĐT' };
    }
    if (normTitle.includes('diem ren luyen')) {
      return { href: '/sinh-vien/diem-ren-luyen', tabMatch: null };
    }
    if (normTitle.includes('dich vu dang xu ly') || normTitle.includes('dich vu')) {
      return { href: '/sinh-vien/ho-tro', tabMatch: null };
    }
    return null;
  };

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
    const template = document.getElementById('cd-user-stat-card-template');
    if (!container || !template) return;
    container.replaceChildren();

    (statsList || []).forEach((rawItem) => {
      const item = sanitizeStatItem(rawItem);
      if (!item) return;

      const fragment = template.content.cloneNode(true);
      const card = fragment.querySelector('.cd-user-stat-card');
      const labelTextEl = fragment.querySelector('.cd-user-stat-label-text');
      const valueEl = fragment.querySelector('.cd-user-stat-value');
      const descEl = fragment.querySelector('.cd-user-stat-desc');
      const progressTrackEl = fragment.querySelector('.cd-user-stat-progress');
      const progressBarEl = fragment.querySelector('.cd-user-stat-progress-bar');

      if (labelTextEl) labelTextEl.textContent = item.title;
      if (valueEl) valueEl.textContent = item.value;

      if (descEl) {
        if (item.desc) {
          descEl.textContent = item.desc;
        } else {
          descEl.remove();
        }
      }

      if (progressTrackEl && progressBarEl) {
        if (typeof item.progress === 'number' && !Number.isNaN(item.progress)) {
          progressBarEl.style.width = `${Math.max(0, Math.min(100, item.progress))}%`;
        } else {
          progressTrackEl.remove();
        }
      }

      const linkConfig = resolveUserStatLink(normalizeText(item.title));
      if (card && linkConfig) {
        card.classList.add('is-link');
        card.href = linkConfig.href;
        card.dataset.href = linkConfig.href;
        if (linkConfig.tabMatch) {
          card.dataset.tabMatch = linkConfig.tabMatch;
        }
        card.addEventListener('click', (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigateToPortalTarget(linkConfig.href, linkConfig.tabMatch);
        });
      } else if (card) {
        card.removeAttribute('href');
        card.querySelector('.cd-link-arrow')?.remove();
      }

      container.appendChild(fragment);
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

  const bindScheduleWidgetLink = () => {
    const scheduleWidget = document.getElementById('cd-widget-schedule');
    if (!scheduleWidget || scheduleWidget.dataset.linkBound === '1') return;
    scheduleWidget.dataset.linkBound = '1';

    const href = scheduleWidget.dataset.href || '/sinh-vien/tkb';
    const tabMatch = scheduleWidget.dataset.tabMatch || 'Lịch tuần';

    scheduleWidget.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('a, button')) return;
      const selected = window.getSelection?.().toString().trim();
      if (selected) return;
      navigateToPortalTarget(href, tabMatch);
    });

    scheduleWidget.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateToPortalTarget(href, tabMatch);
      }
    });
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

  const TKB_PERIOD_TIMES = {
    1: { start: '07:30', end: '08:15' },
    2: { start: '08:15', end: '09:00' },
    3: { start: '09:00', end: '09:45' },
    4: { start: '09:55', end: '10:40' },
    5: { start: '10:40', end: '11:25' },
    6: { start: '13:00', end: '13:45' },
    7: { start: '13:45', end: '14:30' },
    8: { start: '14:30', end: '15:15' },
    9: { start: '15:25', end: '16:10' },
    10: { start: '16:10', end: '17:00' },
    11: { start: '16:55', end: '17:40' },
    12: { start: '17:45', end: '18:30' },
    13: { start: '18:30', end: '19:15' }
  };

  const TKB_METHOD_LABELS = {
    LT: 'LÝ THUYẾT',
    HT1: 'THỰC HÀNH 1',
    HT2: 'THỰC HÀNH 2',
    TH: 'THỰC HÀNH',
    TT: 'TRỰC TUYẾN',
    ONLINE: 'TRỰC TUYẾN',
    DA: 'ĐỒ ÁN',
    KLTN: 'KHÓA LUẬN TỐT NGHIỆP',
    TTTN: 'THỰC TẬP TỐT NGHIỆP'
  };

  const formatMethodCodeLabel = (methodCode) => {
    const code = String(methodCode || '').replace(/[\s\u00A0]+/g, '').toUpperCase();
    if (!code) return '';
    return TKB_METHOD_LABELS[code] || code;
  };

  const formatLecturerName = (raw) => {
    const cleaned = String(raw || '').replace(/[\s\u00A0]+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.replace(/^(?:(?:PGS|GS)\.?\s*)?(?:TS|ThS|CN|KS|GV)\.?\s+/i, '').trim() || cleaned;
  };

  const parseLocalYmd = (ymd) => {
    const match = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
    return new Date(year, month - 1, day);
  };

  const toLocalYmdString = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getMondayOfWeek = (date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayOffset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dayOffset);
    return d;
  };

  const isRowActiveOnDate = (row, now) => {
    if (!row || typeof row !== 'object') return false;
    const status = String(row.status || '').trim().toLowerCase();
    if (status && status !== 'active') return false;

    const todayStr = toLocalYmdString(now);
    const startStr = String(row.startDate || '').trim();
    const endStr = String(row.endDate || '').trim();

    if (startStr && todayStr < startStr) return false;
    if (endStr && todayStr > endStr) return false;

    const weekly2 = Number(row.weekly2 || 1);
    if (weekly2 === 2 && startStr) {
      const startDateObj = parseLocalYmd(startStr);
      if (startDateObj) {
        const startMonday = getMondayOfWeek(startDateObj);
        const todayMonday = getMondayOfWeek(now);
        const diffDays = Math.round((todayMonday.getTime() - startMonday.getTime()) / 86400000);
        const diffWeeks = Math.floor(diffDays / 7);
        if (diffWeeks < 0 || diffWeeks % 2 !== 0) return false;
      }
    }

    return true;
  };

  const buildTodayScheduleItems = (payload, now = new Date()) => {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const jsDay = now.getDay();
    const todayThuList = jsDay === 0 ? [8, 1] : [jsDay + 1];
    const items = [];

    rows.forEach((row) => {
      if (!isRowActiveOnDate(row, now)) return;
      const slots = Array.isArray(row.slots) ? row.slots : [];
      if (slots.length === 0) return;

      const subjectName = String(row.subjectName || row.subjectCode || 'Môn học')
        .replace(/[\s\u00A0]+/g, ' ')
        .trim();
      const classCode = String(row.code || row.subjectCode || '')
        .replace(/[\s\u00A0]+/g, '')
        .trim();
      const methodLabel = formatMethodCodeLabel(row.methodCode);
      const lecturer = formatLecturerName(row.lecturer);

      slots.forEach((slot) => {
        const thu = Number(slot?.thu);
        if (!todayThuList.includes(thu)) return;

        const startPeriod = Number(slot?.tietBatDau);
        const endPeriod = Number(slot?.tietKetThuc || startPeriod);
        if (!Number.isFinite(startPeriod) || startPeriod <= 0) return;

        const startInfo = TKB_PERIOD_TIMES[startPeriod];
        const endInfo = TKB_PERIOD_TIMES[endPeriod] || startInfo;
        const timeRange = startInfo && endInfo ? `${startInfo.start} – ${endInfo.end}` : '';
        const periodLabel = endPeriod > startPeriod
          ? `Tiết ${startPeriod}–${endPeriod}`
          : `Tiết ${startPeriod}`;
        const room = String(slot?.room || '').replace(/[\s\u00A0]+/g, ' ').trim();

        items.push({
          startPeriod,
          endPeriod,
          timeRange,
          periodLabel,
          subjectName,
          classCode,
          methodLabel,
          room,
          lecturer
        });
      });
    });

    items.sort((a, b) => {
      if (a.startPeriod !== b.startPeriod) return a.startPeriod - b.startPeriod;
      if (a.endPeriod !== b.endPeriod) return a.endPeriod - b.endPeriod;
      return a.classCode.localeCompare(b.classCode);
    });

    return items;
  };

  const renderScheduleEmptyMessage = (container, text) => {
    const emptyTemplate = document.getElementById('cd-tkb-empty-template');
    container.replaceChildren();
    if (emptyTemplate) {
      const fragment = emptyTemplate.content.cloneNode(true);
      const p = fragment.querySelector('.cd-tkb-empty');
      if (p) p.textContent = text;
      container.appendChild(fragment);
    } else {
      const p = document.createElement('p');
      p.className = 'cd-tkb-empty';
      p.textContent = text;
      container.appendChild(p);
    }
  };

  const renderTodayScheduleFromApi = (payload) => {
    const container = document.getElementById('cd-schedule-content');
    const itemTemplate = document.getElementById('cd-tkb-item-template');
    if (!container) return;

    const now = new Date();
    const items = buildTodayScheduleItems(payload, now);

    if (items.length === 0 || !itemTemplate) {
      renderScheduleEmptyMessage(container, 'Hôm nay bạn không có lịch học.');
      startScheduleStatusTicker();
      return;
    }

    container.replaceChildren();
    const listEl = document.createElement('ul');
    listEl.className = 'cd-tkb-list';

    items.forEach((item) => {
      const fragment = itemTemplate.content.cloneNode(true);
      const timeRangeEl = fragment.querySelector('.cd-tkb-time-range');
      const timeTextEl = fragment.querySelector('.cd-tkb-time-text');
      const periodEl = fragment.querySelector('.cd-tkb-period-text');
      const subjectEl = fragment.querySelector('.cd-tkb-subject-name');
      const codeEl = fragment.querySelector('.cd-tkb-class-code');
      const metaRow = fragment.querySelector('.cd-tkb-item-meta-row');
      const badgeEl = fragment.querySelector('.cd-tkb-method-badge');
      const roomEl = fragment.querySelector('.cd-tkb-meta-room');
      const lecturerEl = fragment.querySelector('.cd-tkb-meta-lecturer');

      if (item.timeRange && timeTextEl) {
        timeTextEl.textContent = item.timeRange;
      } else {
        timeRangeEl?.remove();
      }

      if (periodEl) periodEl.textContent = item.periodLabel;
      if (subjectEl) subjectEl.textContent = item.subjectName;

      if (item.classCode && codeEl) {
        codeEl.textContent = item.classCode;
      } else {
        codeEl?.remove();
      }

      if (item.methodLabel && badgeEl) {
        badgeEl.textContent = item.methodLabel;
      } else {
        badgeEl?.remove();
      }

      if (item.room && roomEl) {
        const roomText = roomEl.querySelector('.cd-tkb-meta-text');
        if (roomText) roomText.textContent = item.room;
      } else {
        roomEl?.remove();
      }

      if (item.lecturer && lecturerEl) {
        const lecturerText = lecturerEl.querySelector('.cd-tkb-meta-text');
        if (lecturerText) lecturerText.textContent = item.lecturer;
      } else {
        lecturerEl?.remove();
      }

      if (!item.methodLabel && !item.room && !item.lecturer) {
        metaRow?.remove();
      }

      listEl.appendChild(fragment);
    });

    container.appendChild(listEl);
    startScheduleStatusTicker();
  };

  window.__clearTkbDangKyCache = () => {
    window.__uitTkbDangKyCache = null;
    window.__uitTkbDangKyInFlight = null;
    try {
      sessionStorage.removeItem('uit_tkb_dang_ky_cache');
    } catch {}
  };

  const fetchTkbDangKy = (forceRefresh = false) => {
    if (window.__uitTkbDangKyInFlight) return window.__uitTkbDangKyInFlight;
    if (!forceRefresh && window.__uitTkbDangKyCache) return Promise.resolve(window.__uitTkbDangKyCache);

    const task = fetch('https://portal.uit.edu.vn/api/sinh-vien/tkb/dang-ky', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !Array.isArray(data.rows)) {
          throw new Error('Invalid TKB dang-ky payload');
        }
        window.__uitTkbDangKyCache = data;
        try {
          sessionStorage.setItem('uit_tkb_dang_ky_cache', JSON.stringify(data));
        } catch {}
        return data;
      })
      .finally(() => {
        window.__uitTkbDangKyInFlight = null;
      });

    window.__uitTkbDangKyInFlight = task;
    return task;
  };

  const FALLBACK_SHORTCUTS = [
    { id: 'uit-portal', name: 'Cổng thông tin', url: 'https://portal.uit.edu.vn', icon: 'shortcut-portal.png', iconSrc: '' },
    { id: 'uit-drl', name: 'Điểm rèn luyện', url: 'https://drl.uit.edu.vn', icon: 'shortcut-drl.png', iconSrc: '' },
    { id: 'uit-dkhp', name: 'Đăng ký học phần', url: 'https://dkhp.uit.edu.vn', icon: 'shortcut-dkhp.png', iconSrc: '' },
    { id: 'uit-wecode', name: 'Website chính thức', url: 'https://uit.edu.vn', icon: 'shortcut-uit.png', iconSrc: '' },
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
    const template = document.getElementById('cd-shortcut-item-template');
    if (!container || !template) return;

    const shortcuts = Array.isArray(window.__UIT_WEB_SHORTCUTS__) && window.__UIT_WEB_SHORTCUTS__.length > 0
      ? window.__UIT_WEB_SHORTCUTS__
      : FALLBACK_SHORTCUTS;

    container.replaceChildren();

    shortcuts.forEach((item) => {
      if (!item || !item.url) return;

      const fragment = template.content.cloneNode(true);
      const link = fragment.querySelector('.cd-shortcut-item');
      const iconBox = fragment.querySelector('.cd-shortcut-icon-box');
      const img = fragment.querySelector('.cd-shortcut-icon');
      const fallbackSvg = fragment.querySelector('.cd-shortcut-fallback-svg');
      const nameEl = fragment.querySelector('.cd-shortcut-name');

      if (!link) return;
      fallbackSvg?.remove();
      link.href = item.url;
      if (item.id) link.dataset.shortcutId = item.id;
      link.title = `${item.name || item.url} (${item.url})`;
      if (nameEl) nameEl.textContent = item.name || item.url;

      if (item.iconSrc && img) {
        img.src = item.iconSrc;
        img.addEventListener('error', () => {
          img.remove();
          iconBox?.appendChild(createFallbackShortcutIcon());
        }, { once: true });
      } else {
        img?.remove();
        iconBox?.appendChild(createFallbackShortcutIcon());
      }

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

      container.appendChild(fragment);
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
      bindScheduleWidgetLink();

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
      renderWebShortcuts();

      const renderToken = (window.__uitTrangChuRenderToken || 0) + 1;
      window.__uitTrangChuRenderToken = renderToken;

      let cachedTkb = window.__uitTkbDangKyCache || null;
      if (!cachedTkb) {
        try {
          const rawCachedTkb = sessionStorage.getItem('uit_tkb_dang_ky_cache');
          if (rawCachedTkb) {
            const parsedCachedTkb = JSON.parse(rawCachedTkb);
            if (parsedCachedTkb && Array.isArray(parsedCachedTkb.rows)) {
              cachedTkb = parsedCachedTkb;
              window.__uitTkbDangKyCache = parsedCachedTkb;
            }
          }
        } catch {}
      }

      const markTrangChuReady = () => {
        if (window.__uitTrangChuRenderToken !== renderToken) return;
        window.__trangChuPopulated = true;
        if (window.__scheduleBootCurtainCheck) {
          window.__scheduleBootCurtainCheck();
        }
      };

      if (cachedTkb) {
        renderTodayScheduleFromApi(cachedTkb);
        markTrangChuReady();
      } else {
        const scheduleEl = document.getElementById('cd-schedule-content');
        if (scheduleEl) {
          renderScheduleEmptyMessage(scheduleEl, 'Đang tải thời khóa biểu...');
        }
        startScheduleStatusTicker();
      }

      fetchTkbDangKy()
        .then((freshTkb) => {
          if (window.__uitTrangChuRenderToken !== renderToken) return;
          renderTodayScheduleFromApi(freshTkb);
          markTrangChuReady();
        })
        .catch(() => {
          if (window.__uitTrangChuRenderToken !== renderToken) return;
          if (!cachedTkb) {
            const scheduleEl = document.getElementById('cd-schedule-content');
            if (scheduleEl) scheduleEl.replaceChildren();
            extractWidgetContent('Thời khóa biểu', 'cd-schedule-content');
            startScheduleStatusTicker();
          }
          markTrangChuReady();
        });

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