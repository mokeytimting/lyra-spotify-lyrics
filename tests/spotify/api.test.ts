import { test, expect, vi, beforeEach, afterEach, describe } from 'vitest';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

let api: any;
let search: any;
let getPlaybackState: any;
let getPlaylistItems: any;
let getMyPlaylists: any;
let getSavedTracks: any;
let transferPlayback: any;
let play: any;
let pause: any;
let next: any;
let previous: any;
let seek: any;
let setVolume: any;
let QuotaExceededError: any;
let NoActiveDeviceError: any;
let NotOwnedError: any;

type MockResponse = {
  status: number;
  ok: boolean;
  json: () => Promise<any>;
  headers: { get: (name: string) => string | null };
};

function findHeader(headers: Record<string, string>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return null;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): MockResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: { get: (name: string) => findHeader(headers, name) },
  };
}

function emptyResponse(status: number, headers: Record<string, string> = {}): MockResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => { throw new Error('no body'); },
    headers: { get: (name: string) => findHeader(headers, name) },
  };
}

function setupFetch(handler: (url: string, init: RequestInit) => MockResponse | Promise<MockResponse>) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : (input && (input as any).url) ? String((input as any).url) : String(input);
    calls.push({ url, init });
    return handler(url, init);
  }));
}

function getHeader(init: RequestInit, name: string): string | null {
  const h: any = init.headers;
  if (!h) return null;
  if (typeof Headers !== 'undefined' && h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) {
    for (const [k, v] of h) if (String(k).toLowerCase() === name.toLowerCase()) return String(v);
    return null;
  }
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === name.toLowerCase()) return String(h[k]);
  }
  return null;
}

function trackJson(overrides: any = {}) {
  return {
    type: 'track',
    id: 'track1',
    uri: 'spotify:track:track1',
    name: 'Song',
    artists: [{ name: 'A1' }, { name: 'A2' }],
    album: {
      name: 'Album',
      images: [
        { url: 'small', width: 64 },
        { url: 'big', width: 640 },
        { url: 'mid', width: 300 },
      ],
    },
    duration_ms: 123456,
    ...overrides,
  };
}

function callsTo(pathname: string): number {
  return calls.filter((c) => {
    try {
      return new URL(c.url).pathname === pathname;
    } catch {
      return false;
    }
  }).length;
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('spl.tokens', JSON.stringify({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Date.now() + 3_600_000,
  }));

  vi.resetModules();
  api = await import('../../src/spotify/api');
  search = api.search;
  getPlaybackState = api.getPlaybackState;
  getPlaylistItems = api.getPlaylistItems;
  getMyPlaylists = api.getMyPlaylists;
  getSavedTracks = api.getSavedTracks;
  transferPlayback = api.transferPlayback;
  play = api.play;
  pause = api.pause;
  next = api.next;
  previous = api.previous;
  seek = api.seek;
  setVolume = api.setVolume;
  QuotaExceededError = api.QuotaExceededError;
  NoActiveDeviceError = api.NoActiveDeviceError;
  NotOwnedError = api.NotOwnedError;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('export 三個 error class：QuotaExceededError / NoActiveDeviceError / NotOwnedError', () => {
  expect(typeof QuotaExceededError).toBe('function');
  expect(typeof NoActiveDeviceError).toBe('function');
  expect(typeof NotOwnedError).toBe('function');
  expect(new QuotaExceededError('x')).toBeInstanceOf(Error);
  expect(new NoActiveDeviceError('x')).toBeInstanceOf(Error);
  expect(new NotOwnedError('x')).toBeInstanceOf(Error);
});

test('所有請求以 https://api.spotify.com/v1 為 base', async () => {
  setupFetch(() => jsonResponse({ tracks: { items: [] }, playlists: { items: [] }, albums: { items: [] } }));
  await search('x');
  expect(calls[0].url.startsWith('https://api.spotify.com/v1/')).toBe(true);
});

test('請求帶 Authorization: Bearer <access token>', async () => {
  setupFetch(() => jsonResponse({ tracks: { items: [] }, playlists: { items: [] }, albums: { items: [] } }));
  await search('x');
  expect(getHeader(calls[0].init, 'Authorization')).toBe('Bearer test-access-token');
});

test('search 送出的 limit 固定為 10', async () => {
  setupFetch(() => jsonResponse({ tracks: { items: [] }, playlists: { items: [] }, albums: { items: [] } }));
  await search('hello');
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/search');
  expect(u.searchParams.get('limit')).toBe('10');
  expect(u.searchParams.get('q')).toBe('hello');
});

test('search 有 offset 時會帶上 offset，但 limit 仍為 10', async () => {
  setupFetch(() => jsonResponse({ tracks: { items: [] }, playlists: { items: [] }, albums: { items: [] } }));
  await search('hello', 20);
  const u = new URL(calls[0].url);
  expect(u.searchParams.get('limit')).toBe('10');
  expect(u.searchParams.get('offset')).toBe('20');
});

test('search 回傳 { tracks, playlists, albums } 三塊', async () => {
  setupFetch(() => jsonResponse({
    tracks: { items: [trackJson()] },
    playlists: { items: [{ id: 'p1', uri: 'spotify:playlist:p1', name: 'P', images: [{ url: 'http://p', width: 300 }] }] },
    albums: { items: [{ uri: 'spotify:album:a1', name: 'A', artists: [{ name: 'Art' }], images: [{ url: 'http://a', width: 640 }] }] },
  }));
  const res = await search('x');
  expect(res.tracks).toHaveLength(1);
  expect(res.playlists).toHaveLength(1);
  expect(res.albums).toHaveLength(1);
  expect(res.albums[0].artist).toBe('Art');
});

test('getPlaybackState 遇到 204 回傳 null', async () => {
  setupFetch(() => emptyResponse(204));
  expect(await getPlaybackState()).toBeNull();
});

test('getPlaybackState 對應 PlaybackState 欄位（item/progress_ms/is_playing/device）', async () => {
  setupFetch(() => jsonResponse({
    item: trackJson(),
    progress_ms: 5000,
    is_playing: true,
    device: { id: 'dev1', name: 'My Device' },
    timestamp: 9999999999,
  }));
  const before = performance.now();
  const s = await getPlaybackState();
  const after = performance.now();
  expect(s).toBeTruthy();
  expect(s.track.id).toBe('track1');
  expect(s.positionMs).toBe(5000);
  expect(s.isPlaying).toBe(true);
  expect(s.deviceId).toBe('dev1');
  expect(s.deviceName).toBe('My Device');
  expect(typeof s.timestamp).toBe('number');
  expect(s.timestamp).toBeGreaterThanOrEqual(before - 500);
  expect(s.timestamp).toBeLessThanOrEqual(after + 500);
});

test('getPlaybackState item 為 null 時 track 為 null', async () => {
  setupFetch(() => jsonResponse({
    item: null,
    progress_ms: 0,
    is_playing: false,
    device: null,
    timestamp: 0,
  }));
  const s = await getPlaybackState();
  expect(s).toBeTruthy();
  expect(s.track).toBeNull();
  expect(s.deviceId).toBeNull();
  expect(s.deviceName).toBeNull();
});

test('getPlaybackState item 非 track 類型（episode）時 track 為 null', async () => {
  setupFetch(() => jsonResponse({
    item: { type: 'episode', id: 'ep1', name: 'Ep', uri: 'spotify:episode:ep1' },
    progress_ms: 0,
    is_playing: true,
    device: { id: 'd', name: 'D' },
  }));
  const s = await getPlaybackState();
  expect(s).toBeTruthy();
  expect(s.track).toBeNull();
});

test('getPlaylistItems 呼叫 GET /v1/playlists/{id}/items', async () => {
  setupFetch(() => jsonResponse({ items: [], next: null }));
  await getPlaylistItems('pl1');
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/playlists/pl1/items');
});

test('getPlaylistItems 403 丟 NotOwnedError', async () => {
  setupFetch(() => jsonResponse({ error: { status: 403, message: 'Forbidden' } }, 403));
  await expect(getPlaylistItems('pl1')).rejects.toThrow(NotOwnedError);
});

test('getPlaylistItems 相容 2026 新格式 items[].item', async () => {
  setupFetch(() => jsonResponse({
    items: [{ item: trackJson({ id: 't-new' }) }],
    next: null,
  }));
  const r = await getPlaylistItems('p');
  expect(r.tracks).toHaveLength(1);
  expect(r.tracks[0].id).toBe('t-new');
});

test('getPlaylistItems 相容舊格式 items[].track', async () => {
  setupFetch(() => jsonResponse({
    items: [{ track: trackJson({ id: 't-old' }) }],
    next: null,
  }));
  const r = await getPlaylistItems('p');
  expect(r.tracks).toHaveLength(1);
  expect(r.tracks[0].id).toBe('t-old');
});

test('getPlaylistItems next 轉為布林', async () => {
  setupFetch(() => jsonResponse({ items: [], next: 'https://api.spotify.com/v1/playlists/p/items?offset=100' }));
  const r1 = await getPlaylistItems('p');
  expect(r1.next).toBe(true);
  setupFetch(() => jsonResponse({ items: [], next: null }));
  const r2 = await getPlaylistItems('p');
  expect(r2.next).toBe(false);
});

test('getPlaylistItems 有 offset 時帶上 offset', async () => {
  setupFetch(() => jsonResponse({ items: [], next: null }));
  await getPlaylistItems('p', 50);
  const u = new URL(calls[0].url);
  expect(u.searchParams.get('offset')).toBe('50');
});

test('getMyPlaylists：owned 依 owner.id 與 collaborative 判定，且 /me 使用者 id 只抓一次', async () => {
  let meCalls = 0;
  setupFetch((url) => {
    const u = new URL(url);
    if (u.pathname === '/v1/me') {
      meCalls++;
      return jsonResponse({ id: 'me-id' });
    }
    if (u.pathname === '/v1/me/playlists') {
      return jsonResponse({
        items: [
          { id: 'p1', uri: 'spotify:playlist:p1', name: 'Mine', owner: { id: 'me-id' }, images: [] },
          { id: 'p2', uri: 'spotify:playlist:p2', name: 'Collab', owner: { id: 'other' }, collaborative: true, images: [] },
          { id: 'p3', uri: 'spotify:playlist:p3', name: 'Other', owner: { id: 'other' }, images: [] },
        ],
        next: null,
      });
    }
    return jsonResponse({}, 404);
  });
  const r = await getMyPlaylists();
  expect(r.playlists).toHaveLength(3);
  expect(r.playlists[0].owned).toBe(true);
  expect(r.playlists[1].owned).toBe(true);
  expect(r.playlists[2].owned).toBe(false);
  expect(r.next).toBe(false);

  await getMyPlaylists();
  expect(meCalls).toBe(1);
});

test('getSavedTracks 呼叫 /v1/me/tracks 且 limit=50', async () => {
  setupFetch(() => jsonResponse({ items: [], next: null }));
  await getSavedTracks();
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/tracks');
  expect(u.searchParams.get('limit')).toBe('50');
});

test('getSavedTracks 帶 offset 參數', async () => {
  setupFetch(() => jsonResponse({ items: [], next: null }));
  await getSavedTracks(100);
  const u = new URL(calls[0].url);
  expect(u.searchParams.get('offset')).toBe('100');
  expect(u.searchParams.get('limit')).toBe('50');
});

test('getSavedTracks 將 items[].track 對應成 Track（artists / album / imageUrl 最大張）', async () => {
  setupFetch(() => jsonResponse({
    items: [{ track: trackJson() }],
    next: null,
  }));
  const r = await getSavedTracks();
  expect(r.tracks).toHaveLength(1);
  const t = r.tracks[0];
  expect(t.id).toBe('track1');
  expect(t.uri).toBe('spotify:track:track1');
  expect(t.name).toBe('Song');
  expect(t.artists).toEqual(['A1', 'A2']);
  expect(t.album).toBe('Album');
  expect(t.durationMs).toBe(123456);
  expect(t.imageUrl).toBe('big');
});

test('getSavedTracks：album.images 為空時 imageUrl 為 null', async () => {
  setupFetch(() => jsonResponse({
    items: [{ track: trackJson({ album: { name: 'A', images: [] } }) }],
    next: null,
  }));
  const r = await getSavedTracks();
  expect(r.tracks[0].imageUrl).toBeNull();
});

test('getSavedTracks next 轉為布林', async () => {
  setupFetch(() => jsonResponse({ items: [], next: 'https://api.spotify.com/v1/me/tracks?offset=50' }));
  const r1 = await getSavedTracks();
  expect(r1.next).toBe(true);
  setupFetch(() => jsonResponse({ items: [], next: null }));
  const r2 = await getSavedTracks();
  expect(r2.next).toBe(false);
});

test('play 帶 deviceId 時 URL 含 device_id，方法為 PUT，路徑 /v1/me/player/play', async () => {
  setupFetch(() => emptyResponse(204));
  await play({ deviceId: 'd1', uris: ['spotify:track:x'] });
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/player/play');
  expect(u.searchParams.get('device_id')).toBe('d1');
  expect((calls[0].init.method ?? '').toUpperCase()).toBe('PUT');
});

test('play 不帶 deviceId 時 URL 不含 device_id', async () => {
  setupFetch(() => emptyResponse(204));
  await play({ uris: ['spotify:track:x'] });
  const u = new URL(calls[0].url);
  expect(u.searchParams.get('device_id')).toBeNull();
});

test('pause 呼叫 PUT /v1/me/player/pause', async () => {
  setupFetch(() => emptyResponse(204));
  await pause();
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/player/pause');
  expect((calls[0].init.method ?? '').toUpperCase()).toBe('PUT');
});

test('next 呼叫 POST /v1/me/player/next', async () => {
  setupFetch(() => emptyResponse(204));
  await next();
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/player/next');
  expect((calls[0].init.method ?? '').toUpperCase()).toBe('POST');
});

test('previous 呼叫 POST /v1/me/player/previous', async () => {
  setupFetch(() => emptyResponse(204));
  await previous();
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/player/previous');
  expect((calls[0].init.method ?? '').toUpperCase()).toBe('POST');
});

test('seek 呼叫 PUT /v1/me/player/seek 並帶 position_ms', async () => {
  setupFetch(() => emptyResponse(204));
  await seek(12345);
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/player/seek');
  expect(u.searchParams.get('position_ms')).toBe('12345');
  expect((calls[0].init.method ?? '').toUpperCase()).toBe('PUT');
});

test('setVolume 呼叫 PUT /v1/me/player/volume 並帶 volume_percent', async () => {
  setupFetch(() => emptyResponse(204));
  await setVolume(50);
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/player/volume');
  expect(u.searchParams.get('volume_percent')).toBe('50');
  expect((calls[0].init.method ?? '').toUpperCase()).toBe('PUT');
});

test('transferPlayback 呼叫 PUT /v1/me/player 並帶 device_ids 與 play', async () => {
  setupFetch(() => emptyResponse(204));
  await transferPlayback('d1', true);
  const u = new URL(calls[0].url);
  expect(u.pathname).toBe('/v1/me/player');
  expect((calls[0].init.method ?? '').toUpperCase()).toBe('PUT');
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ device_ids: ['d1'], play: true });
});

test('429 + reason: QUOTA_EXCEEDED 丟 QuotaExceededError 且不重試', async () => {
  setupFetch(() => jsonResponse(
    { error: { status: 429, message: 'quota', reason: 'QUOTA_EXCEEDED' } },
    429,
    { 'Retry-After': '1' },
  ));
  await expect(search('x')).rejects.toThrow(QuotaExceededError);
  expect(callsTo('/v1/search')).toBe(1);
});

test('一般 429 依 Retry-After 等待後重試一次（成功）', async () => {
  let n = 0;
  setupFetch(() => {
    n++;
    if (n === 1) {
      return jsonResponse({ error: { status: 429, message: 'rate limited' } }, 429, { 'Retry-After': '0' });
    }
    return jsonResponse({ tracks: { items: [] }, playlists: { items: [] }, albums: { items: [] } });
  });
  await search('x');
  expect(callsTo('/v1/search')).toBe(2);
});

test('一般 429 連續兩次失敗時，只重試一次後就放棄', async () => {
  setupFetch(() => jsonResponse({ error: { status: 429, message: 'rate limited' } }, 429, { 'Retry-After': '0' }));
  await expect(search('x')).rejects.toThrow();
  expect(callsTo('/v1/search')).toBe(2);
});

test('404 + reason: NO_ACTIVE_DEVICE 丟 NoActiveDeviceError（play）', async () => {
  setupFetch(() => jsonResponse(
    { error: { status: 404, message: 'no active device', reason: 'NO_ACTIVE_DEVICE' } },
    404,
  ));
  await expect(play({ uris: ['spotify:track:x'] })).rejects.toThrow(NoActiveDeviceError);
});

describe('getQueue', () => {
  test('maps queue items to tracks and skips non-tracks', async () => {
    const { getQueue } = await import('../../src/spotify/api');
    const track = (id: string) => ({
      type: 'track', id, uri: `spotify:track:${id}`, name: `Song ${id}`, duration_ms: 1000,
      artists: [{ name: 'A' }], album: { name: 'Al', images: [] },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      currently_playing: track('now'),
      queue: [track('q1'), null, track('q2')],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const q = await getQueue();
    expect(q.map((t) => t.id)).toEqual(['q1', 'q2']);
  });
});
