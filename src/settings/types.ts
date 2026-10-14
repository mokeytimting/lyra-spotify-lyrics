/** 可選的翻譯引擎。chrome 是瀏覽器內建（不需金鑰），其餘由本機伺服器代為呼叫。 */
export type EngineId = 'chrome' | 'deepl' | 'azure' | 'openai';

export const SERVER_ENGINES: readonly EngineId[] = ['deepl', 'azure', 'openai'];

/** 存在 data/settings.json 的完整設定（含金鑰，只在伺服器端）。 */
export interface AppSettings {
  spotifyClientId: string;
  translation: {
    engine: EngineId;
    deepl: { apiKey: string };
    azure: { apiKey: string; region: string };
    openai: { baseUrl: string; model: string; apiKey: string };
  };
}

/** 回傳給瀏覽器的設定：金鑰一律不回傳，只告訴有沒有設定。 */
export interface PublicSettings {
  spotifyClientId: string;
  translation: {
    engine: EngineId;
    deepl: { hasKey: boolean };
    azure: { hasKey: boolean; region: string };
    openai: { baseUrl: string; model: string; hasKey: boolean };
  };
}

/**
 * 瀏覽器送來的更新。apiKey：省略或空字串＝保留原本的；null＝清除。
 */
export interface SettingsPatch {
  spotifyClientId?: string;
  translation?: {
    engine?: EngineId;
    deepl?: { apiKey?: string | null };
    azure?: { apiKey?: string | null; region?: string };
    openai?: { baseUrl?: string; model?: string; apiKey?: string | null };
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  spotifyClientId: '',
  translation: {
    engine: 'chrome',
    deepl: { apiKey: '' },
    azure: { apiKey: '', region: '' },
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' },
  },
};

/** /api/translate 的請求與回應 */
export interface TranslateRequest {
  texts: string[];
  /** 'ja' | 'en' | 'ko' ...；未知時省略 */
  sourceLang?: string;
}
export interface TranslateResponse {
  engine: EngineId;
  translations: string[];
}
/** 伺服器翻譯失敗的原因（HTTP body 的 error 欄位） */
export type TranslateErrorCode = 'NO_ENGINE' | 'BAD_KEY' | 'QUOTA' | 'UPSTREAM' | 'BAD_REQUEST';
