import type { TargetLang } from '../i18n';
import { toTraditional } from '../text/chinese';

export class ChromeTranslatorUnavailableError extends Error {
  constructor(message = 'Chrome Translator API 無法使用') {
    super(message);
    this.name = 'ChromeTranslatorUnavailableError';
  }
}

export class NeedsUserActivationError extends Error {
  readonly sourceLanguage: string;

  constructor(sourceLanguage: string) {
    super('Chrome 翻譯模型需要使用者點擊才能下載');
    this.name = 'NeedsUserActivationError';
    this.sourceLanguage = sourceLanguage;
  }
}

type AvailabilityStatus =
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available';

interface DownloadProgressEventLike {
  loaded: number;
}

interface MonitorLike {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: DownloadProgressEventLike) => void,
  ): void;
}

interface TranslatorCreateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  monitor?: (monitor: MonitorLike) => void;
}

interface TranslatorInstance {
  translate(text: string): Promise<string>;
}

interface TranslatorStatic {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<AvailabilityStatus>;
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>;
}

function getTranslatorApi(): TranslatorStatic | null {
  const candidate = (globalThis as { Translator?: unknown }).Translator;
  if (candidate === undefined || candidate === null) return null;
  return candidate as TranslatorStatic;
}

interface ResolvedTarget {
  target: string;
  availability: AvailabilityStatus;
  needsS2T: boolean;
}

const translatorCache = new Map<string, TranslatorInstance>();

function cacheKey(source: string, target: string): string {
  return `${source}\u0000${target}`;
}

async function resolveTarget(
  api: TranslatorStatic,
  src: string,
  want: TargetLang = 'zh-Hant',
): Promise<ResolvedTarget> {
  // 繁體中文：Chrome 不支援 zh-Hant 時退回 zh，再轉成繁體
  const candidates: [string, boolean][] =
    want === 'zh-Hant' ? [['zh-Hant', false], ['zh', true]] : want === 'zh-Hans' ? [['zh-Hans', false], ['zh', false]] : [[want, false]];
  for (const [target, needsS2T] of candidates) {
    const availability = await api.availability({ sourceLanguage: src, targetLanguage: target });
    if (availability !== 'unavailable') return { target, availability, needsS2T };
  }
  throw new ChromeTranslatorUnavailableError(`Chrome 翻譯不支援 ${src} → ${want}`);
}

async function createTranslator(
  api: TranslatorStatic,
  src: string,
  target: string,
  monitor?: (m: MonitorLike) => void,
): Promise<TranslatorInstance> {
  const options: TranslatorCreateOptions = {
    sourceLanguage: src,
    targetLanguage: target,
  };
  if (monitor !== undefined) {
    options.monitor = monitor;
  }
  return api.create(options);
}

export async function chromeTranslate(
  texts: string[],
  src: string,
  target: TargetLang = 'zh-Hant',
): Promise<string[]> {
  const api = getTranslatorApi();
  if (api === null) {
    throw new ChromeTranslatorUnavailableError();
  }

  const resolved = await resolveTarget(api, src, target);
  const key = cacheKey(src, resolved.target);

  let translator = translatorCache.get(key);
  if (translator === undefined) {
    if (resolved.availability !== 'available') {
      throw new NeedsUserActivationError(src);
    }
    translator = await createTranslator(api, src, resolved.target);
    translatorCache.set(key, translator);
  }

  const out: string[] = [];
  for (const text of texts) {
    if (text.length === 0) {
      out.push('');
      continue;
    }
    const translated = await translator.translate(text);
    out.push(resolved.needsS2T ? toTraditional(translated) : translated);
  }
  return out;
}

export async function activateChromeTranslator(
  src: string,
  onProgress: (ratio: number) => void,
  target: TargetLang = 'zh-Hant',
): Promise<void> {
  const api = getTranslatorApi();
  if (api === null) {
    throw new ChromeTranslatorUnavailableError();
  }

  const resolved = await resolveTarget(api, src, target);
  const key = cacheKey(src, resolved.target);
  if (translatorCache.has(key)) {
    return;
  }

  const translator = await createTranslator(
    api,
    src,
    resolved.target,
    (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress(event.loaded);
      });
    },
  );
  translatorCache.set(key, translator);
}
