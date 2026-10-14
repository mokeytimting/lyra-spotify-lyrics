// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  SYSTEM_PROMPT,
  TranslatorError,
  testEngine,
  translateWith,
} from '../../server/translators';
import { DEFAULT_SETTINGS } from '../../src/settings/types';
import type { AppSettings, EngineId, TranslateErrorCode } from '../../src/settings/types';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

type TestEngineResult = Awaited<ReturnType<typeof testEngine>>;

/** 建立一份指定引擎的完整設定（其餘欄位沿用預設值，金鑰全為空）。 */
function settingsFor(engine: EngineId): AppSettings {
  const s: AppSettings = structuredClone(DEFAULT_SETTINGS);
  s.translation.engine = engine;
  return s;
}

/** 建立假的 fetch：記錄每次呼叫，並依 responder 產生回應。 */
function recordingFetch(
  responder: (call: RecordedCall, index: number) => Response,
): { calls: RecordedCall[]; impl: typeof fetch } {
  const calls: RecordedCall[] = [];
  const impl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : String((input as { url?: string } | null)?.url ?? input);
    const call: RecordedCall = { url, init };
    calls.push(call);
    return responder(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return { calls, impl };
}

/** 回傳固定內容的 fetch，用來驗證「不該被呼叫」的路徑。 */
const neverFetch = (async () => {
  throw new Error('fetch 不應被呼叫');
}) as unknown as typeof fetch;

/** 一定會失敗的 fetch，模擬網路層錯誤。 */
const failingFetch = (async () => {
  throw new TypeError('network down');
}) as unknown as typeof fetch;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bodyJson(call: RecordedCall): any {
  return JSON.parse(String(call.init?.body ?? ''));
}

function headerValue(call: RecordedCall, name: string): string | undefined {
  const h = call.init?.headers;
  if (!h) return undefined;
  const value = new Headers(h as HeadersInit).get(name);
  return value === null ? undefined : value;
}

async function expectError(fn: () => Promise<unknown>, code: TranslateErrorCode): Promise<void> {
  let caught: unknown = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TranslatorError);
  expect((caught as TranslatorError).code).toBe(code);
}

function expectFailure(
  res: TestEngineResult,
  code: TranslateErrorCode,
  messagePart: string,
): void {
  if (res.ok) {
    throw new Error(`預期失敗，卻回傳成功：${JSON.stringify(res)}`);
  }
  expect(res.code).toBe(code);
  expect(res.message).toContain(messagePart);
}

describe('TranslatorError', () => {
  test('是 Error 的子類別且帶有 code 欄位', () => {
    const err = new TranslatorError('NO_ENGINE');
    expect(err instanceof Error).toBe(true);
    expect(err.code).toBe('NO_ENGINE');
  });
});

describe('translateWith：引擎與金鑰檢查', () => {
  test("engine 為 'chrome' 時丟 TranslatorError('NO_ENGINE')", async () => {
    const s = settingsFor('chrome');
    await expectError(() => translateWith(s, ['Hello'], undefined, neverFetch), 'NO_ENGINE');
  });

  test("deepl 沒有金鑰時丟 TranslatorError('NO_ENGINE')", async () => {
    const s = settingsFor('deepl');
    await expectError(() => translateWith(s, ['Hello'], undefined, neverFetch), 'NO_ENGINE');
  });

  test("azure 沒有金鑰時丟 TranslatorError('NO_ENGINE')", async () => {
    const s = settingsFor('azure');
    await expectError(() => translateWith(s, ['Hello'], undefined, neverFetch), 'NO_ENGINE');
  });

  test("openai 沒有金鑰且 baseUrl 非本機時丟 TranslatorError('NO_ENGINE')", async () => {
    const s = settingsFor('openai');
    s.translation.openai.baseUrl = 'https://api.openai.com/v1';
    await expectError(() => translateWith(s, ['Hello'], undefined, neverFetch), 'NO_ENGINE');
  });

  test('openai 沒有金鑰但 baseUrl 是 http://localhost 開頭時仍可翻譯', async () => {
    const s = settingsFor('openai');
    s.translation.openai.baseUrl = 'http://localhost:11434/v1';
    const { impl } = recordingFetch(() =>
      jsonRes({ choices: [{ message: { content: '["你好"]' } }] }),
    );
    const res = await translateWith(s, ['Hello'], undefined, impl);
    expect(res.engine).toBe('openai');
    expect(res.translations).toEqual(['你好']);
  });

  test('openai 沒有金鑰但 baseUrl 是 http://127.0.0.1 開頭時仍可翻譯', async () => {
    const s = settingsFor('openai');
    s.translation.openai.baseUrl = 'http://127.0.0.1:8080/v1';
    const { impl } = recordingFetch(() =>
      jsonRes({ choices: [{ message: { content: '["你好"]' } }] }),
    );
    const res = await translateWith(s, ['Hello'], undefined, impl);
    expect(res.translations).toEqual(['你好']);
  });
});

describe('translateWith：空輸入與長度檢查', () => {
  test('texts 為空時回傳該引擎的空陣列', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'key';
    const { impl } = recordingFetch(() => jsonRes({ translations: [] }));
    const res = await translateWith(s, [], undefined, impl);
    expect(res.engine).toBe('deepl');
    expect(res.translations).toEqual([]);
  });

  test('上游回傳譯文數量與 texts 不符時丟 TranslatorError(UPSTREAM)', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'key';
    const { impl } = recordingFetch(() => jsonRes({ translations: [{ text: '只有一筆' }] }));
    await expectError(() => translateWith(s, ['a', 'b'], undefined, impl), 'UPSTREAM');
  });
});

describe('translateWith：deepl', () => {
  test('金鑰以 :fx 結尾時使用 api-free.deepl.com', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'abc:fx';
    const { calls, impl } = recordingFetch(() => jsonRes({ translations: [{ text: '你好' }] }));
    const res = await translateWith(s, ['Hello'], undefined, impl);
    expect(calls[0].url.startsWith('https://api-free.deepl.com/v2/translate')).toBe(true);
    expect(res.translations).toEqual(['你好']);
  });

  test('一般金鑰使用 api.deepl.com', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'plain-key';
    const { calls, impl } = recordingFetch(() => jsonRes({ translations: [{ text: '你好' }] }));
    await translateWith(s, ['Hello'], undefined, impl);
    expect(calls[0].url.startsWith('https://api.deepl.com/v2/translate')).toBe(true);
  });

  test('送出 target_lang=ZH-HANT、大寫 source_lang 與 DeepL-Auth-Key 標頭', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { calls, impl } = recordingFetch(() =>
      jsonRes({ translations: [{ text: '你好' }, { text: '世界' }] }),
    );
    const res = await translateWith(s, ['Hello', 'World'], 'ja', impl);
    const body = bodyJson(calls[0]);
    expect(body.text).toEqual(['Hello', 'World']);
    expect(body.target_lang).toBe('ZH-HANT');
    expect(body.source_lang).toBe('JA');
    expect(headerValue(calls[0], 'authorization')).toBe('DeepL-Auth-Key my-key');
    expect(res.engine).toBe('deepl');
    expect(res.translations).toEqual(['你好', '世界']);
  });

  test('sourceLang 為 undefined 時不帶 source_lang', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { calls, impl } = recordingFetch(() => jsonRes({ translations: [{ text: '你好' }] }));
    await translateWith(s, ['Hello'], undefined, impl);
    const body = bodyJson(calls[0]);
    expect('source_lang' in body).toBe(false);
  });

  test('每批最多 50 筆並依序合併結果', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { calls, impl } = recordingFetch((call) => {
      const body = bodyJson(call);
      return jsonRes({
        translations: body.text.map((t: string) => ({ text: '譯' + t })),
      });
    });
    const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const res = await translateWith(s, texts, undefined, impl);
    expect(calls.length).toBe(3);
    expect(calls.map((c) => bodyJson(c).text.length)).toEqual([50, 50, 20]);
    expect(res.translations).toEqual(texts.map((t) => '譯' + t));
  });

  test('HTTP 403 丟 TranslatorError(BAD_KEY)', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { impl } = recordingFetch(() => jsonRes({ message: 'forbidden' }, 403));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'BAD_KEY');
  });

  test('HTTP 456 丟 TranslatorError(QUOTA)', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { impl } = recordingFetch(() => jsonRes({ message: 'quota' }, 456));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'QUOTA');
  });

  test('HTTP 429 丟 TranslatorError(QUOTA)', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { impl } = recordingFetch(() => jsonRes({ message: 'too many' }, 429));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'QUOTA');
  });

  test('HTTP 500 丟 TranslatorError(UPSTREAM)', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { impl } = recordingFetch(() => jsonRes({ message: 'boom' }, 500));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'UPSTREAM');
  });

  test('fetch 本身丟錯時丟 TranslatorError(UPSTREAM)', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    await expectError(() => translateWith(s, ['Hello'], undefined, failingFetch), 'UPSTREAM');
  });
});

describe('translateWith：azure', () => {
  test('送出 api-version、to=zh-Hant、from、金鑰與 region 標頭', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: 'eastasia' };
    const { calls, impl } = recordingFetch(() =>
      jsonRes([{ translations: [{ text: '你好' }] }]),
    );
    const res = await translateWith(s, ['Hello'], 'KO', impl);
    const url = calls[0].url;
    expect(url).toContain('api-version=3.0');
    expect(url).toContain('to=zh-Hant');
    expect(url).toContain('from=KO');
    expect(headerValue(calls[0], 'ocp-apim-subscription-key')).toBe('az-key');
    expect(headerValue(calls[0], 'ocp-apim-subscription-region')).toBe('eastasia');
    expect(String(headerValue(calls[0], 'content-type'))).toMatch(/application\/json/);
    expect(bodyJson(calls[0])).toEqual([{ Text: 'Hello' }]);
    expect(res.engine).toBe('azure');
    expect(res.translations).toEqual(['你好']);
  });

  test('sourceLang 為 undefined 時不含 from 參數', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: 'eastasia' };
    const { calls, impl } = recordingFetch(() =>
      jsonRes([{ translations: [{ text: '你好' }] }]),
    );
    await translateWith(s, ['Hello'], undefined, impl);
    expect(calls[0].url.includes('from=')).toBe(false);
  });

  test('region 為空字串時不送 region 標頭', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: '' };
    const { calls, impl } = recordingFetch(() =>
      jsonRes([{ translations: [{ text: '你好' }] }]),
    );
    await translateWith(s, ['Hello'], undefined, impl);
    expect(headerValue(calls[0], 'ocp-apim-subscription-region')).toBeUndefined();
  });

  test('每批最多 100 筆並依序合併結果', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: '' };
    const { calls, impl } = recordingFetch((call) => {
      const arr = bodyJson(call) as Array<{ Text: string }>;
      return jsonRes(arr.map((item) => ({ translations: [{ text: '譯' + item.Text }] })));
    });
    const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const res = await translateWith(s, texts, undefined, impl);
    expect(calls.length).toBe(3);
    expect(calls.map((c) => (bodyJson(c) as unknown[]).length)).toEqual([100, 100, 50]);
    expect(res.translations).toEqual(texts.map((t) => '譯' + t));
  });

  test('HTTP 401 丟 TranslatorError(BAD_KEY)', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: '' };
    const { impl } = recordingFetch(() => jsonRes({ message: 'unauthorized' }, 401));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'BAD_KEY');
  });

  test('HTTP 403 丟 TranslatorError(QUOTA)', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: '' };
    const { impl } = recordingFetch(() => jsonRes({ message: 'forbidden' }, 403));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'QUOTA');
  });

  test('HTTP 429 丟 TranslatorError(QUOTA)', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: '' };
    const { impl } = recordingFetch(() => jsonRes({ message: 'too many' }, 429));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'QUOTA');
  });

  test('HTTP 500 丟 TranslatorError(UPSTREAM)', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: '' };
    const { impl } = recordingFetch(() => jsonRes({ message: 'boom' }, 500));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'UPSTREAM');
  });
});

describe('translateWith：openai', () => {
  test('SYSTEM_PROMPT 是提到 JSON 的非空字串常數', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
    expect(SYSTEM_PROMPT).toMatch(/json/i);
  });

  test('送出 /chat/completions 的 URL、Authorization 與 messages 內容', async () => {
    const s = settingsFor('openai');
    s.translation.openai = {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    };
    const { calls, impl } = recordingFetch(() =>
      jsonRes({ choices: [{ message: { content: '["你好"]' } }] }),
    );
    const res = await translateWith(s, ['Hello'], undefined, impl);
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headerValue(calls[0], 'authorization')).toBe('Bearer sk-test');
    expect(String(headerValue(calls[0], 'content-type'))).toMatch(/application\/json/);
    const body = bodyJson(calls[0]);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.temperature).toBe(0.3);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe(JSON.stringify(['Hello']));
    expect(res.engine).toBe('openai');
    expect(res.translations).toEqual(['你好']);
  });

  test('本機且無金鑰時不送 Authorization 標頭', async () => {
    const s = settingsFor('openai');
    s.translation.openai.baseUrl = 'http://127.0.0.1:8080/v1';
    s.translation.openai.apiKey = '';
    const { calls, impl } = recordingFetch(() =>
      jsonRes({ choices: [{ message: { content: '["你好"]' } }] }),
    );
    await translateWith(s, ['Hello'], undefined, impl);
    expect(headerValue(calls[0], 'authorization')).toBeUndefined();
  });

  test('解析 ```json 圍欄包住的回應', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { impl } = recordingFetch(() =>
      jsonRes({ choices: [{ message: { content: '```json\n["你好","世界"]\n```' } }] }),
    );
    const res = await translateWith(s, ['Hello', 'World'], undefined, impl);
    expect(res.translations).toEqual(['你好', '世界']);
  });

  test('解析 ``` 圍欄包住的回應', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { impl } = recordingFetch(() =>
      jsonRes({ choices: [{ message: { content: '```\n["你好"]\n```' } }] }),
    );
    const res = await translateWith(s, ['Hello'], undefined, impl);
    expect(res.translations).toEqual(['你好']);
  });

  test('取第一個 [ 到最後一個 ] 之間的 JSON 解析', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { impl } = recordingFetch(() =>
      jsonRes({
        choices: [{ message: { content: '以下是翻譯結果：\n["你好"]\n希望對你有幫助' } }],
      }),
    );
    const res = await translateWith(s, ['Hello'], undefined, impl);
    expect(res.translations).toEqual(['你好']);
  });

  test('輸出長度不符時重試一次，並在 user 訊息附上要求的行數', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const contents = ['["只有一行"]', '["a","b"]'];
    const { calls, impl } = recordingFetch((_call, index) =>
      jsonRes({ choices: [{ message: { content: contents[index] ?? '["只有一行"]' } }] }),
    );
    const res = await translateWith(s, ['x', 'y'], undefined, impl);
    expect(calls.length).toBe(2);
    const secondUser = String(bodyJson(calls[1]).messages[1].content);
    expect(secondUser).toContain('2');
    expect(res.translations).toEqual(['a', 'b']);
  });

  test('重試後長度仍不符時丟 TranslatorError(UPSTREAM)', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { calls, impl } = recordingFetch(() =>
      jsonRes({ choices: [{ message: { content: '["只有一行"]' } }] }),
    );
    await expectError(() => translateWith(s, ['x', 'y'], undefined, impl), 'UPSTREAM');
    expect(calls.length).toBe(2);
  });

  test('超過 80 行時每批 80 行送出並依序合併', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { calls, impl } = recordingFetch((call) => {
      const arr = JSON.parse(String(bodyJson(call).messages[1].content)) as string[];
      return jsonRes({
        choices: [{ message: { content: JSON.stringify(arr.map((t) => '譯' + t)) } }],
      });
    });
    const texts = Array.from({ length: 170 }, (_, i) => `t${i}`);
    const res = await translateWith(s, texts, undefined, impl);
    expect(calls.length).toBe(3);
    expect(
      calls.map((c) => (JSON.parse(String(bodyJson(c).messages[1].content)) as unknown[]).length),
    ).toEqual([80, 80, 10]);
    expect(res.translations).toEqual(texts.map((t) => '譯' + t));
  });

  test('HTTP 401 丟 TranslatorError(BAD_KEY)', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { impl } = recordingFetch(() => jsonRes({ error: { message: 'bad key' } }, 401));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'BAD_KEY');
  });

  test('HTTP 429 丟 TranslatorError(QUOTA)', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { impl } = recordingFetch(() => jsonRes({ error: { message: 'rate' } }, 429));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'QUOTA');
  });

  test('HTTP 500 丟 TranslatorError(UPSTREAM)', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    const { impl } = recordingFetch(() => jsonRes({ error: { message: 'boom' } }, 500));
    await expectError(() => translateWith(s, ['Hello'], undefined, impl), 'UPSTREAM');
  });

  test('fetch 本身丟錯時丟 TranslatorError(UPSTREAM)', async () => {
    const s = settingsFor('openai');
    s.translation.openai.apiKey = 'sk-test';
    await expectError(() => translateWith(s, ['Hello'], undefined, failingFetch), 'UPSTREAM');
  });
});

describe('testEngine', () => {
  test('成功時回傳 ok:true 與譯文，並以 ["Hello, world"] 測試', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { calls, impl } = recordingFetch(() =>
      jsonRes({ translations: [{ text: '你好，世界' }] }),
    );
    const res = await testEngine(s, impl);
    expect(res).toEqual({ ok: true, sample: '你好，世界' });
    expect(bodyJson(calls[0]).text).toEqual(['Hello, world']);
  });

  test('NO_ENGINE 時回傳「尚未設定金鑰」', async () => {
    const s = settingsFor('deepl');
    const res = await testEngine(s, neverFetch);
    expectFailure(res, 'NO_ENGINE', '尚未設定金鑰');
  });

  test('BAD_KEY 時回傳「金鑰無效」', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { impl } = recordingFetch(() => jsonRes({ message: 'forbidden' }, 403));
    const res = await testEngine(s, impl);
    expectFailure(res, 'BAD_KEY', '金鑰無效');
  });

  test('QUOTA 時回傳「額度已用完或請求太頻繁」', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { impl } = recordingFetch(() => jsonRes({ message: 'rate' }, 429));
    const res = await testEngine(s, impl);
    expectFailure(res, 'QUOTA', '額度已用完或請求太頻繁');
  });

  test('UPSTREAM 時回傳「服務暫時無法使用」', async () => {
    const s = settingsFor('deepl');
    s.translation.deepl.apiKey = 'my-key';
    const { impl } = recordingFetch(() => jsonRes({ message: 'boom' }, 500));
    const res = await testEngine(s, impl);
    expectFailure(res, 'UPSTREAM', '服務暫時無法使用');
  });

  test('fetch 丟錯時回傳 UPSTREAM「服務暫時無法使用」', async () => {
    const s = settingsFor('azure');
    s.translation.azure = { apiKey: 'az-key', region: '' };
    const res = await testEngine(s, failingFetch);
    expectFailure(res, 'UPSTREAM', '服務暫時無法使用');
  });
});
