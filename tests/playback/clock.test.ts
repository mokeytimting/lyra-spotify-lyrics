import { test, expect } from 'vitest';
import { PlaybackClock } from '../../src/playback/clock';

test('未曾 set 時 now() 回傳 0', () => {
  const clock = new PlaybackClock();
  expect(clock.now()).toBe(0);
});

test('未曾 set 時 now(at) 也回傳 0', () => {
  const clock = new PlaybackClock();
  expect(clock.now(123456)).toBe(0);
});

test('播放中經過 500ms 後位置增加 500', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 1000, isPlaying: true, durationMs: 60000, at: 0 });
  expect(clock.now(500)).toBe(1500);
});

test('播放中 now() 以 set 當下為起點回傳原始位置', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 1000, isPlaying: true, durationMs: 60000, at: 0 });
  expect(clock.now(0)).toBe(1000);
});

test('暫停時經過 5000ms 位置固定不動', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 1000, isPlaying: false, durationMs: 60000, at: 0 });
  expect(clock.now(5000)).toBe(1000);
});

test('播放中超過 durationMs 時回傳 durationMs', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 59000, isPlaying: true, durationMs: 60000, at: 0 });
  expect(clock.now(5000)).toBe(60000);
});

test('播放中剛好到達 durationMs 時回傳 durationMs', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 59000, isPlaying: true, durationMs: 60000, at: 0 });
  expect(clock.now(1000)).toBe(60000);
});

test('播放中推算出的位置不會小於 0', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 100, isPlaying: true, durationMs: 60000, at: 1000 });
  expect(clock.now(0)).toBe(0);
});

test('set 之後馬上以新位置為準（往回跳轉 30 秒）', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 50000, isPlaying: true, durationMs: 60000, at: 1000 });
  expect(clock.now(1000)).toBe(50000);
  clock.set({ positionMs: 20000, isPlaying: true, durationMs: 60000, at: 1000 });
  expect(clock.now(1000)).toBe(20000);
});

test('set 之後往回跳轉，再經過時間仍從新位置起算', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 50000, isPlaying: true, durationMs: 60000, at: 0 });
  clock.set({ positionMs: 20000, isPlaying: true, durationMs: 60000, at: 1000 });
  expect(clock.now(1750)).toBe(20750);
});

test('durationMs 為 0 時不做上限，回傳實際推算位置', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 0, isPlaying: true, durationMs: 0, at: 0 });
  expect(clock.now(5000)).toBe(5000);
});

test('durationMs 為 0 且 positionMs 非零時，播放中仍可繼續增加', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 1234, isPlaying: true, durationMs: 0, at: 0 });
  expect(clock.now(1000)).toBe(2234);
});

test('播放中未提供 at 時，預設以 performance.now() 為基準回傳合理位置', () => {
  const clock = new PlaybackClock();
  clock.set({ positionMs: 5000, isPlaying: true, durationMs: 60000 });
  const value = clock.now();
  expect(value).toBeGreaterThanOrEqual(5000);
  expect(value).toBeLessThanOrEqual(60000);
});

test('播放中的小誤差只修正一部分，避免歌詞抖動', () => {
  const c = new PlaybackClock();
  c.set({ positionMs: 10000, isPlaying: true, durationMs: 200000, at: 0 });
  // 1 秒後回報的位置比推算的多 200ms
  c.set({ positionMs: 11200, isPlaying: true, durationMs: 200000, at: 1000 });
  const v = c.now(1000);
  expect(v).toBeGreaterThan(11000);
  expect(v).toBeLessThan(11200);
});

test('重複的偏差會在幾次校正內收斂', () => {
  const c = new PlaybackClock();
  c.set({ positionMs: 0, isPlaying: true, durationMs: 200000, at: 0 });
  for (let i = 1; i <= 8; i += 1) {
    c.set({ positionMs: i * 1000 + 300, isPlaying: true, durationMs: 200000, at: i * 1000 });
  }
  expect(Math.abs(c.now(8000) - 8300)).toBeLessThan(20);
});

test('大幅跳轉與 hard 直接採用', () => {
  const c = new PlaybackClock();
  c.set({ positionMs: 10000, isPlaying: true, durationMs: 200000, at: 0 });
  c.set({ positionMs: 60000, isPlaying: true, durationMs: 200000, at: 100 });
  expect(c.now(100)).toBe(60000);
  c.set({ positionMs: 60300, isPlaying: true, durationMs: 200000, at: 200, hard: true });
  expect(c.now(200)).toBe(60300);
});
