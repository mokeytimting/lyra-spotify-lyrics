import { beforeEach, expect, test, vi } from 'vitest';

const cache = { get: vi.fn(), put: vi.fn() };
const server = { translate: vi.fn() };
const chrome = { translate: vi.fn() };

vi.mock('../../src/translate/cache', () => ({
  getCached: (...a: unknown[]) => cache.get(...a),
  putCached: (...a: unknown[]) => cache.put(...a),
}));
vi.mock('../../src/translate/server', () => {
  class ServerTranslateError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return { serverTranslate: (...a: unknown[]) => server.translate(...a), ServerTranslateError };
});
vi.mock('../../src/translate/chrome', () => {
  class ChromeTranslatorUnavailableError extends Error {}
  class NeedsUserActivationError extends Error {
    sourceLanguage = 'ja';
  }
  return {
    chromeTranslate: (...a: unknown[]) => chrome.translate(...a),
    ChromeTranslatorUnavailableError,
    NeedsUserActivationError,
  };
});

const { translateSong, TranslationUnavailableError, NeedsUserActivationError } = await import(
  '../../src/translate/index'
);
const { ServerTranslateError } = await import('../../src/translate/server');

const LINES = ['hello there', '', '我愛你', 'goodbye now'];

beforeEach(() => {
  cache.get.mockReset().mockResolvedValue(null);
  cache.put.mockReset().mockResolvedValue(undefined);
  server.translate.mockReset();
  chrome.translate.mockReset();
});

test('中文歌不翻譯，回傳全 null', async () => {
  expect(await translateSong('t', ['我愛你', '你好嗎'], 'zh')).toEqual([null, null]);
  expect(server.translate).not.toHaveBeenCalled();
});

test('只送需要翻譯的行，結果放回原位置並寫入快取', async () => {
  server.translate.mockResolvedValue({ engine: 'azure', translations: ['你好', '再見'] });
  const onEngine = vi.fn();
  const out = await translateSong('t', LINES, 'en', { onEngine });
  expect(server.translate).toHaveBeenCalledWith(['hello there', 'goodbye now'], undefined, 'zh-Hant');
  expect(out).toEqual(['你好', null, null, '再見']);
  expect(cache.put).toHaveBeenCalledWith('t', { engine: 'azure', lines: out, target: 'zh-Hant' });
  expect(onEngine).toHaveBeenCalledWith('azure', false);
});

test('有快取時直接使用，不呼叫任何引擎', async () => {
  cache.get.mockResolvedValue({ engine: 'deepl', lines: ['a', null, null, 'b'] });
  const onEngine = vi.fn();
  expect(await translateSong('t', LINES, 'en', { onEngine })).toEqual(['a', null, null, 'b']);
  expect(server.translate).not.toHaveBeenCalled();
  expect(onEngine).toHaveBeenCalledWith('deepl', true);
});

test('force 時略過快取重新翻譯', async () => {
  cache.get.mockResolvedValue({ engine: 'deepl', lines: ['a', null, null, 'b'] });
  server.translate.mockResolvedValue({ engine: 'openai', translations: ['甲', '乙'] });
  expect(await translateSong('t', LINES, 'en', { force: true })).toEqual(['甲', null, null, '乙']);
});

test('伺服器沒有設定引擎時改用 Chrome 內建翻譯', async () => {
  server.translate.mockRejectedValue(new ServerTranslateError('NO_ENGINE'));
  chrome.translate.mockResolvedValue(['哈囉', '掰掰']);
  const out = await translateSong('t', LINES, 'en');
  expect(out).toEqual(['哈囉', null, null, '掰掰']);
  expect(chrome.translate).toHaveBeenCalledWith(['hello there', 'goodbye now'], 'en', 'zh-Hant');
  expect(cache.put).toHaveBeenCalledWith('t', { engine: 'chrome', lines: out, target: 'zh-Hant' });
});

test('快取是 Chrome 的結果時，背景用設定的引擎升級', async () => {
  cache.get.mockResolvedValue({ engine: 'chrome', lines: ['x', null, null, 'y'] });
  server.translate.mockResolvedValue({ engine: 'deepl', translations: ['好', '壞'] });
  const onUpgraded = vi.fn();
  expect(await translateSong('t', LINES, 'en', { onUpgraded })).toEqual(['x', null, null, 'y']);
  await vi.waitFor(() => expect(onUpgraded).toHaveBeenCalledWith(['好', null, null, '壞']));
});

test('Chrome 需要使用者點擊下載模型時原樣丟出', async () => {
  server.translate.mockRejectedValue(new ServerTranslateError('NO_ENGINE'));
  chrome.translate.mockRejectedValue(new NeedsUserActivationError('ja'));
  await expect(translateSong('t', LINES, 'ja')).rejects.toBeInstanceOf(NeedsUserActivationError);
});

test('兩邊都失敗時丟出 TranslationUnavailableError', async () => {
  server.translate.mockRejectedValue(new ServerTranslateError('QUOTA'));
  chrome.translate.mockRejectedValue(new Error('boom'));
  await expect(translateSong('t', LINES, 'en')).rejects.toBeInstanceOf(TranslationUnavailableError);
});

test('翻成其他語言時，快取的語言不同就重新翻譯', async () => {
  cache.get.mockResolvedValue({ engine: 'deepl', lines: ['a', null, null, 'b'], target: 'zh-Hant' });
  server.translate.mockResolvedValue({ engine: 'deepl', translations: ['あ', 'い'] });
  const out = await translateSong('t', ['我愛你', '', 'x'], 'zh', { target: 'ja' });
  expect(server.translate).toHaveBeenCalledWith(['我愛你', 'x'], 'zh', 'ja');
  expect(out).toBeDefined();
});
