/**
 * 整首歌的翻譯流程。
 *
 * - 中文歌整首不翻譯，直接回傳全 null；只把需要翻譯的行送出去。
 * - 先讀硬碟快取；命中即採用（force 時略過快取，用於「用目前引擎重翻」）。
 * - 優先用使用者在設定中選的引擎（經本機伺服器）；沒設定或失敗時改用 Chrome 內建翻譯。
 * - 快取來自 Chrome、而現在有設定伺服器引擎時，背景重翻一次並升級快取。
 */

import { getCached, putCached } from './cache';
import {
  chromeTranslate,
  ChromeTranslatorUnavailableError,
  NeedsUserActivationError,
} from './chrome';
import { serverTranslate, ServerTranslateError } from './server';
import { needsTranslation } from '../text/lang';
import type { SongLang } from '../text/lang';
import type { EngineId } from '../settings/types';
import { getTargetLang, type TargetLang } from '../i18n';

export { NeedsUserActivationError };

export class TranslationUnavailableError extends Error {
  constructor(message = '翻譯服務暫時無法使用') {
    super(message);
    this.name = 'TranslationUnavailableError';
  }
}

export type Engine = EngineId;

export interface TranslateSongOptions {
  onUpgraded?: (lines: (string | null)[]) => void;
  /** 回報這次採用的翻譯引擎；fromCache 為 true 表示來自硬碟快取。 */
  onEngine?: (engine: Engine, fromCache: boolean) => void;
  /** 略過快取重新翻譯 */
  force?: boolean;
  /** 翻譯目標語言；預設為設定的翻譯語言（跟著介面語言） */
  target?: TargetLang;
}

interface CacheEntry {
  engine: Engine;
  lines: (string | null)[];
  /** 翻成哪種語言；舊版快取沒有這個欄位，視為繁體中文 */
  target?: TargetLang;
}

const ENGINES: readonly string[] = ['chrome', 'deepl', 'azure', 'openai'];

function emptyResult(total: number): (string | null)[] {
  return new Array<string | null>(total).fill(null);
}

function mergeValues(targets: number[], values: string[], total: number): (string | null)[] | null {
  if (values.length !== targets.length) return null;
  const out = emptyResult(total);
  targets.forEach((index, i) => {
    out[index] = values[i] ?? null;
  });
  return out;
}

async function readCache(trackId: string, total: number, target: TargetLang): Promise<CacheEntry | null> {
  try {
    const cached = await getCached(trackId);
    if (!cached || !ENGINES.includes(cached.engine) || !Array.isArray(cached.lines)) return null;
    if (cached.lines.length !== total) return null;
    if (((cached as { target?: string }).target ?? 'zh-Hant') !== target) return null;
    return {
      engine: cached.engine as Engine,
      lines: cached.lines.map((l) => (typeof l === 'string' ? l : null)),
    };
  } catch {
    return null;
  }
}

async function writeCache(trackId: string, entry: CacheEntry): Promise<void> {
  try {
    await putCached(trackId, entry);
  } catch {
    // 快取寫入失敗時忽略
  }
}

function safeCall<T extends unknown[]>(fn: ((...a: T) => void) | undefined, ...args: T): void {
  try {
    fn?.(...args);
  } catch {
    // 監聽器的例外不影響翻譯流程
  }
}

export async function translateSong(
  trackId: string,
  lines: string[],
  songLang: SongLang,
  opts: TranslateSongOptions = {},
): Promise<(string | null)[]> {
  const source = Array.isArray(lines) ? lines : [];
  const total = source.length;
  const target = opts.target ?? getTargetLang();
  if (songLang === 'zh' && (target === 'zh-Hant' || target === 'zh-Hans')) return emptyResult(total);

  const targets: number[] = [];
  source.forEach((line, i) => {
    if (typeof line === 'string' && needsTranslation(line, songLang, target)) targets.push(i);
  });
  if (targets.length === 0) return emptyResult(total);
  const texts = targets.map((i) => source[i] ?? '');

  const serverSource =
    songLang === 'ja' || songLang === 'ko' || songLang === 'zh' ? songLang : undefined;
  const chromeSource = songLang === 'ja' || songLang === 'ko' || songLang === 'zh' ? songLang : 'en';

  const viaServer = async (): Promise<CacheEntry | null> => {
    const r = await serverTranslate(texts, serverSource, target);
    const merged = mergeValues(targets, r.translations, total);
    return merged ? { engine: r.engine, lines: merged, target } : null;
  };

  // (1) 快取
  if (opts.force !== true) {
    const cached = await readCache(trackId, total, target);
    if (cached !== null) {
      if (cached.engine === 'chrome') {
        // 背景用設定的引擎升級；伺服器沒設定引擎時會回 NO_ENGINE，靜默略過
        void viaServer()
          .then(async (up) => {
            if (!up) return;
            await writeCache(trackId, up);
            safeCall(opts.onEngine, up.engine, false);
            safeCall(opts.onUpgraded, up.lines);
          })
          .catch(() => undefined);
      }
      safeCall(opts.onEngine, cached.engine, true);
      return cached.lines;
    }
  }

  // (2) 使用者設定的引擎
  let serverFailure: unknown = null;
  try {
    const result = await viaServer();
    if (result) {
      await writeCache(trackId, result);
      safeCall(opts.onEngine, result.engine, false);
      return result.lines;
    }
  } catch (e) {
    serverFailure = e;
  }

  // (3) Chrome 內建翻譯
  let values: string[] | null = null;
  let chromeFailure: unknown = null;
  try {
    const raw = await chromeTranslate(texts, chromeSource, target);
    values = Array.isArray(raw) && raw.length === texts.length ? raw.map((v) => String(v ?? '')) : null;
  } catch (e) {
    chromeFailure = e;
  }
  if (chromeFailure instanceof NeedsUserActivationError) throw chromeFailure;

  const merged = values ? mergeValues(targets, values, total) : null;
  if (!merged) {
    const chromeReason =
      chromeFailure instanceof ChromeTranslatorUnavailableError ? 'Chrome 翻譯無法使用' : 'Chrome 翻譯失敗';
    const serverReason =
      serverFailure instanceof ServerTranslateError && serverFailure.code !== 'NO_ENGINE'
        ? '設定的翻譯服務無法使用，且'
        : '';
    throw new TranslationUnavailableError(serverReason + chromeReason);
  }
  await writeCache(trackId, { engine: 'chrome', lines: merged, target });
  safeCall(opts.onEngine, 'chrome', false);
  return merged;
}
