import { describe, expect, test } from 'vitest';

import {
  fetchLyrics,
  normalize,
  searchCandidates,
  titleVariants,
} from '../../src/lyrics/lrclib';

import type { Track } from '../../src/spotify/types';

const LRC_3_LINES = '[00:01.00]one\n[00:02.00]two\n[00:03.00]three';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    uri: 'spotify:track:track-1',
    name: 'Lemon',
    artists: ['米津玄師'],
    album: 'BOOTLEG',
    durationMs: 255_000,
    imageUrl: null,
    ...overrides,
  };
}

function makeRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    trackName: 'Lemon',
    artistName: '米津玄師',
    albumName: 'BOOTLEG',
    duration: 255,
    instrumental: false,
    syncedLyrics: LRC_3_LINES,
    plainLyrics: 'one two three',
    ...overrides,
  };
}

interface RouteResult {
  status: number;
  data?: unknown;
}

interface FetchHarness {
  impl: typeof fetch;
  urls: string[];
  headers: Record<string, string>[];
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const maybeGet = (headers as unknown as { get?: (key: string) => string | null }).get;
  if (typeof maybeGet === 'function') {
    return maybeGet.call(headers, name) ?? undefined;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return value;
    }
  }
  return undefined;
}

function createFetch(route: (url: string) => RouteResult): FetchHarness {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];

  const impl = async (input: unknown, init?: { headers?: unknown }): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input);
    urls.push(url);
    headers.push((init?.headers ?? {}) as Record<string, string>);
    const result = route(url);
    const response = {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.data ?? null,
    };
    return response as unknown as Response;
  };

  return { impl: impl as unknown as typeof fetch, urls, headers };
}

function throwingFetch(): typeof fetch {
  const impl = async (): Promise<Response> => {
    throw new Error('network unavailable');
  };
  return impl as unknown as typeof fetch;
}

describe('normalize', () => {
  test('全形字母經 NFKC 轉半形並轉成小寫', () => {
    expect(normalize('Ｌｅｍｏｎ')).toBe('lemon');
  });

  test('移除空白與標點符號，保留各國文字', () => {
    expect(normalize('Lemon - レモン！')).toBe('lemonレモン');
  });

  test('保留韓文，移除全形括號，全形數字轉半形', () => {
    expect(normalize('아이유（IU）２')).toBe('아이유iu2');
  });

  test('只有空白與標點時回傳空字串', () => {
    expect(normalize('  ---  ')).toBe('');
  });
});

describe('titleVariants', () => {
  test("'Lemon (レモン)' 產生括號外的 'Lemon' 與括號內的 'レモン'", () => {
    const variants = titleVariants('Lemon (レモン)');
    expect(variants).toContain('Lemon');
    expect(variants).toContain('レモン');
  });

  test("含 ' - ' 時取前半作為候選", () => {
    const variants = titleVariants('Lemon - Remastered 2009');
    expect(variants).toContain('Lemon');
  });

  test('全形括號、【】與「」內外各自成為候選', () => {
    expect(titleVariants('Lemon（レモン）')).toContain('レモン');
    expect(titleVariants('【Lemon】')).toContain('Lemon');
    expect(titleVariants('「Lemon」')).toContain('Lemon');
  });

  test('不含空字串且不重複', () => {
    const variants = titleVariants('Lemon (Lemon)');
    expect(variants).not.toContain('');
    expect(new Set(variants).size).toBe(variants.length);
  });

  test('空字串沒有候選', () => {
    expect(titleVariants('')).toEqual([]);
  });
});

describe('fetchLyrics：請求建構與 header', () => {
  test('每個請求都帶 Lrclib-Client header', async () => {
    const harness = createFetch(() => ({ status: 404 }));
    await fetchLyrics(makeTrack(), harness.impl);

    expect(harness.urls.length > 0).toBe(true);
    for (const headers of harness.headers) {
      expect(headerValue(headers, 'Lrclib-Client')).toBe('Lyra (https://github.com/mokeytimting/lyra-spotify-lyrics)');
    }
  });

  test('所有請求都使用 https://lrclib.net/api 為 base', async () => {
    const harness = createFetch(() => ({ status: 404 }));
    await fetchLyrics(makeTrack(), harness.impl);

    expect(harness.urls.length > 0).toBe(true);
    for (const url of harness.urls) {
      expect(url.startsWith('https://lrclib.net/api/'), url).toBe(true);
    }
  });

  test('指定 lrclibId 時直接 GET /get/<id> 且只發一個請求', async () => {
    const harness = createFetch((url) =>
      url === 'https://lrclib.net/api/get/42'
        ? { status: 200, data: makeRecord() }
        : { status: 404 },
    );

    const result = await fetchLyrics(makeTrack(), harness.impl, { lrclibId: 42 });

    expect(result.kind).toBe('synced');
    expect(harness.urls.length).toBe(1);
    expect(new URL(harness.urls[0] ?? '').pathname).toBe('/api/get/42');
  });

  test('指定 lrclibId 的結果不檢查長度誤差', async () => {
    const harness = createFetch((url) =>
      url === 'https://lrclib.net/api/get/7'
        ? { status: 200, data: makeRecord({ duration: 5 }) }
        : { status: 404 },
    );

    const result = await fetchLyrics(makeTrack({ durationMs: 255_000 }), harness.impl, {
      lrclibId: 7,
    });

    expect(result.kind).toBe('synced');
  });

  test('第一輪 /get 帶 track_name、artist_name、album_name、duration', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/get' && parsed.searchParams.get('album_name') !== null) {
        return { status: 200, data: makeRecord({ duration: 255 }) };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);
    expect(result.kind).toBe('synced');

    const first = new URL(harness.urls[0] ?? '');
    expect(first.pathname).toBe('/api/get');
    expect(first.searchParams.get('track_name')).toBe('Lemon');
    expect(first.searchParams.get('artist_name')).toBe('米津玄師');
    expect(first.searchParams.get('album_name')).toBe('BOOTLEG');
    expect(first.searchParams.get('duration')).toBe('255');
  });

  test('帶 album_name 找不到時，會再以原始標題與第一位歌手不帶 album_name 查一次', async () => {
    const harness = createFetch(() => ({ status: 404 }));
    await fetchLyrics(makeTrack(), harness.impl);

    const retried = harness.urls.some((url) => {
      const parsed = new URL(url);
      return (
        parsed.pathname === '/api/get' &&
        parsed.searchParams.get('album_name') === null &&
        parsed.searchParams.get('track_name') === 'Lemon' &&
        parsed.searchParams.get('artist_name') === '米津玄師'
      );
    });

    expect(retried).toBe(true);
  });

  test('對每個 titleVariant 都嘗試 /get 查詢', async () => {
    const harness = createFetch(() => ({ status: 404 }));
    await fetchLyrics(makeTrack({ name: 'Lemon (レモン)' }), harness.impl);

    const trackNames = harness.urls.map((url) => new URL(url).searchParams.get('track_name'));
    expect(trackNames).toContain('Lemon');
    expect(trackNames).toContain('レモン');
  });

  test('只使用前三位歌手', async () => {
    const harness = createFetch(() => ({ status: 404 }));
    await fetchLyrics(makeTrack({ artists: ['A', 'B', 'C', 'D'] }), harness.impl);

    const artistNames = harness.urls
      .map((url) => new URL(url).searchParams.get('artist_name'))
      .filter((value): value is string => value !== null);

    expect(artistNames).toContain('A');
    expect(artistNames).not.toContain('D');
  });

  test('同一個 URL 不重複請求', async () => {
    const harness = createFetch(() => ({ status: 404 }));
    await fetchLyrics(makeTrack({ name: 'Lemon (レモン)', artists: ['A', 'B'] }), harness.impl);

    expect(new Set(harness.urls).size).toBe(harness.urls.length);
  });

  test('總請求數不超過 14', async () => {
    const harness = createFetch(() => ({ status: 404 }));
    await fetchLyrics(
      makeTrack({ name: 'Lemon (レモン) - Remastered 2009', artists: ['A', 'B', 'C'] }),
      harness.impl,
    );

    expect(harness.urls.length >= 3, `實際請求數 ${harness.urls.length}`).toBe(true);
    expect(harness.urls.length <= 14, `實際請求數 ${harness.urls.length}`).toBe(true);
  });
});

describe('fetchLyrics：結果挑選與錯誤處理', () => {
  test('/get 失敗後改用 /search，非 2xx 不中斷流程', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search' && parsed.searchParams.get('track_name') !== null) {
        return { status: 200, data: [makeRecord({ duration: 255 })] };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result.kind).toBe('synced');
    if (result.kind === 'synced') {
      expect(result.lines.length).toBe(3);
      expect(result.lines[0]?.text).toBe('one');
    }
  });

  test('/get 回傳的長度誤差超過 2 秒時不採用', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/get') {
        return { status: 200, data: makeRecord({ duration: 100 }) };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result).toEqual({ kind: 'none' });
  });

  test('/search 結果中 instrumental 為 true 者不採用', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [
            makeRecord({
              instrumental: true,
              syncedLyrics: '[00:01.00]wrong\n[00:02.00]wrong\n[00:03.00]wrong',
            }),
            makeRecord({
              syncedLyrics: '[00:01.00]right\n[00:02.00]right\n[00:03.00]right',
            }),
          ],
        };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result.kind).toBe('synced');
    if (result.kind === 'synced') {
      expect(result.lines[0]?.text).toBe('right');
    }
  });

  test('/search 結果中 syncedLyrics 為空白字串者不採用', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [
            makeRecord({ syncedLyrics: '   ' }),
            makeRecord({
              syncedLyrics: '[00:01.00]right\n[00:02.00]right\n[00:03.00]right',
            }),
          ],
        };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result.kind).toBe('synced');
    if (result.kind === 'synced') {
      expect(result.lines[0]?.text).toBe('right');
    }
  });

  test('/search 結果長度誤差超過 2 秒者不採用', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [
            makeRecord({
              duration: 250,
              syncedLyrics: '[00:01.00]wrong\n[00:02.00]wrong\n[00:03.00]wrong',
            }),
            makeRecord({
              duration: 255,
              syncedLyrics: '[00:01.00]right\n[00:02.00]right\n[00:03.00]right',
            }),
          ],
        };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result.kind).toBe('synced');
    if (result.kind === 'synced') {
      expect(result.lines[0]?.text).toBe('right');
    }
  });

  test('/search 符合者中取長度誤差最小者', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [
            makeRecord({
              duration: 253.5,
              syncedLyrics: '[00:01.00]far\n[00:02.00]far\n[00:03.00]far',
            }),
            makeRecord({
              duration: 255,
              syncedLyrics: '[00:01.00]close\n[00:02.00]close\n[00:03.00]close',
            }),
          ],
        };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result.kind).toBe('synced');
    if (result.kind === 'synced') {
      expect(result.lines[0]?.text).toBe('close');
    }
  });

  test('/search 全部長度誤差超過 2 秒時回傳 none', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return { status: 200, data: [makeRecord({ duration: 200 })] };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result).toEqual({ kind: 'none' });
  });

  test('/search 結果歌名與查詢歌名不相符時不採用', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return { status: 200, data: [makeRecord({ trackName: 'Something Else' })] };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result).toEqual({ kind: 'none' });
  });

  test('只查歌名的步驟不比對歌手名稱', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        if (parsed.searchParams.get('q') !== null) {
          return { status: 200, data: [] };
        }
        if (parsed.searchParams.get('artist_name') !== null) {
          return { status: 200, data: [] };
        }
        return { status: 200, data: [makeRecord({ artistName: 'Kenshi Yonezu' })] };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result.kind).toBe('synced');
  });

  test('只查歌名的步驟長度誤差須在 1.5 秒內', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        if (parsed.searchParams.get('q') !== null) {
          return { status: 200, data: [] };
        }
        if (parsed.searchParams.get('artist_name') !== null) {
          return { status: 200, data: [] };
        }
        return { status: 200, data: [makeRecord({ duration: 253.2 })] };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result).toEqual({ kind: 'none' });
  });

  test('同步歌詞解析後非空白行少於 3 行視為無效', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [makeRecord({ syncedLyrics: '[00:01.00]one\n[00:02.00]two' })],
        };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result).toEqual({ kind: 'none' });
  });

  test('網路錯誤時回傳 none 且不丟出例外', async () => {
    const result = await fetchLyrics(makeTrack(), throwingFetch());

    expect(result).toEqual({ kind: 'none' });
  });

  test('全部回應皆非 2xx 時回傳 none', async () => {
    const harness = createFetch(() => ({ status: 500 }));

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result).toEqual({ kind: 'none' });
  });

  test('成功時回傳 { kind: synced, lines } 形狀', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/get') {
        return { status: 200, data: makeRecord({ duration: 255 }) };
      }
      return { status: 404 };
    });

    const result = await fetchLyrics(makeTrack(), harness.impl);

    expect(result.kind).toBe('synced');
    if (result.kind === 'synced') {
      expect(Array.isArray(result.lines)).toBe(true);
      expect(result.lines.length).toBe(3);
      for (const line of result.lines) {
        expect(typeof line.timeMs).toBe('number');
        expect(typeof line.text).toBe('string');
      }
    }
  });
});

describe('searchCandidates', () => {
  test('GET /search?q=<query> 並對應成 LyricsCandidate', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [
            {
              id: 7,
              trackName: 'Lemon',
              artistName: '米津玄師',
              albumName: 'BOOTLEG',
              duration: 255.5,
              instrumental: false,
              syncedLyrics: LRC_3_LINES,
              plainLyrics: 'one two three',
            },
          ],
        };
      }
      return { status: 404 };
    });

    const result = await searchCandidates('米津玄師 Lemon', harness.impl);

    expect(harness.urls.length).toBe(1);
    const parsed = new URL(harness.urls[0] ?? '');
    expect(parsed.pathname).toBe('/api/search');
    expect(parsed.searchParams.get('q')).toBe('米津玄師 Lemon');

    expect(result.length).toBe(1);
    expect(result[0]).toEqual({
      id: 7,
      trackName: 'Lemon',
      artistName: '米津玄師',
      albumName: 'BOOTLEG',
      durationSec: 255.5,
      synced: true,
    });
  });

  test('syncedLyrics 非空字串時 synced 為 true，否則為 false', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [
            {
              id: 1,
              trackName: 'A',
              artistName: 'X',
              albumName: 'Al',
              duration: 100,
              syncedLyrics: LRC_3_LINES,
            },
            {
              id: 2,
              trackName: 'B',
              artistName: 'Y',
              albumName: 'Bl',
              duration: 100,
              syncedLyrics: null,
            },
            {
              id: 3,
              trackName: 'C',
              artistName: 'Z',
              albumName: 'Cl',
              duration: 100,
              syncedLyrics: '',
            },
          ],
        };
      }
      return { status: 404 };
    });

    const result = await searchCandidates('q', harness.impl);

    expect(result.length).toBe(3);
    const byId = new Map(result.map((candidate) => [candidate.id, candidate]));
    expect(byId.get(1)?.synced).toBe(true);
    expect(byId.get(2)?.synced).toBe(false);
    expect(byId.get(3)?.synced).toBe(false);
  });

  test('有同步歌詞的結果排在前面', async () => {
    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return {
          status: 200,
          data: [
            {
              id: 1,
              trackName: 'A',
              artistName: 'X',
              albumName: 'Al',
              duration: 100,
              syncedLyrics: null,
            },
            {
              id: 2,
              trackName: 'B',
              artistName: 'Y',
              albumName: 'Bl',
              duration: 100,
              syncedLyrics: LRC_3_LINES,
            },
          ],
        };
      }
      return { status: 404 };
    });

    const result = await searchCandidates('q', harness.impl);

    expect(result.length).toBe(2);
    expect(result[0]?.id).toBe(2);
    expect(result[0]?.synced).toBe(true);
    expect(result[1]?.id).toBe(1);
    expect(result[1]?.synced).toBe(false);
  });

  test('最多回傳 20 筆', async () => {
    const many = Array.from({ length: 25 }, (_unused, index) => ({
      id: index + 1,
      trackName: `Track ${index}`,
      artistName: 'Artist',
      albumName: 'Album',
      duration: 100,
      syncedLyrics: null,
    }));

    const harness = createFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/search') {
        return { status: 200, data: many };
      }
      return { status: 404 };
    });

    const result = await searchCandidates('q', harness.impl);

    expect(result.length).toBe(20);
  });

  test('請求帶 Lrclib-Client header', async () => {
    const harness = createFetch(() => ({ status: 200, data: [] }));

    await searchCandidates('q', harness.impl);

    expect(harness.headers.length).toBe(1);
    expect(headerValue(harness.headers[0] ?? {}, 'Lrclib-Client')).toBe(
      'Lyra (https://github.com/mokeytimting/lyra-spotify-lyrics)',
    );
  });

  test('fetch 丟出例外時回傳空陣列', async () => {
    const result = await searchCandidates('q', throwingFetch());

    expect(result).toEqual([]);
  });

  test('非 2xx 時回傳空陣列', async () => {
    const harness = createFetch(() => ({ status: 503 }));

    const result = await searchCandidates('q', harness.impl);

    expect(result).toEqual([]);
  });
});
