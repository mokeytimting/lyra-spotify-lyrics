/**
 * Spotify Web Playback SDK 包裝（計畫 Task 5）。
 *
 * - sdkStateToPlaybackState：把 SDK 的播放狀態轉成專案內部的 PlaybackState
 * - loadSdk：動態載入 SDK script，重複呼叫只會插入一次
 * - createWebPlayer：建立播放器、註冊事件、連接並取得 device_id
 */

import { CONFIG } from '../config';
import type { PlaybackState, Track } from '../spotify/types';

/** SDK script 來源。 */
const SDK_SCRIPT_SRC = 'https://sdk.scdn.co/spotify-player.js';

/** 等待 'ready' 事件的逾時毫秒數。 */
const READY_TIMEOUT_MS = 10000;

/** 播放器初始音量。 */
const DEFAULT_VOLUME = 0.8;

interface PlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

interface SpotifySdkGlobal {
  Player: new (options: PlayerOptions) => Spotify.Player;
}

interface SpotifySdkWindow {
  Spotify?: SpotifySdkGlobal;
  onSpotifyWebPlaybackSDKReady?: (() => void) | undefined;
}

function sdkWindow(): SpotifySdkWindow {
  return window as unknown as SpotifySdkWindow;
}

/** 取封面網址：優先 width 最大的圖，都沒有寬度資訊時取第一張。 */
function pickImageUrl(images: Spotify.Image[] | null | undefined): string | null {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  let best: string | null = null;
  let bestWidth = Number.NEGATIVE_INFINITY;

  for (const image of images) {
    if (!image || typeof image.url !== 'string' || image.url === '') {
      continue;
    }
    const width = typeof image.width === 'number' ? image.width : null;
    if (width === null) {
      if (best === null) {
        best = image.url;
      }
      continue;
    }
    if (width > bestWidth) {
      bestWidth = width;
      best = image.url;
    }
  }

  return best;
}

/**
 * 把 SDK 的 PlaybackState 轉成內部型別。
 *
 * - s 為 null → null
 * - current_track 的 id 不是字串（null）→ track: null
 * - positionMs 取 s.position、isPlaying 取 !s.paused
 * - deviceId / deviceName 由呼叫端提供，timestamp 預設為當下的 performance.now()
 */
export function sdkStateToPlaybackState(
  s: Spotify.PlaybackState | null,
  deviceId: string,
  deviceName: string,
  now: number = performance.now(),
  epochNow: number = Date.now(),
): PlaybackState | null {
  if (s === null) {
    return null;
  }
  // SDK 的 position 是在 s.timestamp（epoch 毫秒）那一刻量到的；
  // 事件送到我們手上時已經過了一小段時間，換算回 performance.now() 的時間軸。
  const age =
    typeof s.timestamp === 'number' && s.timestamp > 0
      ? Math.min(Math.max(epochNow - s.timestamp, 0), 5000)
      : 0;

  const current = s.track_window?.current_track ?? null;

  let track: Track | null = null;
  if (current !== null && typeof current.id === 'string') {
    const artists: string[] = [];
    if (Array.isArray(current.artists)) {
      for (const artist of current.artists) {
        if (artist && typeof artist.name === 'string') {
          artists.push(artist.name);
        }
      }
    }

    const album = current.album ?? null;

    track = {
      id: current.id,
      uri: typeof current.uri === 'string' ? current.uri : '',
      name: typeof current.name === 'string' ? current.name : '',
      artists,
      album: album !== null && typeof album.name === 'string' ? album.name : '',
      durationMs: typeof current.duration_ms === 'number' ? current.duration_ms : 0,
      imageUrl: album === null ? null : pickImageUrl(album.images),
    };
  }

  return {
    track,
    positionMs: typeof s.position === 'number' ? s.position : 0,
    isPlaying: s.paused !== true,
    deviceId,
    deviceName,
    timestamp: now - age,
  };
}

let sdkLoadPromise: Promise<void> | null = null;

/** 網頁播放時主動校正進度的間隔 */
const RESYNC_MS = 1000;

/**
 * 載入 Spotify Web Playback SDK。
 *
 * 已經有 window.Spotify 時直接完成；否則插入一次 <script>，
 * 並在 window.onSpotifyWebPlaybackSDKReady 被呼叫時完成。
 * 重複呼叫會拿到同一個 Promise。
 */
export function loadSdk(): Promise<void> {
  if (sdkLoadPromise !== null) {
    return sdkLoadPromise;
  }

  const w = sdkWindow();
  if (w.Spotify !== undefined) {
    sdkLoadPromise = Promise.resolve();
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    w.onSpotifyWebPlaybackSDKReady = () => {
      resolve();
    };

    const script = document.createElement('script');
    script.src = SDK_SCRIPT_SRC;
    script.async = true;
    script.addEventListener('error', () => {
      sdkLoadPromise = null;
      reject(new Error('Spotify Web Playback SDK 載入失敗'));
    });
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

/**
 * 建立網頁播放器。
 *
 * connect() 會等待 SDK 的 'ready' 事件以取得 device_id（逾時 10 秒）。
 * activate() 必須在使用者手勢（點擊）中呼叫。
 */
export async function createWebPlayer(
  onState: (s: PlaybackState | null) => void,
  getToken: () => Promise<string>,
): Promise<{
  deviceId: string;
  connect(): Promise<boolean>;
  disconnect(): void;
  activate(): Promise<void>;
  player: Spotify.Player;
}> {
  await loadSdk();

  const sdk = sdkWindow().Spotify;
  if (sdk === undefined) {
    throw new Error('Spotify Web Playback SDK 尚未載入');
  }

  const player = new sdk.Player({
    name: CONFIG.deviceName,
    getOAuthToken: (cb) => {
      void getToken().then(
        (token) => {
          cb(token);
        },
        (error: unknown) => {
          console.error('取得 Spotify access token 失敗：', error);
        },
      );
    },
    volume: DEFAULT_VOLUME,
  });

  let deviceId = '';
  let ready = false;
  const readyWaiters = new Set<() => void>();

  player.addListener('ready', (instance) => {
    deviceId = instance.device_id;
    ready = true;
    for (const waiter of readyWaiters) {
      waiter();
    }
    readyWaiters.clear();
  });

  player.addListener('player_state_changed', (state) => {
    onState(sdkStateToPlaybackState(state, deviceId, CONFIG.deviceName, performance.now()));
  });

  player.addListener('initialization_error', (error) => {
    console.error('Spotify 播放器初始化錯誤：', error.message);
  });

  player.addListener('authentication_error', (error) => {
    console.error('Spotify 播放器驗證錯誤：', error.message);
  });

  player.addListener('account_error', (error) => {
    console.error('Spotify 播放器帳號錯誤：', error.message);
  });

  // player_state_changed 只在狀態改變時才送；播放中每秒主動讀一次，持續校正進度
  let resyncTimer: ReturnType<typeof setInterval> | null = null;
  function startResync(): void {
    if (resyncTimer !== null) return;
    resyncTimer = setInterval(() => {
      void player.getCurrentState().then((state) => {
        if (state !== null && state.paused !== true) {
          onState(sdkStateToPlaybackState(state, deviceId, CONFIG.deviceName));
        }
      });
    }, RESYNC_MS);
  }
  function stopResync(): void {
    if (resyncTimer !== null) clearInterval(resyncTimer);
    resyncTimer = null;
  }

  async function connect(): Promise<boolean> {
    const connected = await player.connect();
    startResync();

    if (!ready) {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null;

        const waiter = () => {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
          resolve();
        };

        readyWaiters.add(waiter);

        timer = setTimeout(() => {
          readyWaiters.delete(waiter);
          reject(new Error('播放器初始化逾時'));
        }, READY_TIMEOUT_MS);

        if (ready) {
          waiter();
        }
      });
    }

    return connected;
  }

  function disconnect(): void {
    stopResync();
    player.disconnect();
  }

  async function activate(): Promise<void> {
    await player.activateElement();
  }

  return {
    get deviceId(): string {
      return deviceId;
    },
    connect,
    disconnect,
    activate,
    player,
  };
}
