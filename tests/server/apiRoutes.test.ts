// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiPlugin, handleApi } from '../../server/apiRoutes';

const dataDir = mkdtempSync(path.join(tmpdir(), 'api-routes-'));

let dirCounter = 0;

function uniqueDir(): string {
  dirCounter += 1;
  return path.join(dataDir, `case-${dirCounter}`);
}

function makeAppSettings() {
  return {
    spotifyClientId: 'client-1',
    translation: {
      engine: 'chrome',
      deepl: { apiKey: 'deepl-key' },
      azure: { apiKey: 'azure-key', region: 'east-asia' },
      openai: { baseUrl: 'local-endpoint', model: 'gpt-4o-mini', apiKey: 'openai-key' },
    },
  };
}

function makePublicSettings() {
  return {
    spotifyClientId: 'client-1',
    translation: {
      engine: 'chrome',
      deepl: { hasKey: true },
      azure: { hasKey: true, region: 'east-asia' },
      openai: { baseUrl: 'local-endpoint', model: 'gpt-4o-mini', hasKey: true },
    },
  };
}

function makeHarness(dir: string) {
  const settings = makeAppSettings();
  const publicSettings = makePublicSettings();
  const calls = {
    load: 0,
    save: [] as unknown[],
    toPublic: [] as unknown[],
    translateWith: [] as unknown[],
    testEngine: [] as unknown[],
  };
  const handlers: any = {
    load: async () => settings,
    save: async (patch: unknown) => {
      calls.save.push(patch);
      return settings;
    },
    toPublic: (s: any) => {
      calls.toPublic.push(s);
      return publicSettings;
    },
    translateWith: async (s: any, texts: string[], sourceLang: string | undefined) => {
      calls.translateWith.push({ settings: s, texts, sourceLang });
      return { engine: 'chrome', translations: texts.map((t: string) => `t:${t}`) };
    },
    testEngine: async (s: any) => {
      calls.testEngine.push(s);
      return { ok: true, sample: 'sample' };
    },
  };
  const deps: any = {
    settings: {
      load: async () => {
        calls.load += 1;
        return handlers.load();
      },
      save: async (patch: unknown) => handlers.save(patch),
      toPublic: (s: any) => handlers.toPublic(s),
    },
    translateWith: (s: any, texts: string[], sourceLang: string | undefined) =>
      handlers.translateWith(s, texts, sourceLang),
    testEngine: (s: any) => handlers.testEngine(s),
    dataDir: dir,
  };
  return { deps, calls, handlers, settings, publicSettings };
}

function getMiddleware(deps: any): any {
  const plugin: any = apiPlugin(deps);
  let middleware: any = null;
  const server: any = {
    middlewares: {
      use: (fn: any) => {
        middleware = fn;
      },
    },
  };
  const hook = plugin.configureServer;
  const configure = typeof hook === 'function' ? hook : hook && hook.handler;
  if (typeof configure !== 'function') {
    throw new Error('configureServer 應為可呼叫的 hook');
  }
  configure(server);
  if (typeof middleware !== 'function') {
    throw new Error('configureServer 應註冊 middleware');
  }
  return middleware;
}

async function dispatch(middleware: any, method: string, url: string, chunks: Buffer[] = []) {
  const req: any = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {};
  const state = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    ended: false,
    nextCalled: false,
  };
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const res: any = {
    statusCode: 0,
    setHeader(k: string, v: string) {
      state.headers[k] = v;
    },
    end(chunk?: unknown) {
      state.statusCode = res.statusCode;
      if (typeof chunk === 'string') state.body += chunk;
      else if (Buffer.isBuffer(chunk)) state.body += chunk.toString('utf8');
      state.ended = true;
      resolveDone();
    },
  };
  middleware(req, res, () => {
    state.nextCalled = true;
    resolveDone();
  });
  setImmediate(() => {
    for (const c of chunks) req.emit('data', c);
    req.emit('end');
  });
  await done;
  return state;
}

/* ------------------------------------------------------------------ */
/* handleApi：路徑判定                                                  */
/* ------------------------------------------------------------------ */

describe('handleApi：路徑判定', () => {
  test('非本模組路徑回傳 null', async () => {
    const h = makeHarness(uniqueDir());
    expect(await handleApi('GET', '/index.html', undefined, h.deps)).toBeNull();
    expect(await handleApi('GET', '/src/main.ts', undefined, h.deps)).toBeNull();
    expect(await handleApi('POST', '/other/thing', {}, h.deps)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/settings                                                   */
/* ------------------------------------------------------------------ */

describe('GET /api/settings', () => {
  test('回 200，body 為 toPublic(load())', async () => {
    const h = makeHarness(uniqueDir());
    const res = await handleApi('GET', '/api/settings', undefined, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.json).toEqual(h.publicSettings);
    expect(h.calls.load).toBe(1);
    expect(h.calls.toPublic[0]).toEqual(h.settings);
  });
});

/* ------------------------------------------------------------------ */
/* PUT /api/settings                                                   */
/* ------------------------------------------------------------------ */

describe('PUT /api/settings', () => {
  test('以 body 呼叫 save，回 200 與 toPublic 結果', async () => {
    const h = makeHarness(uniqueDir());
    const patch = { spotifyClientId: 'new-client', translation: { engine: 'deepl' } };
    const res = await handleApi('PUT', '/api/settings', patch, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.json).toEqual(h.publicSettings);
    expect(h.calls.save).toHaveLength(1);
    expect(h.calls.save[0]).toEqual(patch);
    expect(h.calls.toPublic[0]).toEqual(h.settings);
  });

  test('save 丟錯時回 400 BAD_REQUEST 並附 message', async () => {
    const h = makeHarness(uniqueDir());
    h.handlers.save = async () => {
      throw new Error('儲存失敗');
    };
    const res = await handleApi('PUT', '/api/settings', {}, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const json = res!.json as { error?: string; message?: string };
    expect(json.error).toBe('BAD_REQUEST');
    expect(typeof json.message).toBe('string');
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/translate                                                 */
/* ------------------------------------------------------------------ */

describe('POST /api/translate', () => {
  test('合法請求回 200，並傳入 load() 的設定、texts 與 sourceLang', async () => {
    const h = makeHarness(uniqueDir());
    const res = await handleApi(
      'POST',
      '/api/translate',
      { texts: ['a', 'b'], sourceLang: 'ja' },
      h.deps,
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.json).toEqual({ engine: 'chrome', translations: ['t:a', 't:b'] });
    expect(h.calls.translateWith).toHaveLength(1);
    expect(h.calls.translateWith[0]).toEqual({
      settings: h.settings,
      texts: ['a', 'b'],
      sourceLang: 'ja',
    });
  });

  test('省略 sourceLang 時以 undefined 傳入 translateWith', async () => {
    const h = makeHarness(uniqueDir());
    const res = await handleApi('POST', '/api/translate', { texts: ['a'] }, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const recorded = h.calls.translateWith[0] as { sourceLang?: string };
    expect(recorded.sourceLang).toBeUndefined();
  });

  test('空 texts 陣列通過驗證並回 200', async () => {
    const h = makeHarness(uniqueDir());
    const res = await handleApi('POST', '/api/translate', { texts: [] }, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.json).toEqual({ engine: 'chrome', translations: [] });
  });

  test('剛好 400 筆 texts 為合法', async () => {
    const h = makeHarness(uniqueDir());
    const texts = Array.from({ length: 400 }, (_, i) => `line-${i}`);
    const res = await handleApi('POST', '/api/translate', { texts }, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const recorded = h.calls.translateWith[0] as { texts: string[] };
    expect(recorded.texts).toHaveLength(400);
  });

  const invalidTranslateBodies: Array<[string, unknown]> = [
    ['body 為 undefined', undefined],
    ['body 為 null', null],
    ['body 為字串', 'texts'],
    ['body 為數字', 5],
    ['body 為陣列', []],
    ['缺少 texts 欄位', {}],
    ['texts 為字串', { texts: 'a' }],
    ['texts 內含數字', { texts: ['a', 1] }],
    ['texts 內含 null', { texts: [null] }],
    ['texts 為 401 筆（超過 400）', { texts: Array.from({ length: 401 }, () => 'a') }],
    ['sourceLang 不是字串', { texts: ['a'], sourceLang: 5 }],
  ];

  for (const [name, body] of invalidTranslateBodies) {
    test(`非法輸入（${name}）回 400 BAD_REQUEST`, async () => {
      const h = makeHarness(uniqueDir());
      const res = await handleApi('POST', '/api/translate', body, h.deps);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(400);
      expect(res!.json).toEqual({ error: 'BAD_REQUEST' });
    });
  }

  const translateErrorStatuses: Array<[string, number]> = [
    ['NO_ENGINE', 503],
    ['BAD_KEY', 401],
    ['QUOTA', 429],
    ['UPSTREAM', 502],
  ];

  for (const [code, status] of translateErrorStatuses) {
    test(`上游丟出 code=${code} 時回 ${status} 與 { error: code }`, async () => {
      const h = makeHarness(uniqueDir());
      h.handlers.translateWith = async () => {
        throw Object.assign(new Error('上游失敗'), { code });
      };
      const res = await handleApi('POST', '/api/translate', { texts: ['a'] }, h.deps);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(status);
      expect(res!.json).toEqual({ error: code });
    });
  }

  test('無 code 欄位的錯誤回 502 { error: "UPSTREAM" }', async () => {
    const h = makeHarness(uniqueDir());
    h.handlers.translateWith = async () => {
      throw new Error('未知錯誤');
    };
    const res = await handleApi('POST', '/api/translate', { texts: ['a'] }, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(502);
    expect(res!.json).toEqual({ error: 'UPSTREAM' });
  });

  test('未知 code 回 502 { error: "UPSTREAM" }', async () => {
    const h = makeHarness(uniqueDir());
    h.handlers.translateWith = async () => {
      throw Object.assign(new Error('怪錯誤'), { code: 'SOMETHING_ELSE' });
    };
    const res = await handleApi('POST', '/api/translate', { texts: ['a'] }, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(502);
    expect(res!.json).toEqual({ error: 'UPSTREAM' });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/translate/test                                            */
/* ------------------------------------------------------------------ */

describe('POST /api/translate/test', () => {
  test('無 patch 時以 load() 的設定呼叫 testEngine', async () => {
    const h = makeHarness(uniqueDir());
    const res = await handleApi('POST', '/api/translate/test', {}, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.json).toEqual({ ok: true, sample: 'sample' });
    expect(h.calls.testEngine).toHaveLength(1);
    expect(h.calls.testEngine[0]).toEqual(h.settings);
    expect(h.calls.save).toHaveLength(0);
  });

  test('套用 patch：apiKey 空字串保留、null 清除，且不存檔', async () => {
    const h = makeHarness(uniqueDir());
    const patch = {
      translation: {
        engine: 'deepl',
        deepl: { apiKey: '' },
        azure: { apiKey: null, region: 'japan-east' },
      },
    };
    const res = await handleApi('POST', '/api/translate/test', { patch }, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const used = h.calls.testEngine[0] as any;
    expect(used.translation.engine).toBe('deepl');
    expect(used.translation.deepl.apiKey).toBe('deepl-key');
    expect(used.translation.azure.apiKey).toBe('');
    expect(used.translation.azure.region).toBe('japan-east');
    expect(used.translation.openai.apiKey).toBe('openai-key');
    expect(h.calls.save).toHaveLength(0);
    expect(h.settings.translation.deepl.apiKey).toBe('deepl-key');
    expect(h.settings.translation.azure.region).toBe('east-asia');
  });

  test('patch 只覆蓋指定欄位（spotifyClientId 與 openai 模型）', async () => {
    const h = makeHarness(uniqueDir());
    const patch = {
      spotifyClientId: 'abcdef0123456789abcdef0123456789',
      translation: { openai: { apiKey: null, baseUrl: 'https://other.example/v1' } },
    };
    const res = await handleApi('POST', '/api/translate/test', { patch }, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const used = h.calls.testEngine[0] as any;
    expect(used.spotifyClientId).toBe('abcdef0123456789abcdef0123456789');
    expect(used.translation.openai.baseUrl).toBe('https://other.example/v1');
    expect(used.translation.openai.model).toBe('gpt-4o-mini');
    expect(used.translation.openai.apiKey).toBe('');
    expect(used.translation.engine).toBe('chrome');
  });

  test('換了 AI 伺服器網址時不沿用已存的金鑰；格式錯誤的設定回 400', async () => {
    const h = makeHarness(uniqueDir());
    const res = await handleApi(
      'POST',
      '/api/translate/test',
      { patch: { translation: { engine: 'openai', openai: { baseUrl: 'https://evil.example' } } } },
      h.deps,
    );
    expect(res!.status).toBe(200);
    expect((h.calls.testEngine[0] as any).translation.openai.apiKey).toBe('');
    const bad = await handleApi('POST', '/api/translate/test', { patch: { spotifyClientId: 'nope' } }, h.deps);
    expect(bad!.status).toBe(400);
  });

  test('testEngine 回失敗結果時仍為 200 並原樣回傳', async () => {
    const h = makeHarness(uniqueDir());
    h.handlers.testEngine = async () => ({ ok: false, code: 'BAD_KEY', message: '金鑰無效' });
    const res = await handleApi('POST', '/api/translate/test', {}, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.json).toEqual({ ok: false, code: 'BAD_KEY', message: '金鑰無效' });
  });
});

/* ------------------------------------------------------------------ */
/* /api/store/:ns/:id                                                  */
/* ------------------------------------------------------------------ */

describe('/api/store/:ns/:id', () => {
  test('GET 檔案不存在時回 404', async () => {
    const h = makeHarness(uniqueDir());
    const res = await handleApi('GET', '/api/store/shuffle/abcdef', undefined, h.deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  test('PUT 回 204、不帶 json，並寫入 <dataDir>/<ns>/<id>.json', async () => {
    const dir = uniqueDir();
    const h = makeHarness(dir);
    const payload = { order: ['a', 'b'], seed: 0 };
    const putRes = await handleApi('PUT', '/api/store/shuffle/track-1', payload, h.deps);
    expect(putRes).not.toBeNull();
    expect(putRes!.status).toBe(204);
    expect(putRes!.json).toBeUndefined();

    const raw = await readFile(path.join(dir, 'shuffle', 'track-1.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(payload);

    const getRes = await handleApi('GET', '/api/store/shuffle/track-1', undefined, h.deps);
    expect(getRes).not.toBeNull();
    expect(getRes!.status).toBe(200);
    expect(getRes!.json).toEqual(payload);
  });

  test('PUT /api/store/lyrics-map/<id> 也允許寫入（ns 白名單含 lyrics-map）', async () => {
    const dir = uniqueDir();
    const h = makeHarness(dir);
    const putRes = await handleApi('PUT', '/api/store/lyrics-map/track_2', { lines: ['x'] }, h.deps);
    expect(putRes).not.toBeNull();
    expect(putRes!.status).toBe(204);
    const raw = await readFile(path.join(dir, 'lyrics-map', 'track_2.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ lines: ['x'] });
  });

  const invalidStorePaths: Array<[string, string]> = [
    ['不允許的 ns：other', '/api/store/other/abc'],
    ['不允許的 ns：settings', '/api/store/settings/abc'],
    ['ns 為空', '/api/store//abc'],
    ['id 為空', '/api/store/shuffle/'],
    ['id 超過 64 字元', `/api/store/shuffle/${'a'.repeat(65)}`],
    ['id 含點號', '/api/store/shuffle/a.b'],
    ['id 含斜線字元', '/api/store/shuffle/a/b'],
    ['id 含空格', '/api/store/shuffle/a b'],
  ];

  for (const [name, target] of invalidStorePaths) {
    test(`非法路徑（${name}）回 400`, async () => {
      const h = makeHarness(uniqueDir());
      const getRes = await handleApi('GET', target, undefined, h.deps);
      expect(getRes).not.toBeNull();
      expect(getRes!.status).toBe(400);
      const putRes = await handleApi('PUT', target, { a: 1 }, h.deps);
      expect(putRes).not.toBeNull();
      expect(putRes!.status).toBe(400);
    });
  }

  test('id 長度邊界 1 與 64 皆合法（回 404 而非 400）', async () => {
    const h = makeHarness(uniqueDir());
    const one = await handleApi('GET', '/api/store/shuffle/a', undefined, h.deps);
    expect(one).not.toBeNull();
    expect(one!.status).toBe(404);
    const sixtyFour = await handleApi(
      'GET',
      `/api/store/shuffle/${'a'.repeat(64)}`,
      undefined,
      h.deps,
    );
    expect(sixtyFour).not.toBeNull();
    expect(sixtyFour!.status).toBe(404);
  });

  test('非 GET/PUT method 回 405', async () => {
    const h = makeHarness(uniqueDir());
    for (const method of ['POST', 'DELETE', 'PATCH']) {
      const res = await handleApi(method, '/api/store/shuffle/abc', {}, h.deps);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(405);
    }
  });
});

/* ------------------------------------------------------------------ */
/* apiPlugin                                                           */
/* ------------------------------------------------------------------ */

describe('apiPlugin', () => {
  test('非本模組路徑呼叫 next()，不寫回應', { timeout: 5000 }, async () => {
    const h = makeHarness(uniqueDir());
    const mw = getMiddleware(h.deps);
    const state = await dispatch(mw, 'GET', '/index.html');
    expect(state.nextCalled).toBe(true);
    expect(state.ended).toBe(false);
  });

  test('依 pathname 命中路由（query string 不影響）', { timeout: 5000 }, async () => {
    const h = makeHarness(uniqueDir());
    const mw = getMiddleware(h.deps);
    const state = await dispatch(mw, 'GET', '/api/settings?foo=bar');
    expect(state.nextCalled).toBe(false);
    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual(h.publicSettings);
  });

  test('POST 帶合法 JSON body 時解析後交給 handleApi', { timeout: 5000 }, async () => {
    const h = makeHarness(uniqueDir());
    const mw = getMiddleware(h.deps);
    const state = await dispatch(mw, 'POST', '/api/translate', [
      Buffer.from(JSON.stringify({ texts: ['hi'], sourceLang: 'en' }), 'utf8'),
    ]);
    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual({ engine: 'chrome', translations: ['t:hi'] });
    const recorded = h.calls.translateWith[0] as { texts: string[]; sourceLang?: string };
    expect(recorded.texts).toEqual(['hi']);
    expect(recorded.sourceLang).toBe('en');
  });

  test('body 不是合法 JSON 時回 400', { timeout: 5000 }, async () => {
    const h = makeHarness(uniqueDir());
    const mw = getMiddleware(h.deps);
    const state = await dispatch(mw, 'PUT', '/api/settings', [Buffer.from('{not json', 'utf8')]);
    expect(state.statusCode).toBe(400);
  });

  test('GET 以外的空 body 視為解析失敗回 400', { timeout: 5000 }, async () => {
    const h = makeHarness(uniqueDir());
    const mw = getMiddleware(h.deps);
    const state = await dispatch(mw, 'PUT', '/api/settings', []);
    expect(state.statusCode).toBe(400);
  });

  test('body 超過 2MB 回 413', { timeout: 10000 }, async () => {
    const h = makeHarness(uniqueDir());
    const mw = getMiddleware(h.deps);
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 'a');
    const state = await dispatch(mw, 'PUT', '/api/settings', [big]);
    expect(state.statusCode).toBe(413);
  });

  test('204 回應不寫任何 body', { timeout: 5000 }, async () => {
    const dir = uniqueDir();
    const h = makeHarness(dir);
    const mw = getMiddleware(h.deps);
    const state = await dispatch(mw, 'PUT', '/api/store/shuffle/written', [
      Buffer.from(JSON.stringify({ ok: true }), 'utf8'),
    ]);
    expect(state.statusCode).toBe(204);
    expect(state.body).toBe('');
    const raw = await readFile(path.join(dir, 'shuffle', 'written.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ ok: true });
  });
});
