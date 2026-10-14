import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, SERVER_ENGINES } from '../src/settings/types';
import type { AppSettings, EngineId, PublicSettings, SettingsPatch } from '../src/settings/types';

/** 合法的引擎清單（chrome 為瀏覽器端，其餘由本機伺服器呼叫）。 */
const ENGINES: readonly EngineId[] = ['chrome', ...SERVER_ENGINES];

/** Spotify Client ID：32 位十六進位。 */
const CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/i;

function isEngine(value: unknown): value is EngineId {
  return typeof value === 'string' && (ENGINES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

function hasApiKey(value: unknown): boolean {
  return typeof value === 'string' && value !== '';
}

/**
 * 與 DEFAULT_SETTINGS 深層合併：缺少的欄位、型別不對的欄位一律使用預設值。
 * 回傳全新物件，不會動到 DEFAULT_SETTINGS。
 */
function normalizeSettings(raw: unknown): AppSettings {
  const root = isRecord(raw) ? raw : {};
  const translation = isRecord(root.translation) ? root.translation : {};
  const deepl = isRecord(translation.deepl) ? translation.deepl : {};
  const azure = isRecord(translation.azure) ? translation.azure : {};
  const openai = isRecord(translation.openai) ? translation.openai : {};

  return {
    spotifyClientId: pickString(root, 'spotifyClientId', DEFAULT_SETTINGS.spotifyClientId),
    translation: {
      engine: isEngine(translation.engine) ? translation.engine : DEFAULT_SETTINGS.translation.engine,
      deepl: {
        apiKey: pickString(deepl, 'apiKey', DEFAULT_SETTINGS.translation.deepl.apiKey),
      },
      azure: {
        apiKey: pickString(azure, 'apiKey', DEFAULT_SETTINGS.translation.azure.apiKey),
        region: pickString(azure, 'region', DEFAULT_SETTINGS.translation.azure.region),
      },
      openai: {
        baseUrl: pickString(openai, 'baseUrl', DEFAULT_SETTINGS.translation.openai.baseUrl),
        model: pickString(openai, 'model', DEFAULT_SETTINGS.translation.openai.model),
        apiKey: pickString(openai, 'apiKey', DEFAULT_SETTINGS.translation.openai.apiKey),
      },
    },
  };
}

function cloneSettings(s: AppSettings): AppSettings {
  return {
    spotifyClientId: s.spotifyClientId,
    translation: {
      engine: s.translation.engine,
      deepl: { apiKey: s.translation.deepl.apiKey },
      azure: {
        apiKey: s.translation.azure.apiKey,
        region: s.translation.azure.region,
      },
      openai: {
        baseUrl: s.translation.openai.baseUrl,
        model: s.translation.openai.model,
        apiKey: s.translation.openai.apiKey,
      },
    },
  };
}

/** undefined／空字串＝保留原值，null＝清除，非空字串＝覆蓋（去除前後空白）。 */
function mergeApiKey(current: string, value: unknown): string {
  if (value === null) return '';
  if (typeof value !== 'string') return current;
  const trimmed = value.trim();
  if (trimmed === '') return current;
  return trimmed;
}

/** 去掉結尾的 '/'。 */
function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * 套用更新規則；失敗時丟出例外且不動到任何既有物件。
 * 存檔與「測試翻譯」都用這個函式，兩邊的行為才會一致。
 */
export function applyPatch(base: AppSettings, patch: SettingsPatch): AppSettings {
  const next = cloneSettings(base);
  const p: Record<string, unknown> = isRecord(patch) ? patch : {};

  if (p.spotifyClientId !== undefined) {
    const raw = p.spotifyClientId;
    if (typeof raw !== 'string') throw new Error('Client ID 格式不正確');
    const id = raw.trim();
    if (id !== '' && !CLIENT_ID_PATTERN.test(id)) throw new Error('Client ID 格式不正確');
    next.spotifyClientId = id;
  }

  const translation = isRecord(p.translation) ? p.translation : null;
  if (translation !== null) {
    if (translation.engine !== undefined) {
      const engine = translation.engine;
      if (!isEngine(engine)) throw new Error('翻譯引擎不正確');
      next.translation.engine = engine;
    }

    const deepl = isRecord(translation.deepl) ? translation.deepl : null;
    if (deepl !== null && deepl.apiKey !== undefined) {
      next.translation.deepl.apiKey = mergeApiKey(next.translation.deepl.apiKey, deepl.apiKey);
    }

    const azure = isRecord(translation.azure) ? translation.azure : null;
    if (azure !== null) {
      if (azure.apiKey !== undefined) {
        next.translation.azure.apiKey = mergeApiKey(next.translation.azure.apiKey, azure.apiKey);
      }
      if (typeof azure.region === 'string') {
        next.translation.azure.region = azure.region.trim();
      }
    }

    const openai = isRecord(translation.openai) ? translation.openai : null;
    if (openai !== null) {
      if (typeof openai.baseUrl === 'string') {
        const url = stripTrailingSlashes(openai.baseUrl.trim());
        if (url !== '' && !/^https?:\/\//i.test(url)) throw new Error('Base URL 必須以 http:// 或 https:// 開頭');
        // 換了伺服器位址就不沿用舊金鑰，避免把金鑰送到別的網址
        if (url !== next.translation.openai.baseUrl) next.translation.openai.apiKey = '';
        next.translation.openai.baseUrl = url;
      }
      if (typeof openai.model === 'string') {
        next.translation.openai.model = openai.model.trim();
      }
      if (openai.apiKey !== undefined) {
        next.translation.openai.apiKey = mergeApiKey(next.translation.openai.apiKey, openai.apiKey);
      }
    }
  }

  return next;
}

/** 只輸出「有沒有金鑰」，永不輸出金鑰本身。 */
function toPublicSettings(s: AppSettings): PublicSettings {
  const t = s.translation;
  return {
    spotifyClientId: s.spotifyClientId,
    translation: {
      engine: t.engine,
      deepl: { hasKey: hasApiKey(t.deepl.apiKey) },
      azure: {
        hasKey: hasApiKey(t.azure.apiKey),
        region: t.azure.region,
      },
      openai: {
        baseUrl: t.openai.baseUrl,
        model: t.openai.model,
        hasKey: hasApiKey(t.openai.apiKey),
      },
    },
  };
}

export function createSettingsStore(
  file: string,
  opts?: { legacyDeeplKey?: string },
): {
  load(): Promise<AppSettings>;
  save(patch: SettingsPatch): Promise<AppSettings>;
  toPublic(s: AppSettings): PublicSettings;
} {
  let cache: AppSettings | null = null;

  async function writeToDisk(s: AppSettings): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
    await rename(tmp, file);
  }

  async function readFromDisk(): Promise<AppSettings> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      return normalizeSettings(null);
    }
    try {
      return normalizeSettings(JSON.parse(text));
    } catch {
      return normalizeSettings(null);
    }
  }

  async function load(): Promise<AppSettings> {
    if (cache !== null) return cache;

    const settings = await readFromDisk();

    const legacyKey = opts?.legacyDeeplKey;
    if (
      typeof legacyKey === 'string' &&
      legacyKey.trim() !== '' &&
      settings.translation.deepl.apiKey === ''
    ) {
      settings.translation.deepl.apiKey = legacyKey.trim();
      settings.translation.engine = 'deepl';
      await writeToDisk(settings);
    }

    cache = settings;
    return settings;
  }

  async function save(patch: SettingsPatch): Promise<AppSettings> {
    const current = await load();
    const next = applyPatch(current, patch);
    await writeToDisk(next);
    cache = next;
    return next;
  }

  return { load, save, toPublic: toPublicSettings };
}
