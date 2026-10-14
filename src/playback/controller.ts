/**
 * 播放控制器（計畫 Task 5）。
 *
 * 整合兩種播放模式：
 * - 'web'：本頁的 Spotify Web Playback SDK 播放器
 * - 'app'：遙控既有的 Spotify App（輪詢 Web API 取得狀態）
 *
 * 所有外部相依（Web API、web player、輪詢器）都由建構子注入，方便單元測試。
 */

import { NoActiveDeviceError, QuotaExceededError } from '../spotify/api';
import type { Device, PlaybackState } from '../spotify/types';
import { PlaybackClock } from './clock';
import { pickRemoteDevice } from './modes';
import type { Mode } from './modes';

export type ControllerEvent = 'state' | 'mode' | 'no-device' | 'quota';

export type ControllerListener = (payload?: unknown) => void;

export interface ControllerDeps {
  api: {
    getDevices(): Promise<Device[]>;
    transferPlayback(deviceId: string, play: boolean): Promise<void>;
    play(opts: {
      deviceId?: string;
      contextUri?: string;
      uris?: string[];
      offsetUri?: string;
      positionMs?: number;
    }): Promise<void>;
    pause(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    seek(ms: number): Promise<void>;
    setVolume(pct: number): Promise<void>;
  };
  webPlayer: {
    deviceId: string;
    connect(): Promise<boolean>;
    disconnect(): void;
    player?: {
      togglePlay(): Promise<void>;
      seek(ms: number): Promise<void>;
      nextTrack(): Promise<void>;
      previousTrack(): Promise<void>;
      setVolume(v: number): Promise<void>;
    };
  };
  startPolling: (onState: (s: PlaybackState | null) => void) => () => void;
}

const MODE_STORAGE_KEY = 'spl.mode';

function persistMode(mode: Mode): void {
  try {
    globalThis.localStorage?.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // 儲存空間不可用時忽略，模式仍以記憶體中的值為準。
  }
}

export class PlayerController {
  mode: Mode;
  state: PlaybackState | null;
  clock: PlaybackClock;

  private readonly deps: ControllerDeps;
  private readonly listeners: Record<ControllerEvent, Set<ControllerListener>>;
  private stopPollingFn: (() => void) | null;
  private pollingToken: number;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.mode = 'web';
    this.state = null;
    this.clock = new PlaybackClock();
    this.listeners = {
      state: new Set<ControllerListener>(),
      mode: new Set<ControllerListener>(),
      'no-device': new Set<ControllerListener>(),
      quota: new Set<ControllerListener>(),
    };
    this.stopPollingFn = null;
    this.pollingToken = 0;
  }

  on(event: ControllerEvent, cb: ControllerListener): () => void {
    this.listeners[event].add(cb);
    return () => {
      this.listeners[event].delete(cb);
    };
  }

  private emit(event: ControllerEvent, payload?: unknown): void {
    for (const cb of Array.from(this.listeners[event])) {
      try {
        cb(payload);
      } catch {
        // 監聽器內部錯誤不影響控制器流程。
      }
    }
  }

  /**
   * 收到 Web Playback SDK 的狀態更新時呼叫。
   * 只有在 'web' 模式下才採用，避免切換模式後舊事件蓋掉新狀態。
   */
  handleWebState(s: PlaybackState | null): void {
    if (this.mode !== 'web') return;
    this.applyState(s);
  }

  private lastTrackId: string | null = null;
  /** 拖曳進度後的短時間內，忽略還沒反映跳轉的舊狀態，避免歌詞跳回去又跳回來 */
  private seekGuard: { target: number; at: number; until: number } | null = null;

  private applyState(s: PlaybackState | null): void {
    this.state = s;
    if (s !== null) {
      const trackId = s.track?.id ?? null;
      const changedTrack = trackId !== this.lastTrackId;
      this.lastTrackId = trackId;
      const g = this.seekGuard;
      const now = performance.now();
      const stale =
        g !== null &&
        !changedTrack &&
        now < g.until &&
        Math.abs(s.positionMs - (g.target + (s.isPlaying ? s.timestamp - g.at : 0))) > 1500;
      if (g !== null && (now >= g.until || changedTrack)) this.seekGuard = null;
      if (!stale) {
        this.clock.set({
          positionMs: s.positionMs,
          isPlaying: s.isPlaying,
          durationMs: s.track?.durationMs ?? 0,
          at: s.timestamp,
          hard: changedTrack,
        });
      }
    }
    this.emit('state', s);
  }

  private reportApiError(err: unknown): void {
    if (err instanceof NoActiveDeviceError) {
      this.emit('no-device');
      return;
    }
    if (err instanceof QuotaExceededError) {
      this.emit('quota');
    }
    // 其他錯誤不往上丟，避免 UI 收到未處理的 rejection。
  }

  private updateMode(m: Mode): void {
    this.mode = m;
    persistMode(m);
    this.emit('mode', m);
  }

  private beginPolling(): void {
    this.endPolling();
    const token = this.pollingToken;
    this.stopPollingFn = this.deps.startPolling((s) => {
      if (token !== this.pollingToken) return;
      this.applyState(s);
    });
  }

  private endPolling(): void {
    this.pollingToken += 1;
    const stop = this.stopPollingFn;
    this.stopPollingFn = null;
    if (stop !== null) {
      stop();
    }
  }

  private sdkPlayer(): ControllerDeps['webPlayer']['player'] {
    if (this.mode !== 'web') return undefined;
    return this.deps.webPlayer.player;
  }

  /**
   * 啟動：'app' 模式只開始輪詢（不搶播放）；'web' 模式連上 SDK，
   * 只有在 takeOver 為 true 時才把播放轉到本頁裝置。
   */
  async start(initial: Mode, opts: { takeOver?: boolean } = {}): Promise<void> {
    if (initial === 'app') {
      this.beginPolling();
      this.deps.webPlayer.disconnect();
      this.updateMode('app');
      return;
    }

    this.endPolling();

    try {
      await this.deps.webPlayer.connect();
      if (opts.takeOver === true) {
        await this.deps.api.transferPlayback(this.deps.webPlayer.deviceId, false);
      }
    } catch (err) {
      this.reportApiError(err);
      return;
    }

    this.updateMode('web');
  }

  async setMode(m: Mode): Promise<void> {
    if (m === 'app') {
      await this.switchToApp();
    } else {
      await this.switchToWeb();
    }
  }

  private async switchToApp(): Promise<void> {
    const wasPlaying = this.state?.isPlaying ?? false;

    let devices: Device[];
    try {
      devices = await this.deps.api.getDevices();
    } catch (err) {
      this.reportApiError(err);
      return;
    }

    const device = pickRemoteDevice(devices, this.deps.webPlayer.deviceId);
    if (device === null) {
      this.emit('no-device');
      return;
    }

    try {
      await this.deps.api.transferPlayback(device.id, wasPlaying);
    } catch (err) {
      this.reportApiError(err);
      return;
    }

    this.deps.webPlayer.disconnect();
    this.beginPolling();
    this.updateMode('app');
  }

  private async switchToWeb(): Promise<void> {
    const wasPlaying = this.state?.isPlaying ?? false;

    this.endPolling();

    try {
      await this.deps.webPlayer.connect();
    } catch (err) {
      this.reportApiError(err);
      return;
    }

    try {
      await this.deps.api.transferPlayback(this.deps.webPlayer.deviceId, wasPlaying);
    } catch (err) {
      this.reportApiError(err);
      return;
    }

    this.updateMode('web');
  }

  async togglePlay(): Promise<void> {
    const player = this.sdkPlayer();
    try {
      if (player !== undefined) {
        await player.togglePlay();
        return;
      }
      if (this.state?.isPlaying === true) {
        await this.deps.api.pause();
      } else {
        await this.deps.api.play({});
      }
    } catch (err) {
      this.reportApiError(err);
    }
  }

  async next(): Promise<void> {
    const player = this.sdkPlayer();
    try {
      if (player !== undefined) {
        await player.nextTrack();
        return;
      }
      await this.deps.api.next();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  async prev(): Promise<void> {
    const player = this.sdkPlayer();
    try {
      if (player !== undefined) {
        await player.previousTrack();
        return;
      }
      await this.deps.api.previous();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  async seek(ms: number): Promise<void> {
    const player = this.sdkPlayer();
    try {
      if (player !== undefined) {
        await player.seek(ms);
      } else {
        await this.deps.api.seek(ms);
      }
    } catch (err) {
      this.reportApiError(err);
      return;
    }

    // 立刻把時鐘移到新位置，歌詞才會馬上跳，不必等下一個狀態更新。
    const at = performance.now();
    this.clock.set({
      positionMs: ms,
      isPlaying: this.state?.isPlaying ?? false,
      durationMs: this.state?.track?.durationMs ?? 0,
      at,
      hard: true,
    });
    this.seekGuard = { target: ms, at, until: at + 2500 };
  }

  async setVolume(pct: number): Promise<void> {
    const player = this.sdkPlayer();
    try {
      if (player !== undefined) {
        await player.setVolume(pct / 100);
        return;
      }
      await this.deps.api.setVolume(pct);
    } catch (err) {
      this.reportApiError(err);
    }
  }

  async playContext(uri: string, offsetUri?: string): Promise<void> {
    try {
      await this.deps.api.play({
        contextUri: uri,
        offsetUri,
        deviceId: this.mode === 'web' ? this.deps.webPlayer.deviceId : undefined,
      });
    } catch (err) {
      this.reportApiError(err);
    }
  }

  /** 回傳是否成功開始播放（失敗時已經發出 no-device / quota 等事件） */
  async playUris(uris: string[], offsetUri?: string): Promise<boolean> {
    try {
      await this.deps.api.play({
        uris,
        offsetUri,
        deviceId: this.mode === 'web' ? this.deps.webPlayer.deviceId : undefined,
      });
      return true;
    } catch (err) {
      this.reportApiError(err);
      return false;
    }
  }
}
