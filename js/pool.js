/* 누적 표본(IndexedDB): 검색·핫 비디오·채널 분석으로 불러온 영상과 채널을 쌓아 두고 아웃라이어 찾기에 쓴다.
 * 실제 데이터와 데모 데이터는 서로 다른 DB에 저장한다. IndexedDB를 못 쓰면 이번 방문 동안만 메모리에 둔다.
 */
(function () {
  const STORES = ['videos', 'channels'];
  const opened = {};
  const memory = {}; // IndexedDB를 못 쓸 때의 대체 저장소
  const cache = {}; // mode -> Promise<{ videos: Map, channels: Map, persistent }>

  function open(mode) {
    if (opened[mode]) return opened[mode];
    opened[mode] = new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open('viewradar-pool-' + mode, 1);
        req.onupgradeneeded = () => STORES.forEach((s) => { if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' }); });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return opened[mode];
  }

  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function compactVideo(v, now) {
    return {
      id: v.id, title: v.title, channelId: v.channelId, channelTitle: v.channelTitle, publishedAt: v.publishedAt,
      thumbnail: v.thumbnail, tags: (v.tags || []).slice(0, 12), categoryId: v.categoryId || '', durationSec: v.durationSec || 0,
      hasCaption: !!v.hasCaption, viewCount: v.viewCount || 0, likeCount: v.likeCount || 0, commentCount: v.commentCount || 0,
      url: v.url, demo: !!v.demo, fetchedAt: now,
    };
  }
  function compactChannel(c, now) {
    return {
      id: c.id, title: c.title, handle: c.handle || '', thumbnail: c.thumbnail || '', publishedAt: c.publishedAt, country: c.country || '',
      subscriberCount: c.subscriberCount || 0, hiddenSubscriberCount: !!c.hiddenSubscriberCount, viewCount: c.viewCount || 0,
      videoCount: c.videoCount || 0, url: c.url, demo: !!c.demo, fetchedAt: now,
    };
  }

  /** 전체 표본을 읽는다(처음 한 번만 DB에서 읽고 이후에는 메모리 캐시). */
  function load(mode) {
    if (!cache[mode]) {
      cache[mode] = (async () => {
        const db = await open(mode);
        if (!db && memory[mode]) return memory[mode];
        const out = { videos: new Map(), channels: new Map(), persistent: !!db };
        if (db) {
          for (const s of STORES) {
            const rows = await new Promise((resolve) => {
              const req = db.transaction(s, 'readonly').objectStore(s).getAll();
              req.onsuccess = () => resolve(req.result || []);
              req.onerror = () => resolve([]);
            });
            rows.forEach((r) => out[s].set(r.id, r));
          }
        } else {
          memory[mode] = out;
        }
        return out;
      })();
    }
    return cache[mode];
  }

  /** 영상과 채널을 표본에 더한다(같은 영상은 최신 수치로 덮어쓴다). channels는 { id: channel } 객체. */
  async function add(mode, videos, channels) {
    const now = Date.now();
    const vs = (videos || []).filter((v) => v && v.id && v.channelId).map((v) => compactVideo(v, now));
    const cs = Object.values(channels || {}).filter((c) => c && c.id).map((c) => compactChannel(c, now));
    if (!vs.length && !cs.length) return;
    const p = await load(mode);
    vs.forEach((v) => p.videos.set(v.id, v));
    cs.forEach((c) => p.channels.set(c.id, c));
    const db = await open(mode);
    if (!db) return;
    try {
      const tx = db.transaction(STORES, 'readwrite');
      const vStore = tx.objectStore('videos'), cStore = tx.objectStore('channels');
      vs.forEach((v) => vStore.put(v));
      cs.forEach((c) => cStore.put(c));
      await done(tx);
    } catch (e) {
      console.warn('표본 저장 실패', e);
    }
  }

  async function clear(mode) {
    delete cache[mode];
    delete memory[mode];
    const db = await open(mode);
    if (!db) return;
    const tx = db.transaction(STORES, 'readwrite');
    STORES.forEach((s) => tx.objectStore(s).clear());
    await done(tx).catch(() => {});
  }

  async function stats(mode) {
    const p = await load(mode);
    return { videos: p.videos.size, channels: p.channels.size, persistent: p.persistent };
  }

  window.VR = window.VR || {};
  window.VR.pool = { load, add, clear, stats };
})();
