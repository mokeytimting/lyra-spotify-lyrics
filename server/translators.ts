import type {
  AppSettings,
  EngineId,
  TranslateErrorCode,
  TranslateResponse,
} from '../src/settings/types';

/** 送給 OpenAI 相容服務的系統提示：要求逐行翻譯成台灣繁體中文並輸出 JSON 字串陣列。 */
export const SYSTEM_PROMPT =
  '你是歌詞翻譯者。把 JSON 陣列中的每一行歌詞翻成自然、有意境的台灣繁體中文，' +
  '參考整首歌的上下文，保持行數與順序完全一致、一行對一行、不合併不拆行，' +
  '空字串保持空字串，只輸出 JSON 字串陣列，不要任何說明。';

/** 翻譯目標語言（與介面語言同一組） */
export type TargetLang = 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'ko' | 'es';
const TARGETS: readonly string[] = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko', 'es'];
export function isTargetLang(v: unknown): v is TargetLang {
  return typeof v === 'string' && TARGETS.includes(v);
}

const DEEPL_TARGET: Record<TargetLang, string> = {
  'zh-Hant': 'ZH-HANT',
  'zh-Hans': 'ZH-HANS',
  en: 'EN-US',
  ja: 'JA',
  ko: 'KO',
  es: 'ES',
};
const LANG_NAME: Record<TargetLang, string> = {
  'zh-Hant': 'natural Traditional Chinese as used in Taiwan',
  'zh-Hans': 'natural Simplified Chinese',
  en: 'natural English',
  ja: 'natural Japanese',
  ko: 'natural Korean',
  es: 'natural Spanish',
};

/** 依目標語言產生系統提示（繁體中文沿用原本的中文提示） */
export function systemPrompt(target: TargetLang): string {
  if (target === 'zh-Hant') return SYSTEM_PROMPT;
  return (
    `You are a lyrics translator. Translate every line in the JSON array into ${LANG_NAME[target]}, ` +
    'poetic and faithful to the mood, using the whole song as context. Keep exactly the same number of lines ' +
    'and the same order, one output line per input line, never merge or split lines, keep empty strings empty. ' +
    'Output only a JSON array of strings with no explanation.'
  );
}

const MSG_NO_ENGINE = '尚未設定翻譯引擎或金鑰';
const MSG_BAD_KEY = '金鑰無效';
const MSG_QUOTA = '額度已用完或請求太頻繁';
const MSG_UPSTREAM = '服務暫時無法使用';
const MSG_BAD_SHAPE = '翻譯服務回應格式錯誤';

/** 依錯誤碼取得繁中說明文字。 */
function messageForCode(code: TranslateErrorCode): string {
  switch (code) {
    case 'NO_ENGINE':
      return '尚未設定金鑰';
    case 'BAD_KEY':
      return '金鑰無效';
    case 'QUOTA':
      return '額度已用完或請求太頻繁';
    case 'UPSTREAM':
      return '服務暫時無法使用';
    case 'BAD_REQUEST':
      return '請求內容不正確';
    default:
      return '翻譯失敗';
  }
}

/** 翻譯失敗時統一丟出的錯誤。 */
export class TranslatorError extends Error {
  code: TranslateErrorCode;
  status?: number;

  constructor(code: TranslateErrorCode, message?: string, status?: number) {
    super(message ?? messageForCode(code));
    this.name = 'TranslatorError';
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

type FetchLike = typeof fetch;
type FetchResponse = Awaited<ReturnType<FetchLike>>;

const DEEPL_BATCH_SIZE = 50;
const AZURE_BATCH_SIZE = 100;
const OPENAI_BATCH_SIZE = 80;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function hasSourceLang(sourceLang: string | undefined): sourceLang is string {
  return typeof sourceLang === 'string' && sourceLang.length > 0;
}

function isLocalBaseUrl(baseUrl: string): boolean {
  return baseUrl.startsWith('http://localhost') || baseUrl.startsWith('http://127.0.0.1');
}

function assertEngineUsable(settings: AppSettings): EngineId {
  const engine = settings.translation.engine;
  if (engine === 'chrome') {
    throw new TranslatorError('NO_ENGINE', MSG_NO_ENGINE);
  }
  if (engine === 'deepl') {
    if (settings.translation.deepl.apiKey.trim() === '') {
      throw new TranslatorError('NO_ENGINE', MSG_NO_ENGINE);
    }
    return engine;
  }
  if (engine === 'azure') {
    if (settings.translation.azure.apiKey.trim() === '') {
      throw new TranslatorError('NO_ENGINE', MSG_NO_ENGINE);
    }
    return engine;
  }
  if (engine === 'openai') {
    const { apiKey, baseUrl } = settings.translation.openai;
    if (apiKey.trim() === '' && !isLocalBaseUrl(baseUrl)) {
      throw new TranslatorError('NO_ENGINE', MSG_NO_ENGINE);
    }
    return engine;
  }
  throw new TranslatorError('NO_ENGINE', MSG_NO_ENGINE);
}

async function readJson(res: FetchResponse): Promise<unknown> {
  try {
    const json = await res.json();
    return json as unknown;
  } catch {
    throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
  }
}

function throwForStatus(
  engineStatus: number,
  codeMap: (status: number) => TranslateErrorCode | null,
): void {
  const code = codeMap(engineStatus);
  if (code === 'BAD_KEY') throw new TranslatorError('BAD_KEY', MSG_BAD_KEY, engineStatus);
  if (code === 'QUOTA') throw new TranslatorError('QUOTA', MSG_QUOTA, engineStatus);
  if (code === 'UPSTREAM') throw new TranslatorError('UPSTREAM', MSG_UPSTREAM, engineStatus);
}

function ensureSuccessStatus(
  res: FetchResponse,
  map: (status: number) => TranslateErrorCode | null,
): void {
  const status = res.status;
  if (status >= 200 && status < 300) return;
  throwForStatus(status, map);
}

/* ------------------------------------------------------------------ DeepL */

function deepLErrorCode(status: number): TranslateErrorCode | null {
  if (status === 403) return 'BAD_KEY';
  if (status === 456 || status === 429) return 'QUOTA';
  return 'UPSTREAM';
}

function extractDeepLTexts(json: unknown): string[] {
  const translations = (json as { translations?: unknown }).translations;
  if (!Array.isArray(translations)) {
    throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
  }
  return translations.map((item) => {
    const text = (item as { text?: unknown }).text;
    if (typeof text !== 'string') {
      throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
    }
    return text;
  });
}

async function translateDeepL(
  settings: AppSettings,
  texts: string[],
  sourceLang: string | undefined,
  fetchImpl: FetchLike,
  target: TargetLang = 'zh-Hant',
): Promise<string[]> {
  const key = settings.translation.deepl.apiKey;
  const endpoint = key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const results: string[] = [];
  for (const batch of chunk(texts, DEEPL_BATCH_SIZE)) {
    const payload: { text: string[]; target_lang: string; source_lang?: string } = {
      text: batch,
      target_lang: DEEPL_TARGET[target],
    };
    if (hasSourceLang(sourceLang)) {
      payload.source_lang = sourceLang.toUpperCase();
    }
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `DeepL-Auth-Key ${key}`,
      },
      body: JSON.stringify(payload),
    });
    ensureSuccessStatus(res, deepLErrorCode);
    const json = await readJson(res);
    results.push(...extractDeepLTexts(json));
  }
  return results;
}

/* ------------------------------------------------------------------ Azure */

function azureErrorCode(status: number): TranslateErrorCode | null {
  if (status === 401) return 'BAD_KEY';
  if (status === 403 || status === 429) return 'QUOTA';
  return 'UPSTREAM';
}

function extractAzureTexts(json: unknown): string[] {
  if (!Array.isArray(json)) {
    throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
  }
  return json.map((item) => {
    const translations = (item as { translations?: unknown }).translations;
    if (!Array.isArray(translations) || translations.length === 0) {
      throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
    }
    const text = (translations[0] as { text?: unknown }).text;
    if (typeof text !== 'string') {
      throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
    }
    return text;
  });
}

async function translateAzure(
  settings: AppSettings,
  texts: string[],
  sourceLang: string | undefined,
  fetchImpl: FetchLike,
  target: TargetLang = 'zh-Hant',
): Promise<string[]> {
  const { apiKey, region } = settings.translation.azure;
  let endpoint =
    'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' + encodeURIComponent(target);
  if (hasSourceLang(sourceLang)) {
    endpoint += `&from=${encodeURIComponent(sourceLang)}`;
  }

  const headers: Record<string, string> = {
    'Ocp-Apim-Subscription-Key': apiKey,
    'Content-Type': 'application/json',
  };
  if (region.trim() !== '') {
    headers['Ocp-Apim-Subscription-Region'] = region;
  }

  const results: string[] = [];
  for (const batch of chunk(texts, AZURE_BATCH_SIZE)) {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch.map((Text) => ({ Text }))),
    });
    ensureSuccessStatus(res, azureErrorCode);
    const json = await readJson(res);
    results.push(...extractAzureTexts(json));
  }
  return results;
}

/* ----------------------------------------------------------------- OpenAI */

function openAiErrorCode(status: number): TranslateErrorCode | null {
  if (status === 401) return 'BAD_KEY';
  if (status === 429) return 'QUOTA';
  return 'UPSTREAM';
}

interface OpenAiMessage {
  role: 'system' | 'user';
  content: string;
}

function extractOpenAiContent(json: unknown): string {
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (message === null || typeof message !== 'object') {
    throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== 'string') {
    throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
  }
  return content;
}

function parseLineArray(content: string, expectedLength: number): string[] | null {
  const withoutFences = content.replace(/```json/gi, '').replace(/```/g, '');
  const start = withoutFences.indexOf('[');
  const end = withoutFences.lastIndexOf(']');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedLength) return null;
  for (const item of parsed) {
    if (typeof item !== 'string') return null;
  }
  return parsed as string[];
}

async function requestOpenAi(
  endpoint: string,
  model: string,
  apiKey: string,
  messages: OpenAiMessage[],
  fetchImpl: FetchLike,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey !== '') {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, temperature: 0.3, messages }),
  });
  ensureSuccessStatus(res, openAiErrorCode);
  const json = await readJson(res);
  return extractOpenAiContent(json);
}

async function translateOpenAi(
  settings: AppSettings,
  texts: string[],
  fetchImpl: FetchLike,
  target: TargetLang = 'zh-Hant',
): Promise<string[]> {
  const { baseUrl, model, apiKey } = settings.translation.openai;
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const endpoint = `${trimmedBase}/chat/completions`;

  const results: string[] = [];
  for (const batch of chunk(texts, OPENAI_BATCH_SIZE)) {
    const userContent = JSON.stringify(batch);
    const firstContent = await requestOpenAi(
      endpoint,
      model,
      apiKey,
      [
        { role: 'system', content: systemPrompt(target) },
        { role: 'user', content: userContent },
      ],
      fetchImpl,
    );
    const firstParsed = parseLineArray(firstContent, batch.length);
    if (firstParsed !== null) {
      results.push(...firstParsed);
      continue;
    }

    const retryContent = `${userContent}\n上次的輸出行數不對，請嚴格輸出 ${batch.length} 個元素的 JSON 陣列`;
    const secondContent = await requestOpenAi(
      endpoint,
      model,
      apiKey,
      [
        { role: 'system', content: systemPrompt(target) },
        { role: 'user', content: retryContent },
      ],
      fetchImpl,
    );
    const secondParsed = parseLineArray(secondContent, batch.length);
    if (secondParsed !== null) {
      results.push(...secondParsed);
      continue;
    }

    throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
  }
  return results;
}

/* ---------------------------------------------------------------- 對外 API */

export async function translateWith(
  settings: AppSettings,
  texts: string[],
  sourceLang: string | undefined,
  fetchImpl: typeof fetch = fetch,
  targetLang: string = 'zh-Hant',
): Promise<TranslateResponse> {
  const engine = assertEngineUsable(settings);
  const target: TargetLang = isTargetLang(targetLang) ? targetLang : 'zh-Hant';

  if (texts.length === 0) {
    return { engine, translations: [] };
  }

  try {
    let translations: string[];
    switch (engine) {
      case 'deepl':
        translations = await translateDeepL(settings, texts, sourceLang, fetchImpl, target);
        break;
      case 'azure':
        translations = await translateAzure(settings, texts, sourceLang, fetchImpl, target);
        break;
      case 'openai':
        translations = await translateOpenAi(settings, texts, fetchImpl, target);
        break;
      case 'chrome':
        throw new TranslatorError('NO_ENGINE', MSG_NO_ENGINE);
      default:
        throw new TranslatorError('NO_ENGINE', MSG_NO_ENGINE);
    }

    if (translations.length !== texts.length) {
      throw new TranslatorError('UPSTREAM', MSG_BAD_SHAPE);
    }
    return { engine, translations };
  } catch (error) {
    if (error instanceof TranslatorError) throw error;
    throw new TranslatorError('UPSTREAM', MSG_UPSTREAM);
  }
}

export async function testEngine(
  settings: AppSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<
  { ok: true; sample: string } | { ok: false; code: TranslateErrorCode; message: string }
> {
  try {
    const result = await translateWith(settings, ['Hello, world'], undefined, fetchImpl);
    const sample = result.translations.length > 0 ? result.translations[0] : '';
    return { ok: true, sample };
  } catch (error) {
    const code: TranslateErrorCode = error instanceof TranslatorError ? error.code : 'UPSTREAM';
    return { ok: false, code, message: messageForCode(code) };
  }
}
