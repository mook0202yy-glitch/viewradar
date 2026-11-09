/* 공용 UI: 이스케이프, 토스트, 모달, 툴팁, 등급 표시, 영상 목록(표/카드), 차트, CSV */
(function () {
  const { fmt, metrics } = window.VR;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // ---------- 토스트 ----------
  function toast(msg, type) {
    const el = h(`<div class="toast ${type === 'err' ? 'err' : ''}"></div>`);
    el.textContent = msg;
    document.getElementById('toastRoot').appendChild(el);
    setTimeout(() => el.remove(), type === 'err' ? 5200 : 2600);
  }

  // ---------- 모달 ----------
  function modal({ title, body, footer, size, onClose }) {
    const root = document.getElementById('modalRoot');
    const prevFocus = document.activeElement;
    const el = h(`<div class="modal-backdrop" role="presentation">
      <div class="modal ${size || ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div class="modal-b"></div>
        ${footer ? '<div class="modal-f"></div>' : ''}
      </div></div>`);
    const b = el.querySelector('.modal-b');
    if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
    if (footer) {
      const f = el.querySelector('.modal-f');
      if (typeof footer === 'string') f.innerHTML = footer; else f.appendChild(footer);
    }
    function close() {
      el.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(el);
    const focusable = el.querySelector('input, button:not([data-close]), select, textarea') || el.querySelector('[data-close]');
    if (focusable) focusable.focus();
    return { el, close, body: b };
  }

  function confirmDialog(message, okLabel) {
    return new Promise((resolve) => {
      let ok = false;
      const m = modal({
        title: '확인', size: 'sm', body: `<p style="margin:0">${esc(message)}</p>`,
        footer: `<button class="btn" data-close>취소</button><button class="btn btn-primary" data-ok>${esc(okLabel || '확인')}</button>`,
        onClose: () => resolve(ok),
      });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; m.close(); });
    });
  }

  function promptDialog(title, label, placeholder) {
    return new Promise((resolve) => {
      let value = null;
      const m = modal({
        title, size: 'sm',
        body: `<div class="form-row"><label for="pd">${esc(label)}</label><input id="pd" class="input" placeholder="${esc(placeholder || '')}" maxlength="40" /></div>`,
        footer: `<button class="btn" data-close>취소</button><button class="btn btn-primary" data-ok>확인</button>`,
        onClose: () => resolve(value),
      });
      const input = m.el.querySelector('#pd');
      const submit = () => { if (input.value.trim()) { value = input.value.trim(); m.close(); } };
      m.el.querySelector('[data-ok]').addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }

  // ---------- 툴팁 ----------
  let tipEl = null;
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { if (tipEl) { tipEl.remove(); tipEl = null; } return; }
    if (tipEl && tipEl._for === t) return;
    if (tipEl) tipEl.remove();
    tipEl = h('<div class="tip" role="tooltip"></div>');
    tipEl.textContent = t.getAttribute('data-tip');
    tipEl._for = t;
    document.body.appendChild(tipEl);
    const r = t.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    let left = Math.min(window.innerWidth - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2));
    let top = r.bottom + 8;
    if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  });

  // ---------- 지표 표시 ----------
  const TIPS = {
    contribution: '기여도 = 조회수 ÷ 구독자 수. 구독자 규모보다 훨씬 많이 본 영상일수록 채널을 키울 수 있는 주제입니다.',
    performance: '성과도 = 조회수 ÷ 채널 영상당 평균 조회수. 구독자 알림과 무관하게 영상 자체가 얼마나 잘 됐는지를 봅니다.',
    exposure: '노출확률(추정) = 게시 후 일평균 조회 속도와 경과일로 추정한, 지금도 추천 알고리즘을 타고 있을 가능성. 20분 이상 간격으로 다시 검색하면 실측 증가량이 반영됩니다.',
  };

  function gradeHtml(grade, value, numeric) {
    if (!grade) return '<span class="muted">-</span>';
    const idx = metrics.GRADES.indexOf(grade) + 1;
    const bars = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('');
    const lbl = numeric ? fmt.ratio(value) : grade;
    return `<span class="grade g-${grade}" data-tip="${esc(metrics.GRADE_KO[grade] + ' · ' + fmt.ratio(value))}"><span class="bars">${bars}</span><span class="lbl num">${esc(lbl)}</span></span>`;
  }
  function exposureHtml(p, numeric) {
    if (p == null) return '<span class="muted">-</span>';
    const lv = metrics.exposureLevel(p);
    return `<span class="exposure e-${lv.key}" data-tip="${esc('추정 ' + p + '% · ' + lv.label)}"><span class="meter"><b style="width:${p}%"></b></span><span class="lbl num">${numeric ? p + '%' : lv.label}</span></span>`;
  }
  function thumbHtml(v) {
    const isShort = v.durationSec > 0 && v.durationSec <= 180 && /shorts|쇼츠/i.test(v.title + ' ' + (v.tags || []).join(' ')) || (v.durationSec > 0 && v.durationSec <= 60);
    return `<div class="thumb"><img src="${esc(v.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />${isShort ? '<span class="shorts">SHORTS</span>' : ''}<span class="dur">${fmt.duration(v.durationSec)}</span></div>`;
  }
  function subsText(v) {
    return v.hiddenSubs ? '비공개' : fmt.ko(v.subscriberCount);
  }

  // ---------- 영상 목록(표/카드) ----------
  const COLS = [
    { key: 'viewCount', label: '조회수' },
    { key: 'subscriberCount', label: '구독자' },
    { key: 'contribution', label: '기여도', tip: TIPS.contribution },
    { key: 'performance', label: '성과도', tip: TIPS.performance },
    { key: 'exposure', label: '노출확률', tip: TIPS.exposure },
    { key: 'durationSec', label: '길이' },
    { key: 'channelVideoCount', label: '총 영상 수' },
    { key: 'publishedAt', label: '게시일' },
  ];

  class VideoList {
    constructor(opts) {
      this.root = null;
      this.opts = Object.assign({ selectable: true, extra: null, onOpen: null, onSelect: null, emptyHtml: '' }, opts);
      this.items = [];
      this.sort = { key: null, dir: -1 };
      this.selected = new Set();
      this.view = 'table';
      this.numeric = false;
    }
    /** 화면을 다시 그릴 때마다 새 컨테이너에 연결한다(정렬·선택 상태는 유지). */
    mount(root) {
      this.root = root;
      root.addEventListener('click', (e) => this.onClick(e));
      root.addEventListener('change', (e) => this.onChange(e));
      this.render();
    }
    setItems(items, keepSelection) {
      this.items = items;
      if (!keepSelection) this.selected.clear();
      this.render();
    }
    sorted() {
      const { key, dir } = this.sort;
      if (!key) return this.items;
      const val = (v) => (key === 'publishedAt' ? new Date(v.publishedAt).getTime() : key === 'title' ? v.title : v[key] == null ? -Infinity : v[key]);
      return [...this.items].sort((a, b) => {
        const x = val(a), y = val(b);
        if (typeof x === 'string') return dir * x.localeCompare(y, 'ko');
        return dir * (x - y);
      });
    }
    selectedItems() { return this.items.filter((v) => this.selected.has(v.id)); }
    render() {
      if (!this.root) return;
      if (!this.items.length) { this.root.innerHTML = this.opts.emptyHtml || ''; return; }
      this.root.innerHTML = this.view === 'card' ? this.cardsHtml() : this.tableHtml();
    }
    tableHtml() {
      const n = this.numeric;
      const all = this.items.length && this.items.every((v) => this.selected.has(v.id));
      const head = COLS.map((c) => {
        const sorted = this.sort.key === c.key;
        const arrow = sorted ? (this.sort.dir === 1 ? '▲' : '▼') : '↕';
        return `<th class="sortable ${sorted ? 'sorted' : ''}" data-sort="${c.key}" aria-sort="${sorted ? (this.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}">${c.label}${c.tip ? `<span class="help" data-tip="${esc(c.tip)}">?</span>` : ''}<span class="arrow">${arrow}</span></th>`;
      }).join('');
      const extraHead = this.opts.extra === 'saved' ? '<th>메모</th><th></th>' : '';
      const rows = this.sorted().map((v) => {
        const sel = this.selected.has(v.id);
        const extra = this.opts.extra === 'saved'
          ? `<td><input class="memo" data-memo="${esc(v.id)}" value="${esc(v.memo || '')}" placeholder="메모 추가" aria-label="메모" /></td><td><button class="btn btn-sm btn-ghost" data-remove="${esc(v.id)}" aria-label="삭제">삭제</button></td>`
          : '';
        return `<tr data-id="${esc(v.id)}" class="${sel ? 'selected' : ''}">
          ${this.opts.selectable ? `<td class="col-check"><input type="checkbox" class="check" data-check="${esc(v.id)}" ${sel ? 'checked' : ''} aria-label="선택" /></td>` : ''}
          <td class="col-thumb">${thumbHtml(v)}</td>
          <td class="title-cell"><div class="t-title">${esc(v.title)}</div><div class="t-sub">${v.hasCaption ? '<span class="tag-cc">CC</span>' : ''}<span>${esc(v.channelTitle)}</span></div></td>
          <td class="num"><div class="cell-strong" title="${fmt.int(v.viewCount)}회">${n ? fmt.int(v.viewCount) : fmt.ko(v.viewCount)}</div></td>
          <td class="num"><div title="${fmt.int(v.subscriberCount)}명">${v.hiddenSubs ? '비공개' : n ? fmt.int(v.subscriberCount) : fmt.ko(v.subscriberCount)}</div></td>
          <td>${gradeHtml(v.contributionGrade, v.contribution, n)}</td>
          <td>${gradeHtml(v.performanceGrade, v.performance, n)}</td>
          <td>${exposureHtml(v.exposure, n)}</td>
          <td class="num">${fmt.duration(v.durationSec)}</td>
          <td class="num">${fmt.int(v.channelVideoCount)}</td>
          <td class="num"><div>${fmt.date(v.publishedAt)}</div><div class="cell-sub">${fmt.ago(v.publishedAt)}</div></td>
          ${extra}
        </tr>`;
      }).join('');
      return `<div class="table-wrap"><table class="vt">
        <thead><tr>${this.opts.selectable ? `<th class="col-check"><input type="checkbox" class="check" data-checkall ${all ? 'checked' : ''} aria-label="전체 선택" /></th>` : ''}<th>썸네일</th><th class="sortable ${this.sort.key === 'title' ? 'sorted' : ''}" data-sort="title" style="text-align:left">제목<span class="arrow">${this.sort.key === 'title' ? (this.sort.dir === 1 ? '▲' : '▼') : '↕'}</span></th>${head}${extraHead}</tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }
    cardsHtml() {
      const n = this.numeric;
      return `<div class="cards">${this.sorted().map((v) => {
        const sel = this.selected.has(v.id);
        return `<article class="card ${sel ? 'selected' : ''}" data-id="${esc(v.id)}">
          ${this.opts.selectable ? `<label class="card-check"><input type="checkbox" class="check" data-check="${esc(v.id)}" ${sel ? 'checked' : ''} aria-label="선택" /></label>` : ''}
          ${thumbHtml(v)}
          <div class="card-body">
            <div class="card-title">${esc(v.title)}</div>
            <div class="card-ch"><span>${esc(v.channelTitle)}</span><span>구독자 ${subsText(v)}</span></div>
            <div class="card-nums"><span>조회수 <b>${n ? fmt.int(v.viewCount) : fmt.ko(v.viewCount)}</b></span><span class="muted">${fmt.ago(v.publishedAt)}</span></div>
            <div class="card-stats">
              <div class="card-stat"><span>기여도</span>${gradeHtml(v.contributionGrade, v.contribution, n)}</div>
              <div class="card-stat"><span>성과도</span>${gradeHtml(v.performanceGrade, v.performance, n)}</div>
              <div class="card-stat"><span>노출확률</span>${exposureHtml(v.exposure, n)}</div>
            </div>
          </div></article>`;
      }).join('')}</div>`;
    }
    onClick(e) {
      const th = e.target.closest('th[data-sort]');
      if (th && !e.target.closest('.help')) {
        const key = th.getAttribute('data-sort');
        if (this.sort.key === key) this.sort.dir *= -1;
        else this.sort = { key, dir: key === 'title' ? 1 : -1 };
        this.render();
        return;
      }
      if (e.target.closest('input, label.card-check, .memo, .col-check')) return;
      const rm = e.target.closest('[data-remove]');
      if (rm) { if (this.opts.onRemove) this.opts.onRemove(rm.getAttribute('data-remove')); return; }
      const row = e.target.closest('[data-id]');
      if (row && this.opts.onOpen) {
        const v = this.items.find((x) => x.id === row.getAttribute('data-id'));
        if (v) this.opts.onOpen(v);
      }
    }
    onChange(e) {
      const t = e.target;
      if (t.hasAttribute('data-checkall')) {
        if (t.checked) this.items.forEach((v) => this.selected.add(v.id)); else this.selected.clear();
        this.render();
      } else if (t.hasAttribute('data-check')) {
        const id = t.getAttribute('data-check');
        if (t.checked) this.selected.add(id); else this.selected.delete(id);
        const row = t.closest('[data-id]');
        if (row) row.classList.toggle('selected', t.checked);
        const all = this.root.querySelector('[data-checkall]');
        if (all) all.checked = this.items.every((v) => this.selected.has(v.id));
      } else if (t.hasAttribute('data-memo')) {
        if (this.opts.onMemo) this.opts.onMemo(t.getAttribute('data-memo'), t.value);
        return;
      }
      if (this.opts.onSelect) this.opts.onSelect(this.selected.size);
    }
  }

  function skeletonTable(rows) {
    const r = Array.from({ length: rows || 6 }, () => `<tr class="skeleton-row"><td style="width:40px"></td><td style="width:138px"><div class="sk" style="height:68px;width:122px;margin:auto;border-radius:8px"></div></td><td><div class="sk" style="width:80%"></div><div class="sk" style="width:40%;margin-top:8px"></div></td>${'<td><div class="sk" style="width:60%;margin:auto"></div></td>'.repeat(8)}</tr>`).join('');
    return `<div class="table-wrap"><table class="vt"><thead><tr><th></th><th>썸네일</th><th>제목</th>${COLS.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${r}</tbody></table></div>`;
  }

  // ---------- 차트 ----------
  function growthChartSvg(video) {
    const g = metrics.growthCurve(video, 60);
    const W = 860, H = 220, L = 56, R = 16, T = 14, B = 28;
    const maxV = g.projected * 1.05;
    const x = (t) => L + (t / g.horizon) * (W - L - R);
    const y = (v) => T + (1 - v / maxV) * (H - T - B);
    const past = g.points.filter((p) => !p.future);
    const nowV = video.viewCount;
    past.push({ t: g.now, v: nowV });
    const fut = [{ t: g.now, v: nowV }].concat(g.points.filter((p) => p.future));
    const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1)).join('');
    const area = path(past) + `L${x(g.now).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
    const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => maxV * f);
    const tickDays = niceDays(g.horizon);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="추정 누적 조회수 그래프">
      ${ticksY.map((v) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt.ko(v)}</text>`).join('')}
      ${tickDays.map((d) => `<text class="axis-text" x="${x(d)}" y="${H - 8}" text-anchor="middle">${d}일</text>`).join('')}
      <path class="area" d="${area}"/>
      <path class="curve" d="${path(past)}"/>
      <path class="curve-f" d="${path(fut)}"/>
      <line class="now-line" x1="${x(g.now)}" x2="${x(g.now)}" y1="${T}" y2="${H - B}"/>
      <circle class="now-dot" cx="${x(g.now)}" cy="${y(nowV)}" r="4.5"/>
      <text class="now-text" x="${Math.min(x(g.now) + 8, W - 120)}" y="${y(nowV) - 8}">지금 ${fmt.ko(nowV)}</text>
    </svg>`;
  }
  function niceDays(horizon) {
    const steps = [1, 2, 5, 7, 14, 30, 60, 90, 180, 365, 730];
    const step = steps.find((s) => horizon / s <= 7) || 1000;
    const out = [];
    for (let d = 0; d <= horizon; d += step) out.push(d);
    return out;
  }

  function barChartSvg(videos, avg) {
    const list = [...videos].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    const W = 860, H = 240, L = 52, R = 10, T = 12, B = 26;
    const sortedViews = list.map((v) => v.viewCount).sort((a, b) => a - b);
    const p95 = sortedViews[Math.floor(sortedViews.length * 0.95)] || 1;
    const cap = Math.max(p95 * 1.15, avg * 1.6, 1);
    const bw = (W - L - R) / list.length;
    const y = (v) => T + (1 - Math.min(v, cap) / cap) * (H - T - B);
    const colorVar = (g) => `fill:var(--g-${(g || 'Normal').toLowerCase()})`;
    const bars = list.map((v, i) => {
      const over = v.viewCount > cap;
      const bx = L + i * bw + bw * 0.15;
      return `<rect class="bar" data-id="${esc(v.id)}" x="${bx.toFixed(1)}" y="${y(v.viewCount).toFixed(1)}" width="${Math.max(1, bw * 0.7).toFixed(1)}" height="${(H - B - y(v.viewCount)).toFixed(1)}" rx="2" style="${colorVar(v.performanceGrade)}" data-tip="${esc(v.title + ' · ' + fmt.ko(v.viewCount) + '회 · 성과도 ' + (v.performanceGrade || '-'))}"/>${over ? `<text class="axis-text" x="${(bx + bw * 0.35).toFixed(1)}" y="${T + 9}" text-anchor="middle" style="fill:var(--accent);font-weight:800">▲</text>` : ''}`;
    }).join('');
    const ticks = [0, 0.5, 1].map((f) => cap * f);
    const first = list[0], last = list[list.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 영상 조회수 막대 그래프">
      ${ticks.map((v) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt.ko(v)}</text>`).join('')}
      ${bars}
      <line class="avg-line" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>
      <text class="axis-text" x="${W - R}" y="${y(avg) - 6}" text-anchor="end" style="fill:var(--accent);font-weight:700">채널 평균 ${fmt.ko(avg)}</text>
      ${first ? `<text class="axis-text" x="${L}" y="${H - 6}">${fmt.date(first.publishedAt)}</text><text class="axis-text" x="${W - R}" y="${H - 6}" text-anchor="end">${fmt.date(last.publishedAt)}</text>` : ''}
    </svg>`;
  }

  // ---------- CSV ----------
  function downloadCsv(filename, videos) {
    const head = ['제목', '채널', 'URL', '조회수', '구독자', '기여도', '기여도 등급', '성과도', '성과도 등급', '노출확률(%)', '길이(초)', '채널 영상 수', '게시일', '좋아요', '댓글', '메모'];
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const rows = videos.map((v) => [v.title, v.channelTitle, v.url, v.viewCount, v.subscriberCount, v.contribution != null ? v.contribution.toFixed(3) : '', v.contributionGrade || '', v.performance != null ? v.performance.toFixed(3) : '', v.performanceGrade || '', v.exposure, v.durationSec, v.channelVideoCount, v.publishedAt, v.likeCount, v.commentCount, v.memo || ''].map(q).join(','));
    const blob = new Blob(['﻿' + [head.map(q).join(',')].concat(rows).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  window.VR.ui = { esc, h, toast, modal, confirmDialog, promptDialog, gradeHtml, exposureHtml, thumbHtml, subsText, VideoList, skeletonTable, growthChartSvg, barChartSvg, downloadCsv, TIPS };
})();
