/* localStorage 래퍼: 설정, 수집 폴더, 등록 채널, 조회수 스냅샷 */
(function () {
  const NS = 'viewradar:';
  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
    } catch (e) {
      console.warn('저장 실패', e);
    }
  }

  // ---------- 설정 ----------
  function settings() {
    return Object.assign({ apiKey: '', region: 'KR', theme: 'auto', numeric: false, view: 'table' }, get('settings', {}));
  }
  function saveSettings(patch) {
    const s = Object.assign(settings(), patch);
    set('settings', s);
    return s;
  }

  // ---------- 수집 폴더 ----------
  function folders() {
    const f = get('folders', null);
    if (f && f.length) return f;
    const init = [{ id: 'default', name: '기본 폴더', items: [] }];
    set('folders', init);
    return init;
  }
  function saveFolders(f) { set('folders', f); }
  function addToFolder(folderId, videos) {
    const f = folders();
    const folder = f.find((x) => x.id === folderId) || f[0];
    let added = 0;
    for (const v of videos) {
      if (folder.items.some((i) => i.id === v.id)) continue;
      folder.items.unshift(Object.assign({}, v, { savedAt: new Date().toISOString(), memo: '' }));
      added++;
    }
    saveFolders(f);
    return { folder, added };
  }
  function createFolder(name) {
    const f = folders();
    const folder = { id: 'f' + Date.now().toString(36), name: name, items: [] };
    f.push(folder);
    saveFolders(f);
    return folder;
  }

  // ---------- 채널 분석 목록 ----------
  function channels() { return get('channels', []); }
  function saveChannels(c) { set('channels', c); }
  function addChannel(ch) {
    const list = channels().filter((c) => c.id !== ch.id);
    list.unshift({ id: ch.id, title: ch.title, thumbnail: ch.thumbnail, handle: ch.handle || '', addedAt: new Date().toISOString() });
    saveChannels(list.slice(0, 30));
  }

  // ---------- 조회수 스냅샷(실측 노출 속도) ----------
  const MIN_GAP_MS = 20 * 60 * 1000;
  const MAX_SNAPS = 8000;
  /** 여러 영상의 조회수를 한 번에 기록하고 { 영상ID: 실측값|null }을 돌려준다. */
  function measureMany(pairs) {
    const snaps = get('snaps', {});
    const now = Date.now();
    const out = {};
    for (const { id, views } of pairs) {
      const prev = snaps[id];
      let measured = null;
      if (prev && now - prev.t >= MIN_GAP_MS && views >= prev.v) {
        const hours = (now - prev.t) / 3600000;
        measured = { perHour: (views - prev.v) / hours, hours: hours, since: prev.t, delta: views - prev.v };
      }
      if (!prev || now - prev.t >= MIN_GAP_MS) snaps[id] = { t: now, v: views, m: measured };
      else if (prev.m) measured = prev.m;
      out[id] = measured;
    }
    const keys = Object.keys(snaps);
    if (keys.length > MAX_SNAPS) {
      keys.sort((a, b) => snaps[a].t - snaps[b].t).slice(0, keys.length - MAX_SNAPS).forEach((k) => delete snaps[k]);
    }
    set('snaps', snaps);
    return out;
  }
  function measure(videoId, views) { return measureMany([{ id: videoId, views }])[videoId]; }

  window.VR = window.VR || {};
  window.VR.store = { get, set, settings, saveSettings, folders, saveFolders, addToFolder, createFolder, channels, saveChannels, addChannel, measure, measureMany };
})();
