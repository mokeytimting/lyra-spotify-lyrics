import { test, expect, vi, afterEach } from 'vitest';
import { getCached, putCached } from '../../src/translate/cache';
import type { CacheEntry } from '../../src/translate/cache';

type CapturedCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  calls: CapturedCall[] = [],
): typeof fetch {
  const fn = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input);
    const call: CapturedCall = { url };
    if (init !== undefined) call.init = init;
    calls.push(call);
    return await handler(url, init);
  };
  return fn as unknown as typeof fetch;
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  const raw = init?.headers;
  if (raw === undefined) return null;
  if (raw instanceof Headers) {
    return raw.get(name);
  }
  if (Array.isArray(raw)) {
    for (const pair of raw) {
      if (pair[0]!.toLowerCase() === name.toLowerCase()) return pair[1]!;
    }
    return null;
  }
  for (const [key, value] of Object.entries(raw as Record<string, string>)) {
    if (key.toLowerCase() === name.toLowerCase()) return value;
  }
  return null;
}

const TRACK_ID = '4uLU6hMCjMI75M1A2tKUQC';

afterEach(() => {
  vi.restoreAllMocks();
});

test('getCached 以 GET /api/translations/<trackId> 取得快取並回傳合法內容', async () => {
  const calls: CapturedCall[] = [];
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl', lines: ['a', null] }), calls);

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(calls.length).toBe(1);
  expect(calls[0]!.url).toBe(`/api/translations/${TRACK_ID}`);
  expect(entry).toEqual({ engine: 'deepl', lines: ['a', null] });
});

test('getCached 對 trackId 做 encodeURIComponent', async () => {
  const calls: CapturedCall[] = [];
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl', lines: [] }), calls);

  await getCached('a/b +c', fetchImpl);

  expect(calls.length).toBe(1);
  expect(calls[0]!.url).toBe('/api/translations/a%2Fb%20%2Bc');
});

test('getCached 接受 engine 為 chrome 的快取', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'chrome', lines: ['x'] }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toEqual({ engine: 'chrome', lines: ['x'] });
});

test('getCached 接受 lines 為空陣列的快取', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl', lines: [] }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toEqual({ engine: 'deepl', lines: [] });
});

test('getCached 接受 lines 全為 null 的快取', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl', lines: [null, null] }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toEqual({ engine: 'deepl', lines: [null, null] });
});

test('getCached 在 404 時回傳 null', async () => {
  const fetchImpl = stubFetch(() => new Response(null, { status: 404 }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 500 時回傳 null', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ error: 'boom' }, 500));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 204 時回傳 null', async () => {
  const fetchImpl = stubFetch(() => new Response(null, { status: 204 }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 fetch 丟錯時回傳 null 且不丟例外', async () => {
  const fetchImpl = stubFetch(() => {
    throw new Error('network down');
  });

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在回應不是合法 JSON 時回傳 null', async () => {
  const fetchImpl = stubFetch(
    () => new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 body 為 null 時回傳 null', async () => {
  const fetchImpl = stubFetch(() => new Response('null', { status: 200 }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 body 不是物件時回傳 null', async () => {
  const fetchImpl = stubFetch(() => new Response('"hello"', { status: 200 }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 engine 不是 deepl 或 chrome 時回傳 null', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'google', lines: ['a'] }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在缺少 engine 時回傳 null', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ lines: ['a'] }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 lines 不是陣列時回傳 null', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl', lines: 'a' }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 lines 缺少時回傳 null', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl' }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 lines 元素是數字時回傳 null', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl', lines: ['a', 3] }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('getCached 在 lines 元素是物件時回傳 null', async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ engine: 'deepl', lines: ['a', {}] }));

  const entry = await getCached(TRACK_ID, fetchImpl);

  expect(entry).toBeNull();
});

test('putCached 以 PUT 送出 application/json body 到 /api/translations/<trackId>', async () => {
  const calls: CapturedCall[] = [];
  const fetchImpl = stubFetch(() => new Response(null, { status: 200 }), calls);
  const entry: CacheEntry = { engine: 'deepl', lines: ['你好', null] };

  await putCached(TRACK_ID, entry, fetchImpl);

  expect(calls.length).toBe(1);
  expect(calls[0]!.url).toBe(`/api/translations/${TRACK_ID}`);

  const init = calls[0]!.init;
  expect(init?.method).toBe('PUT');
  expect(headerValue(init, 'Content-Type')).toBe('application/json');
  expect(JSON.parse(String(init?.body))).toEqual({ engine: 'deepl', lines: ['你好', null] });
});

test('putCached 對 trackId 做 encodeURIComponent', async () => {
  const calls: CapturedCall[] = [];
  const fetchImpl = stubFetch(() => new Response(null, { status: 200 }), calls);

  await putCached('a/b +c', { engine: 'chrome', lines: [null] }, fetchImpl);

  expect(calls.length).toBe(1);
  expect(calls[0]!.url).toBe('/api/translations/a%2Fb%20%2Bc');
});

test('putCached 送出 chrome 引擎的空 lines 內容', async () => {
  const calls: CapturedCall[] = [];
  const fetchImpl = stubFetch(() => new Response(null, { status: 200 }), calls);

  await putCached(TRACK_ID, { engine: 'chrome', lines: [] }, fetchImpl);

  expect(calls.length).toBe(1);
  expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ engine: 'chrome', lines: [] });
});

test('putCached 在 fetch 丟錯時不丟例外', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetchImpl = stubFetch(() => {
    throw new Error('network down');
  });

  await expect(putCached(TRACK_ID, { engine: 'deepl', lines: ['a'] }, fetchImpl)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
});

test('putCached 在伺服器回應非 2xx 時不丟例外', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetchImpl = stubFetch(() => new Response(null, { status: 500 }));

  await expect(putCached(TRACK_ID, { engine: 'deepl', lines: ['a'] }, fetchImpl)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
});
