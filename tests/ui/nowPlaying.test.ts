import { test, expect, afterEach } from 'vitest';

import { NowPlayingView, formatTime, type NowPlayingHandlers } from '../../src/ui/nowPlaying';
import type { PlaybackState, Track } from '../../src/spotify/types';

interface Calls {
  togglePlay: number;
  next: number;
  prev: number;
  seek: number[];
  volume: number[];
  mode: number;
  translation: number;
  romaji: number;
  library: number;
  queue: number;
}

function makeView(): { root: HTMLElement; view: NowPlayingView; calls: Calls } {
  const calls: Calls = {
    togglePlay: 0,
    next: 0,
    prev: 0,
    seek: [],
    volume: [],
    mode: 0,
    translation: 0,
    romaji: 0,
    library: 0,
    queue: 0,
  };
  const handlers: NowPlayingHandlers = {
    onTogglePlay() {
      calls.togglePlay += 1;
    },
    onNext() {
      calls.next += 1;
    },
    onPrev() {
      calls.prev += 1;
    },
    onSeek(ms: number) {
      calls.seek.push(ms);
    },
    onVolume(pct: number) {
      calls.volume.push(pct);
    },
    onModeToggle() {
      calls.mode += 1;
    },
    onToggleTranslation() {
      calls.translation += 1;
    },
    onToggleRomaji() {
      calls.romaji += 1;
    },
    onOpenLibrary() {
      calls.library += 1;
    },
    onToggleQueue() {
      calls.queue += 1;
    },
    onOpenPip() {},
    onStopShuffle() {},
  };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const view = new NowPlayingView(root, handlers);
  return { root, view, calls };
}

afterEach(() => {
  document.body.replaceChildren();
});

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    uri: 'spotify:track:t1',
    name: '測試歌曲',
    artists: ['歌手A'],
    album: '專輯',
    durationMs: 200000,
    imageUrl: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    track: makeTrack(),
    positionMs: 0,
    isPlaying: false,
    deviceId: null,
    deviceName: null,
    timestamp: 0,
    ...overrides,
  };
}

// ---------- formatTime ----------

test('formatTime(65000) 回傳 1:05', () => {
  expect(formatTime(65000)).toBe('1:05');
});

test('formatTime(3600000) 回傳 60:00', () => {
  expect(formatTime(3600000)).toBe('60:00');
});

test('formatTime(0) 回傳 0:00', () => {
  expect(formatTime(0)).toBe('0:00');
});

test('formatTime(1000) 回傳 0:01', () => {
  expect(formatTime(1000)).toBe('0:01');
});

test('formatTime 負數當作 0', () => {
  expect(formatTime(-1)).toBe('0:00');
  expect(formatTime(-1000)).toBe('0:00');
});

// ---------- constructor: DOM 契約 ----------

test('constructor 建立 .meta/.badges/.progress/.controls 及其子元素', () => {
  const { root } = makeView();
  expect(root.querySelector('.meta > .title')).not.toBeNull();
  expect(root.querySelector('.meta > .artist')).not.toBeNull();

  const seek = root.querySelector('.progress > input.seek') as HTMLInputElement | null;
  expect(seek).not.toBeNull();
  expect(seek!.type).toBe('range');
  expect(seek!.getAttribute('min')).toBe('0');
  expect(seek!.getAttribute('step')).toBe('1');
  expect(root.querySelector('.progress > .cur')).not.toBeNull();
  expect(root.querySelector('.progress > .dur')).not.toBeNull();
  expect(root.querySelector('.badges > .mode-badge')).not.toBeNull();

  expect(root.querySelector('.controls .ctl-center > button.prev')).not.toBeNull();
  expect(root.querySelector('.controls .ctl-center > button.play')).not.toBeNull();
  expect(root.querySelector('.controls .ctl-center > button.next')).not.toBeNull();

  expect(root.querySelector('.controls .ctl-left button.mode')).not.toBeNull();
  expect(root.querySelector('.controls .ctl-right > button.tog-trans')).not.toBeNull();
  expect(root.querySelector('.controls .ctl-right > button.tog-romaji')).not.toBeNull();
  expect(root.querySelector('.controls .ctl-right > button.queue-btn')).not.toBeNull();
  // 所有按鈕都用 SVG 圖示，不用 emoji
  expect(root.querySelectorAll('.controls button svg').length).toBeGreaterThanOrEqual(8);
  const volume = root.querySelector('.controls .vol-wrap > input.volume') as HTMLInputElement | null;
  expect(volume).not.toBeNull();
  expect(volume!.type).toBe('range');
  expect(volume!.getAttribute('min')).toBe('0');
  expect(volume!.getAttribute('max')).toBe('100');
  expect(root.querySelector('.controls .ctl-right > button.open-lib')).not.toBeNull();
});

// ---------- update ----------

test('update(null) 時 title 顯示「沒有正在播放的歌曲」且 artist 空白', () => {
  const { root, view } = makeView();
  view.update(null);
  expect(root.querySelector('.title')!.textContent).toBe('沒有正在播放的歌曲');
  expect(root.querySelector('.artist')!.textContent).toBe('');
});

test('update 當 track 為 null 時 title 顯示「沒有正在播放的歌曲」且 artist 空白', () => {
  const { root, view } = makeView();
  view.update(makeState({ track: null }));
  expect(root.querySelector('.title')!.textContent).toBe('沒有正在播放的歌曲');
  expect(root.querySelector('.artist')!.textContent).toBe('');
});

test('update 更新 title 與 artist', () => {
  const { root, view } = makeView();
  view.update(makeState());
  expect(root.querySelector('.title')!.textContent).toBe('測試歌曲');
  // 歌手 — 專輯
  expect(root.querySelector('.artist')!.textContent).toMatch(/^歌手A( — .+)?$/);
});

test('update 播放中 play 有 playing class 且 aria-label 為「暫停」', () => {
  const { root, view } = makeView();
  view.update(makeState({ isPlaying: true }));
  const play = root.querySelector('button.play')!;
  expect(play.classList.contains('playing')).toBe(true);
  expect(play.getAttribute('aria-label')).toBe('暫停');
});

test('update 暫停中 play 沒有 playing class 且 aria-label 為「播放」', () => {
  const { root, view } = makeView();
  view.update(makeState({ isPlaying: false }));
  const play = root.querySelector('button.play')!;
  expect(play.classList.contains('playing')).toBe(false);
  expect(play.getAttribute('aria-label')).toBe('播放');
});

test('update 設定 seek.max 為 durationMs 且 .dur 為對應 m:ss', () => {
  const { root, view } = makeView();
  view.update(makeState({ track: makeTrack({ durationMs: 125000 }) }));
  const seek = root.querySelector('input.seek') as HTMLInputElement;
  expect(seek.max).toBe('125000');
  // 右側顯示剩餘時間
  expect(root.querySelector('.dur')!.textContent).toBe('-' + formatTime(125000 - (makeState().positionMs ?? 0)));
  expect(formatTime(125000)).toBe('2:05');
});

// ---------- updatePosition ----------

test('updatePosition 更新 seek.value 與 .cur 為 m:ss', () => {
  const { root, view } = makeView();
  view.updatePosition(5000);
  const seek = root.querySelector('input.seek') as HTMLInputElement;
  expect(seek.value).toBe('5000');
  expect(root.querySelector('.cur')!.textContent).toBe('0:05');
});

test('updatePosition 負數當作 0', () => {
  const { root, view } = makeView();
  view.updatePosition(-100);
  const seek = root.querySelector('input.seek') as HTMLInputElement;
  expect(seek.value).toBe('0');
  expect(root.querySelector('.cur')!.textContent).toBe('0:00');
});

test('pointerdown 到 change 之間 updatePosition 不更新 seek.value，change 之後恢復', () => {
  const { root, view, calls } = makeView();
  const seek = root.querySelector('input.seek') as HTMLInputElement;
  seek.value = '1000';
  seek.dispatchEvent(new Event('pointerdown'));
  view.updatePosition(9999);
  expect(seek.value).toBe('1000');

  seek.value = '2000';
  seek.dispatchEvent(new Event('change'));
  expect(calls.seek).toEqual([2000]);

  view.updatePosition(3000);
  expect(seek.value).toBe('3000');
});

// ---------- seek change ----------

test('seek 的 change 事件呼叫 onSeek(Number(value))', () => {
  const { root, calls } = makeView();
  const seek = root.querySelector('input.seek') as HTMLInputElement;
  seek.value = '7890';
  seek.dispatchEvent(new Event('change'));
  expect(calls.seek).toEqual([7890]);
});

// ---------- volume input ----------

test('volume 的 input 事件呼叫 onVolume(Number(value))', () => {
  const { root, calls } = makeView();
  const volume = root.querySelector('input.volume') as HTMLInputElement;
  volume.value = '42';
  volume.dispatchEvent(new Event('input'));
  expect(calls.volume).toEqual([42]);
});

test('volume 的 input 事件在 150ms 內被節流', () => {
  const { root, calls } = makeView();
  const volume = root.querySelector('input.volume') as HTMLInputElement;
  volume.value = '10';
  volume.dispatchEvent(new Event('input'));
  volume.value = '20';
  volume.dispatchEvent(new Event('input'));
  volume.value = '30';
  volume.dispatchEvent(new Event('input'));
  expect(calls.volume).toEqual([10]);
});

// ---------- setMode ----------

test('setMode 切換 mode 按鈕標籤與狀態徽章', () => {
  const { root, view } = makeView();
  const mode = root.querySelector('button.mode')!;
  const badge = root.querySelector('.mode-badge')!;
  view.setMode('web');
  expect(mode.getAttribute('aria-label') ?? '').toMatch(/網頁/);
  expect(badge.textContent ?? '').toMatch(/網頁播放/);
  view.setMode('app');
  expect(mode.getAttribute('aria-label') ?? '').toMatch(/App/);
  expect(badge.textContent ?? '').toMatch(/App 播放/);
});

test('setEngine 顯示翻譯來源，null 時隱藏', () => {
  const { root, view } = makeView();
  const badge = root.querySelector('.engine-badge') as HTMLElement;
  view.setEngine('deepl');
  expect(badge.hidden).toBe(false);
  expect(badge.textContent).toMatch(/DeepL/);
  view.setEngine('chrome');
  expect(badge.textContent).toMatch(/Chrome/);
  view.setEngine(null);
  expect(badge.hidden).toBe(true);
});

test('音量鈕可靜音並恢復原本音量', () => {
  const { root, view, calls } = makeView();
  view.setVolume(70);
  const btn = root.querySelector('button.vol-btn') as HTMLButtonElement;
  btn.click();
  expect(calls.volume.at(-1)).toBe(0);
  btn.click();
  expect(calls.volume.at(-1)).toBe(70);
});

test('button.queue-btn click 呼叫 onToggleQueue', () => {
  const { root, calls } = makeView();
  (root.querySelector('button.queue-btn') as HTMLButtonElement).click();
  expect(calls.queue).toBe(1);
});

// ---------- setToggles ----------

test('setToggles 切換 toggle 開關與 romaji 的 hidden', () => {
  const { root, view } = makeView();
  const trans = root.querySelector('button.tog-trans')!;
  const romaji = root.querySelector('button.tog-romaji')!;

  view.setToggles({ translation: true, romaji: false, romajiAvailable: false });
  expect(trans.classList.contains('on')).toBe(true);
  expect(romaji.classList.contains('on')).toBe(false);
  expect(romaji.hasAttribute('hidden')).toBe(true);

  view.setToggles({ translation: false, romaji: true, romajiAvailable: true });
  expect(trans.classList.contains('on')).toBe(false);
  expect(romaji.classList.contains('on')).toBe(true);
  expect(romaji.hasAttribute('hidden')).toBe(false);
});

// ---------- setVolume ----------

test('setVolume 更新 volume input 的值', () => {
  const { root, view } = makeView();
  view.setVolume(42);
  const volume = root.querySelector('input.volume') as HTMLInputElement;
  expect(volume.value).toBe('42');
});

// ---------- button clicks ----------

test('button.play click 呼叫 onTogglePlay', () => {
  const { root, calls } = makeView();
  root.querySelector('button.play')!.dispatchEvent(new Event('click'));
  expect(calls.togglePlay).toBe(1);
});

test('button.prev click 呼叫 onPrev，button.next click 呼叫 onNext', () => {
  const { root, calls } = makeView();
  root.querySelector('button.prev')!.dispatchEvent(new Event('click'));
  root.querySelector('button.next')!.dispatchEvent(new Event('click'));
  expect(calls.prev).toBe(1);
  expect(calls.next).toBe(1);
});

test('button.mode / tog-trans / tog-romaji / open-lib click 對應 handler', () => {
  const { root, calls } = makeView();
  root.querySelector('button.mode')!.dispatchEvent(new Event('click'));
  root.querySelector('button.tog-trans')!.dispatchEvent(new Event('click'));
  root.querySelector('button.tog-romaji')!.dispatchEvent(new Event('click'));
  root.querySelector('button.open-lib')!.dispatchEvent(new Event('click'));
  expect(calls.mode).toBe(1);
  expect(calls.translation).toBe(1);
  expect(calls.romaji).toBe(1);
  expect(calls.library).toBe(1);
});
