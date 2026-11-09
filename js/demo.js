/* 데모 공급자: API 키 없이도 모든 화면을 체험할 수 있도록 검색어로부터 결정적인 가상 데이터를 만든다. */
(function () {
  function hashStr(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rng(seed) {
    let a = hashStr(String(seed));
    const next = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.normal = () => {
      const u = Math.max(1e-9, next()), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    next.logn = (median, sigma) => median * Math.exp(sigma * next.normal());
    return next;
  }
  const idFrom = (prefix, s, len) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const r = rng(s);
    let out = prefix;
    while (out.length < len) out += chars[Math.floor(r() * chars.length)];
    return out;
  };

  const PALETTES = [
    ['#4338ca', '#a78bfa'], ['#0f766e', '#5eead4'], ['#be123c', '#fda4af'], ['#b45309', '#fcd34d'],
    ['#1d4ed8', '#7dd3fc'], ['#6d28d9', '#f0abfc'], ['#334155', '#94a3b8'], ['#15803d', '#bef264'],
    ['#c2410c', '#fdba74'], ['#0e7490', '#a5f3fc'],
  ];
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
  function thumb(seed, label, w, h) {
    const r = rng('thumb' + seed);
    const [c1, c2] = r.pick(PALETTES);
    const text = esc(label.length > 12 ? label.slice(0, 11) + '…' : label);
    const cx = r.int(10, 90), cy = r.int(10, 90);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${cx}%" cy="${cy}%" r="${h * 0.45}" fill="#fff" opacity=".12"/><text x="50%" y="54%" font-family="sans-serif" font-weight="800" font-size="${h * 0.16}" fill="#fff" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const TITLE_TEMPLATES = [
    (k) => `${k} 진짜 이렇게 하면 됩니다 (초보 필수)`,
    (k) => `요즘 난리 난 ${k}, 직접 해봤습니다`,
    (k) => `${k} 시작하기 전에 꼭 보세요`,
    (k) => `${k} TOP 10 한 번에 총정리`,
    (k) => `10년 차가 알려주는 ${k} 꿀팁`,
    (k) => `일주일 동안 ${k}만 해본 결과 | 브이로그`,
    (k) => `${k}로 한 달에 300 버는 법? 현실 공개`,
    (k) => `아무도 안 알려주는 ${k}의 비밀`,
    (k) => `${k} 솔직 리뷰 – 장단점 다 말합니다`,
    (k) => `${k} 실패하는 사람들의 공통점 3가지`,
    (k) => `#shorts ${k} 30초 요약`,
    (k) => `${k} 입문 가이드 2026 최신판`,
    (k) => `${k} 할 때 제일 많이 하는 실수`,
    (k) => `구독자 질문 폭주한 ${k} Q&A`,
    (k) => `${k} 비교 끝판왕, 이거 하나면 됩니다`,
    (k) => `${k} 하루 루틴 공개 (현실 버전)`,
    (k) => `[${k}] 이건 몰랐죠? 숨은 기능 모음`,
    (k) => `처음 ${k} 하는 분들 무조건 보세요`,
    (k) => `${k} 가성비 추천 BEST 5`,
    (k) => `#shorts ${k} 이거 하나만 기억하세요`,
  ];
  const KEYWORD_SUFFIXES = ['추천', '방법', '초보', '비교', '후기', '브이로그', '꿀팁', '장단점', '가성비', '루틴', '실수', '입문', '리뷰', '현실', '수익', '공부', '정리', '챌린지', '하는 법', '쇼츠'];
  const CH_PREFIX = ['일상', '데일리', '하루', '찐', '오늘의', '슬기로운', '똑똑한', '떠나는', '먹는', '성장하는', '주말', '퇴근후', '반짝', '느린', '알찬'];
  const CH_SUFFIX = ['연구소', 'TV', '로그', '채널', '스튜디오', '클래스', '랩', '다이어리', '라이프', '하우스', '노트', '튜브'];
  const HOT_TOPICS = ['아이돌 컴백', '야구 하이라이트', '먹방', '게임 공략', '자취 요리', '주식 뉴스', '여행 브이로그', '예능 클립', '운동 루틴', '테크 리뷰', '반려견', '드라마 요약'];

  const registry = loadRegistry();
  function loadRegistry() {
    try { return JSON.parse(localStorage.getItem('viewradar:demoChannels') || '{}'); } catch (e) { return {}; }
  }
  function saveRegistry() {
    try {
      const keys = Object.keys(registry);
      if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete registry[k]);
      localStorage.setItem('viewradar:demoChannels', JSON.stringify(registry));
    } catch (e) { /* 무시 */ }
  }

  function makeChannel(seed, titleHint) {
    const r = rng('ch' + seed);
    const id = idFrom('UC', 'ch' + seed, 24);
    if (registry[id]) return registry[id];
    const title = titleHint || r.pick(CH_PREFIX) + ' ' + r.pick(CH_SUFFIX);
    const subs = Math.round(Math.min(9e6, Math.max(300, r.logn(40000, 1.6))));
    const videoCount = r.int(15, 1400);
    const avg = Math.max(80, subs * r.logn(0.25, 0.9));
    const ch = {
      id, title, handle: '@' + idFrom('', 'h' + seed, 8).toLowerCase().replace(/[-_]/g, 'x'),
      description: `${title}에 오신 것을 환영합니다. (데모 데이터)`,
      thumbnail: thumb('c' + seed, title.slice(0, 2), 120, 120),
      publishedAt: new Date(Date.now() - r.int(200, 4200) * 86400000).toISOString(),
      country: 'KR', subscriberCount: subs, hiddenSubscriberCount: false,
      viewCount: Math.round(avg * videoCount), videoCount, uploadsPlaylist: 'UU' + id.slice(2), url: '#', demo: true,
    };
    registry[id] = ch;
    return ch;
  }

  function makeVideo(r, k, channel, opts, idx) {
    const tpl = r.pick(TITLE_TEMPLATES);
    const title = tpl(k);
    const isShort = /#shorts/.test(title) || r() < 0.12;
    let durationSec = isShort ? r.int(12, 59) : r() < 0.6 ? r.int(240, 1200) : r.int(1201, 3600);
    if (opts.duration === 'short' && durationSec >= 240) durationSec = r.int(20, 230);
    if (opts.duration === 'medium' && (durationSec < 240 || durationSec > 1200)) durationSec = r.int(240, 1200);
    if (opts.duration === 'long' && durationSec <= 1200) durationSec = r.int(1201, 3600);
    const maxAge = { week: 7, month: 30, quarter: 90, year: 365 }[opts.period] || 720;
    const age = Math.max(0.1, maxAge * Math.pow(r(), 2.4));
    const avg = channel.viewCount / channel.videoCount;
    let views = Math.round(avg * r.logn(1, 1.25) * Math.min(1, 0.25 + age / 20));
    if (r() < 0.06) views *= r.int(6, 25);
    views = Math.max(40, views);
    const id = idFrom('', 'v' + k + idx + channel.id, 11);
    const tags = [k].concat(Array.from({ length: r.int(2, 5) }, () => k + ' ' + r.pick(KEYWORD_SUFFIXES)));
    return {
      id, title, description: `${k} 관련 영상입니다. (데모 데이터)`, channelId: channel.id, channelTitle: channel.title,
      publishedAt: new Date(Date.now() - age * 86400000).toISOString(),
      thumbnail: thumb(id, k, 320, 180), tags, categoryId: '22', durationSec, hasCaption: r() < 0.3,
      viewCount: views, likeCount: Math.round(views * r.logn(0.022, 0.5)), commentCount: Math.round(views * r.logn(0.0012, 0.7)),
      url: '#', demo: true,
    };
  }

  function sortVideos(list, order) {
    if (order === 'viewCount') list.sort((a, b) => b.viewCount - a.viewCount);
    else if (order === 'date') list.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    return list;
  }

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  function create() {
    return {
      mode: 'demo',
      async searchVideos({ q, order, period, duration, pageToken }) {
        await delay(350);
        const page = pageToken ? +pageToken.slice(1) : 1;
        const k = q.trim();
        const r = rng('search:' + k + ':' + page + ':' + period + ':' + duration);
        const pool = Array.from({ length: 28 }, (_, i) => makeChannel(k + ':' + i));
        const videos = Array.from({ length: 50 }, (_, i) => makeVideo(r, k, r.pick(pool), { period, duration }, page * 100 + i));
        saveRegistry();
        sortVideos(videos, order);
        const channels = Object.fromEntries(pool.map((c) => [c.id, c]));
        return { videos, channels, nextPageToken: page < 4 ? 'p' + (page + 1) : null, totalResults: 200 };
      },
      async hotVideos({ pageToken }) {
        await delay(300);
        const page = pageToken ? +pageToken.slice(1) : 1;
        const day = new Date().toISOString().slice(0, 10);
        const r = rng('hot:' + day + ':' + page);
        const pool = Array.from({ length: 40 }, (_, i) => {
          const c = makeChannel('hot:' + i);
          return c;
        });
        const videos = Array.from({ length: 50 }, (_, i) => {
          const v = makeVideo(r, r.pick(HOT_TOPICS), r.pick(pool), { period: 'week' }, page * 100 + i);
          v.viewCount = Math.round(v.viewCount * r.int(3, 12));
          return v;
        });
        saveRegistry();
        sortVideos(videos, 'viewCount');
        return { videos, channels: Object.fromEntries(pool.map((c) => [c.id, c])), nextPageToken: page < 2 ? 'p' + (page + 1) : null };
      },
      async searchChannels({ q, pageToken }) {
        await delay(300);
        const page = pageToken ? +pageToken.slice(1) : 1;
        const k = q.trim();
        const r = rng('chsearch:' + k + page);
        const channels = Array.from({ length: 30 }, (_, i) => {
          const name = r() < 0.5 ? k + ' ' + r.pick(CH_SUFFIX) : r.pick(CH_PREFIX) + ' ' + k;
          return makeChannel('cs:' + k + ':' + page + ':' + i, name);
        });
        saveRegistry();
        return { channels, nextPageToken: page < 3 ? 'p' + (page + 1) : null };
      },
      async resolveChannel(input) {
        await delay(200);
        const s = String(input || '').trim();
        const m = /(UC[\w-]{22})/.exec(s);
        if (m && registry[m[1]]) return registry[m[1]];
        const name = s.replace(/^https?:\/\/[^/]+\//, '').replace(/^@/, '').replace(/^channel\//, '') || '데모 채널';
        const c = makeChannel('resolve:' + name, name);
        saveRegistry();
        return c;
      },
      async channelVideos(channelId, max) {
        await delay(350);
        const channel = registry[channelId] || makeChannel('fallback:' + channelId);
        const r = rng('uploads:' + channelId);
        const topic = channel.title.replace(/\s*(TV|로그|채널|연구소|스튜디오|클래스|랩|다이어리|라이프|하우스|노트|튜브)$/, '') || '일상';
        const n = Math.min(max || 50, channel.videoCount);
        let t = r.int(0, 3);
        const videos = Array.from({ length: n }, (_, i) => {
          const v = makeVideo(r, topic, channel, {}, i);
          t += r.logn(4, 0.6);
          v.publishedAt = new Date(Date.now() - t * 86400000).toISOString();
          return v;
        });
        return { channel, videos };
      },
      async test() { return true; },
    };
  }

  window.VR = window.VR || {};
  window.VR.demo = { create, KEYWORD_SUFFIXES };
})();
