import type { EngineId, TranslateErrorCode, TranslateResponse } from '../settings/types';

/** 本機伺服器翻譯失敗（含伺服器沒有設定引擎、金鑰錯誤、額度用完、網路錯誤）。 */
export class ServerTranslateError extends Error {
  constructor(readonly code: TranslateErrorCode | 'NETWORK') {
    super(`翻譯失敗：${code}`);
    this.name = 'ServerTranslateError';
  }
}

/** 透過本機伺服器（/api/translate）用使用者在設定中選的引擎翻譯。 */
export async function serverTranslate(
  texts: string[],
  sourceLang?: string,
  targetLang: string = 'zh-Hant',
  fetchImpl: typeof fetch = fetch,
): Promise<{ engine: EngineId; translations: string[] }> {
  if (texts.length === 0) return { engine: 'chrome', translations: [] };
  let res: Response;
  try {
    res = await fetchImpl('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sourceLang ? { texts, sourceLang, targetLang } : { texts, targetLang }),
    });
  } catch {
    throw new ServerTranslateError('NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 非 JSON 回應
  }
  if (!res.ok) {
    const code = (body as { error?: unknown } | null)?.error;
    throw new ServerTranslateError(
      code === 'NO_ENGINE' || code === 'BAD_KEY' || code === 'QUOTA' || code === 'BAD_REQUEST'
        ? code
        : 'UPSTREAM',
    );
  }
  const data = body as Partial<TranslateResponse> | null;
  if (!data || !Array.isArray(data.translations) || data.translations.length !== texts.length) {
    throw new ServerTranslateError('UPSTREAM');
  }
  return {
    engine: (data.engine ?? 'deepl') as EngineId,
    translations: data.translations.map((t) => (typeof t === 'string' ? t : '')),
  };
}
