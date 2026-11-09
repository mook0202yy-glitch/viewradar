/* 뷰레이더 앱: 라우팅과 각 화면(영상 찾기 / 채널 찾기 / 채널 분석 / 수집한 영상) */
(function () {
  const { metrics, fmt, store, ui } = window.VR;
  const { esc, h, toast, modal } = ui;
  const view = document.getElementById('view');

  const REGIONS = [['KR', '한국'], ['US', '미국'], ['JP', '일본'], ['GB', '영국'], ['TW', '대만'], ['VN', '베트남'], ['TH', '태국'], ['ID', '인도네시아'], ['IN', '인도'], ['BR', '브라질']];
  const EXAMPLES = ['홈카페', '자취 요리', '주식 초보', '캠핑', '다이어트 식단', 'AI 툴', '아이폰 꿀팁'];
  const ICON = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    fire: '<svg viewBox="0 0 24 24"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.7.3 1.6 1 2.7 2.3 3.2C11 9 11.3 5.8 12 3z"/></svg>',
    filter: '<svg viewBox="0 0 24 24"><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/></svg>',
    table: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  };

  // ---------- 전역 상태 ----------
  const S = {
    settings: store.settings(),
    provider: null,
    videos: {
      q: '', order: 'relevance', period: 'any', duration: 'any', hot: false, title: '',
      raw: [], channels: {}, nextPageToken: null, loading: false, error: '', searched: false,
      showFilters: false, keywords: [],
      filters: { minViews: '', maxViews: '', minSubs: '', maxSubs: '', cg: [], pg: [], ex: [] },
      list: null,
    },
    channels: { q: '', items: [], nextPageToken: null, loading: false, error: '', searched: false, minSubs: '', maxSubs: '', sort: { key: null, dir: -1 } },
    analysis: { selectedId: null, cache: {}, loading: false, error: '', list: null },
    saved: { folderId: 'default', list: null },
  };

  function makeProvider() {
    S.provider = S.settings.apiKey ? window.VR.youtube.create(S.settings.apiKey) : window.VR.demo.create();
    const badge = document.getElementById('modeBadge');
    badge.textContent = S.provider.mode === 'api' ? 'YouTube API' : '데모 모드';
    badge.classList.toggle('api', S.provider.mode === 'api');
    badge.setAttribute('data-tip', S.provider.mode === 'api' ? '실제 YouTube 데이터로 분석 중입니다.' : '가상 데이터로 체험 중입니다. 설정에서 YouTube API 키를 넣으면 실제 데이터로 분석합니다.');
  }

  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  function enrichAll(videos, channels) {
    return videos.map((v) => {
      const ch = channels[v.channelId];
      const measured = S.provider.mode === 'api' ? store.measure(v.id, v.viewCount) : null;
      const e = metrics.enrich(v, ch, measured);
      e.channelThumb = ch ? ch.thumbnail : '';
      e.measured = measured;
      return e;
    });
  }

  /** "10만", "1.5억", "3천", "5k", "1,000" 같은 입력을 숫자로 */
  function parseKo(s) {
    s = String(s || '').replace(/[,\s]/g, '').toLowerCase();
    if (!s) return null;
    const m = /^(\d+(?:\.\d+)?)(천|만|억|k|m|b)?$/.exec(s);
    if (!m) return null;
    const mult = { 천: 1e3, 만: 1e4, 억: 1e8, k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
    return parseFloat(m[1]) * mult;
  }

  function errMsg(e) { return (e && e.message) || '알 수 없는 오류가 발생했습니다.'; }

  function updateSavedCount() {
    const n = store.folders().reduce((a, f) => a + f.items.length, 0);
    document.getElementById('savedCount').textContent = n ? String(n) : '';
  }

  // ---------- 공용 동작 ----------
  async function collectVideos(videos) {
    if (!videos.length) { toast('수집할 영상을 먼저 선택해 주세요.'); return; }
    const folders = store.folders();
    let folderId = folders[0].id;
    if (folders.length > 1) {
      folderId = await new Promise((resolve) => {
        let chosen = null;
        const m = modal({
          title: '어느 폴더에 수집할까요?', size: 'sm',
          body: `<div class="folder-tabs" style="margin:0">${folders.map((f) => `<button class="folder-tab" data-f="${esc(f.id)}">${esc(f.name)} <span class="cnt">${f.items.length}</span></button>`).join('')}</div>`,
          onClose: () => resolve(chosen),
        });
        m.el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-f]');
          if (b) { chosen = b.getAttribute('data-f'); m.close(); }
        });
      });
      if (!folderId) return;
    }
    const { folder, added } = store.addToFolder(folderId, videos);
    updateSavedCount();
    toast(added ? `‘${folder.name}’에 ${added}개 영상을 수집했습니다.` : '이미 수집한 영상입니다.');
  }

  function addChannelsForAnalysis(videos) {
    const seen = new Set();
    videos.forEach((v) => {
      if (seen.has(v.channelId)) return;
      seen.add(v.channelId);
      store.addChannel({ id: v.channelId, title: v.channelTitle, thumbnail: v.channelThumb });
    });
    if (seen.size) toast(`채널 ${seen.size}개를 채널 분석에 추가했습니다.`);
    return seen.size;
  }

  // ---------- 영상 상세 ----------
  function openVideo(v) {
    const n = S.settings.numeric;
    const isDemo = !!v.demo;
    const measuredLine = v.measured
      ? `<p><b>실측</b> 최근 ${v.measured.hours.toFixed(1)}시간 동안 +${fmt.int(v.measured.delta)}회 (시간당 ${fmt.ko(v.measured.perHour)}회)</p>`
      : `<p>${S.provider.mode === 'api' ? '20분 뒤 다시 검색하면 실측 증가량이 반영됩니다.' : '데모 모드에서는 추정값만 표시합니다.'}</p>`;
    const body = h(`<div>
      <div class="detail-top">
        <div>${ui.thumbHtml(v)}</div>
        <div>
          <p class="detail-title">${esc(v.title)}</p>
          <div class="detail-ch">${v.channelThumb ? `<img class="avatar" src="${esc(v.channelThumb)}" alt="" referrerpolicy="no-referrer" />` : ''}<div><b>${esc(v.channelTitle)}</b><div class="muted" style="font-size:12px">구독자 ${ui.subsText(v)} · 영상 ${fmt.int(v.channelVideoCount)}개</div></div></div>
          <div class="stat-grid">
            <div class="stat"><span>조회수</span><b>${fmt.int(v.viewCount)}</b></div>
            <div class="stat"><span>좋아요</span><b>${fmt.ko(v.likeCount)}</b></div>
            <div class="stat"><span>댓글</span><b>${fmt.ko(v.commentCount)}</b></div>
            <div class="stat"><span>참여율</span><b>${(v.engagement * 100).toFixed(2)}%</b></div>
            <div class="stat"><span>채널 평균 조회수</span><b>${fmt.ko(v.channelAvgViews)}</b></div>
            <div class="stat"><span>일평균 조회</span><b>${fmt.ko(v.viewCount / v.ageDays)}</b></div>
            <div class="stat"><span>길이</span><b>${fmt.duration(v.durationSec)}</b></div>
            <div class="stat"><span>게시</span><b>${fmt.date(v.publishedAt)}</b></div>
          </div>
        </div>
      </div>
      <div class="metric-cards">
        <div class="metric-card"><h5>기여도 ${ui.gradeHtml(v.contributionGrade, v.contribution, n)}</h5><div class="big">${fmt.ratio(v.contribution)}</div><p>${esc(ui.TIPS.contribution)}</p></div>
        <div class="metric-card"><h5>성과도 ${ui.gradeHtml(v.performanceGrade, v.performance, n)}</h5><div class="big">${fmt.ratio(v.performance)}</div><p>${esc(ui.TIPS.performance)}</p></div>
        <div class="metric-card"><h5>노출확률 ${ui.exposureHtml(v.exposure, n)}</h5><div class="big">${v.exposure}%</div><p>지금도 추천 알고리즘을 타고 있을 가능성(추정).</p><div class="callout" style="margin-top:8px">${measuredLine}</div></div>
      </div>
      <div class="growth chart">
        <h4>조회수 성장 추정 그래프</h4>
        <p class="note">현재 조회수와 노출확률로 그린 추정 곡선입니다. 점선은 앞으로의 예상치입니다(예상 도달 ${fmt.ko(metrics.growthCurve(v).projected)}회).</p>
        ${ui.growthChartSvg(v)}
      </div>
      ${v.tags && v.tags.length ? `<div class="tags">${v.tags.slice(0, 18).map((t) => `<button class="chip" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
    </div>`);
    const footer = h(`<div style="display:contents">
      <button class="btn" data-act="analyze">${ICON.chart}채널 분석</button>
      <button class="btn" data-act="save">${ICON.save}영상 수집</button>
      ${isDemo ? '<button class="btn btn-primary" disabled title="데모 영상입니다">YouTube에서 보기</button>' : `<a class="btn btn-primary" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${ICON.ext}YouTube에서 보기</a>`}
    </div>`);
    const m = modal({ title: '영상 상세 분석', body, footer });
    m.el.addEventListener('click', (e) => {
      const tag = e.target.closest('[data-tag]');
      if (tag) { m.close(); runVideoSearch(tag.getAttribute('data-tag')); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.getAttribute('data-act') === 'save') collectVideos([v]);
      if (act.getAttribute('data-act') === 'analyze') {
        store.addChannel({ id: v.channelId, title: v.channelTitle, thumbnail: v.channelThumb });
        S.analysis.selectedId = v.channelId;
        m.close();
        location.hash = '#/analysis';
      }
    });
  }

  // ======================================================================
  // 영상 찾기
  // ======================================================================
  function videoList() {
    if (!S.videos.list) {
      S.videos.list = new ui.VideoList({
        onOpen: openVideo,
        onSelect: () => updateSelectionUi(),
        emptyHtml: '<div class="empty"><b>조건에 맞는 영상이 없습니다</b>필터를 조정해 보세요.</div>',
      });
    }
    return S.videos.list;
  }

  function filteredVideos() {
    const f = S.videos.filters;
    const minV = parseKo(f.minViews), maxV = parseKo(f.maxViews), minS = parseKo(f.minSubs), maxS = parseKo(f.maxSubs);
    const d = S.videos.duration;
    return S.videos.raw.filter((v) => {
      if (minV != null && v.viewCount < minV) return false;
      if (maxV != null && v.viewCount > maxV) return false;
      if (minS != null && v.subscriberCount < minS) return false;
      if (maxS != null && v.subscriberCount > maxS) return false;
      if (f.cg.length && !f.cg.includes(v.contributionGrade)) return false;
      if (f.pg.length && !f.pg.includes(v.performanceGrade)) return false;
      if (f.ex.length && !f.ex.includes(metrics.exposureLevel(v.exposure).key)) return false;
      if (S.videos.hot && d !== 'any') {
        if (d === 'short' && v.durationSec >= 240) return false;
        if (d === 'medium' && (v.durationSec < 240 || v.durationSec > 1200)) return false;
        if (d === 'long' && v.durationSec <= 1200) return false;
      }
      return true;
    });
  }

  const STOP = new Set(['shorts', 'short', '쇼츠', 'the', 'and', 'with', 'for', 'you', 'official', 'video', 'mv', 'ep', 'vlog', '영상', '진짜', '이렇게', '하면', '됩니다', '보세요', '직접', '해봤습니다', '번에', '이건', '몰랐죠', '하는', '분들', '무조건', '이거', '하나면', '하나만', '기억하세요', '공개', '솔직', '말합니다', '버전', '최신판', '모음', '결과', '동안', '숨은', '기능', '끝판왕', '제일', '많이', '처음', '요즘', '아무도', '알려주는', '비밀', '가지', '시작하기', '전에', '그리고', '정말', '너무', '이제', '우리', '오늘', '다들', '데모', '데이터', '관련', '영상입니다']);
  function computeKeywords(videos, q) {
    const qTokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const score = new Map();
    const add = (word, w, vid, seen) => {
      const k = word.trim().toLowerCase();
      if (k.length < 2 || k.length > 24 || STOP.has(k) || /^\d+$/.test(k) || qTokens.includes(k) || k === q.toLowerCase()) return;
      if (seen.has(k)) return;
      seen.add(k);
      const cur = score.get(k) || { word: word.trim(), s: 0, n: 0 };
      cur.s += w; cur.n += 1;
      score.set(k, cur);
    };
    videos.forEach((v) => {
      const w = 1 + Math.log10(1 + v.viewCount) / 3;
      const seen = new Set();
      (v.tags || []).slice(0, 15).forEach((t) => add(t, w * 1.4, v.id, seen));
      v.title.split(/[\s|,.!?()[\]{}"'“”‘’<>#/·:~\-–—]+/).forEach((t) => add(t, w, v.id, seen));
    });
    return [...score.values()].filter((x) => x.n >= 2).sort((a, b) => b.s - a.s).slice(0, 18);
  }

  async function runVideoSearch(q, opts) {
    const V = S.videos;
    opts = opts || {};
    if (q != null) V.q = q.trim();
    if (!opts.hot && !V.q) { toast('검색어를 입력해 주세요.'); return; }
    V.hot = !!opts.hot;
    V.loading = true; V.error = ''; V.searched = true;
    if (!opts.more) { V.raw = []; V.channels = {}; V.nextPageToken = null; V.keywords = []; videoList().sort = { key: null, dir: -1 }; }
    if (location.hash !== '#/videos') location.hash = '#/videos'; else renderVideos();
    try {
      const params = { q: V.q, region: S.settings.region, order: V.order, period: V.period, duration: V.duration, pageToken: opts.more ? V.nextPageToken : undefined };
      const res = V.hot ? await S.provider.hotVideos(params) : await S.provider.searchVideos(params);
      Object.assign(V.channels, res.channels);
      const enriched = enrichAll(res.videos, V.channels);
      const ids = new Set(V.raw.map((v) => v.id));
      V.raw = V.raw.concat(enriched.filter((v) => !ids.has(v.id)));
      V.nextPageToken = res.nextPageToken;
      V.title = V.hot ? `${fmt.date(new Date().toISOString())} 인기 급상승 · ${regionName(S.settings.region)}` : `‘${V.q}’ 검색 결과`;
      V.keywords = V.hot ? [] : computeKeywords(V.raw, V.q);
    } catch (e) {
      V.error = errMsg(e);
      toast(V.error, 'err');
    } finally {
      V.loading = false;
      if (currentRoute() === 'videos') renderVideos();
    }
  }

  function regionName(code) { const r = REGIONS.find((x) => x[0] === code); return r ? r[1] : code; }

  function heroHtml() {
    return `<section class="hero">
      <div>
        <h1>지금 <em>뜨는 영상</em>을<br/>레이더처럼 찾아내세요</h1>
        <p>키워드 하나로 유튜브 영상과 채널을 모아 <b>기여도 · 성과도 · 노출확률</b>로 바로 비교합니다. 내 채널에 맞는 다음 주제를 데이터로 고르세요.</p>
        <ul class="feature-list">
          <li><span class="fi" style="background:var(--g-great)">기여</span><div><b>기여도</b><span>구독자 수보다 훨씬 많이 본 영상 = 채널을 키우는 주제</span></div></li>
          <li><span class="fi" style="background:var(--g-good)">성과</span><div><b>성과도</b><span>채널 평균보다 잘 된 영상 = 알림 없이도 터진 콘텐츠</span></div></li>
          <li><span class="fi" style="background:var(--e-high)">노출</span><div><b>노출확률</b><span>지금도 추천 알고리즘을 타고 있을 가능성(추정)</span></div></li>
        </ul>
        <div class="examples" style="margin-top:18px"><span class="label muted" style="font-size:12px;font-weight:700">이렇게 시작해 보세요</span>${EXAMPLES.map((k) => `<button class="chip" data-example="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      </div>
      <svg class="radar-art" viewBox="0 0 360 360" aria-hidden="true">
        <defs><radialGradient id="sweepGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(180 180) scale(170)"><stop offset="0" stop-color="var(--primary)" stop-opacity=".0"/><stop offset="1" stop-color="var(--primary)" stop-opacity=".35"/></radialGradient></defs>
        <circle class="ring" cx="180" cy="180" r="170"/><circle class="ring" cx="180" cy="180" r="120"/><circle class="ring" cx="180" cy="180" r="70"/>
        <line class="axis" x1="10" y1="180" x2="350" y2="180"/><line class="axis" x1="180" y1="10" x2="180" y2="350"/>
        <path class="sweep" d="M180 180 L180 10 A170 170 0 0 1 327 95 Z"/>
        <circle class="blip2" cx="110" cy="230" r="5"/><circle class="blip2" cx="240" cy="270" r="4"/><circle class="blip2" cx="90" cy="120" r="3.5"/>
        <circle class="blip" cx="250" cy="110" r="7"/><circle class="blip-ring" cx="250" cy="110" r="7"/>
      </svg>
    </section>`;
  }

  function gradeChecks(name, values, selected) {
    return values.map(([val, label, cls]) => `<label class="grade-check ${cls}"><input type="checkbox" data-filter-grade="${name}" value="${val}" ${selected.includes(val) ? 'checked' : ''}/><span>${label}</span></label>`).join('');
  }

  function renderVideos() {
    const V = S.videos;
    const list = videoList();
    list.view = S.settings.view;
    list.numeric = S.settings.numeric;
    const f = V.filters;
    const gradeVals = metrics.GRADES.slice().reverse().map((g) => [g, g, 'g-' + g]);
    const activeFilters = ['minViews', 'maxViews', 'minSubs', 'maxSubs'].filter((k) => f[k]).length + f.cg.length + f.pg.length + f.ex.length;
    view.innerHTML = `
      <section class="search-panel">
        <form class="search-row" id="vSearch" role="search">
          <div class="search-box">${ICON.search}<input class="input" name="q" placeholder="키워드 또는 문장을 입력하세요 (예: 홈카페 브이로그)" value="${esc(V.hot ? '' : V.q)}" autocomplete="off" aria-label="검색어" /></div>
          <select class="select" name="region" aria-label="국가">${REGIONS.map(([c, n]) => `<option value="${c}" ${c === S.settings.region ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <button class="btn btn-primary" type="submit">${ICON.search}검색</button>
          <button class="btn btn-hot ${V.hot ? 'on' : ''}" type="button" id="hotBtn">${ICON.fire}핫 비디오</button>
        </form>
        <div class="search-sub">
          <span class="label">정렬</span>
          <div class="segmented" data-seg="order">${[['relevance', '관련도'], ['viewCount', '조회수'], ['date', '최신']].map(([k, l]) => `<button type="button" data-v="${k}" class="${V.order === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="label">기간</span>
          <div class="segmented" data-seg="period">${[['any', '전체'], ['week', '1주'], ['month', '1개월'], ['quarter', '3개월'], ['year', '1년']].map(([k, l]) => `<button type="button" data-v="${k}" class="${V.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="label">길이</span>
          <div class="segmented" data-seg="duration">${[['any', '전체'], ['short', '4분 미만'], ['medium', '4~20분'], ['long', '20분+']].map(([k, l]) => `<button type="button" data-v="${k}" class="${V.duration === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <button class="btn btn-sm ${V.showFilters ? 'toggled' : ''}" type="button" id="filterBtn">${ICON.filter}상세 필터${activeFilters ? ` (${activeFilters})` : ''}</button>
        </div>
        <div class="filters" id="filters" ${V.showFilters ? '' : 'hidden'}>
          <div class="filter-group"><h4>조회수 범위</h4><div class="range"><input class="input input-sm" data-filter="minViews" value="${esc(f.minViews)}" placeholder="최소 (예: 1만)"/><span class="muted">~</span><input class="input input-sm" data-filter="maxViews" value="${esc(f.maxViews)}" placeholder="최대"/></div></div>
          <div class="filter-group"><h4>구독자 범위</h4><div class="range"><input class="input input-sm" data-filter="minSubs" value="${esc(f.minSubs)}" placeholder="최소 (예: 1천)"/><span class="muted">~</span><input class="input input-sm" data-filter="maxSubs" value="${esc(f.maxSubs)}" placeholder="최대 (예: 10만)"/></div></div>
          <div class="filter-group"><h4>기여도</h4><div class="grade-checks">${gradeChecks('cg', gradeVals, f.cg)}</div></div>
          <div class="filter-group"><h4>성과도</h4><div class="grade-checks">${gradeChecks('pg', gradeVals, f.pg)}</div></div>
          <div class="filter-group"><h4>노출확률</h4><div class="grade-checks">${gradeChecks('ex', [['high', '높음', 'e-high'], ['mid', '보통', 'e-mid'], ['low', '낮음', 'e-low']], f.ex)}</div></div>
          <div class="filter-group" style="display:flex;align-items:flex-end"><button class="btn btn-sm" type="button" id="clearFilters">필터 전체 해제</button></div>
        </div>
      </section>
      <div id="vBody"></div>`;
    const body = view.querySelector('#vBody');
    if (!V.searched) {
      body.innerHTML = heroHtml();
    } else if (V.loading && !V.raw.length) {
      body.innerHTML = `<div class="toolbar"><div class="result-title">${V.hot ? '인기 급상승 영상을 불러오는 중…' : `‘${esc(V.q)}’ 검색 중…`}</div></div>${ui.skeletonTable(7)}`;
    } else if (V.error && !V.raw.length) {
      body.innerHTML = `<div class="empty" style="margin-top:18px"><b>결과를 불러오지 못했습니다</b>${esc(V.error)}<br/><button class="btn" id="openSettings2">설정 열기</button></div>`;
    } else if (!V.raw.length) {
      body.innerHTML = '<div class="empty" style="margin-top:18px"><b>검색 결과가 없습니다</b>다른 키워드로 검색해 보세요.</div>';
    } else {
      const items = filteredVideos();
      body.innerHTML = `
        <div class="toolbar">
          <div class="result-title">${esc(V.title)} <small>${items.length === V.raw.length ? `${items.length}개` : `${V.raw.length}개 중 ${items.length}개 표시`}</small></div>
          <div class="spacer"></div>
          <span class="muted" id="selInfo" style="font-size:12.5px"></span>
          <button class="btn btn-sm" id="collectBtn">${ICON.save}영상 수집</button>
          <button class="btn btn-sm" id="toAnalysisBtn">${ICON.chart}채널 분석에 추가</button>
          <button class="btn btn-sm" id="csvBtn">${ICON.down}CSV</button>
          <div class="segmented" data-seg="view"><button type="button" data-v="table" class="${S.settings.view === 'table' ? 'on' : ''}" aria-label="표 보기">${ICON.table}표</button><button type="button" data-v="card" class="${S.settings.view === 'card' ? 'on' : ''}" aria-label="카드 보기">${ICON.grid}카드</button></div>
          <button class="btn btn-sm ${S.settings.numeric ? 'toggled' : ''}" id="numBtn" data-tip="기여도·성과도·노출확률을 수치로 표시">123</button>
        </div>
        ${V.keywords.length ? `<div class="keywords-bar"><span class="kb-label">${ICON.spark}추천 키워드</span>${V.keywords.map((k) => `<button class="chip" data-kw="${esc(k.word)}">${esc(k.word)} <span class="cnt">${k.n}</span></button>`).join('')}</div>` : ''}
        <div id="vList"></div>
        <div class="load-more">${V.nextPageToken ? `<button class="btn" id="moreBtn" ${V.loading ? 'disabled' : ''}>${V.loading ? '불러오는 중…' : '50개 더 불러오기'}</button>` : ''}</div>`;
      list.items = items;
      for (const id of [...list.selected]) if (!items.some((v) => v.id === id)) list.selected.delete(id);
      list.mount(body.querySelector('#vList'));
      updateSelectionUi();
    }
    bindVideoEvents();
  }

  function updateSelectionUi() {
    const el = document.getElementById('selInfo');
    if (el) el.textContent = S.videos.list && S.videos.list.selected.size ? `${S.videos.list.selected.size}개 선택됨` : '';
  }

  function bindVideoEvents() {
    const V = S.videos;
    const form = view.querySelector('#vSearch');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      runVideoSearch(form.q.value);
    });
    form.region.addEventListener('change', () => {
      S.settings = store.saveSettings({ region: form.region.value });
      if (V.searched && (V.hot || V.q)) runVideoSearch(null, { hot: V.hot });
    });
    view.querySelector('#hotBtn').addEventListener('click', () => runVideoSearch(null, { hot: true }));
    view.querySelectorAll('[data-seg]').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const key = seg.getAttribute('data-seg'), val = b.getAttribute('data-v');
      if (key === 'view') { S.settings = store.saveSettings({ view: val }); renderVideos(); return; }
      V[key] = val;
      if (V.searched && !V.hot && V.q) runVideoSearch();
      else renderVideos();
    }));
    view.querySelector('#filterBtn').addEventListener('click', () => { V.showFilters = !V.showFilters; renderVideos(); });
    view.querySelectorAll('[data-filter]').forEach((inp) => inp.addEventListener('change', () => {
      V.filters[inp.getAttribute('data-filter')] = inp.value.trim();
      if (inp.value.trim() && parseKo(inp.value) == null) toast('숫자 또는 1만, 3천, 1.5억 형식으로 입력해 주세요.', 'err');
      renderVideos();
    }));
    view.querySelectorAll('[data-filter-grade]').forEach((inp) => inp.addEventListener('change', () => {
      const name = inp.getAttribute('data-filter-grade');
      const arr = V.filters[name];
      if (inp.checked) arr.push(inp.value); else arr.splice(arr.indexOf(inp.value), 1);
      renderVideos();
    }));
    view.querySelector('#clearFilters').addEventListener('click', () => {
      V.filters = { minViews: '', maxViews: '', minSubs: '', maxSubs: '', cg: [], pg: [], ex: [] };
      renderVideos();
    });
    view.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => runVideoSearch(b.getAttribute('data-example'))));
    view.querySelectorAll('[data-kw]').forEach((b) => b.addEventListener('click', () => runVideoSearch(b.getAttribute('data-kw'))));
    const more = view.querySelector('#moreBtn');
    if (more) more.addEventListener('click', () => runVideoSearch(null, { more: true, hot: V.hot }));
    const num = view.querySelector('#numBtn');
    if (num) num.addEventListener('click', () => { S.settings = store.saveSettings({ numeric: !S.settings.numeric }); renderVideos(); });
    const collect = view.querySelector('#collectBtn');
    if (collect) collect.addEventListener('click', () => collectVideos(V.list.selectedItems()));
    const toA = view.querySelector('#toAnalysisBtn');
    if (toA) toA.addEventListener('click', () => {
      const sel = V.list.selectedItems();
      if (!sel.length) { toast('채널 분석에 추가할 영상을 먼저 선택해 주세요.'); return; }
      addChannelsForAnalysis(sel);
    });
    const csv = view.querySelector('#csvBtn');
    if (csv) csv.addEventListener('click', () => {
      const sel = V.list.selectedItems();
      const items = sel.length ? sel : V.list.sorted();
      ui.downloadCsv(`viewradar_${(V.hot ? 'hot' : V.q).replace(/[\\/:*?"<>|\s]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`, items);
      toast(`${items.length}개 영상을 CSV로 저장했습니다.`);
    });
    const os2 = view.querySelector('#openSettings2');
    if (os2) os2.addEventListener('click', openSettings);
  }

  // ======================================================================
  // 채널 찾기
  // ======================================================================
  async function runChannelSearch(q, more) {
    const C = S.channels;
    if (q != null) C.q = q.trim();
    if (!C.q) { toast('검색어를 입력해 주세요.'); return; }
    C.loading = true; C.error = ''; C.searched = true;
    if (!more) { C.items = []; C.nextPageToken = null; }
    renderChannels();
    try {
      const res = await S.provider.searchChannels({ q: C.q, region: S.settings.region, pageToken: more ? C.nextPageToken : undefined });
      const ids = new Set(C.items.map((c) => c.id));
      C.items = C.items.concat(res.channels.filter((c) => !ids.has(c.id)));
      C.nextPageToken = res.nextPageToken;
    } catch (e) {
      C.error = errMsg(e);
      toast(C.error, 'err');
    } finally {
      C.loading = false;
      if (currentRoute() === 'channels') renderChannels();
    }
  }

  function renderChannels() {
    const C = S.channels;
    const minS = parseKo(C.minSubs), maxS = parseKo(C.maxSubs);
    let items = C.items.filter((c) => (minS == null || c.subscriberCount >= minS) && (maxS == null || c.subscriberCount <= maxS));
    const val = (c, k) => (k === 'avg' ? (c.videoCount ? c.viewCount / c.videoCount : 0) : k === 'ratio' ? (c.subscriberCount ? c.viewCount / c.videoCount / c.subscriberCount : 0) : k === 'publishedAt' ? new Date(c.publishedAt).getTime() : c[k]);
    if (C.sort.key) items = [...items].sort((a, b) => C.sort.dir * (val(a, C.sort.key) - val(b, C.sort.key)));
    const th = (key, label, tip) => {
      const on = C.sort.key === key;
      return `<th class="sortable ${on ? 'sorted' : ''}" data-csort="${key}">${label}${tip ? `<span class="help" data-tip="${esc(tip)}">?</span>` : ''}<span class="arrow">${on ? (C.sort.dir === 1 ? '▲' : '▼') : '↕'}</span></th>`;
    };
    let bodyHtml;
    if (!C.searched) {
      bodyHtml = `<div class="empty" style="margin-top:18px"><b>키워드로 채널을 찾아보세요</b>같은 분야에서 활동하는 채널의 구독자·조회수 규모를 비교하고, 바로 채널 분석에 추가할 수 있습니다.<div class="examples" style="justify-content:center;margin-top:14px">${EXAMPLES.slice(0, 5).map((k) => `<button class="chip" data-cexample="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>`;
    } else if (C.loading && !C.items.length) {
      bodyHtml = `<div class="empty" style="margin-top:18px"><b>‘${esc(C.q)}’ 채널 검색 중…</b></div>`;
    } else if (!items.length) {
      bodyHtml = `<div class="empty" style="margin-top:18px"><b>${C.error ? '결과를 불러오지 못했습니다' : '조건에 맞는 채널이 없습니다'}</b>${esc(C.error)}</div>`;
    } else {
      bodyHtml = `
        <div class="toolbar"><div class="result-title">‘${esc(C.q)}’ 채널 <small>${items.length}개</small></div></div>
        <div class="table-wrap"><table class="vt" style="min-width:980px">
          <thead><tr><th style="text-align:left">채널</th>${th('subscriberCount', '구독자')}${th('viewCount', '총 조회수')}${th('videoCount', '영상 수')}${th('avg', '영상당 평균 조회수')}${th('ratio', '구독자 대비 평균', '영상당 평균 조회수 ÷ 구독자. 1보다 크면 구독자 밖으로도 잘 퍼지는 채널입니다.')}${th('publishedAt', '개설일')}<th></th></tr></thead>
          <tbody>${items.map((c) => {
            const avg = c.videoCount ? c.viewCount / c.videoCount : 0;
            const ratio = c.subscriberCount ? avg / c.subscriberCount : null;
            const g = ratio == null ? null : metrics.gradeOf(ratio, metrics.CONTRIBUTION_CUTS);
            return `<tr data-cid="${esc(c.id)}">
              <td class="title-cell"><div style="display:flex;gap:10px;align-items:center"><img class="avatar" src="${esc(c.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"/><div style="min-width:0"><div class="t-title">${esc(c.title)}</div><div class="t-sub">${esc(c.handle)}${c.country ? ' · ' + esc(c.country) : ''}</div></div></div></td>
              <td class="num cell-strong">${c.hiddenSubscriberCount ? '비공개' : fmt.ko(c.subscriberCount)}</td>
              <td class="num">${fmt.ko(c.viewCount)}</td>
              <td class="num">${fmt.int(c.videoCount)}</td>
              <td class="num">${fmt.ko(avg)}</td>
              <td>${ui.gradeHtml(g, ratio, S.settings.numeric)}</td>
              <td class="num">${fmt.date(c.publishedAt)}</td>
              <td style="white-space:nowrap"><button class="btn btn-sm" data-analyze="${esc(c.id)}">${ICON.chart}분석</button>${c.demo ? '' : ` <a class="btn btn-sm btn-ghost" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="YouTube에서 열기">${ICON.ext}</a>`}</td>
            </tr>`;
          }).join('')}</tbody></table></div>
        <div class="load-more">${C.nextPageToken ? `<button class="btn" id="cMore" ${C.loading ? 'disabled' : ''}>${C.loading ? '불러오는 중…' : '더 불러오기'}</button>` : ''}</div>`;
    }
    view.innerHTML = `
      <div class="page-head"><div><h2>채널 찾기</h2><p>키워드로 채널을 찾고 규모와 확산력을 비교합니다.</p></div></div>
      <section class="search-panel">
        <form class="search-row" id="cSearch" role="search">
          <div class="search-box">${ICON.search}<input class="input" name="q" placeholder="채널 주제 키워드 (예: 캠핑)" value="${esc(C.q)}" autocomplete="off" aria-label="채널 검색어" /></div>
          <div class="range" style="flex:0 1 300px"><input class="input" name="minSubs" value="${esc(C.minSubs)}" placeholder="구독자 최소 (1천)" aria-label="구독자 최소"/><span class="muted">~</span><input class="input" name="maxSubs" value="${esc(C.maxSubs)}" placeholder="최대 (10만)" aria-label="구독자 최대"/></div>
          <button class="btn btn-primary" type="submit">${ICON.search}채널 검색</button>
        </form>
      </section>
      ${bodyHtml}`;
    const form = view.querySelector('#cSearch');
    form.addEventListener('submit', (e) => { e.preventDefault(); C.minSubs = form.minSubs.value.trim(); C.maxSubs = form.maxSubs.value.trim(); if (form.q.value.trim() === C.q && C.items.length) renderChannels(); else runChannelSearch(form.q.value); });
    [form.minSubs, form.maxSubs].forEach((inp) => inp.addEventListener('change', () => { C[inp.name] = inp.value.trim(); renderChannels(); }));
    view.querySelectorAll('[data-cexample]').forEach((b) => b.addEventListener('click', () => runChannelSearch(b.getAttribute('data-cexample'))));
    view.querySelectorAll('[data-csort]').forEach((t) => t.addEventListener('click', (e) => {
      if (e.target.closest('.help')) return;
      const k = t.getAttribute('data-csort');
      C.sort = C.sort.key === k ? { key: k, dir: -C.sort.dir } : { key: k, dir: -1 };
      renderChannels();
    }));
    view.querySelectorAll('[data-analyze]').forEach((b) => b.addEventListener('click', () => {
      const c = C.items.find((x) => x.id === b.getAttribute('data-analyze'));
      store.addChannel(c);
      S.analysis.selectedId = c.id;
      location.hash = '#/analysis';
    }));
    const more = view.querySelector('#cMore');
    if (more) more.addEventListener('click', () => runChannelSearch(null, true));
  }

  // ======================================================================
  // 채널 분석
  // ======================================================================
  async function loadAnalysis(id, force) {
    const A = S.analysis;
    if (!force && A.cache[id]) return;
    A.loading = true; A.error = '';
    renderAnalysis();
    try {
      const { channel, videos } = await S.provider.channelVideos(id, 50);
      const enriched = enrichAll(videos, { [channel.id]: channel });
      A.cache[id] = { channel, videos: enriched, at: Date.now() };
      store.addChannel(channel);
    } catch (e) {
      A.error = errMsg(e);
      toast(A.error, 'err');
    } finally {
      A.loading = false;
      if (currentRoute() === 'analysis') renderAnalysis();
    }
  }

  function analysisList() {
    if (!S.analysis.list) {
      S.analysis.list = new ui.VideoList({ onOpen: openVideo, emptyHtml: '<div class="empty"><b>영상이 없습니다</b></div>' });
    }
    return S.analysis.list;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function distHtml(title, videos, key) {
    const total = videos.length || 1;
    return `<div class="panel"><div class="panel-h"><h3>${title}</h3><span class="help muted" data-tip="${esc(key === 'performanceGrade' ? ui.TIPS.performance : ui.TIPS.contribution)}">?</span></div><div class="panel-b dist">${metrics.GRADES.slice().reverse().map((g) => {
      const n = videos.filter((v) => v[key] === g).length;
      const pct = Math.round((n / total) * 100);
      return `<div class="dist-row g-${g}"><span style="color:var(--gc)">${g}</span><span class="track"><b style="width:${pct}%"></b></span><span class="pct">${n}개</span></div>`;
    }).join('')}</div></div>`;
  }

  function renderAnalysis() {
    const A = S.analysis;
    const chans = store.channels();
    if (!A.selectedId && chans.length) A.selectedId = chans[0].id;
    const data = A.selectedId ? A.cache[A.selectedId] : null;
    let main;
    if (!chans.length) {
      main = `<div class="empty"><b>분석할 채널을 추가해 보세요</b>왼쪽 입력창에 채널 주소(youtube.com/@handle), @핸들, 채널 ID 또는 채널명을 넣으면<br/>최근 영상 50개의 기여도·성과도를 한 번에 분석합니다.</div>`;
    } else if (A.loading && !data) {
      main = `<div class="panel"><div class="panel-b"><div class="sk" style="height:64px;width:40%"></div><div class="kpis">${'<div class="kpi"><div class="sk" style="height:40px"></div></div>'.repeat(4)}</div><div class="sk" style="height:220px"></div></div></div>`;
    } else if (!data) {
      main = `<div class="empty"><b>${A.error ? '채널을 불러오지 못했습니다' : '채널을 불러오는 중…'}</b>${esc(A.error)}${A.error ? '<br/><button class="btn" id="retryA">다시 시도</button>' : ''}</div>`;
    } else {
      const { channel: c, videos } = data;
      const avgAll = c.videoCount ? c.viewCount / c.videoCount : 0;
      const views = videos.map((v) => v.viewCount);
      const recentAvg = views.reduce((a, b) => a + b, 0) / (views.length || 1);
      const dates = videos.map((v) => new Date(v.publishedAt).getTime()).sort((a, b) => b - a);
      const gaps = dates.slice(1).map((d, i) => (dates[i] - d) / 86400000);
      const cadence = gaps.length ? median(gaps) : null;
      const hits = videos.filter((v) => v.performanceGrade === 'Great' || v.performanceGrade === 'Good').length;
      const trend = recentAvg / (avgAll || 1);
      main = `
        <div class="panel"><div class="panel-b" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
          <div class="ch-head"><img class="avatar avatar-lg" src="${esc(c.thumbnail)}" alt="" referrerpolicy="no-referrer"/><div><h2>${esc(c.title)}</h2><div class="meta"><span>${esc(c.handle)}</span><span>개설 ${fmt.date(c.publishedAt)}</span>${c.country ? `<span>${esc(c.country)}</span>` : ''}<span>분석 ${new Date(data.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div></div></div>
          <div style="display:flex;gap:6px"><button class="btn btn-sm" id="refreshA" ${A.loading ? 'disabled' : ''}>${ICON.refresh}${A.loading ? '분석 중…' : '최신화'}</button>${c.demo ? '' : `<a class="btn btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${ICON.ext}YouTube</a>`}</div>
        </div></div>
        <div class="kpis">
          <div class="kpi"><span>구독자</span><b>${c.hiddenSubscriberCount ? '비공개' : fmt.ko(c.subscriberCount)}</b><small>총 조회수 ${fmt.ko(c.viewCount)}</small></div>
          <div class="kpi"><span>영상당 평균 조회수(전체)</span><b>${fmt.ko(avgAll)}</b><small>영상 ${fmt.int(c.videoCount)}개 기준</small></div>
          <div class="kpi"><span>최근 ${videos.length}개 평균</span><b>${fmt.ko(recentAvg)}</b><small style="color:${trend >= 1 ? 'var(--e-high)' : 'var(--g-worst)'}">전체 평균 대비 ${trend >= 1 ? '▲' : '▼'} ${fmt.ratio(trend)}</small></div>
          <div class="kpi"><span>최근 중앙값</span><b>${fmt.ko(median(views))}</b><small>극단값 영향 제외</small></div>
          <div class="kpi"><span>업로드 주기</span><b>${cadence == null ? '-' : cadence < 1 ? Math.round(cadence * 24) + '시간' : cadence.toFixed(1) + '일'}</b><small>최근 업로드 간격 중앙값</small></div>
          <div class="kpi"><span>성과도 Good 이상</span><b>${Math.round((hits / (videos.length || 1)) * 100)}%</b><small>${hits}개 / ${videos.length}개</small></div>
        </div>
        <div class="chart-grid">
          <div class="panel chart"><div class="panel-h"><h3>최근 영상 조회수</h3><span class="muted" style="font-size:12px">막대 색 = 성과도 등급 · ▲ = 축 범위 초과</span></div><div class="panel-b">${ui.barChartSvg(videos, avgAll)}</div></div>
          <div style="display:grid;gap:16px">${distHtml('성과도 분포', videos, 'performanceGrade')}${distHtml('기여도 분포', videos, 'contributionGrade')}</div>
        </div>
        <div class="toolbar"><div class="result-title">최근 영상 <small>${videos.length}개 · 행을 누르면 상세 분석</small></div><div class="spacer"></div>
          <button class="btn btn-sm" id="aCollect">${ICON.save}선택 영상 수집</button><button class="btn btn-sm" id="aCsv">${ICON.down}CSV</button>
          <button class="btn btn-sm ${S.settings.numeric ? 'toggled' : ''}" id="aNum">123</button></div>
        <div id="aList"></div>`;
    }
    view.innerHTML = `
      <div class="page-head"><div><h2>채널 분석</h2><p>채널의 최근 영상 50개로 어떤 주제가 채널을 키웠는지 확인합니다.</p></div></div>
      <div class="analysis">
        <aside class="panel">
          <form class="add-row" id="addCh"><input class="input" name="ch" placeholder="@핸들, 채널 URL 또는 채널명" aria-label="채널 추가" /><button class="btn btn-primary" type="submit" aria-label="채널 추가">${ICON.plus}</button></form>
          ${chans.length ? `<ul class="ch-list">${chans.map((c) => `<li data-ch="${esc(c.id)}" class="${c.id === A.selectedId ? 'active' : ''}"><img class="avatar" src="${esc(c.thumbnail || '')}" alt="" referrerpolicy="no-referrer"/><span class="nm">${esc(c.title)}</span><button class="rm" data-rm="${esc(c.id)}" aria-label="${esc(c.title)} 삭제">×</button></li>`).join('')}</ul>` : '<p class="muted" style="padding:14px;margin:0;font-size:13px">등록된 채널이 없습니다.</p>'}
        </aside>
        <section>${main}</section>
      </div>`;

    if (data) {
      const list = analysisList();
      if (list._for !== A.selectedId || list._at !== data.at) { list.items = data.videos; list.selected.clear(); list.sort = { key: 'publishedAt', dir: -1 }; list._for = A.selectedId; list._at = data.at; }
      list.numeric = S.settings.numeric;
      list.view = 'table';
      list.mount(view.querySelector('#aList'));
      view.querySelector('#aCollect').addEventListener('click', () => collectVideos(list.selectedItems()));
      view.querySelector('#aCsv').addEventListener('click', () => { const sel = list.selectedItems(); ui.downloadCsv(`viewradar_channel_${data.channel.title.replace(/[\\/:*?"<>|\s]+/g, '_')}.csv`, sel.length ? sel : list.sorted()); });
      view.querySelector('#aNum').addEventListener('click', () => { S.settings = store.saveSettings({ numeric: !S.settings.numeric }); renderAnalysis(); });
      view.querySelector('#refreshA').addEventListener('click', () => loadAnalysis(A.selectedId, true));
      view.querySelectorAll('.chart .bar').forEach((b) => b.addEventListener('click', () => {
        const v = data.videos.find((x) => x.id === b.getAttribute('data-id'));
        if (v) openVideo(v);
      }));
    }
    const retry = view.querySelector('#retryA');
    if (retry) retry.addEventListener('click', () => loadAnalysis(A.selectedId, true));
    const form = view.querySelector('#addCh');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = form.ch.value.trim();
      if (!val) return;
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const c = await S.provider.resolveChannel(val);
        store.addChannel(c);
        A.selectedId = c.id;
        await loadAnalysis(c.id, true);
      } catch (err) {
        toast(errMsg(err), 'err');
        btn.disabled = false;
      }
    });
    view.querySelectorAll('[data-ch]').forEach((li) => li.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      const id = li.getAttribute('data-ch');
      if (rm) {
        store.saveChannels(store.channels().filter((c) => c.id !== id));
        if (A.selectedId === id) A.selectedId = null;
        renderAnalysis();
        if (A.selectedId && !A.cache[A.selectedId]) loadAnalysis(A.selectedId);
        return;
      }
      A.selectedId = id;
      if (A.cache[id]) renderAnalysis(); else loadAnalysis(id);
    }));
    if (A.selectedId && !A.cache[A.selectedId] && !A.loading && !A.error) loadAnalysis(A.selectedId);
  }

  // ======================================================================
  // 수집한 영상
  // ======================================================================
  function savedList() {
    if (!S.saved.list) {
      S.saved.list = new ui.VideoList({
        extra: 'saved',
        onOpen: openVideo,
        emptyHtml: `<div class="empty"><b>아직 수집한 영상이 없습니다</b>영상 찾기에서 마음에 드는 영상을 선택하고 ‘영상 수집’을 눌러 보세요.<br/><a class="btn" href="#/videos">영상 찾으러 가기</a></div>`,
        onRemove: (id) => {
          const f = store.folders();
          const folder = f.find((x) => x.id === S.saved.folderId) || f[0];
          folder.items = folder.items.filter((v) => v.id !== id);
          store.saveFolders(f);
          updateSavedCount();
          renderSaved();
        },
        onMemo: (id, memo) => {
          const f = store.folders();
          const folder = f.find((x) => x.id === S.saved.folderId) || f[0];
          const item = folder.items.find((v) => v.id === id);
          if (item) { item.memo = memo; store.saveFolders(f); toast('메모를 저장했습니다.'); }
        },
      });
    }
    return S.saved.list;
  }

  function renderSaved() {
    const folders = store.folders();
    let folder = folders.find((f) => f.id === S.saved.folderId);
    if (!folder) { folder = folders[0]; S.saved.folderId = folder.id; }
    view.innerHTML = `
      <div class="page-head"><div><h2>수집한 영상</h2><p>참고할 영상을 폴더별로 모아 두고 메모를 남기세요. 지표는 수집한 시점 기준입니다.</p></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" id="sCsv">${ICON.down}CSV</button><button class="btn btn-sm" id="sDelSel">${ICON.trash}선택 삭제</button>${folder.id !== 'default' ? `<button class="btn btn-sm" id="sDelFolder">폴더 삭제</button>` : ''}</div></div>
      <div class="folder-tabs">${folders.map((f) => `<button class="folder-tab ${f.id === folder.id ? 'on' : ''}" data-folder="${esc(f.id)}">${esc(f.name)} <span class="cnt">${f.items.length}</span></button>`).join('')}<button class="btn btn-sm btn-ghost" id="newFolder">${ICON.plus}새 폴더</button></div>
      <div id="sList"></div>`;
    const list = savedList();
    list.numeric = S.settings.numeric;
    if (list._for !== folder.id) { list.selected.clear(); list._for = folder.id; }
    list.items = folder.items;
    list.mount(view.querySelector('#sList'));
    view.querySelectorAll('[data-folder]').forEach((b) => b.addEventListener('click', () => { S.saved.folderId = b.getAttribute('data-folder'); renderSaved(); }));
    view.querySelector('#newFolder').addEventListener('click', async () => {
      const name = await ui.promptDialog('새 폴더', '폴더 이름', '예: 썸네일 참고');
      if (!name) return;
      S.saved.folderId = store.createFolder(name).id;
      renderSaved();
    });
    view.querySelector('#sCsv').addEventListener('click', () => {
      if (!folder.items.length) { toast('내보낼 영상이 없습니다.'); return; }
      ui.downloadCsv(`viewradar_${folder.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.csv`, list.sorted());
    });
    view.querySelector('#sDelSel').addEventListener('click', async () => {
      const sel = list.selectedItems();
      if (!sel.length) { toast('삭제할 영상을 선택해 주세요.'); return; }
      if (!(await ui.confirmDialog(`선택한 영상 ${sel.length}개를 이 폴더에서 삭제할까요?`, '삭제'))) return;
      const f = store.folders();
      const target = f.find((x) => x.id === folder.id);
      const ids = new Set(sel.map((v) => v.id));
      target.items = target.items.filter((v) => !ids.has(v.id));
      store.saveFolders(f);
      list.selected.clear();
      updateSavedCount();
      renderSaved();
    });
    const delF = view.querySelector('#sDelFolder');
    if (delF) delF.addEventListener('click', async () => {
      if (!(await ui.confirmDialog(`‘${folder.name}’ 폴더와 안의 영상 ${folder.items.length}개를 삭제할까요?`, '폴더 삭제'))) return;
      store.saveFolders(store.folders().filter((f) => f.id !== folder.id));
      S.saved.folderId = 'default';
      updateSavedCount();
      renderSaved();
    });
  }

  // ======================================================================
  // 설정
  // ======================================================================
  function openSettings() {
    const s = S.settings;
    const body = h(`<div>
      <div class="form-row">
        <label for="apiKey">YouTube Data API v3 키</label>
        <div class="inline"><input id="apiKey" class="input" type="password" value="${esc(s.apiKey)}" placeholder="AIza로 시작하는 키" autocomplete="off" spellcheck="false"/><button class="btn" type="button" id="showKey">보기</button><button class="btn" type="button" id="testKey">연결 테스트</button></div>
        <span class="hint">키는 이 브라우저의 localStorage에만 저장되고, YouTube API(googleapis.com) 호출에만 사용됩니다. 비워 두면 데모 모드로 동작합니다.</span>
      </div>
      <div class="callout" style="margin-bottom:16px">
        <b>API 키 발급 방법 (무료)</b>
        <ol class="steps"><li>Google Cloud Console(console.cloud.google.com)에서 프로젝트를 만듭니다.</li><li>‘API 및 서비스 → 라이브러리’에서 <b>YouTube Data API v3</b>를 사용 설정합니다.</li><li>‘사용자 인증 정보 → API 키 만들기’로 키를 만든 뒤 붙여 넣습니다.</li></ol>
        <div style="margin-top:6px">기본 할당량은 하루 10,000유닛입니다. 영상 검색 1회(50개)는 약 102유닛, 핫 비디오·채널 분석은 2~5유닛을 씁니다.</div>
      </div>
      <div class="form-row"><label for="regionSel">기본 국가</label><select id="regionSel" class="select">${REGIONS.map(([c, n]) => `<option value="${c}" ${c === s.region ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="form-row"><label>저장 데이터</label><div><button class="btn btn-sm" type="button" id="resetData">${ICON.trash}수집 영상·채널 목록·측정 기록 초기화</button></div></div>
    </div>`);
    const footer = h('<div style="display:contents"><button class="btn" data-close>취소</button><button class="btn btn-primary" id="saveSettings">저장</button></div>');
    const m = modal({ title: '설정', body, footer, size: 'sm' });
    const keyInput = m.el.querySelector('#apiKey');
    m.el.querySelector('#showKey').addEventListener('click', (e) => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      e.target.textContent = keyInput.type === 'password' ? '보기' : '숨기기';
    });
    m.el.querySelector('#testKey').addEventListener('click', async (e) => {
      const k = keyInput.value.trim();
      if (!k) { toast('키를 입력해 주세요.'); return; }
      e.target.disabled = true; e.target.textContent = '확인 중…';
      try { await window.VR.youtube.create(k).test(); toast('연결 성공! 저장을 누르면 실제 데이터로 분석합니다.'); }
      catch (err) { toast(errMsg(err), 'err'); }
      finally { e.target.disabled = false; e.target.textContent = '연결 테스트'; }
    });
    m.el.querySelector('#resetData').addEventListener('click', async () => {
      if (!(await ui.confirmDialog('수집한 영상, 채널 분석 목록, 조회수 측정 기록을 모두 지웁니다. API 키와 화면 설정은 유지됩니다.', '초기화'))) return;
      ['folders', 'channels', 'snaps', 'demoChannels'].forEach((k) => localStorage.removeItem('viewradar:' + k));
      S.analysis = { selectedId: null, cache: {}, loading: false, error: '', list: null };
      S.saved = { folderId: 'default', list: null };
      updateSavedCount();
      toast('저장 데이터를 초기화했습니다.');
      route();
    });
    m.el.querySelector('#saveSettings').addEventListener('click', () => {
      const newKey = keyInput.value.trim();
      const changed = newKey !== S.settings.apiKey;
      S.settings = store.saveSettings({ apiKey: newKey, region: m.el.querySelector('#regionSel').value });
      if (changed) {
        makeProvider();
        S.videos.raw = []; S.videos.searched = false; S.videos.hot = false; S.videos.keywords = [];
        S.channels.items = []; S.channels.searched = false;
        S.analysis.cache = {};
        toast(newKey ? 'YouTube API 모드로 전환했습니다.' : '데모 모드로 전환했습니다.');
      } else toast('설정을 저장했습니다.');
      m.close();
      route();
    });
  }

  // ---------- 라우터 ----------
  function currentRoute() {
    const r = (location.hash.replace(/^#\/?/, '') || 'videos').split('/')[0];
    return ['videos', 'channels', 'analysis', 'saved'].includes(r) ? r : 'videos';
  }
  function route() {
    const r = currentRoute();
    document.querySelectorAll('.mainnav a').forEach((a) => {
      const on = a.getAttribute('data-route') === r;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const titles = { videos: '영상 찾기', channels: '채널 찾기', analysis: '채널 분석', saved: '수집한 영상' };
    document.title = titles[r] + ' · 뷰레이더';
    ({ videos: renderVideos, channels: renderChannels, analysis: renderAnalysis, saved: renderSaved })[r]();
  }

  // ---------- 시작 ----------
  applyTheme();
  makeProvider();
  updateSavedCount();
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('modeBadge').addEventListener('click', openSettings);
  document.getElementById('themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    S.settings = store.saveSettings({ theme: dark ? 'light' : 'dark' });
    applyTheme();
  });
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  if (!location.hash) history.replaceState(null, '', '#/videos');
  route();
})();
