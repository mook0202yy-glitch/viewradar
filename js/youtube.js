/* YouTube Data API v3 공급자. 데모 공급자(demo.js)와 같은 인터페이스를 가진다.
 * 할당량(기본 일 10,000 유닛): search.list = 100, videos/channels/playlistItems.list = 1
 */
(function () {
  const BASE = 'https://www.googleapis.com/youtube/v3/';
  const { parseISODuration } = window.VR.fmt;

  function ApiError(message, reason) {
    const e = new Error(message);
    e.reason = reason;
    return e;
  }

  // ---------- 할당량 추정(이 브라우저에서 보낸 요청 기준, 태평양 시간 자정에 초기화) ----------
  const COST = { search: 100 };
  function ptDay() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function track(endpoint) {
    const store = window.VR.store;
    if (!store) return;
    const d = ptDay();
    const q = store.get('quota', {});
    const used = (q.day === d ? q.used : 0) + (COST[endpoint] || 1);
    store.set('quota', { day: d, used });
  }
  function quotaUsed() {
    const q = window.VR.store ? window.VR.store.get('quota', {}) : {};
    return q.day === ptDay() ? q.used : 0;
  }

  async function call(key, endpoint, params) {
    track(endpoint);
    const url = new URL(BASE + endpoint);
    Object.entries(Object.assign({}, params, { key })).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    let res;
    try {
      res = await fetch(url.toString());
    } catch (e) {
      throw ApiError('네트워크 오류로 YouTube API에 연결하지 못했습니다.', 'network');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body.error && body.error.errors && body.error.errors[0] ? body.error.errors[0].reason : 'unknown';
      const map = {
        quotaExceeded: '오늘 YouTube API 할당량을 모두 사용했습니다. 내일(태평양 시간 자정) 초기화됩니다.',
        keyInvalid: 'API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.',
        badRequest: 'API 키가 올바르지 않거나 요청이 잘못되었습니다.',
        accessNotConfigured: '이 키의 프로젝트에서 YouTube Data API v3가 활성화되지 않았습니다.',
        ipRefererBlocked: '이 키는 현재 주소에서 사용하도록 허용되지 않았습니다(키 제한 설정 확인).',
      };
      throw ApiError(map[reason] || (body.error && body.error.message) || 'YouTube API 오류 (' + res.status + ')', reason);
    }
    return body;
  }

  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function bestThumb(t) {
    if (!t) return '';
    return (t.high || t.medium || t.default || {}).url || '';
  }

  function normVideo(v) {
    const s = v.statistics || {};
    return {
      id: v.id,
      title: v.snippet.title,
      description: v.snippet.description || '',
      channelId: v.snippet.channelId,
      channelTitle: v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt,
      thumbnail: bestThumb(v.snippet.thumbnails),
      tags: v.snippet.tags || [],
      categoryId: v.snippet.categoryId,
      durationSec: parseISODuration(v.contentDetails && v.contentDetails.duration),
      hasCaption: v.contentDetails && v.contentDetails.caption === 'true',
      viewCount: +s.viewCount || 0,
      likeCount: +s.likeCount || 0,
      commentCount: +s.commentCount || 0,
      url: 'https://www.youtube.com/watch?v=' + v.id,
    };
  }

  function normChannel(c) {
    const s = c.statistics || {};
    return {
      id: c.id,
      title: c.snippet.title,
      handle: c.snippet.customUrl || '',
      description: c.snippet.description || '',
      thumbnail: bestThumb(c.snippet.thumbnails),
      publishedAt: c.snippet.publishedAt,
      country: c.snippet.country || '',
      subscriberCount: +s.subscriberCount || 0,
      hiddenSubscriberCount: !!s.hiddenSubscriberCount,
      viewCount: +s.viewCount || 0,
      videoCount: +s.videoCount || 0,
      uploadsPlaylist: c.contentDetails && c.contentDetails.relatedPlaylists ? c.contentDetails.relatedPlaylists.uploads : '',
      url: 'https://www.youtube.com/channel/' + c.id,
    };
  }

  async function videosByIds(key, ids) {
    const out = [];
    for (const group of chunk(ids, 50)) {
      const r = await call(key, 'videos', { part: 'snippet,statistics,contentDetails', id: group.join(','), maxResults: 50 });
      out.push(...r.items.map(normVideo));
    }
    return out;
  }

  async function channelsByIds(key, ids) {
    const out = [];
    for (const group of chunk([...new Set(ids)], 50)) {
      const r = await call(key, 'channels', { part: 'snippet,statistics,contentDetails', id: group.join(','), maxResults: 50 });
      out.push(...r.items.map(normChannel));
    }
    return out;
  }

  async function withChannels(key, videos) {
    const chans = await channelsByIds(key, videos.map((v) => v.channelId));
    const byId = Object.fromEntries(chans.map((c) => [c.id, c]));
    return { videos, channels: byId };
  }

  function periodToDate(period) {
    const days = { week: 7, month: 30, quarter: 90, year: 365 }[period];
    if (!days) return undefined;
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  function create(key) {
    return {
      mode: 'api',
      async searchVideos({ q, region, order, period, duration, pageToken }) {
        const r = await call(key, 'search', {
          part: 'snippet', type: 'video', q, maxResults: 50, regionCode: region,
          relevanceLanguage: region === 'KR' ? 'ko' : undefined,
          order: order || 'relevance', publishedAfter: periodToDate(period),
          videoDuration: duration && duration !== 'any' ? duration : undefined, pageToken,
        });
        const ids = r.items.map((i) => i.id.videoId).filter(Boolean);
        const videos = ids.length ? await videosByIds(key, ids) : [];
        const res = await withChannels(key, videos);
        res.nextPageToken = r.nextPageToken || null;
        res.totalResults = r.pageInfo ? r.pageInfo.totalResults : videos.length;
        return res;
      },
      /** 인기 급상승 차트. category를 주면 그 카테고리의 인기 영상(카테고리마다 최대 200개). */
      async hotVideos({ region, category, pageToken }) {
        const r = await call(key, 'videos', { part: 'snippet,statistics,contentDetails', chart: 'mostPopular', regionCode: region, videoCategoryId: category || undefined, maxResults: 50, pageToken });
        const res = await withChannels(key, (r.items || []).map(normVideo));
        res.nextPageToken = r.nextPageToken || null;
        return res;
      },
      /** 이 국가에서 쓸 수 있는 영상 카테고리 목록 */
      async categories(region) {
        const r = await call(key, 'videoCategories', { part: 'snippet', regionCode: region, hl: 'ko' });
        return (r.items || []).filter((c) => c.snippet && c.snippet.assignable).map((c) => ({ id: c.id, title: c.snippet.title }));
      },
      async searchChannels({ q, region, pageToken }) {
        const r = await call(key, 'search', { part: 'snippet', type: 'channel', q, maxResults: 50, regionCode: region, pageToken });
        const ids = r.items.map((i) => i.id.channelId || i.snippet.channelId).filter(Boolean);
        const channels = ids.length ? await channelsByIds(key, ids) : [];
        const order = Object.fromEntries(ids.map((id, i) => [id, i]));
        channels.sort((a, b) => order[a.id] - order[b.id]);
        return { channels, nextPageToken: r.nextPageToken || null };
      },
      async resolveChannel(input) {
        const s = String(input || '').trim();
        let m;
        let params = null;
        let q = s.replace(/^@/, '');
        if ((m = /channel\/(UC[\w-]{22})/.exec(s)) || (m = /^(UC[\w-]{22})$/.exec(s))) params = { id: m[1] };
        else if ((m = /youtube\.com\/(@[^/?#\s]+)/.exec(s)) || (m = /^(@[^/?#\s]+)$/.exec(s))) params = { forHandle: decodeURIComponent(m[1]) };
        else if ((m = /youtube\.com\/user\/([^/?#\s]+)/.exec(s))) params = { forUsername: decodeURIComponent(m[1]) };
        else if ((m = /youtube\.com\/c\/([^/?#\s]+)/.exec(s))) q = decodeURIComponent(m[1]);
        if (params) {
          const r = await call(key, 'channels', Object.assign({ part: 'snippet,statistics,contentDetails' }, params));
          if (r.items && r.items.length) return normChannel(r.items[0]);
          if (params.forHandle) q = params.forHandle.replace(/^@/, '');
          else if (params.forUsername) q = params.forUsername;
        }
        const r = await call(key, 'search', { part: 'snippet', type: 'channel', q, maxResults: 1 });
        if (!r.items.length) throw ApiError('채널을 찾지 못했습니다: ' + s, 'notFound');
        const [c] = await channelsByIds(key, [r.items[0].id.channelId]);
        return c;
      },
      async channelVideos(channelId, max) {
        const [channel] = await channelsByIds(key, [channelId]);
        if (!channel) throw ApiError('채널 정보를 불러오지 못했습니다.', 'notFound');
        const ids = [];
        let pageToken;
        while (channel.uploadsPlaylist && channel.videoCount > 0 && ids.length < (max || 50)) {
          let r;
          try {
            r = await call(key, 'playlistItems', { part: 'contentDetails', playlistId: channel.uploadsPlaylist, maxResults: 50, pageToken });
          } catch (e) {
            if (e.reason === 'playlistNotFound') break; // 공개 업로드가 없는 채널
            throw e;
          }
          ids.push(...r.items.map((i) => i.contentDetails.videoId));
          pageToken = r.nextPageToken;
          if (!pageToken) break;
        }
        const videos = ids.length ? await videosByIds(key, ids.slice(0, max || 50)) : [];
        return { channel, videos };
      },
      async test() {
        await call(key, 'videos', { part: 'id', chart: 'mostPopular', regionCode: 'KR', maxResults: 1 });
        return true;
      },
    };
  }

  window.VR = window.VR || {};
  window.VR.youtube = { create, quotaUsed, DAILY_QUOTA: 10000 };
})();
