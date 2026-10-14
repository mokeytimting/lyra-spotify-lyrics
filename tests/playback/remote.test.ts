import { test, expect, vi, beforeEach, afterEach } from 'vitest';

import { startPolling } from '../../src/playback/remote';
import { QuotaExceededError } from '../../src/spotify/api';
import type { PlaybackState } from '../../src/spotify/types';

// 這裡不直接覆寫 document.hidden，而是提供一個可切換的 stub，
// 以免被環境的唯讀 getter 擋下。
let hiddenValue = false;

function setHidden(value: boolean): void {
  hiddenValue = value;
}

/** 推進數個 microtask，讓被 fake timer 凍住的 promise 鏈跑完。 */
async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  hiddenValue = false;

  const descriptor: PropertyDescriptor = {
    configurable: true,
    get: () => hiddenValue,
  };

  try {
    Object.defineProperty(document, 'hidden', descriptor);
  } catch {
    Object.defineProperty(Object.getPrototypeOf(document), 'hidden', descriptor);
  }
});

afterEach(() => {
  vi.useRealTimers();
  hiddenValue = false;
});

test('startPolling immediately calls getState once and returns a stop function', async () => {
  let calls = 0;
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return Promise.resolve(null);
  };

  const stop = startPolling(() => {}, 1000, getState);

  // 「立刻」＝不必等任何 timer 或 microtask 就應該已呼叫一次。
  expect(calls).toBe(1);
  expect(typeof stop).toBe('function');

  stop();
  await flush();
});

test('startPolling polls again every intervalMs', async () => {
  let calls = 0;
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return Promise.resolve(null);
  };

  const stop = startPolling(() => {}, 1000, getState);
  await flush();
  expect(calls).toBe(1);

  await vi.advanceTimersByTimeAsync(999);
  await flush();
  expect(calls).toBe(1);

  await vi.advanceTimersByTimeAsync(1);
  await flush();
  expect(calls).toBe(2);

  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(calls).toBe(3);

  stop();
});

test('startPolling delivers getState results to onState', async () => {
  const state: PlaybackState = {
    track: null,
    positionMs: 0,
    isPlaying: false,
    deviceId: null,
    deviceName: null,
    timestamp: 0,
  };
  const received: Array<PlaybackState | null> = [];
  const getState = (): Promise<PlaybackState | null> => Promise.resolve(state);

  const stop = startPolling((s) => received.push(s), 1000, getState);
  await flush();

  expect(received.length).toBe(1);
  expect(received[0]).toBe(state);

  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(received.length).toBe(2);
  expect(received[1]).toBe(state);

  stop();
});

test('startPolling skips a tick while the previous getState is still pending', async () => {
  let calls = 0;
  const resolvers: Array<(v: PlaybackState | null) => void> = [];
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return new Promise<PlaybackState | null>((resolve) => {
      resolvers.push(resolve);
    });
  };

  const stop = startPolling(() => {}, 1000, getState);
  await flush();
  expect(calls).toBe(1);

  // 推進多個 interval；上一個請求尚未完成，不能重疊呼叫。
  await vi.advanceTimersByTimeAsync(5000);
  await flush();
  expect(calls).toBe(1);

  // 完成第一個請求後，下一次 interval 才允許呼叫。
  resolvers[0]!(null);
  await flush();

  await vi.advanceTimersByTimeAsync(5000);
  await flush();
  expect(calls).toBe(2);

  stop();
  if (resolvers.length > 1) resolvers[1]!(null);
  await flush();
});

test('startPolling calls onError on generic errors and continues polling', async () => {
  const err = new Error('boom');
  let calls = 0;
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return Promise.reject(err);
  };
  const errors: unknown[] = [];

  const stop = startPolling(() => {}, 1000, getState, (e) => errors.push(e));
  await flush();

  expect(calls).toBe(1);
  expect(errors.length).toBe(1);
  expect(errors[0]).toBe(err);

  await vi.advanceTimersByTimeAsync(1000);
  await flush();

  expect(calls).toBe(2);
  expect(errors.length).toBe(2);
  expect(errors[1]).toBe(err);

  stop();
});

test('startPolling without onError still keeps polling after a generic error', async () => {
  let calls = 0;
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return Promise.reject(new Error('boom'));
  };

  const stop = startPolling(() => {}, 1000, getState);
  await flush();
  expect(calls).toBe(1);

  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(calls).toBe(2);

  stop();
});

test('startPolling stops polling when QuotaExceededError is thrown', async () => {
  const err = new QuotaExceededError();
  let calls = 0;
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return Promise.reject(err);
  };
  const errors: unknown[] = [];

  const stop = startPolling(() => {}, 1000, getState, (e) => errors.push(e));
  await flush();

  expect(calls).toBe(1);
  expect(errors.length).toBe(1);
  expect(errors[0]).toBe(err);

  // 停止後不應再有任何 getState 呼叫。
  await vi.advanceTimersByTimeAsync(10000);
  await flush();

  expect(calls).toBe(1);
  expect(errors.length).toBe(1);

  stop();
});

test('the returned stop function halts further polling', async () => {
  let calls = 0;
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return Promise.resolve(null);
  };
  const states: Array<PlaybackState | null> = [];

  const stop = startPolling((s) => states.push(s), 1000, getState);
  await flush();
  expect(calls).toBe(1);
  expect(states.length).toBe(1);

  stop();

  await vi.advanceTimersByTimeAsync(10000);
  await flush();

  expect(calls).toBe(1);
  expect(states.length).toBe(1);
});

test('after stop, an in-flight getState resolution does not call onState', async () => {
  const resolvers: Array<(v: PlaybackState | null) => void> = [];
  const getState = (): Promise<PlaybackState | null> =>
    new Promise<PlaybackState | null>((resolve) => {
      resolvers.push(resolve);
    });
  const states: Array<PlaybackState | null> = [];

  const stop = startPolling((s) => states.push(s), 1000, getState);
  await flush();

  expect(resolvers.length).toBe(1);
  stop();

  // 進行中的請求完成，但已經來不及——不能再呼叫 onState。
  resolvers[0]!(null);
  await flush();

  expect(states.length).toBe(0);
});

test('startPolling uses intervalMs * 5 when document.hidden is true', async () => {
  setHidden(true);

  let calls = 0;
  const getState = (): Promise<PlaybackState | null> => {
    calls += 1;
    return Promise.resolve(null);
  };

  const stop = startPolling(() => {}, 1000, getState);
  await flush();
  expect(calls).toBe(1);

  // 尚未到 5000ms，不應再呼叫。
  await vi.advanceTimersByTimeAsync(4999);
  await flush();
  expect(calls).toBe(1);

  // 剛好到 5000ms 時才呼叫第二次。
  await vi.advanceTimersByTimeAsync(1);
  await flush();
  expect(calls).toBe(2);

  stop();
});
