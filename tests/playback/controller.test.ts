import { beforeEach, expect, test } from 'vitest';

import { PlayerController } from '../../src/playback/controller';
import type { ControllerDeps } from '../../src/playback/controller';
import { NoActiveDeviceError, QuotaExceededError } from '../../src/spotify/api';
import type { Device, PlaybackState, Track } from '../../src/spotify/types';

/* -------------------------------------------------------------------------- */
/* 測試環境的 localStorage 替身（每個測試重新安裝，避免模式殘留）               */
/* -------------------------------------------------------------------------- */

interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
}

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? (keys[index] as string) : null;
    },
    get length(): number {
      return store.size;
    },
  };
}

beforeEach(() => {
  const storage = createMemoryStorage();
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    return;
  } catch {
    // 無法覆寫時退而求其次，至少清空既有的儲存空間。
  }
  try {
    globalThis.localStorage?.clear();
  } catch {
    // 儲存空間不可用時忽略；控制器本身會吞掉存取失敗。
  }
});

/* -------------------------------------------------------------------------- */
/* 假資料                                                                      */
/* -------------------------------------------------------------------------- */

const WEB_DEVICE_ID = 'web-device-1';

const APP_DEVICE: Device = {
  id: 'app-device-1',
  name: '我的電腦',
  type: 'Computer',
  isActive: true,
  isRestricted: false,
};

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    uri: 'spotify:track:track-1',
    name: 'Song',
    artists: ['Artist'],
    album: 'Album',
    durationMs: 200000,
    imageUrl: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    track: makeTrack(),
    positionMs: 0,
    isPlaying: true,
    deviceId: WEB_DEVICE_ID,
    deviceName: 'Lyra',
    timestamp: 1000,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* 測試替身                                                                    */
/* -------------------------------------------------------------------------- */

interface FakeCalls {
  order: string[];
  getDevices: number;
  transferPlayback: Array<{ deviceId: string; play: boolean }>;
  play: Array<Record<string, unknown>>;
  pause: number;
  next: number;
  previous: number;
  seek: number[];
  setVolume: number[];
  connect: number;
  disconnect: number;
  startPolling: number;
  stopPolling: number;
}

interface FakeSdkCalls {
  togglePlay: number;
  seek: number[];
  nextTrack: number;
  previousTrack: number;
  setVolume: number[];
}

interface Harness {
  deps: ControllerDeps;
  calls: FakeCalls;
  sdk: FakeSdkCalls;
  failNext(err: Error): void;
  emitPoll(state: PlaybackState | null): void;
}

function setup(options: { devices?: Device[]; withPlayer?: boolean } = {}): Harness {
  const devices: Device[] = options.devices ?? [APP_DEVICE];

  const calls: FakeCalls = {
    order: [],
    getDevices: 0,
    transferPlayback: [],
    play: [],
    pause: 0,
    next: 0,
    previous: 0,
    seek: [],
    setVolume: [],
    connect: 0,
    disconnect: 0,
    startPolling: 0,
    stopPolling: 0,
  };

  const sdk: FakeSdkCalls = {
    togglePlay: 0,
    seek: [],
    nextTrack: 0,
    previousTrack: 0,
    setVolume: [],
  };

  let pendingError: Error | null = null;
  const maybeThrow = (): void => {
    if (pendingError !== null) {
      const err = pendingError;
      pendingError = null;
      throw err;
    }
  };

  const api: ControllerDeps['api'] = {
    async getDevices(): Promise<Device[]> {
      calls.getDevices += 1;
      calls.order.push('getDevices');
      maybeThrow();
      return devices;
    },
    async transferPlayback(deviceId: string, play: boolean): Promise<void> {
      calls.transferPlayback.push({ deviceId, play });
      calls.order.push('transferPlayback');
      maybeThrow();
    },
    async play(
      opts: {
        deviceId?: string;
        contextUri?: string;
        uris?: string[];
        offsetUri?: string;
        positionMs?: number;
      } = {},
    ): Promise<void> {
      calls.play.push({ ...opts });
      calls.order.push('play');
      maybeThrow();
    },
    async pause(): Promise<void> {
      calls.pause += 1;
      calls.order.push('pause');
      maybeThrow();
    },
    async next(): Promise<void> {
      calls.next += 1;
      calls.order.push('next');
      maybeThrow();
    },
    async previous(): Promise<void> {
      calls.previous += 1;
      calls.order.push('previous');
      maybeThrow();
    },
    async seek(ms: number): Promise<void> {
      calls.seek.push(ms);
      calls.order.push('seek');
      maybeThrow();
    },
    async setVolume(pct: number): Promise<void> {
      calls.setVolume.push(pct);
      calls.order.push('setVolume');
      maybeThrow();
    },
  };

  const webPlayer: ControllerDeps['webPlayer'] = {
    deviceId: WEB_DEVICE_ID,
    async connect(): Promise<boolean> {
      calls.connect += 1;
      calls.order.push('connect');
      return true;
    },
    disconnect(): void {
      calls.disconnect += 1;
      calls.order.push('disconnect');
    },
  };

  if (options.withPlayer === true) {
    webPlayer.player = {
      async togglePlay(): Promise<void> {
        sdk.togglePlay += 1;
      },
      async seek(ms: number): Promise<void> {
        sdk.seek.push(ms);
      },
      async nextTrack(): Promise<void> {
        sdk.nextTrack += 1;
      },
      async previousTrack(): Promise<void> {
        sdk.previousTrack += 1;
      },
      async setVolume(v: number): Promise<void> {
        sdk.setVolume.push(v);
      },
    };
  }

  let pollHandler: ((s: PlaybackState | null) => void) | null = null;

  const startPolling = (
    onState: (s: PlaybackState | null) => void,
  ): (() => void) => {
    calls.startPolling += 1;
    calls.order.push('startPolling');
    pollHandler = onState;
    return () => {
      calls.stopPolling += 1;
      calls.order.push('stopPolling');
      if (pollHandler === onState) {
        pollHandler = null;
      }
    };
  };

  const deps: ControllerDeps = { api, webPlayer, startPolling };

  return {
    deps,
    calls,
    sdk,
    failNext(err: Error): void {
      pendingError = err;
    },
    emitPoll(state: PlaybackState | null): void {
      if (pollHandler === null) {
        throw new Error('輪詢尚未開始，無法送出 state');
      }
      pollHandler(state);
    },
  };
}

function indexOf(calls: FakeCalls, name: string): number {
  return calls.order.indexOf(name);
}

/* -------------------------------------------------------------------------- */
/* on / 事件                                                                   */
/* -------------------------------------------------------------------------- */

test('on() 回傳取消訂閱函式，取消後不再收到事件', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  let count = 0;
  const off = controller.on('state', () => {
    count += 1;
  });

  controller.handleWebState(makeState());
  expect(count).toBe(1);

  off();
  controller.handleWebState(makeState());
  expect(count).toBe(1);
});

/* -------------------------------------------------------------------------- */
/* state 與 clock                                                              */
/* -------------------------------------------------------------------------- */

test("web 模式下收到 state 會更新 state、寫入 clock 並發出 'state'", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  const received: unknown[] = [];
  controller.on('state', (payload) => {
    received.push(payload);
  });

  const state = makeState({ positionMs: 5000, isPlaying: true, timestamp: 100000 });
  controller.handleWebState(state);

  expect(controller.state).toBe(state);
  expect(received).toHaveLength(1);
  expect(received[0]).toBe(state);
  expect(controller.clock.now(100000)).toBe(5000);
  expect(controller.clock.now(101500)).toBe(6500);
});

test('clock 的長度上限取自 track.durationMs', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  const state = makeState({
    track: makeTrack({ durationMs: 1000 }),
    positionMs: 900,
    isPlaying: true,
    timestamp: 100000,
  });
  controller.handleWebState(state);

  expect(controller.clock.now(100000)).toBe(900);
  expect(controller.clock.now(105000)).toBe(1000);
});

test('app 模式下 handleWebState 的結果不被採用', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('app');

  const before = controller.state;
  const received: unknown[] = [];
  controller.on('state', (payload) => {
    received.push(payload);
  });

  controller.handleWebState(makeState());

  expect(controller.state).toBe(before);
  expect(received).toHaveLength(0);
});

test("app 模式下輪詢回來的 state 會被採用並發出 'state'", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('app');

  const received: unknown[] = [];
  controller.on('state', (payload) => {
    received.push(payload);
  });

  const state = makeState({ positionMs: 1234, isPlaying: false, timestamp: 2000 });
  h.emitPoll(state);

  expect(controller.state).toBe(state);
  expect(received).toHaveLength(1);
  expect(received[0]).toBe(state);
});

/* -------------------------------------------------------------------------- */
/* setMode                                                                     */
/* -------------------------------------------------------------------------- */

test("setMode('app') 找不到可用裝置時發出 'no-device'、模式不變且不轉移播放", async () => {
  const h = setup({ devices: [] });
  const controller = new PlayerController(h.deps);

  const before = controller.mode;
  let noDevice = 0;
  let modeEvents = 0;
  controller.on('no-device', () => {
    noDevice += 1;
  });
  controller.on('mode', () => {
    modeEvents += 1;
  });

  await controller.setMode('app');

  expect(noDevice).toBe(1);
  expect(modeEvents).toBe(0);
  expect(controller.mode).toBe(before);
  expect(h.calls.transferPlayback).toHaveLength(0);
  expect(h.calls.disconnect).toBe(0);
});

test("setMode('app') 有裝置時先轉移播放、再中斷網頁播放器、最後開始輪詢並切換模式", async () => {
  const h = setup({ devices: [APP_DEVICE] });
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');
  controller.handleWebState(makeState({ isPlaying: true }));

  h.calls.transferPlayback.length = 0;
  h.calls.order.length = 0;

  const modes: unknown[] = [];
  controller.on('mode', (payload) => {
    modes.push(payload);
  });

  await controller.setMode('app');

  expect(h.calls.transferPlayback).toEqual([
    { deviceId: APP_DEVICE.id, play: true },
  ]);

  const iTransfer = indexOf(h.calls, 'transferPlayback');
  const iDisconnect = indexOf(h.calls, 'disconnect');
  const iPoll = indexOf(h.calls, 'startPolling');
  expect(iTransfer).toBeGreaterThanOrEqual(0);
  expect(iDisconnect).toBeGreaterThan(iTransfer);
  expect(iPoll).toBeGreaterThan(iDisconnect);
  expect(h.calls.startPolling).toBe(1);

  expect(controller.mode).toBe('app');
  expect(modes).toHaveLength(1);
  expect(modes[0]).toBe('app');
});

test("setMode('web') 停止輪詢、連線、轉移播放並切換模式", async () => {
  const h = setup({ devices: [APP_DEVICE] });
  const controller = new PlayerController(h.deps);
  await controller.setMode('app');

  h.calls.stopPolling = 0;
  h.calls.connect = 0;
  h.calls.transferPlayback.length = 0;

  const modes: unknown[] = [];
  controller.on('mode', (payload) => {
    modes.push(payload);
  });

  await controller.setMode('web');

  expect(h.calls.stopPolling).toBe(1);
  expect(h.calls.connect).toBe(1);
  expect(h.calls.transferPlayback).toEqual([
    { deviceId: WEB_DEVICE_ID, play: false },
  ]);
  expect(controller.mode).toBe('web');
  expect(modes).toHaveLength(1);
  expect(modes[0]).toBe('web');
});

/* -------------------------------------------------------------------------- */
/* start                                                                       */
/* -------------------------------------------------------------------------- */

test("start('app') 只開始輪詢並中斷網頁播放器，不呼叫 transferPlayback", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);

  await controller.start('app');

  expect(h.calls.startPolling).toBe(1);
  expect(h.calls.disconnect).toBe(1);
  expect(h.calls.transferPlayback).toHaveLength(0);
  expect(controller.mode).toBe('app');
});

test("start('web') 會連線但不搶走正在播放的裝置", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);

  await controller.start('web');

  expect(h.calls.connect).toBe(1);
  expect(h.calls.transferPlayback).toHaveLength(0);
  expect(controller.mode).toBe('web');
});

test("start('web', { takeOver: true }) 會把播放轉到網頁播放器且不自動播放", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);

  await controller.start('web', { takeOver: true });

  expect(h.calls.connect).toBe(1);
  expect(h.calls.transferPlayback).toEqual([
    { deviceId: WEB_DEVICE_ID, play: false },
  ]);
});

/* -------------------------------------------------------------------------- */
/* 控制指令                                                                    */
/* -------------------------------------------------------------------------- */

test('web 模式且有 SDK player 時，控制指令走 SDK', async () => {
  const h = setup({ withPlayer: true });
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  await controller.togglePlay();
  await controller.next();
  await controller.prev();
  await controller.seek(1234);
  await controller.setVolume(50);

  expect(h.sdk.togglePlay).toBe(1);
  expect(h.sdk.nextTrack).toBe(1);
  expect(h.sdk.previousTrack).toBe(1);
  expect(h.sdk.seek).toEqual([1234]);
  expect(h.sdk.setVolume).toEqual([0.5]);

  expect(h.calls.pause).toBe(0);
  expect(h.calls.play).toHaveLength(0);
  expect(h.calls.next).toBe(0);
  expect(h.calls.previous).toBe(0);
  expect(h.calls.seek).toHaveLength(0);
  expect(h.calls.setVolume).toHaveLength(0);
});

test('web 模式沒有 SDK player 時，控制指令走 Web API', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  controller.handleWebState(makeState({ isPlaying: true }));
  await controller.togglePlay();
  expect(h.calls.pause).toBe(1);
  expect(h.calls.play).toHaveLength(0);

  controller.handleWebState(makeState({ isPlaying: false }));
  await controller.togglePlay();
  expect(h.calls.play).toHaveLength(1);
  expect(h.calls.play[0]?.deviceId).toBeUndefined();
  expect(h.calls.play[0]?.contextUri).toBeUndefined();
  expect(h.calls.play[0]?.uris).toBeUndefined();

  await controller.next();
  await controller.prev();
  expect(h.calls.next).toBe(1);
  expect(h.calls.previous).toBe(1);

  await controller.seek(45000);
  expect(h.calls.seek).toEqual([45000]);

  await controller.setVolume(30);
  expect(h.calls.setVolume).toEqual([30]);
});

test('seek 之後 clock 立刻反映新位置', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  controller.handleWebState(
    makeState({ positionMs: 0, isPlaying: false, timestamp: 5000 }),
  );

  await controller.seek(30000);

  const value = controller.clock.now();
  expect(value).toBeGreaterThanOrEqual(30000);
  expect(value).toBeLessThanOrEqual(31000);
});

/* -------------------------------------------------------------------------- */
/* playContext / playUris                                                      */
/* -------------------------------------------------------------------------- */

test('web 模式的 playContext 帶上網頁播放器 deviceId', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  await controller.playContext('spotify:playlist:p1');

  expect(h.calls.play).toHaveLength(1);
  expect(h.calls.play[0]?.deviceId).toBe(WEB_DEVICE_ID);
  expect(h.calls.play[0]?.contextUri).toBe('spotify:playlist:p1');
});

test('web 模式的 playContext 可以指定起始曲目', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  await controller.playContext('spotify:playlist:p1', 'spotify:track:t9');

  expect(h.calls.play).toHaveLength(1);
  expect(h.calls.play[0]?.deviceId).toBe(WEB_DEVICE_ID);
  expect(h.calls.play[0]?.contextUri).toBe('spotify:playlist:p1');
  expect(h.calls.play[0]?.offsetUri).toBe('spotify:track:t9');
});

test('web 模式的 playUris 帶上網頁播放器 deviceId', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  await controller.playUris(['spotify:track:a', 'spotify:track:b']);

  expect(h.calls.play).toHaveLength(1);
  expect(h.calls.play[0]?.deviceId).toBe(WEB_DEVICE_ID);
  expect(h.calls.play[0]?.uris).toEqual(['spotify:track:a', 'spotify:track:b']);
});

test('app 模式的 playUris 不指定 deviceId', async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('app');

  await controller.playUris(['spotify:track:a']);

  expect(h.calls.play).toHaveLength(1);
  expect(h.calls.play[0]?.deviceId).toBeUndefined();
  expect(h.calls.play[0]?.uris).toEqual(['spotify:track:a']);
});

/* -------------------------------------------------------------------------- */
/* 錯誤處理                                                                    */
/* -------------------------------------------------------------------------- */

test("控制指令遇到 NoActiveDeviceError 時發出 'no-device' 且不往外拋", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  let noDevice = 0;
  let quota = 0;
  controller.on('no-device', () => {
    noDevice += 1;
  });
  controller.on('quota', () => {
    quota += 1;
  });

  h.failNext(new NoActiveDeviceError());

  await controller.next();

  expect(noDevice).toBe(1);
  expect(quota).toBe(0);
});

test("播放指令遇到 NoActiveDeviceError 時發出 'no-device' 且不往外拋", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  let noDevice = 0;
  controller.on('no-device', () => {
    noDevice += 1;
  });

  h.failNext(new NoActiveDeviceError());

  await controller.playContext('spotify:playlist:p1');

  expect(noDevice).toBe(1);
});

test("API 額度用完時發出 'quota' 且不往外拋", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  let noDevice = 0;
  let quota = 0;
  controller.on('no-device', () => {
    noDevice += 1;
  });
  controller.on('quota', () => {
    quota += 1;
  });

  h.failNext(new QuotaExceededError());

  await controller.next();

  expect(quota).toBe(1);
  expect(noDevice).toBe(0);
});

test("seek 遇到 NoActiveDeviceError 時發出 'no-device' 且不往外拋", async () => {
  const h = setup();
  const controller = new PlayerController(h.deps);
  await controller.setMode('web');

  let noDevice = 0;
  controller.on('no-device', () => {
    noDevice += 1;
  });

  h.failNext(new NoActiveDeviceError());

  await controller.seek(10000);

  expect(noDevice).toBe(1);
});
