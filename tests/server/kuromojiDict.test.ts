import { test, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { Writable } from 'node:stream';
import { resolveDictFile, kuromojiDictPlugin } from '../../server/kuromojiDict';

const DICT_DIR = '/srv/kuromoji/dict';

// ---------------------------------------------------------------------------
// resolveDictFile
// ---------------------------------------------------------------------------

test('resolveDictFile：合法單一檔名回傳 path.join(dictDir, 檔名)', () => {
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz', DICT_DIR)).toBe(
    path.join(DICT_DIR, 'base.dat.gz'),
  );
  expect(resolveDictFile('/kuromoji-dict/a.dat.gz', DICT_DIR)).toBe(
    path.join(DICT_DIR, 'a.dat.gz'),
  );
  expect(resolveDictFile('/kuromoji-dict/kuromoji_ipadic.dat.gz', DICT_DIR)).toBe(
    path.join(DICT_DIR, 'kuromoji_ipadic.dat.gz'),
  );
  expect(resolveDictFile('/kuromoji-dict/_.dat.gz', DICT_DIR)).toBe(
    path.join(DICT_DIR, '_.dat.gz'),
  );
});

test('resolveDictFile：忽略 query string', () => {
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz?v=1', DICT_DIR)).toBe(
    path.join(DICT_DIR, 'base.dat.gz'),
  );
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz?a=b&c=d', DICT_DIR)).toBe(
    path.join(DICT_DIR, 'base.dat.gz'),
  );
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz?', DICT_DIR)).toBe(
    path.join(DICT_DIR, 'base.dat.gz'),
  );
});

test('resolveDictFile：空輸入、只有空白、缺檔名皆回傳 null', () => {
  expect(resolveDictFile('', DICT_DIR)).toBeNull();
  expect(resolveDictFile('   ', DICT_DIR)).toBeNull();
  expect(resolveDictFile('\t', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict', DICT_DIR)).toBeNull();
});

test('resolveDictFile：前綴不是 /kuromoji-dict/ 時回傳 null', () => {
  expect(resolveDictFile('/other/base.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('kuromoji-dict/base.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dictX/base.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dictother/base.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/base.dat.gz', DICT_DIR)).toBeNull();
});

test('resolveDictFile：含 .. 的路徑穿越一律回傳 null', () => {
  expect(resolveDictFile('/kuromoji-dict/../secret.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/../../etc/passwd', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/..', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/....dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/%2e%2e/base.dat.gz', DICT_DIR)).toBeNull();
});

test('resolveDictFile：子資料夾形式回傳 null', () => {
  expect(resolveDictFile('/kuromoji-dict/sub/base.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/sub/', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/a/b/c.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz/', DICT_DIR)).toBeNull();
});

test('resolveDictFile：檔名不符 /^[a-z_]+\\.dat\\.gz$/ 時回傳 null', () => {
  expect(resolveDictFile('/kuromoji-dict/base.dat', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base.dat.gzip', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/BASE.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/Base.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base-1.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base 1.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base%20name.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base\\name.dat.gz', DICT_DIR)).toBeNull();
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz.bak', DICT_DIR)).toBeNull();
});

test('resolveDictFile：回傳值以傳入的 dictDir 為基準', () => {
  const other = path.join('relative', 'other', 'dict');
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz', other)).toBe(
    path.join(other, 'base.dat.gz'),
  );
  const another = path.join('/tmp', 'dict-two');
  expect(resolveDictFile('/kuromoji-dict/base.dat.gz', another)).toBe(
    path.join(another, 'base.dat.gz'),
  );
});

// ---------------------------------------------------------------------------
// kuromojiDictPlugin
// ---------------------------------------------------------------------------

function getMiddleware(dictDir: string): unknown {
  const plugin = kuromojiDictPlugin(dictDir);
  let middleware: unknown = null;
  const server = {
    middlewares: {
      use(fn: unknown) {
        middleware = fn;
      },
    },
  };
  (plugin.configureServer as unknown as (s: unknown) => unknown)(server);
  return middleware;
}

interface FakeRes {
  res: any;
  headers: Record<string, string>;
  body: () => Buffer;
}

function makeFakeRes(): FakeRes {
  const chunks: Buffer[] = [];
  const res: any = new Writable({
    write(chunk: Buffer, _enc: string, cb: (e?: Error | null) => void) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  res.statusCode = 200;
  res.headers = {} as Record<string, string>;
  res.setHeader = (name: string, value: unknown) => {
    res.headers[String(name).toLowerCase()] = String(value);
  };
  res.getHeader = (name: string) => res.headers[String(name).toLowerCase()];
  res.removeHeader = (name: string) => {
    delete res.headers[String(name).toLowerCase()];
  };
  res.writeHead = (status: number, hdrs?: Record<string, unknown>) => {
    res.statusCode = status;
    if (hdrs) {
      for (const key of Object.keys(hdrs)) {
        res.setHeader(key, hdrs[key]);
      }
    }
    return res;
  };
  return { res, headers: res.headers, body: () => Buffer.concat(chunks) };
}

function invokeMiddleware(
  middleware: any,
  url: string,
  res: any,
): Promise<{ nextCalled: boolean }> {
  return new Promise((resolve, reject) => {
    let nextCalled = false;
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve({ nextCalled });
    };
    const timer = setTimeout(() => finish(new Error('middleware 未回應')), 2000);
    res.on('finish', () => finish());
    res.on('close', () => finish());
    const next = () => {
      nextCalled = true;
      finish();
    };
    try {
      const returned = middleware({ url, method: 'GET', headers: {} }, res, next);
      if (returned && typeof returned.then === 'function') {
        returned.then(
          () => {
            if (!settled && !res.writableFinished) finish();
          },
          (e: unknown) => finish(e instanceof Error ? e : new Error(String(e))),
        );
      }
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function makeTempDict(entries: Record<string, Buffer | string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuromoji-dict-test-'));
  for (const name of Object.keys(entries)) {
    fs.writeFileSync(path.join(dir, name), entries[name]);
  }
  return dir;
}

// 注意：測試過程不刪除建立的暫存目錄，避免使用任何遞迴刪除操作。

test('kuromojiDictPlugin：回傳含 configureServer 函式的 plugin（含使用預設參數）', () => {
  const plugin = kuromojiDictPlugin(DICT_DIR);
  expect(typeof plugin.configureServer).toBe('function');

  const defaultPlugin = kuromojiDictPlugin();
  expect(typeof defaultPlugin.configureServer).toBe('function');
});

test('kuromojiDictPlugin middleware：存在的字典檔以 application/octet-stream 原樣輸出且不加 Content-Encoding', async () => {
  const dictDir = makeTempDict({
    'base.dat.gz': Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03, 0xff, 0x7a]),
  });
  const middleware = getMiddleware(dictDir);
  expect(typeof middleware).toBe('function');
  const { res, headers, body } = makeFakeRes();
  const result = await invokeMiddleware(middleware, '/kuromoji-dict/base.dat.gz', res);

  expect(result.nextCalled).toBe(false);
  expect(headers['content-type']).toBe('application/octet-stream');
  expect(headers['content-encoding']).toBeUndefined();
  expect(body()).toEqual(
    Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03, 0xff, 0x7a]),
  );
});

test('kuromojiDictPlugin middleware：帶 query string 的合法路徑仍輸出同一個檔案', async () => {
  const dictDir = makeTempDict({ 'base.dat.gz': 'DICT-CONTENT' });
  const middleware = getMiddleware(dictDir);
  const { res, headers, body } = makeFakeRes();
  const result = await invokeMiddleware(
    middleware,
    '/kuromoji-dict/base.dat.gz?version=2',
    res,
  );

  expect(result.nextCalled).toBe(false);
  expect(headers['content-type']).toBe('application/octet-stream');
  expect(headers['content-encoding']).toBeUndefined();
  expect(body()).toEqual(Buffer.from('DICT-CONTENT'));
});

test('kuromojiDictPlugin middleware：合法路徑但檔案不存在時呼叫 next()', async () => {
  const dictDir = makeTempDict({ 'base.dat.gz': 'DICT-CONTENT' });
  const middleware = getMiddleware(dictDir);
  const { res, body } = makeFakeRes();
  const result = await invokeMiddleware(middleware, '/kuromoji-dict/missing.dat.gz', res);

  expect(result.nextCalled).toBe(true);
  expect(body().length).toBe(0);
});

test('kuromojiDictPlugin middleware：路徑不合規則時呼叫 next()', async () => {
  const dictDir = makeTempDict({ 'base.dat.gz': 'DICT-CONTENT' });
  const middleware = getMiddleware(dictDir);
  const badUrls = [
    '',
    '/',
    '/other/base.dat.gz',
    '/kuromoji-dict/',
    '/kuromoji-dict',
    '/kuromoji-dict/../base.dat.gz',
    '/kuromoji-dict/sub/base.dat.gz',
    '/kuromoji-dict/base.dat',
    '/kuromoji-dict/BASE.dat.gz',
    '/kuromoji-dict/base-1.dat.gz',
  ];
  for (const url of badUrls) {
    const { res, body } = makeFakeRes();
    const result = await invokeMiddleware(middleware, url, res);
    expect(result.nextCalled, `url=${url} 應該呼叫 next()`).toBe(true);
    expect(body().length, `url=${url} 不應該輸出內容`).toBe(0);
  }
});
