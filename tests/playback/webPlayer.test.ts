import { test, expect, vi, afterEach } from 'vitest';

type AnyRecord = Record<string, any>;

function makeSpotifyState(overrides: AnyRecord = {}): AnyRecord {
  const base: AnyRecord = {
    context: { uri: 'spotify:album:x', metadata: null },
    disallows: {},
    paused: false,
    position: 1234,
    repeat_mode: 0,
    shuffle: false,
    track_window: {
      current_track: {
        id: 'track-1',
        uri: 'spotify:track:track-1',
        name: 'Song',
        artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
        album: {
          name: 'Album X',
          images: [
            { url: 'small.jpg', width: 64, height: 64 },
            { url: 'large.jpg', width: 640, height: 640 },
            { url: 'medium.jpg', width: 300, height: 300 },
          ],
        },
        duration_ms: 180000,
      },
    },
  };
  return { ...base, ...overrides };
}

/**
 * 每次都重新載入模組，避免 loadSdk 的模組層級 Promise 快取跨測試殘留。
 */
async function importWebPlayer(): Promise<typeof import('../../src/playback/webPlayer')> {
  vi.resetModules();
  return import('../../src/playback/webPlayer');
}

interface FakeSdkEnv {
  appended: AnyRecord[];
  created: AnyRecord[];
  readyRef: { fn: unknown };
}

/**
 * 建立假的 window / document，避免真的插入 script（也就不會發出網路請求）。
 */
function makeFakeSdkEnv(options: { withSpotify?: boolean } = {}): FakeSdkEnv {
  const appended: AnyRecord[] = [];
  const created: AnyRecord[] = [];
  const readyRef: { fn: unknown } = { fn: null };

  const fakeWindow: AnyRecord = {};
  if (options.withSpotify === true) {
    fakeWindow.Spotify = { Player: class {} };
  }
  Object.defineProperty(fakeWindow, 'onSpotifyWebPlaybackSDKReady', {
    get: () => readyRef.fn,
    set: (fn: unknown) => {
      readyRef.fn = fn;
    },
    configurable: true,
  });

  const fakeDocument: AnyRecord = {
    createElement: (tag: string) => {
      const el: AnyRecord = { tagName: tag, src: '' };
      el.setAttribute = (name: string, value: string) => {
        if (name === 'src') el.src = value;
      };
      el.addEventListener = vi.fn();
      created.push(el);
      return el;
    },
    head: {
      appendChild: (el: AnyRecord) => {
        appended.push(el);
        return el;
      },
    },
  };

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', fakeDocument);

  return { appended, created, readyRef };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('sdkStateToPlaybackState 在 s 為 null 時回傳 null', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  expect(sdkStateToPlaybackState(null, 'dev-1', 'Device One', 12345)).toBeNull();
});

test('sdkStateToPlaybackState 將正常的 PlaybackState 對應成 Track 與各欄位', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  const now = 9999;
  const result = sdkStateToPlaybackState(
    makeSpotifyState() as any,
    'dev-1',
    'Device One',
    now,
  );

  expect(result).not.toBeNull();
  expect(result?.positionMs).toBe(1234);
  expect(result?.isPlaying).toBe(true);
  expect(result?.deviceId).toBe('dev-1');
  expect(result?.deviceName).toBe('Device One');
  expect(result?.timestamp).toBe(now);

  const track = result?.track ?? null;
  expect(track).not.toBeNull();
  expect(track?.id).toBe('track-1');
  expect(track?.uri).toBe('spotify:track:track-1');
  expect(track?.name).toBe('Song');
  expect(track?.artists).toEqual(['Artist A', 'Artist B']);
  expect(track?.album).toBe('Album X');
  expect(track?.durationMs).toBe(180000);
  expect(track?.imageUrl).toBe('large.jpg');
});

test('sdkStateToPlaybackState 在 paused 為 true 時 isPlaying 為 false', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  const result = sdkStateToPlaybackState(
    makeSpotifyState({ paused: true }) as any,
    'd',
    'n',
    0,
  );
  expect(result).not.toBeNull();
  expect(result?.isPlaying).toBe(false);
});

test('sdkStateToPlaybackState 在 current_track.id 為 null 時 track 為 null', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  const s = makeSpotifyState();
  s.track_window.current_track.id = null;
  const result = sdkStateToPlaybackState(s as any, 'd', 'n', 0);
  expect(result).not.toBeNull();
  expect(result?.track).toBeNull();
});

test('sdkStateToPlaybackState 在圖片沒有 width 時取第一張', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  const s = makeSpotifyState();
  s.track_window.current_track.album.images = [{ url: 'a.jpg' }, { url: 'b.jpg' }];
  const result = sdkStateToPlaybackState(s as any, 'd', 'n', 0);
  expect(result).not.toBeNull();
  expect(result?.track).not.toBeNull();
  expect(result?.track?.imageUrl).toBe('a.jpg');
});

test('sdkStateToPlaybackState 在 album 沒有圖片時 imageUrl 為 null', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  const s = makeSpotifyState();
  s.track_window.current_track.album.images = [];
  const result = sdkStateToPlaybackState(s as any, 'd', 'n', 0);
  expect(result).not.toBeNull();
  expect(result?.track).not.toBeNull();
  expect(result?.track?.imageUrl).toBeNull();
});

test('sdkStateToPlaybackState 保留 position 為 0 的邊界值', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  const result = sdkStateToPlaybackState(
    makeSpotifyState({ position: 0 }) as any,
    'd',
    'n',
    0,
  );
  expect(result).not.toBeNull();
  expect(result?.positionMs).toBe(0);
});

test('loadSdk 只插入一個 script 標籤，重複呼叫回傳同一個 Promise，並在 ready 後完成', async () => {
  const env = makeFakeSdkEnv();
  const { loadSdk } = await importWebPlayer();

  const p1 = loadSdk();
  const p2 = loadSdk();
  const p3 = loadSdk();

  expect(p1).toBe(p2);
  expect(p2).toBe(p3);

  expect(env.created).toHaveLength(1);
  expect(env.appended).toHaveLength(1);
  expect(env.appended[0]?.src).toBe('https://sdk.scdn.co/spotify-player.js');
  expect(env.created[0]?.src).toBe('https://sdk.scdn.co/spotify-player.js');

  expect(typeof env.readyRef.fn).toBe('function');
  (env.readyRef.fn as () => void)();

  await p1;
  await p2;
  await p3;
});

test('loadSdk 在 window.Spotify 已存在時直接完成且不插入 script', async () => {
  const env = makeFakeSdkEnv({ withSpotify: true });
  const { loadSdk } = await importWebPlayer();

  await loadSdk();

  expect(env.created).toHaveLength(0);
  expect(env.appended).toHaveLength(0);
});

test('sdkStateToPlaybackState 依 SDK 的 timestamp 往回推算量測時間', async () => {
  const { sdkStateToPlaybackState } = await importWebPlayer();
  const s = {
    position: 5000,
    paused: false,
    timestamp: 1_000_000,
    track_window: { current_track: null },
  } as unknown as Spotify.PlaybackState;
  const r = sdkStateToPlaybackState(s, 'dev', 'name', 50_000, 1_000_300);
  expect(r?.timestamp).toBe(49_700);
});
