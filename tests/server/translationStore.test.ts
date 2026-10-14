import { test, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  isValidTrackId,
  createTranslationStore,
  translationStorePlugin,
} from '../../server/translationStore';

const VALID_ID = '4uLU6hMCjMI75M1A2tKUQC';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'transl-store-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- isValidTrackId --------------------------------------------------------

test('isValidTrackId accepts a 22-character alphanumeric id', () => {
  expect(isValidTrackId(VALID_ID)).toBe(true);
});

test('isValidTrackId rejects ids shorter than 22 characters', () => {
  expect(isValidTrackId(VALID_ID.slice(0, 21))).toBe(false);
});

test('isValidTrackId rejects ids longer than 22 characters', () => {
  expect(isValidTrackId(VALID_ID + 'A')).toBe(false);
});

test('isValidTrackId rejects the empty string', () => {
  expect(isValidTrackId('')).toBe(false);
});

test('isValidTrackId rejects path traversal input such as ../../etc', () => {
  expect(isValidTrackId('../../etc')).toBe(false);
});

test('isValidTrackId rejects a 22-character id containing a hyphen', () => {
  expect(isValidTrackId('ABCDEFGHIJKLMNOPQRSTU-')).toBe(false);
});

test('isValidTrackId rejects a 22-character id containing an underscore', () => {
  expect(isValidTrackId('ABCDEFGHIJKLMNOPQRSTU_')).toBe(false);
});

test('isValidTrackId rejects a 22-character string of spaces', () => {
  expect(isValidTrackId(' '.repeat(22))).toBe(false);
});

// --- createTranslationStore -----------------------------------------------

test('createTranslationStore put then get returns the stored entry', async () => {
  await withTempDir(async (dir) => {
    const store = createTranslationStore(dir);
    const data = { engine: 'deepl', lines: ['a', null, 'b'] };
    await store.put(VALID_ID, data);
    const got = await store.get(VALID_ID);
    expect(got).toEqual(data);
  });
});

test('createTranslationStore put writes to <dir>/<id>.json', async () => {
  await withTempDir(async (dir) => {
    const store = createTranslationStore(dir);
    const data = { hello: 'world' };
    await store.put(VALID_ID, data);
    const raw = await readFile(join(dir, VALID_ID + '.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(data);
  });
});

test('createTranslationStore put creates missing directories recursively', async () => {
  await withTempDir(async (dir) => {
    const nested = join(dir, 'a', 'b', 'c');
    const store = createTranslationStore(nested);
    await store.put(VALID_ID, { ok: true });
    expect(await store.get(VALID_ID)).toEqual({ ok: true });
  });
});

test('createTranslationStore get returns null when the entry is missing', async () => {
  await withTempDir(async (dir) => {
    const store = createTranslationStore(dir);
    const got = await store.get(VALID_ID);
    expect(got).toBeNull();
  });
});

test('createTranslationStore get returns null for an invalid id', async () => {
  await withTempDir(async (dir) => {
    const store = createTranslationStore(dir);
    expect(await store.get('../../etc')).toBeNull();
    expect(await store.get('short')).toBeNull();
    expect(await store.get('')).toBeNull();
  });
});

test('createTranslationStore put throws an Error for an invalid id', async () => {
  await withTempDir(async (dir) => {
    const store = createTranslationStore(dir);
    await expect(store.put('short', { a: 1 })).rejects.toThrow(Error);
    await expect(store.put('../../etc', { a: 1 })).rejects.toThrow(Error);
  });
});

test('createTranslationStore put/get roundtrip preserves JSON-serializable data', async () => {
  await withTempDir(async (dir) => {
    const store = createTranslationStore(dir);
    let seed = 0;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 100; i++) {
      const id = String(i).padStart(22, '0');
      const data = {
        n: Math.floor(rand() * 1000),
        s: 'x'.repeat(Math.floor(rand() * 10)),
        arr: [null, Math.floor(rand() * 100), false],
      };
      await store.put(id, data);
      const got = await store.get(id);
      expect(got).toEqual(data);
    }
  });
});

// --- translationStorePlugin -----------------------------------------------

function setupMiddleware(dir: string): any {
  const plugin: any = translationStorePlugin(dir);
  let middleware: any = null;
  const server = {
    middlewares: {
      use(...args: any[]): void {
        for (const arg of args) {
          if (typeof arg === 'function') {
            middleware = arg;
            break;
          }
        }
      },
    },
  };
  const configure: any = plugin && plugin.configureServer;
  if (typeof configure === 'function') {
    configure(server);
  } else if (configure && typeof configure.handler === 'function') {
    configure.handler(server);
  } else {
    throw new Error('configureServer not found on plugin');
  }
  if (!middleware) {
    throw new Error('middleware was not registered by configureServer');
  }
  return middleware;
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    chunks: [] as string[],
    ended: false,
    setHeader(key: string, value: unknown): void {
      res.headers[String(key).toLowerCase()] = String(value);
    },
    getHeader(key: string): string | undefined {
      return res.headers[String(key).toLowerCase()];
    },
    write(chunk: unknown): boolean {
      if (chunk !== undefined && chunk !== null) {
        res.chunks.push(String(chunk));
      }
      return true;
    },
    end(chunk?: unknown): void {
      if (chunk !== undefined && chunk !== null) {
        res.write(chunk);
      }
      res.ended = true;
    },
    body(): string {
      return res.chunks.join('');
    },
  };
  return res;
}

function makeReq(method: string, url: string, body?: string): any {
  if (body !== undefined) {
    const req: any = Readable.from([Buffer.from(body, 'utf8')]);
    req.method = method;
    req.url = url;
    req.headers = { 'content-type': 'application/json' };
    return req;
  }
  return { method, url, headers: {} as Record<string, string> };
}

/** Runs the middleware and resolves once it either answers or calls next(). */
async function dispatch(middleware: any, req: any, res: any): Promise<boolean> {
  let nextCalled = false;
  await new Promise<void>((resolve) => {
    const originalEnd = res.end.bind(res);
    res.end = (chunk?: unknown): void => {
      originalEnd(chunk);
      resolve();
    };
    try {
      middleware(req, res, () => {
        nextCalled = true;
        resolve();
      });
    } catch {
      resolve();
    }
  });
  return nextCalled;
}

test('plugin ignores paths outside /api/translations and calls next', async () => {
  await withTempDir(async (dir) => {
    const middleware = setupMiddleware(dir);
    const req = makeReq('GET', '/some/other/path');
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(true);
  });
});

test('plugin GET /api/translations/:id returns 200 JSON for a stored entry', async () => {
  await withTempDir(async (dir) => {
    const data = { engine: 'deepl', lines: ['你好', null, '世界'] };
    await createTranslationStore(dir).put(VALID_ID, data);
    const middleware = setupMiddleware(dir);
    const req = makeReq('GET', '/api/translations/' + VALID_ID);
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body())).toEqual(data);
  });
});

test('plugin GET /api/translations/:id returns 404 for a missing entry', async () => {
  await withTempDir(async (dir) => {
    const middleware = setupMiddleware(dir);
    const req = makeReq('GET', '/api/translations/' + VALID_ID);
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(404);
  });
});

test('plugin GET /api/translations/:id returns 400 for an invalid id', async () => {
  await withTempDir(async (dir) => {
    const middleware = setupMiddleware(dir);
    const req = makeReq('GET', '/api/translations/not-valid-id');
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
  });
});

test('plugin PUT /api/translations/:id stores the JSON body and returns 204', async () => {
  await withTempDir(async (dir) => {
    const middleware = setupMiddleware(dir);
    const data = { engine: 'chrome', lines: ['a', null, 'b'] };
    const req = makeReq('PUT', '/api/translations/' + VALID_ID, JSON.stringify(data));
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(204);
    const stored = await createTranslationStore(dir).get(VALID_ID);
    expect(stored).toEqual(data);
  });
});

test('plugin PUT /api/translations/:id returns 400 for an invalid id', async () => {
  await withTempDir(async (dir) => {
    const middleware = setupMiddleware(dir);
    const req = makeReq('PUT', '/api/translations/short', JSON.stringify({ a: 1 }));
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
  });
});

test('plugin PUT /api/translations/:id returns 413 when the body exceeds 1 MB', async () => {
  await withTempDir(async (dir) => {
    const middleware = setupMiddleware(dir);
    const big = 'a'.repeat(1024 * 1024 + 5000);
    const req = makeReq('PUT', '/api/translations/' + VALID_ID, JSON.stringify({ d: big }));
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(413);
    const stored = await createTranslationStore(dir).get(VALID_ID);
    expect(stored).toBeNull();
  });
});

test('plugin responds 405 for unsupported HTTP methods', async () => {
  await withTempDir(async (dir) => {
    const middleware = setupMiddleware(dir);
    const req = makeReq('DELETE', '/api/translations/' + VALID_ID);
    const res = makeRes();
    const nextCalled = await dispatch(middleware, req, res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(405);
  });
});
