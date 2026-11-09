/* 뷰레이더 지표 계산 + 포맷 유틸
 * 모든 지표는 YouTube Data API가 공개하는 수치(조회수, 구독자 수, 채널 총 조회수/영상 수, 게시일)만으로 계산한다.
 */
(function () {
  const GRADES = ['Worst', 'Bad', 'Normal', 'Good', 'Great'];
  const GRADE_KO = { Great: '매우 좋음', Good: '좋음', Normal: '보통', Bad: '낮음', Worst: '매우 낮음' };

  function gradeOf(value, cuts) {
    // cuts: [Bad 이상, Normal 이상, Good 이상, Great 이상]
    let g = 0;
    for (let i = 0; i < cuts.length; i++) if (value >= cuts[i]) g = i + 1;
    return GRADES[g];
  }

  /** 기여도: 구독자 수 대비 조회수. 구독자 규모를 넘어서는 조회수를 낸 영상일수록 채널을 키울 주제다. */
  function contribution(views, subs) {
    if (!subs || subs < 1) return null;
    return views / subs;
  }
  const CONTRIBUTION_CUTS = [0.08, 0.25, 0.8, 2.0];

  /** 성과도: 채널의 영상당 평균 조회수 대비 조회수. 구독자 알림 노출과 무관한 '자체 성과'를 본다. */
  function performance(views, channelAvgViews) {
    if (!channelAvgViews || channelAvgViews < 1) return null;
    return views / channelAvgViews;
  }
  const PERFORMANCE_CUTS = [0.3, 0.7, 1.8, 4.0];

  function ageDays(publishedAt, now) {
    const t = new Date(publishedAt).getTime();
    return Math.max(0.04, ((now || Date.now()) - t) / 86400000);
  }

  /**
   * 노출확률(추정): 지금도 알고리즘 추천을 타고 있을 가능성(0~100).
   * - 일평균 조회 속도를 채널의 '평균 영상 하나가 한 달간 받는 속도'와 비교한 모멘텀
   * - 게시 후 경과일에 따른 감쇠
   * - 같은 영상을 이전에 조회한 기록이 있으면 실측 시간당 증가량으로 보정
   */
  function exposure(views, publishedAt, channelAvgViews, measured) {
    const d = ageDays(publishedAt);
    const daily = views / d;
    const base = Math.max(30, (channelAvgViews || 1000) / 30);
    let momentum = daily / base;
    if (measured && measured.perHour >= 0) {
      const measuredDaily = measured.perHour * 24;
      momentum = 0.35 * momentum + 0.65 * (measuredDaily / base);
    }
    const s = 1 / (1 + Math.exp(-1.1 * Math.log(Math.max(momentum, 1e-4))));
    const recency = Math.exp(-d / 40);
    const p = s * (0.3 + 0.7 * recency);
    return Math.round(Math.min(0.99, Math.max(0.01, p)) * 100);
  }

  function exposureLevel(p) {
    if (p == null) return null;
    if (p >= 70) return { key: 'high', label: '높음' };
    if (p >= 40) return { key: 'mid', label: '보통' };
    return { key: 'low', label: '낮음' };
  }

  function enrich(video, channel, measured) {
    const avg = channel && channel.videoCount ? channel.viewCount / channel.videoCount : null;
    const c = contribution(video.viewCount, channel ? channel.subscriberCount : 0);
    const p = performance(video.viewCount, avg);
    const e = exposure(video.viewCount, video.publishedAt, avg, measured);
    return Object.assign({}, video, {
      subscriberCount: channel ? channel.subscriberCount : 0,
      hiddenSubs: channel ? !!channel.hiddenSubscriberCount : false,
      channelVideoCount: channel ? channel.videoCount : 0,
      channelViewCount: channel ? channel.viewCount : 0,
      channelAvgViews: avg,
      contribution: c,
      contributionGrade: c == null ? null : gradeOf(c, CONTRIBUTION_CUTS),
      performance: p,
      performanceGrade: p == null ? null : gradeOf(p, PERFORMANCE_CUTS),
      exposure: e,
      engagement: video.viewCount ? (video.likeCount + video.commentCount) / video.viewCount : 0,
      ageDays: ageDays(video.publishedAt),
    });
  }

  /** 추정 누적 조회수 곡선: 지수 포화 모델 V(t) = V∞(1 − e^(−t/τ)). τ는 노출확률로 조정. */
  function growthCurve(video, points) {
    const T = video.ageDays;
    const tau = Math.max(1.5, 4 + (video.exposure / 100) * 40);
    const norm = 1 - Math.exp(-T / tau);
    const vInf = video.viewCount / Math.max(norm, 1e-6);
    const n = points || 40;
    const horizon = T + Math.max(3, Math.min(30, T * 0.3));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = (horizon * i) / n;
      out.push({ t, v: vInf * (1 - Math.exp(-t / tau)), future: t > T });
    }
    return { points: out, now: T, projected: out[out.length - 1].v, horizon };
  }

  // ---------- 포맷 ----------
  function fmtKo(n) {
    if (n == null || isNaN(n)) return '-';
    const a = Math.abs(n);
    if (a >= 1e8) return trim(n / 1e8, a >= 1e10 ? 0 : 1) + '억';
    if (a >= 1e4) return trim(n / 1e4, a >= 1e6 ? 0 : 1) + '만';
    if (a >= 1e3) return trim(n / 1e3, 1) + '천';
    return Math.round(n).toLocaleString('ko-KR');
  }
  function trim(x, digits) {
    return Number(x.toFixed(digits)).toLocaleString('ko-KR');
  }
  function fmtInt(n) {
    if (n == null || isNaN(n)) return '-';
    return Math.round(n).toLocaleString('ko-KR');
  }
  function fmtRatio(x) {
    if (x == null) return '-';
    if (x >= 100) return '×' + Math.round(x);
    if (x >= 10) return '×' + x.toFixed(1);
    return '×' + x.toFixed(2);
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    const yy = String(d.getFullYear()).slice(2);
    return yy + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  function fmtAgo(iso) {
    const d = ageDays(iso);
    if (d < 1 / 24) return '방금';
    if (d < 1) return Math.round(d * 24) + '시간 전';
    if (d < 30) return Math.round(d) + '일 전';
    if (d < 365) return Math.round(d / 30) + '개월 전';
    return (d / 365).toFixed(1).replace(/\.0$/, '') + '년 전';
  }
  function fmtDuration(sec) {
    if (sec == null) return '-';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function parseISODuration(iso) {
    const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  window.VR = window.VR || {};
  window.VR.metrics = {
    GRADES, GRADE_KO, CONTRIBUTION_CUTS, PERFORMANCE_CUTS,
    contribution, performance, exposure, exposureLevel, enrich, growthCurve, gradeOf, ageDays,
  };
  window.VR.fmt = { ko: fmtKo, int: fmtInt, ratio: fmtRatio, date: fmtDate, ago: fmtAgo, duration: fmtDuration, parseISODuration };
})();
