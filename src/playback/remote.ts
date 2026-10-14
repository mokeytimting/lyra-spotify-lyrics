import { CONFIG } from '../config';
import { getPlaybackState, QuotaExceededError } from '../spotify/api';
import type { PlaybackState } from '../spotify/types';

/**
 * App 模式輪詢：以固定間隔向 Spotify Web API 詢問目前的播放狀態。
 *
 * - 啟動時立刻取一次，之後每隔 intervalMs 取一次。
 * - 上一次請求尚未完成時，該次排程直接跳過（不會重疊請求）。
 * - 結果交給 onState；getState 丟錯時交給 onError（若有）並繼續輪詢。
 * - 若錯誤是 QuotaExceededError，先停止輪詢再呼叫 onError。
 * - document.hidden 為 true 時，間隔延長為 intervalMs * 5。
 * - 回傳的停止函式被呼叫後，即使有進行中的請求完成，也不會再呼叫 onState。
 */
export function startPolling(
  onState: (s: PlaybackState | null) => void,
  intervalMs: number = CONFIG.remotePollMs,
  getState: () => Promise<PlaybackState | null> = getPlaybackState,
  onError?: (e: unknown) => void,
): () => void {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const baseMs =
    Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : CONFIG.remotePollMs;

  function isDocumentHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden === true;
  }

  function nextDelay(): number {
    return isDocumentHidden() ? baseMs * 5 : baseMs;
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, nextDelay());
  }

  function isQuotaError(e: unknown): boolean {
    if (typeof QuotaExceededError === 'function' && e instanceof QuotaExceededError) {
      return true;
    }
    return (
      typeof e === 'object' &&
      e !== null &&
      (e as { name?: unknown }).name === 'QuotaExceededError'
    );
  }

  async function tick(): Promise<void> {
    if (stopped) return;

    if (inFlight) {
      schedule();
      return;
    }

    inFlight = true;
    try {
      const state = await getState();
      if (!stopped) {
        onState(state);
      }
    } catch (e) {
      if (isQuotaError(e)) {
        stop();
        if (onError) {
          onError(e);
        }
        return;
      }
      if (!stopped && onError) {
        onError(e);
      }
    } finally {
      inFlight = false;
    }

    schedule();
  }

  void tick();

  return stop;
}
