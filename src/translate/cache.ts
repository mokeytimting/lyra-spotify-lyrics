/**
 * 翻譯硬碟快取（計畫 Task 8）。
 *
 * 翻譯結果存在本機伺服器的 `data/translations/<trackId>.json`，
 * 瀏覽器端只透過 `/api/translations/:trackId` 讀寫。
 * 讀取失敗或形狀不對時一律當作沒有快取，不中斷翻譯流程；
 * 寫入失敗只留下警告，不影響畫面。
 */

export type CacheEntry = {
  engine: 'deepl' | 'chrome' | 'azure' | 'openai';
  lines: (string | null)[];
  /** 翻譯目標語言（舊快取沒有） */
  target?: string;
};

const CACHE_PATH = '/api/translations/';

function cacheUrl(trackId: string): string {
  return CACHE_PATH + encodeURIComponent(trackId);
}

/**
 * 檢查伺服器回來的 JSON 是否符合 CacheEntry 形狀。
 */
function isCacheEntry(value: unknown): value is CacheEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { engine?: unknown; lines?: unknown };

  if (!['deepl', 'chrome', 'azure', 'openai'].includes(candidate.engine as string)) {
    return false;
  }

  if (!Array.isArray(candidate.lines)) {
    return false;
  }

  for (const line of candidate.lines) {
    if (line !== null && typeof line !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * 讀取指定歌曲的翻譯快取。
 * 任何失敗（404、非 2xx、JSON 解析失敗、形狀不對、網路錯誤）都回傳 null。
 */
export async function getCached(
  trackId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CacheEntry | null> {
  try {
    const res = await fetchImpl(cacheUrl(trackId), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return null;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }

    if (!isCacheEntry(body)) {
      return null;
    }

    const target = (body as { target?: unknown }).target;
    return {
      engine: body.engine,
      lines: body.lines.slice(),
      ...(typeof target === 'string' ? { target } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * 寫入指定歌曲的翻譯快取。
 * 失敗時只印出警告，永不丟出例外。
 */
export async function putCached(
  trackId: string,
  entry: CacheEntry,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const res = await fetchImpl(cacheUrl(trackId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: entry.engine,
        lines: entry.lines,
      }),
    });

    if (!res.ok) {
      console.warn(
        `翻譯快取寫入失敗（${trackId}）：HTTP ${res.status}`,
      );
    }
  } catch (err) {
    console.warn(`翻譯快取寫入失敗（${trackId}）`, err);
  }
}
