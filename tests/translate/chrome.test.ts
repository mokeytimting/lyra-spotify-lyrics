import { test, expect, beforeEach, afterEach } from 'vitest';

import {
  chromeTranslate,
  activateChromeTranslator,
  ChromeTranslatorUnavailableError,
  NeedsUserActivationError,
} from '../../src/translate/chrome';

type AvailabilityStatus =
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available';

interface AvailabilityQuery {
  sourceLanguage: string;
  targetLanguage: string;
}

interface DownloadProgressEventLike {
  loaded: number;
}

interface MonitorLike {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: DownloadProgressEventLike) => void,
  ): void;
}

interface TranslatorCreateOptionsLike {
  sourceLanguage: string;
  targetLanguage: string;
  monitor?: (monitor: MonitorLike) => void;
}

interface FakeState {
  availabilityQueries: AvailabilityQuery[];
  availabilityFor: (query: AvailabilityQuery) => AvailabilityStatus;
  createCount: number;
  createOptions: TranslatorCreateOptionsLike[];
  translatorIds: number[];
  translateInputs: string[];
  translateImpl: (text: string) => Promise<string> | string;
  concurrent: number;
  maxConcurrent: number;
  onCreate: ((options: TranslatorCreateOptionsLike) => void) | undefined;
}

let state: FakeState;
let nextTranslatorId = 0;

function installFakeTranslatorApi(): void {
  nextTranslatorId = 0;
  (globalThis as unknown as Record<string, unknown>).Translator = {
    async availability(query: AvailabilityQuery): Promise<AvailabilityStatus> {
      state.availabilityQueries.push({
        sourceLanguage: query.sourceLanguage,
        targetLanguage: query.targetLanguage,
      });
      return state.availabilityFor(query);
    },
    async create(options: TranslatorCreateOptionsLike) {
      state.createCount += 1;
      state.createOptions.push(options);
      nextTranslatorId += 1;
      state.translatorIds.push(nextTranslatorId);
      state.onCreate?.(options);
      return {
        async translate(text: string): Promise<string> {
          state.translateInputs.push(text);
          state.concurrent += 1;
          state.maxConcurrent = Math.max(state.maxConcurrent, state.concurrent);
          try {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 0);
            });
            return await state.translateImpl(text);
          } finally {
            state.concurrent -= 1;
          }
        },
      };
    },
  };
}

async function captureRejection(
  fn: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error('預期會丟出錯誤，但 Promise 成功解析');
}

beforeEach(() => {
  state = {
    availabilityQueries: [],
    availabilityFor: () => 'available',
    createCount: 0,
    createOptions: [],
    translatorIds: [],
    translateInputs: [],
    translateImpl: (text) => `tr:${text}`,
    concurrent: 0,
    maxConcurrent: 0,
    onCreate: undefined,
  };
  installFakeTranslatorApi();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'Translator');
});

test('ChromeTranslatorUnavailableError 是 Error 的子類別', () => {
  const error = new ChromeTranslatorUnavailableError();
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(ChromeTranslatorUnavailableError);
});

test('NeedsUserActivationError 是 Error 的子類別且帶有 sourceLanguage', () => {
  const error = new NeedsUserActivationError('ja');
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(NeedsUserActivationError);
  expect(error.sourceLanguage).toBe('ja');
});

test('chromeTranslate：沒有 globalThis.Translator 時丟 ChromeTranslatorUnavailableError', async () => {
  Reflect.deleteProperty(globalThis, 'Translator');

  const error = await captureRejection(() => chromeTranslate(['hello'], 'en'));

  expect(error).toBeInstanceOf(ChromeTranslatorUnavailableError);
});

test('chromeTranslate：zh-Hant 可用時使用 zh-Hant 建立 translator 並回傳逐行翻譯結果', async () => {
  state.availabilityFor = ({ targetLanguage }) =>
    targetLanguage === 'zh-Hant' ? 'available' : 'unavailable';
  state.translateImpl = (text) => `H:${text}`;

  const result = await chromeTranslate(['hello', 'world'], 'ja');

  expect(result).toEqual(['H:hello', 'H:world']);
  expect(state.createCount).toBe(1);
  const [options] = state.createOptions;
  expect(options?.sourceLanguage).toBe('ja');
  expect(options?.targetLanguage).toBe('zh-Hant');
});

test('chromeTranslate：zh-Hant 不可用但 zh 可用時改用 zh，結果套用 toTraditional', async () => {
  state.availabilityFor = ({ targetLanguage }) =>
    targetLanguage === 'zh-Hant' ? 'unavailable' : 'available';
  state.translateImpl = () => '后来';

  const result = await chromeTranslate(['later'], 'es');

  expect(result).toEqual(['後來']);
  expect(state.createCount).toBe(1);
  const [options] = state.createOptions;
  expect(options?.sourceLanguage).toBe('es');
  expect(options?.targetLanguage).toBe('zh');
});

test('chromeTranslate：zh-Hant 與 zh 都 unavailable 時丟 ChromeTranslatorUnavailableError 且不建立 translator', async () => {
  state.availabilityFor = () => 'unavailable';

  const error = await captureRejection(() => chromeTranslate(['hello'], 'de'));

  expect(error).toBeInstanceOf(ChromeTranslatorUnavailableError);
  expect(state.createCount).toBe(0);
});

test('chromeTranslate：可用性為 downloadable 時丟 NeedsUserActivationError 且不建立 translator', async () => {
  state.availabilityFor = ({ targetLanguage }) =>
    targetLanguage === 'zh-Hant' ? 'downloadable' : 'unavailable';

  const error = await captureRejection(() => chromeTranslate(['hello'], 'fr'));

  expect(error).toBeInstanceOf(NeedsUserActivationError);
  expect((error as NeedsUserActivationError).sourceLanguage).toBe('fr');
  expect(state.createCount).toBe(0);
});

test('chromeTranslate：可用性為 downloading 時丟 NeedsUserActivationError 且不建立 translator', async () => {
  state.availabilityFor = ({ targetLanguage }) =>
    targetLanguage === 'zh-Hant' ? 'downloading' : 'unavailable';

  const error = await captureRejection(() => chromeTranslate(['hello'], 'it'));

  expect(error).toBeInstanceOf(NeedsUserActivationError);
  expect((error as NeedsUserActivationError).sourceLanguage).toBe('it');
  expect(state.createCount).toBe(0);
});

test('chromeTranslate：同一語言對的 translator 建立後快取重用', async () => {
  state.translateImpl = (text) => `cached:${text}`;

  const first = await chromeTranslate(['a'], 'pt');
  const second = await chromeTranslate(['b'], 'pt');

  expect(first).toEqual(['cached:a']);
  expect(second).toEqual(['cached:b']);
  expect(state.createCount).toBe(1);
  expect(state.translateInputs).toEqual(['a', 'b']);
});

test('chromeTranslate：逐行依序翻譯，不會平行送出', async () => {
  const result = await chromeTranslate(['a', 'b', 'c'], 'nl');

  expect(result).toEqual(['tr:a', 'tr:b', 'tr:c']);
  expect(state.translateInputs).toEqual(['a', 'b', 'c']);
  expect(state.maxConcurrent).toBe(1);
});

test('chromeTranslate：空字串直接回空字串且不送翻譯；空陣列回空陣列', async () => {
  const first = await chromeTranslate(['', 'x', ''], 'sv');

  expect(first).toEqual(['', 'tr:x', '']);
  expect(state.translateInputs).toEqual(['x']);

  const allEmpty = await chromeTranslate(['', ''], 'sv');

  expect(allEmpty).toEqual(['', '']);
  expect(state.translateInputs).toEqual(['x']);

  const none = await chromeTranslate([], 'sv');

  expect(none).toEqual([]);
  expect(state.translateInputs).toEqual(['x']);
});

test('activateChromeTranslator：點擊時建立 translator、回報 downloadprogress 的 loaded，並快取供後續使用', async () => {
  state.availabilityFor = ({ targetLanguage }) =>
    targetLanguage === 'zh-Hant' ? 'downloadable' : 'unavailable';

  const listeners: ((event: DownloadProgressEventLike) => void)[] = [];
  state.onCreate = (options) => {
    const monitor: MonitorLike = {
      addEventListener(type, listener) {
        expect(type).toBe('downloadprogress');
        listeners.push(listener);
      },
    };
    options.monitor?.(monitor);
  };

  const progress: number[] = [];
  await activateChromeTranslator('da', (ratio) => {
    progress.push(ratio);
  });

  expect(state.createCount).toBe(1);
  const [options] = state.createOptions;
  expect(options?.sourceLanguage).toBe('da');
  expect(options?.targetLanguage).toBe('zh-Hant');
  expect(listeners.length).toBe(1);

  for (const listener of listeners) {
    listener({ loaded: 0.25 });
    listener({ loaded: 1 });
  }
  expect(progress).toEqual([0.25, 1]);

  state.translateImpl = (text) => `T:${text}`;
  const result = await chromeTranslate(['hi'], 'da');

  expect(result).toEqual(['T:hi']);
  expect(state.createCount).toBe(1);
});

test('activateChromeTranslator：同一語言對已快取時不重複建立 translator', async () => {
  state.availabilityFor = ({ targetLanguage }) =>
    targetLanguage === 'zh-Hant' ? 'downloadable' : 'unavailable';

  await activateChromeTranslator('fi', () => {});
  await activateChromeTranslator('fi', () => {});

  expect(state.createCount).toBe(1);
});

test('activateChromeTranslator：沒有 globalThis.Translator 時丟 ChromeTranslatorUnavailableError', async () => {
  Reflect.deleteProperty(globalThis, 'Translator');

  const error = await captureRejection(() =>
    activateChromeTranslator('el', () => {}),
  );

  expect(error).toBeInstanceOf(ChromeTranslatorUnavailableError);
});

test('activateChromeTranslator：zh-Hant 與 zh 都 unavailable 時丟 ChromeTranslatorUnavailableError 且不建立 translator', async () => {
  state.availabilityFor = () => 'unavailable';

  const error = await captureRejection(() =>
    activateChromeTranslator('el', () => {}),
  );

  expect(error).toBeInstanceOf(ChromeTranslatorUnavailableError);
  expect(state.createCount).toBe(0);
});
